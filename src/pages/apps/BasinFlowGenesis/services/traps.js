// Traps and charge in Basin & Charge Modeling (2026-10-14, Ekene basin
// videos). The events chart said "Trap formation: not modelled in 1D" and
// the fetch area, trap age and efficiency could only be typed in
// ReservoirCalc Pro after the hand-off. A basin modeller keeps the traps the
// kitchen charges with the model: when each formed, the area it drains, the
// share of the expelled petroleum that reaches it, the source layers on its
// migration path and the volume it holds. Saved in the model's settings
// (settings.traps); not an engine input, so a trap edit never makes the run
// out of date. The arithmetic is src/lib/basinCharge.js chargeAssessment,
// the same function Prospect Risking runs.

import { parseDelimitedText } from '@/lib/tabularFile';
import { chargeAssessment, inPlaceMMboe, IN_PLACE_UNITS, DEFAULT_MIGRATION_EFFICIENCY } from '@/lib/basinCharge';

export const TRAP_UNITS = Object.keys(IN_PLACE_UNITS);
const norm = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : NaN; };

export function newTrap(i = 0) {
  return { id: `trap-${Date.now().toString(36)}-${i}`, name: `Trap ${i + 1}`, formedMa: '', fetchKm2: '', efficiency: DEFAULT_MIGRATION_EFFICIENCY, sourceIds: [], inPlace: '', inPlaceUnit: 'MMstb' };
}

/**
 * A traps file: trap (name), formed_ma, fetch_km2, migration_efficiency,
 * charged_by (source layer names, separated by ; or |), in_place,
 * in_place_unit. Source names resolve to the model's source layers.
 */
export function parseTrapsText(text, stratigraphy = []) {
  const { header, rows } = parseDelimitedText(text);
  const problems = [];
  if (!header) return { traps: [], problems: ['No header row found: name the columns (trap, formed_ma, fetch_km2, ...).'] };
  const col = (...names) => header.findIndex((h) => names.includes(norm(h)));
  const iName = col('trap', 'name', 'prospect');
  const iAge = col('formedma', 'formed', 'trapagema', 'trapage', 'age');
  const iArea = col('fetchkm2', 'fetch', 'drainagekm2', 'area');
  const iEff = col('migrationefficiency', 'efficiency', 'eff');
  const iSrc = col('chargedby', 'source', 'sources');
  const iVol = col('inplace', 'volume', 'required');
  const iUnit = col('inplaceunit', 'unit');
  if (iName < 0) problems.push('No trap name column found (trap, name).');
  const traps = [];
  rows.forEach((r, k) => {
    const name = iName >= 0 ? String(r[iName] ?? '').trim() : '';
    if (!name) return;
    const t = { ...newTrap(k), name };
    if (iAge >= 0) t.formedMa = num(r[iAge]);
    if (iArea >= 0) t.fetchKm2 = num(r[iArea]);
    if (iEff >= 0 && Number.isFinite(num(r[iEff]))) t.efficiency = num(r[iEff]);
    if (iVol >= 0 && Number.isFinite(num(r[iVol]))) t.inPlace = num(r[iVol]);
    if (iUnit >= 0) { const u = TRAP_UNITS.find((x) => norm(x) === norm(r[iUnit])); if (u) t.inPlaceUnit = u; else if (String(r[iUnit] ?? '').trim()) problems.push(`Row ${k + 2}: unit "${r[iUnit]}" is not one of ${TRAP_UNITS.join(', ')}.`); }
    if (iSrc >= 0) {
      const names = String(r[iSrc] ?? '').split(/[;|]/).map((x) => x.trim()).filter(Boolean);
      names.forEach((n) => {
        const l = stratigraphy.find((s) => norm(s.name) === norm(n));
        if (l && l.sourceRock?.isSource) t.sourceIds.push(l.id);
        else problems.push(`Row ${k + 2}: "${n}" is not a source layer of this model; ${name} takes every source.`);
      });
    }
    traps.push(t);
  });
  return { traps, problems };
}

/** Each trap's assessment against a 'bf-charge/1' payload (null payload: nothing to assess). */
export function assessTraps(traps, payload) {
  return (traps || []).map((t) => {
    const required = inPlaceMMboe(t.inPlace, t.inPlaceUnit);
    if (!payload) return { trap: t, required, a: null };
    const a = chargeAssessment(payload, { fetchAreaKm2: Number(t.fetchKm2), trapAgeMa: t.formedMa === '' ? NaN : Number(t.formedMa), efficiency: Number(t.efficiency), requiredMMboe: required, sourceIds: t.sourceIds });
    return { trap: t, required, a };
  });
}

/** Events chart rows: each trap from the age it formed to the present. */
export function trapIntervals(traps) {
  return (traps || []).filter((t) => Number.isFinite(Number(t.formedMa)) && t.formedMa !== '' && Number(t.formedMa) >= 0)
    .map((t) => ({ interval: [Number(t.formedMa), 0], layer: t.name }));
}
