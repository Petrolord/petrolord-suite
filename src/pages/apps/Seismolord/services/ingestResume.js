// Ingest RESUME identity: an interrupted import may only be resumed
// with the SAME file it started from — the brick store is a function of
// (file bytes, header mapping), so resuming with anything else would
// silently interleave bricks from two different volumes. Identity is a
// sampled SHA-256 fingerprint (size + first/middle/last 64 KiB) — cheap
// on multi-GB files, and any same-size file that differs only outside
// the sampled windows still fails the full per-trace validation during
// transcode. The fingerprint and the mapping are recorded on the
// seismic_volumes row (survey_meta.ingest) at registration time, BEFORE
// any upload — an interrupted ingest has no manifest, so the row is the
// only place identity can live.
//
// Pure logic here (plan/compare/gate) is unit-tested; the actual
// hashing runs through an injectable digest so tests never need
// crypto.subtle under jsdom.

export const FINGERPRINT_ALGO = 'sha256-sampled-64k-v1';
export const SAMPLE_BYTES = 64 * 1024;

/**
 * Byte windows a fingerprint samples: first / middle / last 64 KiB,
 * clamped to the file and merged when they overlap (small files
 * degenerate to a single whole-file window). Pure.
 *
 * @param {number} size file size in bytes
 * @returns {{offset: number, length: number}[]}
 */
export function fingerprintPlan(size) {
  if (!Number.isFinite(size) || size <= 0) return [];
  const w = SAMPLE_BYTES;
  const wanted = [
    [0, Math.min(w, size)],
    [Math.max(0, Math.floor(size / 2) - w / 2), Math.min(w, size)],
    [Math.max(0, size - w), Math.min(w, size)],
  ];
  const merged = [];
  for (const [offset, length] of wanted.sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && offset <= last.offset + last.length) {
      last.length = Math.max(last.length, offset + length - last.offset);
    } else {
      merged.push({ offset, length });
    }
  }
  return merged;
}

const toHex = (buf) => Array.from(new Uint8Array(buf))
  .map((b) => b.toString(16).padStart(2, '0')).join('');

const subtleDigest = (bytes) => crypto.subtle.digest('SHA-256', bytes);

/**
 * Sampled fingerprint of a local File.
 *
 * @param {File|Blob} file
 * @param {(bytes: Uint8Array) => Promise<ArrayBuffer>} [digest]
 *   injectable hasher (default WebCrypto SHA-256)
 * @returns {Promise<{algo: string, size: number, hash: string}>}
 */
export async function fileFingerprint(file, digest = subtleDigest) {
  const plan = fingerprintPlan(file.size);
  const parts = await Promise.all(plan.map(
    ({ offset, length }) => file.slice(offset, offset + length).arrayBuffer()));
  const total = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    total.set(new Uint8Array(p), at);
    at += p.byteLength;
  }
  return { algo: FINGERPRINT_ALGO, size: file.size, hash: toHex(await digest(total)) };
}

/** Strict identity: same algo, same size, same hash. Pure. */
export function fingerprintsMatch(a, b) {
  return Boolean(a && b && a.algo === b.algo && a.size === b.size && a.hash === b.hash);
}

/**
 * The survey_meta.ingest record written at registration time — the
 * identity a later resume is gated on. Mapping is stored because the
 * brick store depends on it as much as on the bytes: a resume must
 * transcode under the ORIGINAL byte positions, not whatever the dialog
 * currently shows. Pure.
 */
export function ingestRecord(fingerprint, mapping, file) {
  return {
    fingerprint,
    mapping: { il_byte: mapping.ilByte, xl_byte: mapping.xlByte },
    file_name: file.name,
    file_size: file.size,
  };
}

/**
 * Gate a resume attempt: the row must still be mid-ingest, must carry
 * an identity record (rows from before resume support cannot be
 * verified — delete and re-import), and the offered file must
 * fingerprint-match. Returns the ORIGINAL mapping to transcode under.
 * Throws plain domain errors the import panel shows verbatim. Pure.
 *
 * @param {Object} row seismic_volumes row
 * @param {{algo, size, hash}} fingerprint of the offered file
 * @returns {{mapping: {ilByte: number, xlByte: number}}}
 */
export function resumeGate(row, fingerprint) {
  if (!row) throw new Error('Volume to resume was not found.');
  if (row.status !== 'ingesting') {
    throw new Error(`"${row.name}" is not an interrupted import (status: ${row.status}).`);
  }
  const rec = row.survey_meta?.ingest;
  if (!rec?.fingerprint) {
    throw new Error(
      `"${row.name}" predates resume support — its source file cannot be verified. `
      + 'Delete the interrupted volume and import the file again.');
  }
  if (!fingerprintsMatch(rec.fingerprint, fingerprint)) {
    const stored = rec.fingerprint;
    const detail = stored.size !== fingerprint.size
      ? `sizes differ (${stored.size.toLocaleString()} vs ${fingerprint.size.toLocaleString()} bytes)`
      : 'contents differ';
    throw new Error(
      `This is not the file "${row.name}" was importing (${detail}). `
      + `Resume needs the original file${rec.file_name ? ` "${rec.file_name}"` : ''}; `
      + 'to import this file instead, start a new import.');
  }
  return { mapping: { ilByte: rec.mapping.il_byte, xlByte: rec.mapping.xl_byte } };
}
