// LAS 3.0 text and date-time channels (AppUpgrade WDM-U2-017, finding
// WDM-U1-031). The vendored reader keeps numeric curves only and names the
// text columns ({S}, {D}, {DT}, {T} or non-numeric values) in
// skippedCurves. This module reads those columns back from the same
// ~Log_Data rows (the reader's own quote-aware splitDelimited) and turns
// them into registry curves that every app can carry:
//
//   date-time   seconds after the first stamp (float32 keeps 1 s over
//               ~190 days), the origin in provenance; a stamp without a
//               zone is read as UTC and said so
//   text        a coded curve: 1, 2, 3 ... in order of first appearance,
//               the code table in provenance (Techlog's discrete logs);
//               empty cells are nulls. More than MAX_CODES distinct values
//               is free text, which is not stored, with the reason
//
// Coded values must never be interpolated, so the import offers them only
// when they land on the file's own depth grid. Pure, worker-safe, no I/O.

import { splitDelimited, parseHeaderLine3 } from './lasParse';

export const MAX_CODES = 250;
const TEXT_FORMATS_DATETIME = /^((DT|D|T)\d*|DATE|TIME|DATETIME)$/i;
const base = (m) => String(m || '').trim().toUpperCase();

/** Section lines between a title matching `re` and the next title. */
function sectionLines(lines, re) {
  const start = lines.findIndex((l) => re.test(l.trim()));
  if (start < 0) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim().startsWith('~')) break;
    out.push(lines[i]);
  }
  return out;
}

/**
 * Values of every text column the reader skipped, one per data row.
 * @param {string} text the LAS file
 * @param {Object} parsed parseLas output
 * @returns {Array<{mnemonic, unit, descr, format, values: string[]}>}
 */
export function extractTextChannels(text, parsed) {
  const skipped = parsed?.skippedCurves || [];
  if (!skipped.length || !(Number(parsed?.version) >= 3)) return [];
  const lines = String(text || '').split(/\r\n|\r|\n/);
  const defs = (sectionLines(lines, /^~(LOG_DEFINITION|C)/i) || [])
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => parseHeaderLine3(l)).filter((d) => d && d.name).map((d) => base(d.name));
  const data = sectionLines(lines, /^~(LOG_DATA|A)\b/i) || [];
  const delimiter = parsed.delimiter || 'space';
  const rows = [];
  for (const line of data) {
    const t = line.trim();
    if (t === '' || t.startsWith('#')) continue;
    rows.push(splitDelimited(delimiter === 'space' ? t : line, delimiter).map((x) => x.trim()));
  }
  return skipped.map((c) => {
    const ci = defs.indexOf(base(c.mnemonic));
    return { ...c, values: ci < 0 ? [] : rows.map((r) => r[ci] ?? '') };
  }).filter((c) => c.values.length);
}

const isNull = (v, nullValue) => v === '' || (nullValue != null && Number(v) === Number(nullValue) && v.trim() !== '');

/** ms since epoch of a stamp; a stamp without a zone reads as UTC. */
function stampMs(v) {
  const s = String(v).trim();
  if (!s) return NaN;
  const iso = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/.test(s) ? `${s.replace(' ', 'T')}${s.length > 10 ? 'Z' : 'T00:00:00Z'}` : s;
  return Date.parse(iso);
}

/**
 * Registry curves from the text channels, on the file's depth grid.
 * @param {ReturnType<typeof extractTextChannels>} channels
 * @param {{logs: Array, startMdM: number, stopMdM: number, stepM: ?number}} prep the oriented registry prep
 * @param {{reversed?: boolean, sourceFile?: ?string, nullValue?: ?number}} [opts]
 * @returns {{logs: Object[], skipped: {mnemonic: string, reason: string}[]}}
 */
export function textChannelLogs(channels, prep, { reversed = false, sourceFile = null, nullValue = null } = {}) {
  const logs = [];
  const skipped = [];
  const n = prep?.logs?.[0]?.data?.length || 0;
  for (const c of channels || []) {
    let values = c.values.slice();
    if (values.length !== n) { skipped.push({ mnemonic: c.mnemonic, reason: `${values.length} values for ${n} depth samples` }); continue; }
    if (reversed) values = values.reverse();
    const data = new Float32Array(n);
    let nullCount = 0;
    let provenance;
    let unit = '';
    const nonEmpty = values.filter((v) => !isNull(v, nullValue));
    const asDate = TEXT_FORMATS_DATETIME.test(c.format || '') || (nonEmpty.length > 0 && nonEmpty.every((v) => /\d{4}-\d{2}-\d{2}/.test(v) && Number.isFinite(stampMs(v))));
    if (asDate) {
      const ms = values.map((v) => (isNull(v, nullValue) ? NaN : stampMs(v)));
      const finite = ms.filter(Number.isFinite);
      if (!finite.length) { skipped.push({ mnemonic: c.mnemonic, reason: 'no readable date or time' }); continue; }
      const origin = Math.min(...finite);
      ms.forEach((m, i) => { data[i] = Number.isFinite(m) ? (m - origin) / 1000 : NaN; if (!Number.isFinite(m)) nullCount += 1; });
      unit = 's';
      provenance = { text_channel: 'datetime', time_origin: new Date(origin).toISOString(), zone_assumed_utc: nonEmpty.some((v) => !/(Z|[+-]\d{2}:?\d{2})$/.test(v.trim())), format: c.format || null };
    } else {
      const codes = new Map();
      values.forEach((v) => { if (!isNull(v, nullValue) && !codes.has(v)) codes.set(v, codes.size + 1); });
      if (codes.size > MAX_CODES) { skipped.push({ mnemonic: c.mnemonic, reason: `${codes.size} distinct values is free text, which is not stored as a curve` }); continue; }
      values.forEach((v, i) => { if (isNull(v, nullValue)) { data[i] = NaN; nullCount += 1; } else data[i] = codes.get(v); });
      provenance = { text_channel: 'string', codes: Object.fromEntries([...codes].map(([v, k]) => [k, v])), format: c.format || null };
    }
    logs.push({
      mnemonic: c.mnemonic,
      description: `${c.descr || c.mnemonic} (LAS 3.0 ${asDate ? 'date-time' : 'text'} channel)`,
      unit,
      sourceUnit: '',
      converted: false,
      kind: 'text',
      data,
      startMdM: prep.startMdM,
      stopMdM: prep.stopMdM,
      stepM: prep.stepM,
      nSamples: n,
      nullCount,
      provenance: { ...provenance, source_file: sourceFile, source_mnemonic: c.mnemonic },
    });
  }
  return { logs, skipped };
}

/**
 * The door's text-channel step: extract, orient like the numeric curves,
 * build the curves. Used by the parse worker and the in-memory backend.
 */
export function prepareTextChannels(text, parsed, prep, { sourceFile = null } = {}) {
  const channels = extractTextChannels(text, parsed);
  if (!channels.length) return { logs: [], skipped: [] };
  const d = parsed.curves?.[0]?.data;
  let first = null;
  let last = null;
  if (d) {
    for (let i = 0; i < d.length; i++) if (Number.isFinite(d[i])) { first = d[i]; break; }
    for (let i = d.length - 1; i >= 0; i--) if (Number.isFinite(d[i])) { last = d[i]; break; }
  }
  return textChannelLogs(channels, prep, { reversed: first != null && last != null && last < first, sourceFile, nullValue: parsed.nullValue });
}
