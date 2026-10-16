// ZGY import (owner request 2026-10-16: a client's legacy seismic is in
// Petrel ZGY). A picked .zgy is read in place and presented to the import as
// the SEG-Y it holds (engines zgySegy.js), so every door works on it as on
// any SEG-Y: the preview scan, crop before upload, the browser conversion,
// Local Workspace and the server import (which uploads that SEG-Y).
// Nothing is converted to disk first.
//
// Workers receive the picked File and open it here again: a ZGY is known by
// its name and confirmed by its signature.

import { fileReader } from '../engine/reader';
import { openZgy } from '../engine/zgy';
import { zgySegyReader, zgyAmplitudeClip } from '../engine/zgySegy';
import { loadZfpDecode } from '@/lib/zfp/zfpWasmLoader';

/** File types the volume import accepts. */
export const VOLUME_ACCEPT = '.sgy,.segy,.SGY,.SEGY,.zgy,.ZGY';

export const isZgyName = (name) => /\.zgy$/i.test(String(name || ''));
export const isZgyFile = (file) => Boolean(file && !file.remote && isZgyName(file.name));

/**
 * Open a ZGY, with the ZFP decoder loaded only when the file has compressed bricks.
 * @param {import('../engine/reader').ByteReader} raw
 */
export async function openZgyFile(raw, { zfp = loadZfpDecode } = {}) {
  const plain = await openZgy(raw);
  if (!plain.meta.compressedBricks) return plain;
  return openZgy(raw, { zfpDecode: await zfp() });
}

/**
 * The SEG-Y bytes of a picked file: the file itself, or a ZGY's SEG-Y view
 * (with the open ZGY as `zgyHandle`).
 * @param {File|Blob} file
 * @returns {Promise<import('../engine/reader').ByteReader>}
 */
export async function importSourceReader(file, opts = {}) {
  const raw = fileReader(file);
  if (!isZgyFile(file)) return raw;
  const zgy = await openZgyFile(raw, opts);
  const reader = zgySegyReader(zgy, { sourceName: file.name });
  reader.zgyHandle = zgy;
  return reader;
}

/**
 * The display clip a conversion of this source starts from, when the
 * source can give it cheaper than the trace-spread pre-pass: a compressed
 * ZGY (that pre-pass would decode its bricks again and again). Null
 * otherwise (the conversion measures it as usual).
 */
export async function sourceClip(reader) {
  const z = reader?.zgyHandle;
  if (!z || !z.meta.compressedBricks) return null;
  return zgyAmplitudeClip(z);
}

/** What the import dialog says about a picked ZGY. */
export function zgySummary(reader) {
  const view = reader?.zgy;
  if (!view) return null;
  const { meta, layout } = view;
  return {
    version: meta.version,
    stored: meta.dtype,
    compressed: meta.compressedBricks > 0,
    vertical: meta.vertical,
    verticalUnit: layout.unit || null,
    firstSample: layout.z0,
    notes: layout.notes,
    segyBytes: reader.size,
    hasCoordinates: Boolean(meta.corners),
    projection: meta.hprjsys || null,
  };
}

const stemOf = (name) => String(name || 'volume.zgy').replace(/\.zgy$/i, '');

/**
 * The ZGY's SEG-Y view as the resumable upload reads it (the server import
 * converts SEG-Y). Same shape as cropImport.cropFileLike: `slice` serves the
 * fingerprint, the upload reads parts with `read`.
 */
export function zgyFileLike(reader, file) {
  return {
    name: `${stemOf(file.name)}.sgy`,
    size: reader.size,
    lastModified: file.lastModified || 0,
    cropKey: `zgy:${file.name}|${file.size}`,
    virtual: true,
    read: (offset, length) => reader.read(offset, length),
    slice: (a, b) => ({ arrayBuffer: () => reader.read(a, Math.min(b, reader.size) - a) }),
  };
}
