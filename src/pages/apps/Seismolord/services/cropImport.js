// Crop before upload (owner-approved 2026-10-14): the import's crop step.
// The crop happens while the local SEG-Y is read, so only the kept traces
// and samples are ever uploaded or stored; at 1 MB/s an uncropped 80 GB
// stack is a day of upload.
//
//   planImportCrop   the crop snapped to this file, and its kept traces
//                    (arithmetic for a regular grid, the trace headers for
//                    anything else, gathers included)
//   cropSource       the cropped SEG-Y as a reader (valid file, source bytes)
//   spotCheckCrop    reads the first and last kept trace of up to 200 runs,
//                    so a file that only looked regular stops before upload
//   conversionView   the cropped file as the converters read it: through
//                    the SEG-Y door, with the window's top padded with nulls
//                    so the volume keeps the 0 ms origin
//   cropFileLike     the cropped file as a File-like for the resumable upload
//
// The engines do the byte work (packages/engines/engines/seismolord/segyCrop.js).
import {
  normalizeCrop, planRegularCrop, planCropFromHeaders, croppedSegyReader, padTopReader,
  detectGatherLayout, croppedFileBytes, cropKeeps, cropProvenance, cropIsWhole,
} from '../engine/segyCrop';
import { scanGeometry } from '../engine/segyScan';
import { inspectSegy, openSegyDoor, needsTraceLattice, doorScanWarnings } from '../lib/segyDoor';

const MB = 1e6;

/** Where the traces are and how wide they are, from the SEG-Y door. */
export function layoutFromDoor(door, size) {
  const traceBytes = 240 + door.ns * door.sampleBytes;
  return {
    dataStart: door.dataStart,
    sampleBytes: door.sampleBytes,
    ns: door.ns,
    dtUs: door.dtUs,
    littleEndian: door.byteOrder === 'little',
    formatCode: door.formatCode,
    traceBytes,
    totalTraces: Math.floor((size - door.dataStart) / traceBytes),
  };
}

/** The kept cell count of a crop over the grid (no file reads). */
export function keptCells(crop) {
  if (!crop.polygon) return crop.il.count * crop.xl.count;
  let n = 0;
  for (let il = crop.il.from; il <= crop.il.to; il += crop.il.step) {
    for (let xl = crop.xl.from; xl <= crop.xl.to; xl += crop.xl.step) if (cropKeeps(crop, il, xl)) n += 1;
  }
  return n;
}

/**
 * What the crop keeps, before any file is read: exact for a regular grid,
 * "about" (by area) for an irregular outline or gathers.
 */
export function cropEstimate({ crop, scan, door, fileSize, gathers = null }) {
  const bps = door?.sampleBytes || 4;
  const ns = door?.ns || scan.ns;
  const traceBytes = 240 + ns * bps;
  const totalTraces = door ? Math.floor((fileSize - door.dataStart) / traceBytes) : scan.totalTraces;
  const regular = !gathers?.gathers && !needsTraceLattice(scan);
  const cells = keptCells(crop);
  const allCells = scan.il.count * scan.xl.count;
  const keptTraces = regular ? cells : Math.round(totalTraces * (cells / Math.max(1, allCells)));
  const croppedBytes = croppedFileBytes(keptTraces, crop.samples.count, bps);
  return {
    keptTraces,
    approximate: !regular,
    totalTraces,
    originalBytes: fileSize,
    croppedBytes,
    share: fileSize > 0 ? croppedBytes / fileSize : 1,
  };
}

/** Seconds to upload `bytes` at `mbPerSecond` (megabytes of 10^6 bytes). */
export const uploadSeconds = (bytes, mbPerSecond) => (mbPerSecond > 0 ? bytes / (mbPerSecond * MB) : Infinity);

/** "3 h 20 min", "14 min", "40 s". */
export function formatDuration(s) {
  if (!Number.isFinite(s)) return 'unknown';
  if (s < 60) return `${Math.max(1, Math.round(s))} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${(h / 24).toFixed(1)} days`;
}

/**
 * Snap the crop to this file and find its kept traces.
 * @param {Object} p
 * @param {import('../engine/reader').ByteReader} p.raw the file as it is on disk
 * @param {Object} p.scan the import preview scan
 * @param {Object} p.def the crop the user chose
 * @param {{ilByte, xlByte}} p.mapping
 * @param {boolean} [p.fromHeaders] find the kept traces from the headers even for a regular grid
 */
export async function planImportCrop({ raw, scan, def, mapping, fromHeaders = false, onProgress, isCancelled }) {
  const door = await inspectSegy(raw);
  const layout = layoutFromDoor(door, raw.size);
  const crop = normalizeCrop(def, { il: scan.il, xl: scan.xl, ns: door.ns, dtUs: door.dtUs });
  const gathers = await detectGatherLayout(raw, layout, mapping);
  const regular = !gathers.gathers && !needsTraceLattice(scan) && !fromHeaders;
  const plan = regular
    ? planRegularCrop({ ...scan, totalTraces: layout.totalTraces }, crop)
    : await planCropFromHeaders(raw, layout, mapping, crop, { inlineSorted: scan.inlineSorted !== false, onProgress, isCancelled });
  return { door, layout, crop, plan, gathers, whole: cropIsWhole(crop) && plan.keptTraces === layout.totalTraces };
}

export const cropSource = (raw, { layout, plan, crop }, { sourceName, mapping }) => croppedSegyReader(raw, layout, plan, crop, { sourceName, mapping });

