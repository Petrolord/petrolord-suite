// Project Data Inventory: the whole inventory as one pure function of what
// is loaded (the registries) and what the user added (state.js). The
// matrix, the seismic and interpretation sections, the summary tiles, the
// notes and the readiness all come from here, so the screen, the
// presentation view, the PNG, the PDF and the CSV say the same thing.

import { COLUMN_GROUPS, COLUMNS } from './columns';
import { wellRow, tieRecord } from './cells';
import { seismicSummary } from './seismic';
import { interpretationRows } from './interpretations';
import { runRules } from './rules';
import { readiness } from './readiness';
import { sanitiseInventoryState, manualHas as manualHasIn, MANUAL_KIND_BY_KEY } from './state';
import { STATUS, STATUS_ORDER, MANUAL_STATE_BY_KEY } from './status';

const pct = (f) => `${Math.round(f * 100)}%`;

/** The short remark the matrix prints per well, from its cells. */
export function autoRemark(row, { hasSeismic = false } = {}) {
  const c = row.cells;
  const out = [];
  if (row.interval && !row.interval.matched) out.push('target zone not on the well');
  if (c.datum.status === 'missing') out.push('no datum');
  if (c.dtc.status === 'missing') out.push('no sonic');
  if (c.rhob.status === 'missing') out.push('no density');
  if (c.dts.status === 'derived') out.push('shear estimated');
  else if (c.dts.status === 'missing') out.push('no shear');
  if (c.hole.status === 'partial' && Number.isFinite(c.hole.badShare)) out.push(`bad hole ${pct(c.hole.badShare)}`);
  if (c.checkshots.status === 'missing') out.push('no checkshots');
  const t = tieRecord(row.well);
  if (hasSeismic && !t && c.dtc.status !== 'missing') out.push('not tied');
  else if (t && t.meanCorr !== null && c.tie.status === 'partial') out.push(`tie ${t.meanCorr.toFixed(2)}`);
  if (c.phi.status === 'missing' || c.sw.status === 'missing') out.push('not interpreted');
  const s = out.join('; ');
  return s ? `${s[0].toUpperCase()}${s.slice(1)}.` : 'Complete for the interval.';
}

/**
 * @param {Object} p
 * @param {Array<{well, logs, zones, tops}>} p.wells
 * @param {{volumes?, datasets?, horizons?, faults?, surfaces?}} [p.seismicData]
 * @param {Object<string, ArrayLike<number>>} [p.samples] curve samples by log id, once scanned
 * @param {Object} [p.state] the user's additions (state.js)
 * @param {'qi'|'petro'} [p.audience]
 * @param {'ft'|'m'} [p.unit]
 * @param {Object} [p.defaultInterval] used when the state has none
 * @param {{velocity?: Array, records?: Array}} [p.extras] host-app records for the interpretation section
 */
export function buildInventory({
  wells = [], seismicData = {}, samples = {}, state = null, audience = 'qi', unit = 'ft', defaultInterval = { mode: 'well' }, extras = {},
} = {}) {
  const s = sanitiseInventoryState(state);
  const interval = s.interval || defaultInterval || { mode: 'well' };
  const rows = wells.map((b) => {
    const r = wellRow(b, { interval, samples, overrides: s.cells[b.well.id] || {}, unit });
    return { ...r, well: b.well };
  });
  const seismic = seismicSummary(seismicData.volumes || [], seismicData.datasets || [], { allVolumeNames: seismicData.allVolumeNames || null });
  const interpList = interpretationRows({ wells, horizons: seismicData.horizons, faults: seismicData.faults, surfaces: seismicData.surfaces, extras });
  const interp = Object.fromEntries(interpList.map((r) => [r.key, r]));
  for (const r of rows) {
    r.autoRemark = autoRemark(r, { hasSeismic: seismic.stacks.length > 0 });
    r.remark = s.remarks[r.wellId] || r.autoRemark;
    r.remarkEdited = !!s.remarks[r.wellId];
  }
  const ctx = {
    rows, seismic, interp, audience, unit, columns: COLUMNS, manualHas: (tag) => manualHasIn(s, tag),
  };
  const findings = runRules(ctx).map((f) => ({
    ...f, dismissed: !!s.notes[f.id]?.dismissed, comment: s.notes[f.id]?.comment || '',
  }));
  const ready = readiness({ rows, seismic, interp, audience });

  // counts by state over every cell, and the completeness share
  const counts = Object.fromEntries([...STATUS_ORDER, 'pending'].map((k) => [k, 0]));
  for (const r of rows) for (const col of COLUMNS) counts[r.cells[col.key].status] = (counts[r.cells[col.key].status] || 0) + 1;
  const judged = rows.length * COLUMNS.length - counts.unrecorded - counts.pending;
  const completeness = judged > 0 ? (counts.complete + 0.5 * (counts.partial + counts.derived + counts.external)) / judged : null;
  const curves = wells.reduce((n, b) => n + (b.logs || []).filter((l) => !/^(DEPT|DEPTH|MD|TDEP)$/i.test(String(l.mnemonic || '').split(':')[0])).length, 0);
  const manual = s.manual.map((m) => ({
    ...m, kindLabel: MANUAL_KIND_BY_KEY[m.kind]?.label || 'Other', status: MANUAL_STATE_BY_KEY[m.state]?.status || 'external', stateLabel: MANUAL_STATE_BY_KEY[m.state]?.label || '',
  }));
  const open = findings.filter((f) => !f.dismissed);
  return {
    audience,
    unit,
    interval,
    groups: COLUMN_GROUPS,
    columns: COLUMNS,
    rows,
    seismic,
    interpretations: interpList,
    manual,
    findings,
    readiness: ready,
    counts,
    statusesShown: STATUS_ORDER.filter((k) => counts[k] > 0 || ['complete', 'partial', 'derived', 'missing', 'notAcquired'].includes(k)),
    summary: {
      wells: rows.length,
      curves,
      completeness,
      volumes: seismic.delivered.length,
      angleStacks: seismic.angle.length,
      gathers: seismic.gathers.length,
      derivedVolumes: seismic.derived.length,
      areaKm2: seismic.areaKm2,
      horizons: interp.horizons?.count || 0,
      faults: interp.faults?.count || 0,
      score: ready.score,
      high: open.filter((f) => f.severity === 'high').length,
      notes: open.length,
    },
    scanned: rows.every((r) => COLUMNS.every((c) => !r.cells[c.key].approx && r.cells[c.key].status !== 'pending')),
  };
}

export { STATUS };
