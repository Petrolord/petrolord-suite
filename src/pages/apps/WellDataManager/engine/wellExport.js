// File exports from Well Data Manager (AppUpgrade WDM-U2-002): a LAS 2.0
// per well with the curves the user picks, a tops CSV and a survey CSV,
// all in the display depth unit, so clean data goes back to Petrel,
// Techlog or a contractor in one click.
//
// Contracts (tests: __tests__/u2Export.test.js):
//   LAS    parseLas + the registry door read the exported file back to the
//          SAME float32 samples: every curve bit for bit (the vendored
//          writer prints 9 significant digits), the depth bit for bit in
//          metres. In feet the vendored reader casts the feet value to
//          float32 before the exact 0.3048, so a depth first logged in
//          metres may return one float32 step away (0.24 mm at 2,000 m).
//   CSV    every depth column names its unit in the header ("MD (ft)"), so
//          the Suite's own paste door and Petrel read the unit off it.
//          Metres re-import exactly; feet to within 1e-9 m.
//   Units  depths in the display unit; curve values as stored (SI, the
//          unit is in the ~Curve section); X/Y in the well's CRS unit.
//
// Pure functions, no I/O. The caller downloads the returned text.

import { writeLas } from './lasWrite';
import { findDepthLog } from './mergeImport';
import { makeDepthFrame } from './checkshots';
import { toDisp, unitText } from './displayUnits';
import { EMPTY_VALUE } from '@/lib/emptyValue';

/** Safe file stem from a well name. */
export const fileStem = (name) => String(name || 'well').trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'well';

const sameGrid = (log, depth) => log.n_samples === depth.n_samples
  && Math.abs(Number(log.start_md_m) - Number(depth.start_md_m)) < 1e-6
  && Math.abs(Number(log.stop_md_m) - Number(depth.stop_md_m)) < 1e-6;

/**
 * Which logs can go into one LAS with the well's depth curve, and why the
 * others cannot (PL4: nothing is left out without a reason).
 * @returns {{depth: ?Object, exportable: Object[], skipped: {mnemonic: string, reason: string}[]}}
 */
export function lasExportPlan(logs) {
  const depth = findDepthLog(logs);
  if (!depth) {
    return { depth: null, exportable: [], skipped: (logs || []).map((l) => ({ mnemonic: l.mnemonic, reason: 'the well has no depth curve' })) };
  }
  const exportable = [];
  const skipped = [];
  for (const l of logs || []) {
    if (l.id === depth.id) continue;
    if (sameGrid(l, depth)) exportable.push(l);
    else skipped.push({ mnemonic: l.mnemonic, reason: `sampled on another depth grid (${l.n_samples} samples, the depth curve has ${depth.n_samples})` });
  }
  return { depth, exportable, skipped };
}

/**
 * LAS 2.0 text for one well.
 * @param {Object} p
 * @param {Object} p.well registry row
 * @param {Object[]} p.logs registry log rows of the well
 * @param {Map<string, ArrayLike<number>>|Object} p.data samples by log id (depth included)
 * @param {string[]} [p.selectedIds] curves to write (default: every exportable curve)
 * @param {'m'|'ft'} [p.unit] depth unit of the file
 * @param {string} [p.build] software build written to ~Other
 * @returns {{text: string, fileName: string, included: string[], skipped: {mnemonic: string, reason: string}[]}}
 */
