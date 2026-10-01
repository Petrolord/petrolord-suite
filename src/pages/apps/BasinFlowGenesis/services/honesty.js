// What a Basin result rests on, said in words (AppUpgrade Basin U1, PL4 and
// PL5, 2026-10-01). Pure: the context, the results panel, the Calibration
// tab and the report call these; the engine is untouched.
//
//  - engineInputsKey: the inputs the engine reads, as one string, so a
//    result can say it was computed from different inputs (BF-U1-012).
//  - staleOverrides: a layer saved by an earlier release that carries
//    another lithology's library values as explicit overrides (a "shale"
//    with sandstone conductivity and porosity, seen in live rows), which the
//    engine applies silently (BF-U1-011).
//  - modelNotes: everything about the inputs a modeller should know before
//    reading the answer (unknown erosion amounts the engine skips, guessed
//    ages, ages entered under an older chart, overlapping deposition).
//  - calibrationCoverage: measured points outside the modelled column are
//    compared with an extrapolated value; say which (BF-U1-013).

import { getThermalProps, ThermalProperties } from './ThermalPropertiesLibrary';
import { ageOnChart, isTimescaleVersion, TIMESCALE_VERSION } from '@/lib/stratigraphy/timescale';
import { getCompactionParams, LithologyCompaction } from './CompactionModelLibrary';

const LITHS = ['sandstone', 'shale', 'limestone', 'salt', 'coal'];
const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));

/** The engine's inputs as one comparable string. */
export function engineInputsKey(state) {
  const layers = (state?.stratigraphy || []).map((l) => ({
    id: l.id, a0: num(l.ageStart), a1: num(l.ageEnd), h: num(l.thickness), lith: l.lithology || null,
    src: l.sourceRock?.isSource ? { toc: num(l.sourceRock.toc), hi: num(l.sourceRock.hi), k: typeof l.sourceRock.kerogen === 'string' ? l.sourceRock.kerogen : JSON.stringify(l.sourceRock.kerogen ?? null) } : null,
    th: l.thermal ? [num(l.thermal.conductivity), num(l.thermal.radiogenic), num(l.thermal.heatCapacity)] : null,
    co: l.compaction ? [num(l.compaction.phi0), num(l.compaction.c), num(l.compaction.grainDensity)] : null,
  }));
  const hf = state?.heatFlow || {};
  return JSON.stringify({
    layers,
    hf: { type: hf.type || 'constant', value: num(hf.value), history: hf.type === 'variable' ? (hf.history || []).map((p) => [num(p.age), num(p.value)]) : null },
    ero: (state?.erosionEvents || []).map((e) => [num(e.age), num(e.amount)]),
    ts: num(state?.settings?.surfaceTemp),
  });
}

const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

/**
 * The explicit overrides of a layer that equal ANOTHER lithology's library
 * values while differing from its own: a preset left behind by an earlier
 * release (layers were created as sandstone with its values written out,
 * and the lithology changed later without re-syncing them).
 * @returns {null | { from: string, fields: string[] }}
 */
export function staleOverrides(layer) {
  const lith = String(layer?.lithology || '').toLowerCase();
  if (!LITHS.includes(lith)) return null;
  const own = { ...getThermalProps(lith), ...getCompactionParams(lith) };
  const t = layer.thermal || {}; const c = layer.compaction || {};
  const given = { conductivity: num(t.conductivity), radiogenic: num(t.radiogenic), heatCapacity: num(t.heatCapacity), phi0: num(c.phi0), c: num(c.c) };
  const differs = Object.entries(given).filter(([k, v]) => Number.isFinite(v) && !near(v, own[k])).map(([k]) => k);
  if (!differs.length) return null;
  for (const other of LITHS) {
    if (other === lith) continue;
    const lib = { ...ThermalProperties[other], ...LithologyCompaction[other] };
    if (differs.every((k) => near(given[k], lib[k]))) return { from: other, fields: differs };
  }
  return null;
}

/** The layer with its thermal and compaction overrides set to its own lithology's library values. */
export function withLibraryProperties(layer) {
  const t = getThermalProps(layer.lithology); const c = getCompactionParams(layer.lithology);
  return { ...layer, thermal: { conductivity: t.conductivity, radiogenic: t.radiogenic, heatCapacity: t.heatCapacity }, compaction: { model: 'exponential', phi0: c.phi0, c: c.c } };
}

const FIELD_WORD = { conductivity: 'conductivity', radiogenic: 'radiogenic heat', heatCapacity: 'heat capacity', phi0: 'surface porosity', c: 'compaction coefficient' };

/**
 * Notes about the inputs (strings, plain words).
 * @param {{stratigraphy, erosionEvents}} state
 * @param {{ chartFlags?: Array<{layer: string, message: string}> }} [opts]
 */