/** Read the first and last kept trace of up to `maxRuns` runs spread over the plan. */
export async function spotCheckCrop(cropped, plan, maxRuns = 200) {
  const tb = cropped.traceBytes;
  const step = Math.max(1, Math.floor(plan.runs / maxRuns));
  for (let r = 0; r < plan.runs; r += step) {
    await cropped.read(3600 + plan.cum[r] * tb, 240);
    await cropped.read(3600 + (plan.cum[r + 1] - 1) * tb, 240);
  }
  await cropped.read(3600 + (plan.keptTraces - 1) * tb, 240);
}

/** The cropped file as the converters read it (door, then the top padded). */
export async function conversionView(cropped, crop) {
  const { reader } = await openSegyDoor(cropped);
  return padTopReader(reader, crop.samples.first);
}

/** The preview scan of the conversion view (what stack_to_v4 and the browser conversion are given). */
export async function scanConversionView(view, mapping, { onProgress } = {}) {
  const { door } = await openSegyDoor(view);
  const scan = await scanGeometry(view, mapping, { maxTraces: 20000, onProgress });
  scan.warnings = doorScanWarnings(door, scan);
  return scan;
}

/** FNV-1a of a string, 8 hex digits. */
export function shortHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** Identity of a crop of a file: two crops of one file never share an upload. */
export function cropKeyOf(crop, file) {
  const { notes, ...rest } = crop;
  return shortHash(JSON.stringify([file.name, file.size, file.lastModified || 0, rest]));
}

const stemOf = (name) => String(name || 'volume.sgy').replace(/\.(sgy|segy)$/i, '');

/**
 * The cropped file as the resumable upload reads it. `slice` serves the
 * fingerprint; the upload reads parts with `read`.
 */
export function cropFileLike(cropped, { file, crop }) {
  const key = cropKeyOf(crop, file);
  return {
    name: `${stemOf(file.name)}_crop.sgy`,
    size: cropped.size,
    lastModified: file.lastModified || 0,
    cropKey: key,
    virtual: true,
    read: (offset, length) => cropped.read(offset, length),
    slice: (a, b) => ({ arrayBuffer: () => cropped.read(a, Math.min(b, cropped.size) - a) }),
  };
}

/** Provenance kept on the volume (survey_meta.ingest.crop, manifest source.crop). */
export const importCropProvenance = (prep, { file, mode, definitionId = null }) => cropProvenance(prep.crop, {
  sourceName: file.name, sourceSize: file.size, keptTraces: prep.plan.keptTraces, sourceTraces: prep.layout.totalTraces, definitionId, mode,
});

/** The conversion reader for a crop request: only the kept traces and samples, top padded. */
export async function cropConversionReader(raw, req) {
  const cropped = croppedSegyReader(raw, req.layout, req.plan, req.crop, { sourceName: req.sourceName, mapping: req.mapping });
  return conversionView(cropped, req.crop);
}

/** What crosses to the conversion worker (typed arrays clone cheaply). */
export const cropRequest = (prep, sourceName, mapping) => ({
  layout: prep.layout, plan: prep.plan, crop: prep.crop, sourceName, mapping,
});

// The crop of an unfinished upload, so picking the same file again restores it.
const REMEMBER = 'seismolord.cropFor:';
const fileKey = (f) => `${REMEMBER}${f.name}|${f.size}|${f.lastModified || 0}`;
export function rememberCropFor(file, def, storage = typeof localStorage === 'undefined' ? null : localStorage) {
  try { storage?.setItem(fileKey(file), JSON.stringify(def)); } catch { /* private window */ }
}
export function recallCropFor(file, storage = typeof localStorage === 'undefined' ? null : localStorage) {
  try { const v = storage?.getItem(fileKey(file)); return v ? JSON.parse(v) : null; } catch { return null; }
}
export function forgetCropFor(file, storage = typeof localStorage === 'undefined' ? null : localStorage) {
  try { storage?.removeItem(fileKey(file)); } catch { /* ignore */ }
}

// The last measured upload speed (MB/s), for the estimate before an upload.
const SPEED = 'seismolord.uploadSpeedMBs';
export function savedUploadSpeed(storage = typeof localStorage === 'undefined' ? null : localStorage) {
  try { const v = Number(storage?.getItem(SPEED)); return v > 0 ? v : null; } catch { return null; }
}
export function saveUploadSpeed(v, storage = typeof localStorage === 'undefined' ? null : localStorage) {
  try { if (v > 0) storage?.setItem(SPEED, String(Math.round(v * 100) / 100)); } catch { /* ignore */ }
}

/**
 * Upload speed from progress events: bytes over the last `windowMs`,
 * after the first `warmupMs` (the first part's latency is not the link).
 */
export function speedMeter({ windowMs = 30000, warmupMs = 3000, now = () => Date.now() } = {}) {
  const pts = [];
  let t0 = null;
  return {
    add(bytesDone) {
      const t = now();
      if (t0 == null) t0 = t;
      pts.push([t, bytesDone]);
      while (pts.length > 2 && t - pts[0][0] > windowMs) pts.shift();
    },
    mbPerSecond() {
      if (pts.length < 2) return null;
      const [ta, ba] = pts[0];
      const [tb, bb] = pts[pts.length - 1];
      if (tb - t0 < warmupMs || tb <= ta) return null;
      return (bb - ba) / MB / ((tb - ta) / 1000);
    },
  };
}
