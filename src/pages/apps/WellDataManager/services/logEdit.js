// Log editing in Well Data Manager (QI programme Q1 / A3, 2026-10-06):
// splice runs, interval edits with a ledger, and sonic drift correction
// against the well's checkshots. Every result is a NEW curve (owner rule,
// as for digitized curves): <MNEM>_SPL, <MNEM>_ED, <DT>_DC, with the next
// free ':n' suffix, and the ledger in its provenance. Raw logs are never
// written. Pure apart from nothing: the panel saves through the backend.
// The maths is the engines' (petrophysics/logEdit.js).

import { spliceRuns, applyEdits, sonicDriftCorrection } from '../engine/logEdit';
import { nextFreeName, nameKey } from '@/lib/curveNames';
import { makeWellFrame } from '@/lib/wellDatum';

export const ENGINE = 'well-data-manager';
export const PIPELINE_VERSION = 'wdm-edit-1.0.0';

/** The depth (m MD) of each sample of a stored log; null when the log is irregular. */
export function logDepths(log) {
  if (log.step_m == null || !(Number(log.step_m) > 0)) return null;
  const n = Number(log.n_samples);
  return Array.from({ length: n }, (_, i) => Number(log.start_md_m) + i * Number(log.step_m));
}

/** A regular grid covering every log, at the finest step among them. */
export function commonGrid(logs) {
  const reg = logs.filter((l) => logDepths(l));
  if (reg.length !== logs.length) throw new Error('Every curve needs a regular depth step to be edited here.');
  const step = Math.min(...reg.map((l) => Number(l.step_m)));
  const top = Math.min(...reg.map((l) => Number(l.start_md_m)));
  const base = Math.max(...reg.map((l) => Number(l.stop_md_m)));
  const n = Math.floor((base - top) / step + 1e-9) + 1;
  return Array.from({ length: n }, (_, i) => top + i * step);
}

/** A stored curve read onto a grid: linear between bracketing samples, null outside, nulls never bridged. */
export function resampleTo(log, data, grid) {
  const d = logDepths(log);
  const out = new Float64Array(grid.length).fill(NaN);
  const step = Number(log.step_m);
  for (let k = 0; k < grid.length; k++) {
    const f = (grid[k] - d[0]) / step;
    if (f < -1e-9 || f > d.length - 1 + 1e-9) continue;
    const i = Math.min(d.length - 2, Math.max(0, Math.floor(f + 1e-9)));
    const t = Math.min(1, Math.max(0, f - i));
    const a = data[i]; const b = data[i + 1];
    if (t < 1e-9) out[k] = Number.isFinite(a) ? a : NaN;
    else if (t > 1 - 1e-9) out[k] = Number.isFinite(b) ? b : NaN;
    else out[k] = Number.isFinite(a) && Number.isFinite(b) ? a + t * (b - a) : NaN;
  }
  return out;
}

const baseName = (m) => nameKey(m).split(':')[0].replace(/_(SPL|ED|DC)$/, '') || 'CURVE';

function prepared(mnemonic, unit, description, grid, x, provenance) {
  const data = Float32Array.from(x, (v) => (Number.isFinite(v) ? v : NaN));
  let nullCount = 0;
  for (const v of data) if (!Number.isFinite(v)) nullCount += 1;
  return {
    mnemonic, unit, description, data,
    startMdM: grid[0], stopMdM: grid[grid.length - 1], stepM: grid.length > 1 ? grid[1] - grid[0] : null,
    nSamples: grid.length, nullCount,
    provenance: { computed: true, engine: ENGINE, pipeline_version: PIPELINE_VERSION, created_at: new Date().toISOString(), ...provenance },
  };
}

/**
 * Splice runs into one new curve.
 * @param {Array<{log: Object, data: ArrayLike<number>, top: number, base: number}>} runs in priority order
 * @param {{matchWindowM?: number, existingNames: string[]}} opts
 */
export function prepareSplice(runs, { matchWindowM = 0, existingNames = [] } = {}) {
  if (runs.length < 2) throw new Error('Choose at least two runs to splice.');
  const units = new Set(runs.map((r) => String(r.log.unit || '').toUpperCase()));
  if (units.size > 1) throw new Error(`The runs are in different units (${[...units].join(', ')}): convert them first.`);
  const grid = commonGrid(runs.map((r) => r.log));
  const res = spliceRuns(grid, runs.map((r) => ({ x: resampleTo(r.log, r.data, grid), top: r.top, base: r.base, name: r.log.mnemonic })), { matchWindowM });
  const mnemonic = nextFreeName(`${baseName(runs[0].log.mnemonic)}_SPL`, existingNames);
  const desc = `Spliced from ${runs.map((r) => `${r.log.mnemonic} (${r.top} to ${r.base} m)`).join(', ')}${matchWindowM > 0 ? `, levels matched over ${matchWindowM} m at each join` : ''}`;
  return {
    log: prepared(mnemonic, runs[0].log.unit, desc, grid, res.x, {
      operation: 'splice',
      input_log_ids: runs.map((r) => r.log.id),
      runs: runs.map((r, k) => ({ log_id: r.log.id, mnemonic: r.log.mnemonic, top_md_m: r.top, base_md_m: r.base, offset: k ? res.joins[k - 1].offset : 0 })),
      match_window_m: matchWindowM,
    }),
    joins: res.joins,
  };
}

