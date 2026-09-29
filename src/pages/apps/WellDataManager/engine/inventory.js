// Registry inventory and QC flags (AppUpgrade WDM-U2-006): the data
// manager's first question, "what is missing or suspect in my field",
// answered for every well at once instead of well by well.
//
// Each flag is computed from the registry rows only (log metadata, tops,
// the well row); no curve samples are read, so the table scales to a
// field of thousands of wells. A flag says what is wrong, why it matters
// downstream and where to fix it. Pure functions, no I/O.

import { CURVE_ALIASES } from '@/components/wells/curveMap';
import { fmtDepth, unitText } from './displayUnits';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const base = (m) => String(m || '').trim().toUpperCase().split(':')[0];
const isDepth = (m) => CURVE_ALIASES.DEPT.includes(base(m));
const has = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

/**
 * Every flag the inventory raises. `level` warn = a result downstream is
 * wrong or missing until fixed; info = worth knowing, not wrong.
 */
export const QC_FLAGS = Object.freeze([
  { code: 'no_location', level: 'warn', label: 'No surface location', why: 'Not drawn on the map and not posted by Mapping or Seismolord.', fix: 'Header tab: Surface X and Y.' },
  { code: 'no_crs', level: 'warn', label: 'No CRS', why: 'The coordinates cannot be compared with other wells or reprojected.', fix: 'Header tab: Assign CRS.' },
  { code: 'mixed_frame', level: 'warn', label: 'CRS differs from most wells', why: 'Positions are not comparable on one map until reprojected to the Project CRS.', fix: 'Reproject to the Project CRS.' },
  { code: 'no_kb', level: 'warn', label: 'KB not set', why: 'TVDSS equals TVD, and checkshot time assumes KB at the datum.', fix: 'Header tab: KB.' },
  { code: 'bottom_up', level: 'warn', label: 'Curves stored bottom-up', why: 'Stored by an earlier release with depth decreasing; readers index them by sample.', fix: 'Logs tab: Reorient.' },
  { code: 'no_depth', level: 'warn', label: 'Logs without a depth curve', why: 'Downstream apps find no depth to plot the curves against.', fix: 'Re-import the LAS.' },
  { code: 'top_below_td', level: 'warn', label: 'Top deeper than TD', why: 'A pick below total depth is usually a unit or datum slip.', fix: 'Tops tab or Header tab: TD.' },
  { code: 'irregular_step', level: 'info', label: 'Irregular depth step', why: 'Plotted by sample index in the quick view; resampling may be needed.', fix: 'Petrophysics Studio conditioning.' },
  { code: 'no_td', level: 'info', label: 'No TD', why: 'The well is drawn to its last survey station or log sample.', fix: 'Header tab: TD.' },
  { code: 'no_survey', level: 'info', label: 'No deviation survey', why: 'Treated as vertical: TVD equals MD.', fix: 'Deviation tab.' },
  { code: 'no_logs', level: 'info', label: 'No logs', why: 'Nothing for Petrophysics or Correlation to read.', fix: 'Import LAS.' },
  { code: 'no_tops', level: 'info', label: 'No tops', why: 'Nothing for Correlation or Mapping to map.', fix: 'Tops tab or the Tops sheet.' },
]);
export const FLAG_BY_CODE = Object.freeze(Object.fromEntries(QC_FLAGS.map((f) => [f.code, f])));

/** The CRS most located wells are stored in ('' when none). */
export function majorityFrame(wells) {
  const counts = new Map();
  for (const w of wells || []) {
    if (!has(w.surface_x) || !has(w.surface_y) || !w.crs) continue;
    counts.set(w.crs, (counts.get(w.crs) || 0) + 1);
  }
  let best = '';
  let n = 0;
  for (const [k, v] of counts) if (v > n) { best = k; n = v; }
  return best;
}

/**
 * Inventory row of one well.
 * @param {Object} well registry row
 * @param {Object[]} logs log metadata rows of the well
 * @param {Object[]} tops top rows of the well
 * @param {{frame?: string}} [ctx] majority CRS of the registry
 */