export function buildWellLas({ well, logs, data, selectedIds = null, unit = 'm', build = null, date = null }) {
  const get = (id) => (data instanceof Map ? data.get(id) : data[id]);
  const plan = lasExportPlan(logs);
  if (!plan.depth) throw new Error('This well has no depth curve, so there is nothing to write a LAS file against.');
  const chosen = plan.exportable.filter((l) => !selectedIds || selectedIds.includes(l.id));
  if (!chosen.length) throw new Error('Pick at least one curve to export.');
  const u = unitText(unit);
  const depthM = get(plan.depth.id);
  if (!depthM) throw new Error(`The samples of ${plan.depth.mnemonic} are not loaded.`);
  const depth = Float64Array.from(depthM, (v) => (Number.isFinite(v) ? toDisp(v, u) : Number.NaN));
  const curves = [{ mnemonic: 'DEPT', unit: u === 'ft' ? 'F' : 'M', descr: 'Measured depth', data: depth }];
  for (const l of chosen) {
    const d = get(l.id);
    if (!d) throw new Error(`The samples of ${l.mnemonic} are not loaded.`);
    const computed = l.provenance?.computed ? ` (computed by ${l.provenance.engine || 'another app'})` : '';
    curves.push({ mnemonic: l.mnemonic, unit: l.unit || '', descr: `${l.description || l.mnemonic}${computed}`, data: d });
  }
  const params = [];
  if (Number.isFinite(Number(well.kb_m))) params.push({ name: 'EKB', unit: u === 'ft' ? 'F' : 'M', value: toDisp(well.kb_m, u), descr: 'Kelly bushing elevation above datum' });
  if (Number.isFinite(Number(well.td_md_m)) && well.td_md_m != null) params.push({ name: 'TD', unit: u === 'ft' ? 'F' : 'M', value: toDisp(well.td_md_m, u), descr: 'Total depth MD' });
  if (well.surface_x != null && well.surface_y != null) {
    const xy = String(well.xy_unit || 'm').toUpperCase();
    params.push({ name: 'XWELL', unit: xy, value: Number(well.surface_x), descr: `Surface X in ${well.crs || 'an unassigned CRS'}` });
    params.push({ name: 'YWELL', unit: xy, value: Number(well.surface_y), descr: `Surface Y in ${well.crs || 'an unassigned CRS'}` });
  }
  if (well.crs) params.push({ name: 'CRS', unit: '', value: String(well.crs), descr: 'Coordinate reference system of XWELL and YWELL' });
  const other = [
    `Exported from Petrolord Well Data Manager${build ? ` build ${build}` : ''}.`,
    `Depths in ${u === 'ft' ? 'feet' : 'metres'} MD below KB; the registry stores metres.`,
    'Curve values are in the units named in the Curve section, as stored.',
  ].join('\n');
  const text = writeLas({ wellName: well.name, uwi: well.uwi || '', depthUnit: u === 'ft' ? 'F' : 'M', curves, params, other, date });
  return { text, fileName: `${fileStem(well.name)}.las`, included: chosen.map((l) => l.mnemonic), skipped: plan.skipped };
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvLine = (cells) => cells.map(csvCell).join(',');
/** 12 significant digits, trailing zeros trimmed (metres print as stored). */
const num = (v, unit) => {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '';
  const d = toDisp(v, unit);
  return unit === 'ft' ? String(Number(d.toPrecision(12))) : String(d);
};

/**
 * Tops CSV: one row per top with MD, TVD and TVDSS in the display unit.
 * @param {Object} well @param {Object[]} tops @param {'m'|'ft'} unit
 * @param {Object[]} [units] strat units (id -> name for the Unit column)
 */
export function topsCsv(well, tops, unit = 'm', units = []) {
  const u = unitText(unit);
  const frame = makeDepthFrame({ deviation: well.deviation, kbM: well.kb_m ?? 0, tdMdM: well.td_md_m });
  const lines = [csvLine(['Well', 'UWI', 'Top', `MD (${u})`, `TVD (${u})`, `TVDSS (${u})`, 'Surface type', 'Unit', 'Confidence', 'Age (Ma)', 'Interpreter'])];
  for (const t of [...(tops || [])].sort((a, b) => a.md_m - b.md_m)) {
    let pos = null;
    try { pos = frame.mdToPosition(Number(t.md_m)); } catch (e) { pos = null; }
    lines.push(csvLine([
      well.name, well.uwi || '', t.name, num(t.md_m, u), pos ? num(pos.tvd, u) : '', pos ? num(pos.tvdss, u) : '',
      t.surface_type || '', units.find((x) => x.id === t.unit_id)?.name || '', t.confidence || '',
      t.age_ma == null ? '' : t.age_ma, t.interpreter || '',
    ]));
  }
  return { text: `${lines.join('\n')}\n`, fileName: `${fileStem(well.name)}_tops.csv` };
}

/**
 * Deviation survey CSV with the computed path (minimum curvature through
 * the welldata engine): MD, inclination, grid azimuth, TVD, TVDSS and the
 * East / North offsets from the wellhead, depths and offsets in the
 * display unit.
 */
export function surveyCsv(well, unit = 'm') {
  const u = unitText(unit);
  const stations = (well.deviation || []).filter((s) => Number.isFinite(Number(s.md)));
  if (!stations.length) throw new Error('This well has no deviation survey to export (it is treated as vertical).');
  const frame = makeDepthFrame({ deviation: well.deviation, kbM: well.kb_m ?? 0, tdMdM: well.td_md_m });
  const lines = [csvLine([`MD (${u})`, 'Inc (deg)', 'Azi grid (deg)', `TVD (${u})`, `TVDSS (${u})`, `East offset (${u})`, `North offset (${u})`])];
  for (const s of stations) {
    let p = null;
    try { p = frame.mdToPosition(Number(s.md)); } catch (e) { p = null; }
    lines.push(csvLine([num(s.md, u), String(s.inc), String(s.azi), p ? num(p.tvd, u) : '', p ? num(p.tvdss, u) : '', p ? num(p.x, u) : '', p ? num(p.y, u) : '']));
  }
  return { text: `${lines.join('\n')}\n`, fileName: `${fileStem(well.name)}_survey.csv` };
}

/** One-line description of what an export holds, for the status bar. */
export function exportSummary(kind, { included = [], skipped = [], rows = 0, unit = 'm' } = {}) {
  const u = unitText(unit);
  if (kind === 'las') {
    return `LAS written with ${included.length} curve${included.length === 1 ? '' : 's'}, depths in ${u}`
      + `${skipped.length ? `; not included: ${skipped.map((s) => `${s.mnemonic} (${s.reason})`).join(', ')}` : ''}.`;
  }
  return `${kind === 'tops' ? 'Tops' : 'Survey'} CSV written (${rows || EMPTY_VALUE} rows, depths in ${u}).`;
}
