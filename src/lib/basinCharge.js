// Basin & Charge Modeling to ReservoirCalc Pro and Risked Reserves: the
// charge a basin model expels (AppUpgrade BF-U2-017). The handoff contract;
// neither app reaches into the other's state.
//
// Basin writes one payload per click (buildBasinCharge, writeBasinCharge) and
// opens ReservoirCalc Pro with ?bfCharge=<id>. ReservoirCalc Pro's Prospect
// Risking reads it (readBasinCharge), the analyst gives the fetch (drainage)
// area, the trap's age and a migration efficiency, and chargeAssessment
// answers two questions with the model's own numbers:
//   - how much petroleum reached the trap after it existed, against what the
//     prospect needs (its unrisked mean), and
//   - a starting value for the charge factor of Pg, from the bands below.
// The analyst applies it or not; the prospect keeps the record (inputs.bfCharge)
// and Risked Reserves Valuation names it beside the prospect.
//
// 2026-10-14 (Ekene basin videos): traps in Basin itself. A model keeps its
// traps (settings.traps: name, the age it formed, fetch area, migration
// efficiency, the source layers that charge it, the volume in place it
// holds); Basin assesses each with chargeAssessment and sends one trap to
// Prospect Risking with its numbers filled in (payload.trap). The expelled
// mass is split by the source's Ro when it left the rock (phaseSplit):
// expelled below GAS_WINDOW_RO is oil, at or above it gas, the maturity
// windows the app draws (0.55, 1.3, 2.0 %Ro). Gas is converted at a
// standard density of GAS_KG_PER_SM3; by mass a tonne is about 7.4 boe
// either way, so the total in MMboe does not depend on the split.
//
// Payload schema 'bf-charge/1' (SI; ages in Ma):
//   {schema, id, createdAt, model: {name, registryWellName},
//    unit: {mass: 'kg/m2', age: 'Ma', density: 'kg/m3'},
//    sources: [{id, name, tocWtPct, hi, kinetics, generatedKgM2, expelledKgM2,
//      transformation, expulsion: [{age, value}] (cumulative kg/m2)}],
//    (optional, 2026-10-14) gasKgM2, expulsionGas: [{age, value}] the gas-window part,
//    expelledKgM2 (all sources, present day), criticalMomentMa,
//    trap (optional): {name, formedMa, fetchKm2, efficiency, sourceIds, inPlace, inPlaceUnit},
//    hcDensityKgM3 (the engine's reference density of the expelled petroleum),
//    notes: [text]}
//
// Charge reaching the trap (oil equivalent):
//   mass  = expelled after the trap formed (kg/m2) x fetch area (m2) x efficiency
//   boe   = mass / hcDensity (m3) / 0.158987 (m3 per bbl)
// Suggested charge factor from the ratio R = charge / requirement:
//   no expulsion after the trap  0.05     R < 0.1   0.1     0.1 to 0.5   0.3
//   0.5 to 1  0.5                1 to 2   0.7       above 2  0.9
// The bands are a screening convention (adequacy classes in the manner of
// prospect-risking guides); they are a place to start, and
// the 1D model has no migration path, so the efficiency carries that risk.

export const BF_CHARGE_SCHEMA = 'bf-charge/1';
const KEY = 'bf.charge.';
const KEEP = 5;
const M3_PER_BBL = 0.158987294928;
const store = () => { try { return window.localStorage; } catch { return null; } };

export const CHARGE_BANDS = Object.freeze([
  { below: 0.1, factor: 0.1, word: 'far short of the requirement' },
  { below: 0.5, factor: 0.3, word: 'short of the requirement' },
  { below: 1, factor: 0.5, word: 'about half to all of the requirement' },
  { below: 2, factor: 0.7, word: 'one to two times the requirement' },
  { below: Infinity, factor: 0.9, word: 'more than twice the requirement' },
]);
export const DEFAULT_MIGRATION_EFFICIENCY = 0.1;
/** Expelled at or above this source Ro counts as gas (the 1.3 %Ro window line). */
export const GAS_WINDOW_RO = 1.3;
/** Standard gas density (kg/sm3), a gas of specific gravity about 0.65. */
export const GAS_KG_PER_SM3 = 0.8;
const SCF_PER_SM3 = 35.3146667;
/** In-place units a trap may hold, to MMboe (6 Bcf to the MMboe for gas). */
export const IN_PLACE_UNITS = Object.freeze({ MMboe: 1, MMbbl: 1, MMstb: 1, Bcf: 1 / 6 });

/**
 * Cumulative expulsion split by the source's Ro at each step.
 * @param {Array<{age, value}>} expulsion cumulative kg/m2, oldest first
 * @param {Array<{age, value}>} maturity Ro of the same layer, same ages
 * @returns {Array<{age, oil, gas}>} cumulative kg/m2
 */
