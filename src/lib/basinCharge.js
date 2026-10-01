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
// Payload schema 'bf-charge/1' (SI; ages in Ma):
//   {schema, id, createdAt, model: {name, registryWellName},
//    unit: {mass: 'kg/m2', age: 'Ma', density: 'kg/m3'},
//    sources: [{id, name, tocWtPct, hi, kinetics, generatedKgM2, expelledKgM2,
//      transformation, expulsion: [{age, value}] (cumulative kg/m2)}],
//    expelledKgM2 (all sources, present day), criticalMomentMa,
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

/**
 * The payload from a Basin result whose layers carry their roles
 * (withLayerRoles) and the model's stratigraphy.
 */
export function buildBasinCharge(results, { name = 'Basin model', settings = {}, stratigraphy = [], criticalMoment = null, kineticsLabel = (k) => String(k), hcDensityKgM3 = 850, now = new Date() } = {}) {
  const { data, meta } = results || {};
  if (!data?.timeSteps?.length) throw new Error('Run the model first: there is no charge to send.');
  const byId = new Map((stratigraphy || []).map((l) => [l.id, l]));
  const sources = [];
  meta.layers.forEach((l, li) => {
    const s = byId.get(l.id);
    if (!s?.sourceRock?.isSource) return;
    const last = (arr) => (arr?.length ? arr[arr.length - 1].value : 0);
    sources.push({
      id: l.id, name: l.name, tocWtPct: Number(s.sourceRock.toc), hi: Number(s.sourceRock.hi), kinetics: kineticsLabel(s.sourceRock.kerogen),
      generatedKgM2: last(data.generation[li]), expelledKgM2: last(data.expulsion[li]), transformation: last(data.transformation[li]),
      expulsion: (data.expulsion[li] || []).map((e) => ({ age: e.age, value: e.value })),
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
    notes: [
      '1D model at one location: expelled petroleum per unit area of source rock. Trap formation and migration are not modelled; the fetch area and the migration efficiency are the analyst\'s.',
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

/** Cumulative expelled mass (kg/m2, all sources) at an age, from the series (0 before the first sample). */
export function expelledAt(payload, ageMa) {
  let tot = 0;
  for (const s of payload.sources || []) {
    // series run old to young; take the last sample at or older than the age
    let v = 0;
    for (const e of s.expulsion || []) { if (e.age >= ageMa - 1e-9) v = e.value; else break; }
    tot += v;
  }
  return tot;
}

/**
 * @param {object} payload a 'bf-charge/1' payload
 * @param {{fetchAreaKm2: number, trapAgeMa: number, efficiency?: number, requiredMMboe?: number}} a
 * @returns {{ok: boolean, reason?: string, expelledAfterTrapKgM2?, beforeTrapFraction?, chargeMMboe?, ratio?, factor?, band?, text?}}
 */
export function chargeAssessment(payload, { fetchAreaKm2, trapAgeMa, efficiency = DEFAULT_MIGRATION_EFFICIENCY, requiredMMboe = null }) {
  const area = Number(fetchAreaKm2); const trap = Number(trapAgeMa); const eff = Number(efficiency);
  if (!(area > 0)) return { ok: false, reason: 'Give the fetch (drainage) area in km2.' };
  if (!(trap >= 0)) return { ok: false, reason: 'Give the age the trap formed, in Ma (0 or more).' };
  if (!(eff > 0 && eff <= 1)) return { ok: false, reason: 'The migration efficiency is a fraction above 0 and up to 1.' };
  const total = Number(payload.expelledKgM2) || 0;
  const before = Math.min(total, expelledAt(payload, trap));
  const after = Math.max(0, total - before);
  const chargeM3 = (after * area * 1e6 * eff) / (Number(payload.hcDensityKgM3) || 850);
  const chargeMMboe = chargeM3 / M3_PER_BBL / 1e6;
  const out = { ok: true, expelledAfterTrapKgM2: after, beforeTrapFraction: total > 0 ? before / total : 0, chargeMMboe };
  const timing = total > 0 ? `${(100 * (1 - out.beforeTrapFraction)).toFixed(0)} % of the expulsion came after the trap formed at ${trap} Ma` : 'nothing is expelled';
  if (!(after > 0)) return { ...out, ratio: 0, factor: 0.05, band: 'no charge after the trap formed', text: `${timing}; no charge reaches the trap. Suggested charge factor 0.05.` };
  if (!(Number(requiredMMboe) > 0)) return { ...out, ratio: null, factor: null, band: null, text: `${timing}; about ${chargeMMboe.toPrecision(3)} MMboe reaches the trap. Enter the prospect's unrisked mean to compare.` };
  const ratio = chargeMMboe / Number(requiredMMboe);
  const band = CHARGE_BANDS.find((b) => ratio < b.below);
  return { ...out, ratio, factor: band.factor, band: band.word, text: `${timing}; about ${chargeMMboe.toPrecision(3)} MMboe reaches the trap, ${band.word} (${ratio.toPrecision(2)} times). Suggested charge factor ${band.factor}.` };
}