export function wellInventory(well, logs = [], tops = [], ctx = {}) {
  const flags = [];
  const located = has(well.surface_x) && has(well.surface_y);
  if (!located) flags.push('no_location');
  if (located && !well.crs) flags.push('no_crs');
  if (located && well.crs && ctx.frame && well.crs !== ctx.frame) flags.push('mixed_frame');
  if (!(Number(well.kb_m) > 0)) flags.push('no_kb');
  const depthLogs = logs.filter((l) => isDepth(l.mnemonic));
  const curves = logs.filter((l) => !isDepth(l.mnemonic));
  const bottomUp = logs.filter((l) => has(l.start_md_m) && has(l.stop_md_m) && Number(l.start_md_m) > Number(l.stop_md_m));
  if (bottomUp.length) flags.push('bottom_up');
  if (curves.length && !depthLogs.length) flags.push('no_depth');
  const td = has(well.td_md_m) ? Number(well.td_md_m) : null;
  if (td !== null && tops.some((t) => Number(t.md_m) > td + 1e-6)) flags.push('top_below_td');
  if (logs.some((l) => l.step_m == null && Number(l.n_samples) > 2 && !bottomUp.includes(l))) flags.push('irregular_step');
  if (td === null) flags.push('no_td');
  if ((well.deviation || []).length < 2) flags.push('no_survey');
  if (!curves.length) flags.push('no_logs');
  if (!tops.length) flags.push('no_tops');
  const ends = logs.flatMap((l) => [Number(l.start_md_m), Number(l.stop_md_m)]).filter(Number.isFinite);
  return {
    id: well.id,
    name: well.name,
    uwi: well.uwi || null,
    isOwn: !!well.is_own,
    crs: well.crs || null,
    kbM: has(well.kb_m) ? Number(well.kb_m) : null,
    tdM: td,
    stations: (well.deviation || []).length,
    checkshots: (well.checkshots || []).length,
    nCurves: curves.length,
    curveNames: curves.map((l) => l.mnemonic),
    nTops: tops.length,
    logTopM: ends.length ? Math.min(...ends) : null,
    logBaseM: ends.length ? Math.max(...ends) : null,
    bottomUpLogs: bottomUp.map((l) => l.mnemonic),
    flags,
    warnings: flags.filter((c) => FLAG_BY_CODE[c].level === 'warn').length,
  };
}

/**
 * Inventory of the whole registry plus the count of wells per flag.
 * @returns {{rows: Object[], counts: Object<string, number>, frame: string}}
 */
export function registryInventory(wells, logs = [], tops = []) {
  const logsBy = new Map();
  const topsBy = new Map();
  for (const l of logs) { if (!logsBy.has(l.well_id)) logsBy.set(l.well_id, []); logsBy.get(l.well_id).push(l); }
  for (const t of tops) { if (!topsBy.has(t.well_id)) topsBy.set(t.well_id, []); topsBy.get(t.well_id).push(t); }
  const frame = majorityFrame(wells);
  const rows = (wells || []).map((w) => wellInventory(w, logsBy.get(w.id) || [], topsBy.get(w.id) || [], { frame }));
  const counts = Object.fromEntries(QC_FLAGS.map((f) => [f.code, 0]));
  for (const r of rows) for (const c of r.flags) counts[c] += 1;
  return { rows, counts, frame };
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The inventory as CSV, depths in the display unit. */
export function inventoryCsv(rows, unit = 'm') {
  const u = unitText(unit);
  const head = ['Well', 'UWI', 'CRS', `KB (${u})`, `TD (${u} MD)`, 'Survey stations', 'Checkshot pairs', 'Curves', 'Tops', `Logged from (${u} MD)`, `Logged to (${u} MD)`, 'Flags'];
  const lines = [head.map(csvCell).join(',')];
  for (const r of rows) {
    const d = (v) => (v === null ? '' : fmtDepth(v, u, 2));
    lines.push([r.name, r.uwi || '', r.crs || '', d(r.kbM), d(r.tdM), r.stations, r.checkshots, r.nCurves, r.nTops, d(r.logTopM), d(r.logBaseM),
      r.flags.map((c) => FLAG_BY_CODE[c].label).join('; ')].map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

export const inventoryDepth = (v, unit) => (v === null ? EMPTY_VALUE : fmtDepth(v, unit));
