// Merge a parsed LAS into an EXISTING registry well (owner finding
// 2026-09-03: survey + checkshots were loaded into a new well, then the
// LAS import created a second well instead of filling the first).
//
// Pure planning, no I/O: the dialog feeds it the prepared logs, the
// user's keep/rename choices and what the target well already holds;
// it answers with exactly which log rows to write, what to delete first
// and what happened to each curve. Rules:
//
//   depth    a well has ONE depth vector. When the target already has a
//            depth log, the LAS depth curve is not written again and
//            every incoming curve is RESAMPLED onto the well's grid
//            (linear between neighbouring finite samples, NaN where a
//            neighbour is null or outside the LAS interval). Same grid
//            -> samples pass through untouched.
//   names    the saved mnemonic is the user's "save as" (defaults to the
//            LAS mnemonic); empty or duplicated names within one import
//            are errors, never guessed.
//   clashes  a name the well already carries is either kept alongside
//            with the next free ':n' suffix (the registry convention the
//            alias mapper ignores) or REPLACES the existing log (the old
//            row is deleted first). Per curve; default is keep both.
//   provenance  source_mnemonic when renamed, resampled_from when
//            regridded, replaced_log_id when replacing.

const NAN = Number.NaN;

const base = (m) => String(m || '').toUpperCase().split(':')[0];
import { nextFreeName, nameKey } from '@/lib/curveNames';
import { CURVE_ALIASES } from '@/components/wells/curveMap';

// the DEPT alias family every downstream app reads (WDM-U1-003: TDEP and
// friends are depth too, so a second LAS never writes a second depth curve)
const isDepthMnemonic = (m) => CURVE_ALIASES.DEPT.includes(base(m));

/** Linear resample of (depthSrc, data) onto depthDst; both ascending MD in
 *  metres. Returns Float32Array(depthDst.length). */
export function resampleToGrid(depthSrc, data, depthDst) {
  const n = depthSrc.length;
  const out = new Float32Array(depthDst.length).fill(NAN);
  if (!n || n !== data.length) return out;
  let j = 0;
  for (let i = 0; i < depthDst.length; i++) {
    const d = depthDst[i];
    if (!Number.isFinite(d) || d < depthSrc[0] || d > depthSrc[n - 1]) continue;
    while (j < n - 2 && depthSrc[j + 1] < d) j++;
    const d0 = depthSrc[j];
    const d1 = depthSrc[j + 1];
    const v0 = data[j];
    const v1 = data[j + 1];
    if (d === d0) { out[i] = v0; continue; }
    if (d1 === undefined || d === d1) { out[i] = d1 === undefined ? v0 : v1; continue; }
    if (!Number.isFinite(v0) || !Number.isFinite(v1)) continue;
    const t = (d - d0) / (d1 - d0);
    out[i] = v0 + t * (v1 - v0);
  }
  return out;
}

/**
 * Point data onto a log grid without inventing values (PETRO-U1-011): each
 * grid sample takes the NEAREST source sample within half a grid step, or
 * NaN. For core plugs and other sparse or irregular measurements, where
 * linear resampling drew a continuous "core porosity" between plugs metres
 * apart and kept none of the measured values.
 */
export function placeNearest(depthSrc, data, depthDst) {
  const out = new Float32Array(depthDst.length).fill(NAN);
  const n = depthSrc.length;
  if (!n || n !== data.length || depthDst.length < 2) return out;
  let j = 0;
  for (let i = 0; i < depthDst.length; i++) {
    const d = depthDst[i];
    if (!Number.isFinite(d)) continue;
    const half = Math.abs((i + 1 < depthDst.length ? depthDst[i + 1] - d : d - depthDst[i - 1])) / 2;
    while (j < n - 1 && Math.abs(depthSrc[j + 1] - d) <= Math.abs(depthSrc[j] - d)) j++;
    // among equally near finite samples, take the first finite one
    let best = -1;
    for (let k = Math.max(0, j - 1); k <= Math.min(n - 1, j + 1); k++) {
      if (!Number.isFinite(data[k]) || Math.abs(depthSrc[k] - d) > half + 1e-9) continue;
      if (best < 0 || Math.abs(depthSrc[k] - d) < Math.abs(depthSrc[best] - d)) best = k;
    }
    if (best >= 0) out[i] = data[best];
  }
  return out;
}

/** Sparse or irregular: no constant step (null), or more than half the
 *  samples null. A negative step is an unoriented regular log, not points. */
export function isPointData(stepM, data) {
  if (stepM === null || stepM === undefined || Number.isNaN(stepM)) return true;
  let nulls = 0;
  for (let i = 0; i < data.length; i++) if (!Number.isFinite(data[i])) nulls++;
  return data.length > 0 && nulls / data.length > 0.5;
}

/** True when two depth vectors are the same grid (length and every
 *  sample within 1 mm). */
export function sameGrid(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-3) return false;
  return true;
}

const countNulls = (arr) => { let c = 0; for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) c++; return c; };

// Naming lives in src/lib/curveNames.js (shared with the digitizer); kept
// exported here for existing callers and tests.
export { nextFreeName };

/**
 * @param {Object} p
 * @param {Array} p.prepLogs   prepareLogs().logs (index 0 = LAS depth)
 * @param {Object} p.keep      mnemonic -> boolean (depth ignored: always eligible)
 * @param {Object} [p.names]   mnemonic -> save-as name (default: mnemonic)
 * @param {Object} [p.onClash] mnemonic -> 'suffix' | 'replace' (default 'suffix')
 * @param {Array}  [p.existingLogs]  registry rows on the target well
 * @param {{log: Object, data: Float32Array}} [p.existingDepth] the well's
 *   depth log with its samples; absent = the well has no depth yet
 * @returns {{logs: Array, deletions: Array, report: Array, errors: string[],
 *   depthReused: boolean, resampled: number}}
 */