/** Apply edits to one curve as a new curve, with the ledger. */
export function prepareEdits(log, data, edits, { existingNames = [] } = {}) {
  if (!edits.length) throw new Error('Add at least one edit.');
  const grid = logDepths(log);
  if (!grid) throw new Error('This curve has no regular depth step, so it cannot be edited here.');
  const res = applyEdits(grid, Array.from(data), edits);
  const mnemonic = nextFreeName(`${baseName(log.mnemonic)}_ED`, existingNames);
  const desc = `${log.mnemonic} edited: ${res.ledger.map((l) => `${l.op} ${l.top} to ${l.base} m (${l.changed} samples)`).join('; ')}`;
  return {
    log: prepared(mnemonic, log.unit, desc, grid, res.x, { operation: 'edit', input_log_ids: [log.id], source_mnemonic: log.mnemonic, ledger: res.ledger }),
    ledger: res.ledger,
  };
}

/** Sonic slowness in us/m from a stored DT curve (us/m or us/ft). */
function toUsPerM(unit, v) {
  const u = String(unit || '').toUpperCase().replace(/\s/g, '');
  if (u === 'US/M' || u === 'USEC/M') return v;
  if (u === 'US/F' || u === 'US/FT' || u === 'USEC/FT' || u === 'US/FOOT') return v / 0.3048;
  throw new Error(`The sonic unit "${unit}" is not a slowness this tool reads (us/m or us/ft).`);
}

/**
 * Drift-correct a sonic against the well's stored checkshots (TVDSS, TWT).
 * The sonic is integrated on TVDSS, like the vertical checkshot times, so the
 * well's elevation must be set; the corrected curve stays on the sonic's MD grid.
 */
export function prepareDrift(well, log, data, { existingNames = [] } = {}) {
  const rows = Array.isArray(well?.checkshots) ? well.checkshots : [];
  if (rows.length < 2) throw new Error('This well needs at least two checkshot levels (add them on the Checkshots tab).');
  const frame = makeWellFrame(well);
  if (!frame.datum?.tvdssOk) throw new Error('Set the well elevation first: the checkshot depths are TVDSS, so the sonic needs the same reference.');
  const md = logDepths(log);
  if (!md) throw new Error('This curve has no regular depth step.');
  const dtUsM = Array.from(data, (v) => (Number.isFinite(v) ? toUsPerM(log.unit, v) : NaN));
  const tvdss = md.map((m) => frame.mdToTvdss(m).tvdss);
  for (let i = 1; i < tvdss.length; i++) {
    if (!(tvdss[i] > tvdss[i - 1])) throw new Error('The well turns horizontal or upward inside the sonic, so its vertical depth does not increase; drift correction needs it to.');
  }
  // vertical time through layered rock is the slowness integrated over
  // vertical depth: the sonic's slowness at each sample, on the TVDSS axis
  // (no dMD/dTVD factor; that would give the along-hole time instead)
  const checkshots = rows
    .filter((r) => Number.isFinite(r.tvdss_m) && Number.isFinite(r.twt_ms))
    .map((r) => ({ md: Number(r.tvdss_m), owtS: Number(r.twt_ms) / 2000 }));
  const res = sonicDriftCorrection({ depth: tvdss, dt: dtUsM, checkshots });
  // the corrected slowness, back in the curve's own unit
  const perUnit = toUsPerM(log.unit, 1); // us/m per one unit of the curve
  const back = res.dt.map((v) => (Number.isFinite(v) ? v / perUnit : NaN));
  const mnemonic = nextFreeName(`${baseName(log.mnemonic)}_DC`, existingNames);
  const desc = `${log.mnemonic} drift-corrected to ${res.usedLevels} checkshot levels (largest drift ${Math.max(...res.drift.map((d) => Math.abs(d.driftMs))).toFixed(2)} ms, closure ${res.closureMs.toFixed(3)} ms)`;
  return {
    log: prepared(mnemonic, log.unit, desc, md, back, {
      operation: 'drift-correction',
      input_log_ids: [log.id],
      source_mnemonic: log.mnemonic,
      method: 'block shift between checkshot levels, integrated on TVDSS',
      drift: res.drift,
      corrections: res.corrections,
      closure_ms: res.closureMs,
      uncorrected_ends: res.outside,
      gap_m: res.gapM,
    }),
    report: res,
  };
}