export function phaseSplit(expulsion, maturity, gasRo = GAS_WINDOW_RO) {
  const ro = new Map((maturity || []).map((m) => [m.age, m.value]));
  let prev = 0; let oil = 0; let gas = 0;
  return (expulsion || []).map((e) => {
    const d = Math.max(0, e.value - prev); prev = Math.max(prev, e.value);
    if ((ro.get(e.age) ?? 0) >= gasRo) gas += d; else oil += d;
    return { age: e.age, oil, gas };
  });
}

/**
 * The payload from a Basin result whose layers carry their roles
 * (withLayerRoles) and the model's stratigraphy.
 */
export function buildBasinCharge(results, { name = 'Basin model', settings = {}, stratigraphy = [], criticalMoment = null, kineticsLabel = (k) => String(k), hcDensityKgM3 = 850, now = new Date(), trap = null } = {}) {
  const { data, meta } = results || {};
  if (!data?.timeSteps?.length) throw new Error('Run the model first: there is no charge to send.');
  const byId = new Map((stratigraphy || []).map((l) => [l.id, l]));
  const sources = [];
  meta.layers.forEach((l, li) => {
    const s = byId.get(l.id);
    if (!s?.sourceRock?.isSource) return;
    const last = (arr) => (arr?.length ? arr[arr.length - 1].value : 0);
    const split = phaseSplit(data.expulsion[li], data.maturity?.[li]);
    sources.push({
      id: l.id, name: l.name, tocWtPct: Number(s.sourceRock.toc), hi: Number(s.sourceRock.hi), kinetics: kineticsLabel(s.sourceRock.kerogen),
      generatedKgM2: last(data.generation[li]), expelledKgM2: last(data.expulsion[li]), transformation: last(data.transformation[li]),
      expulsion: (data.expulsion[li] || []).map((e) => ({ age: e.age, value: e.value })),
      gasKgM2: split.length ? split[split.length - 1].gas : 0,
      expulsionGas: split.map((p) => ({ age: p.age, value: p.gas })),
      roNow: last(data.maturity?.[li]),
    });
  });
  if (!sources.length) throw new Error('The model has no source rock: mark a layer as source rock and run it.');
  const expelled = sources.reduce((a, s) => a + s.expelledKgM2, 0);
  return {
    schema: BF_CHARGE_SCHEMA,
    id: `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now.toISOString(),
    model: { name, registryWellName: settings.registryWellName || null },
    unit: { mass: 'kg/m2', age: 'Ma', density: 'kg/m3' },
    sources,
    expelledKgM2: expelled,
    criticalMomentMa: criticalMoment,
    hcDensityKgM3,
    ...(trap ? { trap: { name: trap.name, formedMa: Number(trap.formedMa), fetchKm2: Number(trap.fetchKm2), efficiency: Number(trap.efficiency), sourceIds: Array.isArray(trap.sourceIds) ? trap.sourceIds : [], inPlace: Number(trap.inPlace), inPlaceUnit: trap.inPlaceUnit || 'MMboe' } } : {}),
    notes: [
      '1D model at one location: expelled petroleum per unit area of source rock. Migration is not modelled: the fetch area, the age the trap formed and the migration efficiency are the analyst\'s.',
      expelled > 0 ? '' : 'Nothing is expelled in this model (the source rock is immature or lean).',
    ].filter(Boolean),
  };
}

export function writeBasinCharge(payload, storage = store()) {
  if (!storage) return null;
  const keys = [];
  for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(KEY)) keys.push(k); }
  keys.sort().slice(0, Math.max(0, keys.length - (KEEP - 1))).forEach((k) => storage.removeItem(k));
  storage.setItem(`${KEY}${payload.id}`, JSON.stringify(payload));
  return payload.id;
}

export function readBasinCharge(id, storage = store()) {
  let p = null;
  try { p = JSON.parse(storage?.getItem(`${KEY}${id}`) || 'null'); } catch { p = null; }
  if (!p) return { ok: false, reason: 'The Basin charge handoff was not found in this browser (it is kept for the last five sends).' };
  if (p.schema !== BF_CHARGE_SCHEMA) return { ok: false, reason: `The Basin charge handoff has schema ${p.schema || 'none'}; this build reads ${BF_CHARGE_SCHEMA}.` };
  if (p.unit?.mass !== 'kg/m2' || p.unit?.age !== 'Ma') return { ok: false, reason: `The Basin charge handoff is in ${p.unit?.mass || 'no mass unit'} and ${p.unit?.age || 'no age unit'}; this build reads kg/m2 and Ma.` };
  return { ok: true, payload: p };
}

const pick = (payload, sourceIds) => (payload.sources || []).filter((s) => !sourceIds?.length || sourceIds.includes(s.id));
const valueAt = (series, ageMa) => {
  // series run old to young; take the last sample at or older than the age
  let v = 0;
  for (const e of series || []) { if (e.age >= ageMa - 1e-9) v = e.value; else break; }
  return v;
};

/** Cumulative expelled mass (kg/m2) at an age, all sources or those listed (0 before the first sample). */
export function expelledAt(payload, ageMa, sourceIds = null) {
  return pick(payload, sourceIds).reduce((tot, s) => tot + valueAt(s.expulsion, ageMa), 0);
}

/** The volume a trap holds, in MMboe (null when not given). */
export function inPlaceMMboe(inPlace, unit = 'MMboe') {
  const v = Number(inPlace); const f = IN_PLACE_UNITS[unit];
  return Number.isFinite(v) && v > 0 && f ? v * f : null;
}

/**
 * @param {object} payload a 'bf-charge/1' payload
 * @param {{fetchAreaKm2: number, trapAgeMa: number, efficiency?: number, requiredMMboe?: number, sourceIds?: string[]}} a
 *   sourceIds: the source layers that charge the trap (all when empty)
 * @returns {{ok: boolean, reason?: string, expelledAfterTrapKgM2?, beforeTrapFraction?, chargeMMboe?, ratio?, factor?, band?, text?}}
 */
export function chargeAssessment(payload, { fetchAreaKm2, trapAgeMa, efficiency = DEFAULT_MIGRATION_EFFICIENCY, requiredMMboe = null, sourceIds = null }) {
  const area = Number(fetchAreaKm2); const trap = Number(trapAgeMa); const eff = Number(efficiency);
  if (!(area > 0)) return { ok: false, reason: 'Give the fetch (drainage) area in km2.' };
  if (!(trap >= 0)) return { ok: false, reason: 'Give the age the trap formed, in Ma (0 or more).' };
  if (!(eff > 0 && eff <= 1)) return { ok: false, reason: 'The migration efficiency is a fraction above 0 and up to 1.' };
  const srcs = pick(payload, sourceIds);
  if (sourceIds?.length && !srcs.length) return { ok: false, reason: 'None of the trap\'s source layers is a source rock in this model.' };
  const total = srcs.reduce((a, s) => a + (Number(s.expelledKgM2) || 0), 0);
  const before = Math.min(total, expelledAt(payload, trap, sourceIds));
  const after = Math.max(0, total - before);
  // the gas-window part (older payloads carry no split: all of it counts as oil)
  const gasTotal = srcs.reduce((a, s) => a + (Number(s.gasKgM2) || 0), 0);
  const gasBefore = srcs.reduce((a, s) => a + valueAt(s.expulsionGas, trap), 0);
  const gasAfter = Math.min(after, Math.max(0, gasTotal - gasBefore));
  const oilAfter = Math.max(0, after - gasAfter);
  const k = area * 1e6 * eff; // kg per (kg/m2)
  const chargeM3 = (after * k) / (Number(payload.hcDensityKgM3) || 850);
  const chargeMMboe = chargeM3 / M3_PER_BBL / 1e6;
  const oilMMbbl = ((oilAfter * k) / (Number(payload.hcDensityKgM3) || 850)) / M3_PER_BBL / 1e6;
  const gasBcf = ((gasAfter * k) / GAS_KG_PER_SM3) * SCF_PER_SM3 / 1e9;
  const out = { ok: true, expelledAfterTrapKgM2: after, beforeTrapFraction: total > 0 ? before / total : 0, chargeMMboe, oilMMbbl, gasBcf, gasFraction: after > 0 ? gasAfter / after : 0 };
  const timing = total > 0 ? `${(100 * (1 - out.beforeTrapFraction)).toFixed(0)} % of the expulsion came after the trap formed at ${trap} Ma` : 'nothing is expelled';
  const phase = after > 0 && gasAfter > 0 && oilAfter > 0 ? ` (${oilMMbbl.toPrecision(3)} MMbbl of oil and ${gasBcf.toPrecision(3)} Bcf of gas)` : after > 0 && gasAfter > 0 ? ` (gas: ${gasBcf.toPrecision(3)} Bcf)` : '';
  if (!(after > 0)) return { ...out, ratio: 0, factor: 0.05, band: 'no charge after the trap formed', text: `${timing}; no charge reaches the trap. Suggested charge factor 0.05.` };
  if (!(Number(requiredMMboe) > 0)) return { ...out, ratio: null, factor: null, band: null, text: `${timing}; about ${chargeMMboe.toPrecision(3)} MMboe reaches the trap${phase}. Enter the prospect's unrisked mean to compare.` };
  const ratio = chargeMMboe / Number(requiredMMboe);
  const band = CHARGE_BANDS.find((b) => ratio < b.below);
  return { ...out, ratio, factor: band.factor, band: band.word, text: `${timing}; about ${chargeMMboe.toPrecision(3)} MMboe reaches the trap${phase}, ${band.word} (${ratio.toPrecision(2)} times). Suggested charge factor ${band.factor}.` };
}
