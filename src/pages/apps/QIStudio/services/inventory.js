// QI Studio data inventory (QI programme Q1 / A4, 2026-10-06; SOW section 2):
// every data group a QI study asks for, with its state (requested, received,
// usable, missing, outstanding), the date it arrived and a note. What the
// Suite already holds is suggested from the registries (wells, curves,
// checkshots, surveys, tops, seismic volumes); the user confirms. Pure.

import { makeWellFrame } from '@/lib/wellDatum';
import { familyOf } from './usability';

export const STATES = Object.freeze([
  { key: 'requested', label: 'Requested' },
  { key: 'received', label: 'Received' },
  { key: 'usable', label: 'Usable' },
  { key: 'missing', label: 'Missing' },
  { key: 'outstanding', label: 'Outstanding' },
]);

export const GROUPS = Object.freeze([
  { key: 'wells-header', area: 'Wells', label: 'Well headers, coordinates and elevations' },
  { key: 'wells-survey', area: 'Wells', label: 'Deviation surveys' },
  { key: 'wells-logs', area: 'Wells', label: 'Conventional logs (GR, resistivity, density, neutron, sonic)' },
  { key: 'wells-shear', area: 'Wells', label: 'Shear sonic (dipole)' },
  { key: 'wells-checkshots', area: 'Wells', label: 'Checkshots or VSP' },
  { key: 'wells-tops', area: 'Wells', label: 'Formation tops' },
  { key: 'wells-petro', area: 'Wells', label: 'Petrophysical interpretation (porosity, Vsh, Sw)' },
  { key: 'wells-core', area: 'Wells', label: 'Core data and descriptions' },
  { key: 'wells-pressure', area: 'Wells', label: 'Pressure and fluid samples (PVT)' },
  { key: 'wells-production', area: 'Wells', label: 'Production history and first production dates' },
  { key: 'seis-full', area: 'Seismic', label: 'Full-stack volume' },
  { key: 'seis-partial', area: 'Seismic', label: 'Partial (angle) stacks' },
  { key: 'seis-gathers', area: 'Seismic', label: 'Prestack gathers' },
  { key: 'seis-velocity', area: 'Seismic', label: 'Velocity model (stacking or migration)' },
  { key: 'seis-reports', area: 'Seismic', label: 'Acquisition and processing reports' },
  { key: 'interp-horizons', area: 'Interpretation', label: 'Interpreted horizons' },
  { key: 'interp-faults', area: 'Interpretation', label: 'Interpreted faults' },
  { key: 'reports', area: 'Reports', label: 'Previous studies and well reports' },
]);

/**
 * What the registries already hold, per group: a suggested state and the
 * evidence in words. Groups the Suite cannot see stay unsuggested.
 * @param {{wells: Array<{well, logs, zones, tops?}>, volumes?: Array<{name, survey_meta?}>, horizons?: number}} held
 */
export function suggestInventory({ wells = [], volumes = [], horizons = 0 }) {
  const n = wells.length;
  const has = (pred) => wells.filter(pred).length;
  const curvesOf = (w, fam) => (w.logs || []).some((l) => familyOf(l.mnemonic) === fam);
  const out = {};
  const set = (key, count, total, noun) => {
    if (!total) return;
    out[key] = {
      state: count === total ? 'received' : count ? 'outstanding' : 'missing',
      evidence: `${count} of ${total} ${noun}`,
    };
  };
  // coordinates are always stored (surface_x and surface_y are required), so
  // the header is complete when the elevation (the depth reference) is set
  set('wells-header', has((w) => { try { return !!makeWellFrame(w.well).datum?.tvdssOk; } catch { return false; } }), n, 'wells have their elevation set');
  set('wells-survey', has((w) => Array.isArray(w.well?.deviation) && w.well.deviation.length >= 2), n, 'wells have a survey');
  set('wells-logs', has((w) => curvesOf(w, 'density') && curvesOf(w, 'sonic')), n, 'wells have density and sonic');
  set('wells-shear', has((w) => curvesOf(w, 'shear')), n, 'wells have a shear log');
  set('wells-checkshots', has((w) => Array.isArray(w.well?.checkshots) && w.well.checkshots.length >= 2), n, 'wells have checkshots');
  set('wells-tops', has((w) => (w.tops || []).length > 0 || (w.zones || []).length > 0), n, 'wells have tops or zones');
  set('wells-petro', has((w) => curvesOf(w, 'porosity') && curvesOf(w, 'sw')), n, 'wells have porosity and Sw');
  // derived products (attributes, inversions, matched stacks) are not delivered seismic
  const delivered = volumes.filter((v) => v.kind !== 'attribute');
  if (delivered.length) {
    out['seis-full'] = { state: 'received', evidence: `${delivered.length} delivered seismic volume${delivered.length === 1 ? '' : 's'} in Seismolord; check that one is the full stack` };
  }
  if (horizons > 0) out['interp-horizons'] = { state: 'received', evidence: `${horizons} horizon${horizons === 1 ? '' : 's'} in the surfaces registry` };
  return out;
}

/**
 * The register rows: saved rows win; groups never touched take the
 * suggestion (marked as such) or start as requested.
 * @param {Object<string, {state, date?, note?}>} saved by group key
 */
export function inventoryRows(saved = {}, suggested = {}) {
  return GROUPS.map((g) => {
    const s = saved[g.key];
    if (s) return { ...g, state: s.state, date: s.date || '', note: s.note || '', suggested: suggested[g.key] || null, fromSuggestion: false };
    const sug = suggested[g.key];
    return { ...g, state: sug ? sug.state : 'requested', date: '', note: '', suggested: sug || null, fromSuggestion: !!sug };
  });
}

/** Counts by state, for the summary line and the report. */
export function inventorySummary(rows) {
  const c = Object.fromEntries(STATES.map((s) => [s.key, 0]));
  for (const r of rows) c[r.state] = (c[r.state] || 0) + 1;
  return c;
}