export function modelNotes(state, { chartFlags = [] } = {}) {
  const out = [];
  const layers = state?.stratigraphy || [];
  const unknown = (state?.erosionEvents || []).filter((e) => !(Number(e.amount) > 0));
  if (unknown.length) {
    out.push({ key: 'erosion-unknown', level: 'warn', text: `${unknown.length} erosion event${unknown.length === 1 ? ' has' : 's have'} no amount (${unknown.map((e) => `${e.surface ? `${e.surface}, ` : ''}${e.age} Ma`).join('; ')}) and ${unknown.length === 1 ? 'is' : 'are'} not modelled: the section below is buried no deeper than today. Type the eroded thickness in Global History.` });
  }
  const guessed = layers.filter((l) => l.agesGuessed);
  if (guessed.length) out.push({ key: 'ages-guessed', level: 'warn', text: `${guessed.length} layer${guessed.length === 1 ? ' has' : 's have'} placeholder ages (${guessed.map((l) => l.name).join(', ')}): the burial and maturity history is not dated until they are typed.` });
  for (const l of layers) {
    const s = staleOverrides(l);
    if (s) out.push({ key: `stale-${l.id}`, level: 'warn', layerId: l.id, text: `${l.name} is ${l.lithology} but carries ${s.from} values for ${s.fields.map((f) => FIELD_WORD[f]).join(', ')} (saved by an earlier release); the engine models it with those values. Use the ${l.lithology} library values in its layer details, or keep them on purpose.` });
  }
  const byAge = [...layers].filter((l) => Number.isFinite(num(l.ageStart)) && Number.isFinite(num(l.ageEnd)))
    .sort((a, b) => num(b.ageStart) - num(a.ageStart));
  const same = new Map();
  for (const l of byAge) { const k = `${num(l.ageStart)}|${num(l.ageEnd)}`; same.set(k, [...(same.get(k) || []), l.name]); }
  for (const [k, names] of same) {
    if (names.length > 1) { const [a0, a1] = k.split('|'); out.push({ key: `same-${k}`, level: 'warn', text: `${names.join(', ')} share the deposition interval ${a0} to ${a1} Ma, so the engine deposits them at the same instant.` }); }
  }
  // BF-U1-018: the plots key their series by layer name, so two layers with one name draw as one
  const names = new Map();
  for (const l of layers) names.set(l.name, (names.get(l.name) || 0) + 1);
  for (const [n, c] of names) if (c > 1) out.push({ key: `dup-${n}`, level: 'warn', text: `${c} layers are named "${n}": the plots and the CSV tell them apart by name, so rename them.` });
  for (const f of chartFlags) out.push({ key: `chart-${f.layer}`, level: 'warn', text: f.message });
  return out;
}

/**
 * Measured points against the modelled column: a point above the shallowest
 * or below the deepest modelled layer centre is compared with an end value
 * (the interpolation holds the end), which is extrapolation.
 * @param {Array<{depth:number}>} points
 * @param {Array<number>} modelDepths layer-centre depths, ascending
 * @returns {{ outside: Array<{depth:number}>, top: number|null, base: number|null }}
 */
export function calibrationCoverage(points, modelDepths) {
  if (!modelDepths?.length) return { outside: [], top: null, base: null };
  const top = modelDepths[0]; const base = modelDepths[modelDepths.length - 1];
  return { outside: (points || []).filter((p) => p.depth < top || p.depth > base), top, base };
}

/** Whether a fitted heat flow sits on a search bound (the answer may lie outside it). */
export function fitAtBound(value, [lo, hi]) {
  const tol = 0.01 * (hi - lo);
  return value <= lo + tol ? 'low' : value >= hi - tol ? 'high' : null;
}

/**
 * BF-U1-015: ages a model received from Stratigraphy Studio under an older
 * chart that the current chart moved (J/K 145.0 to 143.1 Ma under ICS
 * 2026/06). Each layer's provenance.age_charts carries the chart of its two
 * bounding ages; a model sent before chart versions travelled is said once.
 * @returns {Array<{layer: string, message: string}>}
 */
export function chartAgeFlags(state) {
  const out = [];
  const layers = state?.stratigraphy || [];
  for (const l of layers) {
    const ac = l.provenance?.age_charts;
    if (!ac) continue;
    for (const [which, a] of [['start', ac.ageStart], ['end', ac.ageEnd]]) {
      if (!a || !Number.isFinite(Number(a.value)) || !a.chart || a.chart === TIMESCALE_VERSION) continue;
      if (!isTimescaleVersion(a.chart)) { out.push({ layer: l.name, message: `${l.name}: the ${which} age ${a.value} Ma (top ${a.top}) was entered under "${a.chart}", a chart this build does not know; check it in Stratigraphy Studio.` }); continue; }
      const r = ageOnChart(Number(a.value), a.chart, TIMESCALE_VERSION);
      if (r.update) out.push({ layer: l.name, message: `${l.name}: the ${which} age ${a.value} Ma (top ${a.top}) was entered under ${a.chart}; ${TIMESCALE_VERSION} puts the ${r.update.label || r.update.boundary} boundary at ${r.update.to_ma} Ma. Accept the update in Stratigraphy Studio and send the well again.` });
    }
  }
  const fromStrat = state?.settings?.fromStratigraphyStudio;
  if (fromStrat && !state?.settings?.timescale && layers.some((l) => l.provenance?.registry_well_id && !l.agesGuessed)) {
    out.push({ layer: '_model', message: `This model was sent from Stratigraphy Studio before chart versions travelled with the ages (they were then on ICS 2023/09); send the well again to check them against ${TIMESCALE_VERSION}.` });
  }
  return out;
}