export function planMerge({ prepLogs, keep, names = {}, onClash = {}, existingLogs = [], existingDepth = null }) {
  const errors = [];
  const report = [];
  const deletions = [];
  const logs = [];
  if (!prepLogs?.length) return { logs, deletions, report, errors: ['Nothing parsed.'], depthReused: false, resampled: 0 };

  const lasDepth = prepLogs[0];
  const depthReused = !!(existingDepth && existingDepth.data && existingDepth.data.length);
  const regrid = depthReused && !sameGrid(lasDepth.data, existingDepth.data);
  const dst = depthReused ? existingDepth.data : null;
  const startMdM = depthReused ? existingDepth.log.start_md_m : lasDepth.startMdM;
  const stopMdM = depthReused ? existingDepth.log.stop_md_m : lasDepth.stopMdM;
  const stepM = depthReused ? existingDepth.log.step_m : lasDepth.stepM;

  // names: default, trim, validate unique within the import
  const chosen = new Map();
  const seen = new Map();
  prepLogs.forEach((l, i) => {
    if (i === 0 || !keep[l.mnemonic]) return;
    const raw = names[l.mnemonic] !== undefined ? names[l.mnemonic] : l.mnemonic;
    const name = String(raw || '').trim();
    if (!name) { errors.push(`Curve ${l.mnemonic} needs a name.`); return; }
    if (/[\s]/.test(name)) { errors.push(`Curve name "${name}" must not contain spaces.`); return; }
    const k = nameKey(name);
    if (seen.has(k)) { errors.push(`Two curves would be saved as "${name}" (${seen.get(k)} and ${l.mnemonic}).`); return; }
    seen.set(k, l.mnemonic);
    chosen.set(l.mnemonic, name);
  });
  if (errors.length) return { logs, deletions, report, errors, depthReused, resampled: 0 };

  const existingNames = existingLogs.map((e) => e.mnemonic);
  let resampled = 0;
  // point placement needs an ascending index (an unoriented bottom-up file
  // keeps the old path, which its own orientation step exists to prevent)
  let srcAscending = true;
  for (let i = 1; i < (lasDepth.data?.length || 0); i++) if (!(lasDepth.data[i] > lasDepth.data[i - 1])) { srcAscending = false; break; }

  // depth: written only when the well has none
  if (!depthReused) {
    logs.push({ ...lasDepth });
    report.push({ mnemonic: lasDepth.mnemonic, savedAs: lasDepth.mnemonic, action: 'depth' });
  } else {
    report.push({ mnemonic: lasDepth.mnemonic, savedAs: existingDepth.log.mnemonic, action: regrid ? 'depth-resampled' : 'depth-same-grid' });
  }

  prepLogs.forEach((l, i) => {
    if (i === 0 || !chosen.has(l.mnemonic)) return;
    let savedAs = chosen.get(l.mnemonic);
    const provenance = { ...(l.provenance || {}) };
    if (nameKey(savedAs) !== nameKey(l.mnemonic)) provenance.source_mnemonic = l.mnemonic;

    let action = 'add';
    const clash = existingLogs.find((e) => nameKey(e.mnemonic) === nameKey(savedAs));
    if (clash) {
      const mode = onClash[l.mnemonic] === 'replace' ? 'replace' : 'suffix';
      if (mode === 'replace') {
        deletions.push(clash);
        provenance.replaced_log_id = clash.id;
        action = 'replace';
      } else {
        savedAs = nextFreeName(savedAs, [...existingNames, ...logs.map((x) => x.mnemonic)]);
        action = 'add-suffixed';
      }
    }

    let data = l.data;
    if (regrid) {
      // PETRO-U1-011: point data (core plugs, sparse samples) is placed on
      // the nearest grid sample, never interpolated between measurements
      const points = srcAscending && isPointData(lasDepth.stepM, l.data);
      data = points ? placeNearest(lasDepth.data, l.data, dst) : resampleToGrid(lasDepth.data, l.data, dst);
      provenance.resampled_from = {
        start_md_m: l.startMdM, stop_md_m: l.stopMdM, step_m: l.stepM, n_samples: l.nSamples,
        depth_mnemonic: lasDepth.mnemonic,
        ...(points ? { method: 'nearest sample within half a grid step (point data, not interpolated)' } : {}),
      };
      resampled++;
    }
    logs.push({
      ...l,
      mnemonic: savedAs,
      data,
      nSamples: data.length,
      nullCount: countNulls(data),
      startMdM, stopMdM, stepM,
      provenance,
    });
    report.push({ mnemonic: l.mnemonic, savedAs, action, resampled: regrid });
  });

  return { logs, deletions, report, errors, depthReused, resampled };
}

/** The depth log among a well's registry rows, if any. */
export function findDepthLog(existingLogs) {
  return (existingLogs || []).find((e) => isDepthMnemonic(e.mnemonic)) || null;
}

/** Existing mnemonic a save-as name would collide with (for the table badge). */
export function clashFor(name, existingLogs) {
  const k = nameKey(name);
  if (!k) return null;
  return (existingLogs || []).find((e) => nameKey(e.mnemonic) === k) || null;
}
