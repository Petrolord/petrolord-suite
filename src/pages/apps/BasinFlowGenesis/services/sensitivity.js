// Sensitivity outputs (2026-10-14, Ekene basin videos). The Sensitivity tab
// swept a parameter and plotted the maximum present-day Ro anywhere in the
// column, the one number a charge question does not ask. A basin modeller
// sweeps heat flow, erosion or conductivity and reads what they move: the Ro
// of the source, what it expelled, and the charge that reaches each trap with
// its charge factor; trap age and migration efficiency are swept on the
// current run (no re-run). Every value is the engine's run and the charge
// contract's chargeAssessment, as on the Analysis tab.

import { buildBasinCharge, chargeAssessment, inPlaceMMboe } from '@/lib/basinCharge';
import { finalDepthProfile, withLayerRoles } from './resultsView';

/** Parameters that re-run the engine, and the ones read off the current run. */
export const ENGINE_PARAMS = ['heatFlow', 'erosion', 'conductivity'];
export const TRAP_PARAMS = ['trapAge', 'efficiency'];

/** The outputs one run can give for this model: source Ro, column Ro, expelled, per-trap charge and factor. */
export function sensitivityOutputs(stratigraphy = [], traps = []) {
  const sources = stratigraphy.filter((l) => l.sourceRock?.isSource);
  return [
    ...sources.map((l) => ({ key: `ro:${l.id}`, label: `Ro now, ${l.name} (%)`, unit: '%Ro' })),
    { key: 'roMax', label: 'Maximum Ro now in the column (%)', unit: '%Ro' },
    ...(sources.length ? [{ key: 'expelled', label: 'Expelled by the source rocks (kg/m²)', unit: 'kg/m²' }] : []),
    ...traps.map((t) => ({ key: `charge:${t.id}`, label: `Charge reaching ${t.name} (MMboe)`, unit: 'MMboe' })),
    ...traps.map((t) => ({ key: `factor:${t.id}`, label: `Charge factor, ${t.name}`, unit: '' })),
  ];
}

/** One output's value from an engine result (raw or with roles) and the model's traps. */
export function outputValue(result, key, { stratigraphy = [], traps = [], trapOverride = null } = {}) {
  if (!result?.data?.timeSteps?.length) return NaN;
  const r = withLayerRoles(result, stratigraphy);
  const last = (a) => (a?.length ? a[a.length - 1].value : NaN);
  if (key === 'roMax') { const p = finalDepthProfile(r); return p.length ? Math.max(...p.map((x) => x.ro)) : NaN; }
  if (key.startsWith('ro:')) { const li = r.meta.layers.findIndex((l) => l.id === key.slice(3)); return li >= 0 ? last(r.data.maturity[li]) : NaN; }
  let payload = null;
  try { payload = buildBasinCharge(r, { stratigraphy }); } catch { return key === 'expelled' ? 0 : NaN; }
  if (key === 'expelled') return payload.expelledKgM2;
  const [kind, id] = key.split(':');
  const t0 = traps.find((t) => t.id === id);
  if (!t0) return NaN;
  const t = trapOverride && trapOverride.id === id ? { ...t0, ...trapOverride } : t0;
  const a = chargeAssessment(payload, { fetchAreaKm2: Number(t.fetchKm2), trapAgeMa: Number(t.formedMa), efficiency: Number(t.efficiency), requiredMMboe: inPlaceMMboe(t.inPlace, t.inPlaceUnit), sourceIds: t.sourceIds });
  if (!a.ok) return NaN;
  return kind === 'charge' ? a.chargeMMboe : kind === 'factor' ? (a.factor ?? NaN) : NaN;
}

/** Evenly spaced sweep values, min to max, `steps` of them (2 or more). */
export function sweepValues(min, max, steps) {
  const n = Math.max(2, Math.round(Number(steps)) || 2);
  const a = Number(min); const b = Number(max);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
  return Array.from({ length: n }, (_, i) => a + (i * (b - a)) / (n - 1));
}
