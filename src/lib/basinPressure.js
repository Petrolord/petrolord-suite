// Basin & Charge Modeling to Pore Pressure Studio: the 1D compaction-
// disequilibrium pressure of a basin model (AppUpgrade BF-U2-015). The
// handoff contract between the two apps; neither app reaches into the
// other's state.
//
// Basin writes one payload per click (buildBasinPressure, writeBasinPressure)
// and opens Pore Pressure Studio with ?bfPressure=<id>. Pore Pressure reads it
// (readBasinPressure) through src/lib/ppfgUnits.js: the payload DECLARES its
// pressure unit and every value is converted by that declaration (a unit that
// is not a pressure is refused with the reason, as for registry curves).
//
// Payload schema 'bf-pressure/1':
//   {schema, id, createdAt,
//    model: {name, registryWellId, registryWellName, kbM},
//    depthRef: 'tvd_below_model_surface', topTvdBelowKbM (the model surface
//      below KB when the model is tied to a registry well, else null),
//    unit: {depth: 'm', pressure: 'MPa'},
//    rows: [{tvdM, hydrostatic, porePressure, overburden}],
//    engine: 'basin PressureEngine (Gibson / Bethke loading form)',
//    notes: [text]}
// The pressures are those of Basin's engine (engines/basin/PressureEngine.js):
// a 1D estimate decoupled from compaction (said in the notes).

import { ppfgUnit, unreadableUnitReason } from './ppfgUnits';

export const BF_PRESSURE_SCHEMA = 'bf-pressure/1';
const KEY = 'bf.pressure.';
const KEEP = 5;
const store = () => { try { return window.localStorage; } catch { return null; } };

/** The payload from a Basin result (column slices in SI). */
export function buildBasinPressure(results, { name = 'Basin model', settings = {}, stratigraphy = [], now = new Date() } = {}) {
  const col = results?.data?.column;
  if (!Array.isArray(col) || !col.length) throw new Error('Run the model first: this result carries no pressure column.');
  const top = (stratigraphy || []).map((l) => l.provenance?.top_tvd_m).filter(Number.isFinite);
  const topTvd = settings.registryWellId && top.length ? Math.min(...top) : null;
  const maxOp = Math.max(...col.map((c) => c.overpressurePa));
  return {
    schema: BF_PRESSURE_SCHEMA,
    id: `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now.toISOString(),
    model: { name, registryWellId: settings.registryWellId || null, registryWellName: settings.registryWellName || null, kbM: Number.isFinite(settings.registryKbM) ? settings.registryKbM : null },
    depthRef: 'tvd_below_model_surface',
    topTvdBelowKbM: topTvd,
    unit: { depth: 'm', pressure: 'MPa' },
    rows: col.map((c) => ({ tvdM: c.depth, hydrostatic: c.hydrostaticPa / 1e6, porePressure: c.porePressurePa / 1e6, overburden: c.overburdenPa / 1e6 })),
    engine: 'Basin & Charge Modeling PressureEngine: 1D compaction disequilibrium (Gibson 1958, Bethke 1985 loading form), Kozeny-Carman permeability',
    notes: [
      'A 1D estimate of the overpressure the burial rate can trap; it does not feed back into compaction (porosity stays the hydrostatic Athy porosity).',
      maxOp > 1e5 ? `Overpressure up to ${(maxOp / 1e6).toFixed(1)} MPa.` : 'The model stays at about hydrostatic pressure.',
    ],
  };
}

export function writeBasinPressure(payload, storage = store()) {
  if (!storage) return null;
  const keys = [];
  for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(KEY)) keys.push(k); }
  keys.sort().slice(0, Math.max(0, keys.length - (KEEP - 1))).forEach((k) => storage.removeItem(k));
  storage.setItem(`${KEY}${payload.id}`, JSON.stringify(payload));
  return payload.id;
}

/**
 * The payload in MPa by its declared unit.
 * @returns {{ok: true, payload, rows: Array<{tvdM, hydrostaticMpa, poreMpa, overburdenMpa}>} | {ok: false, reason: string}}
 */
export function readBasinPressure(id, storage = store()) {
  let p = null;
  try { p = JSON.parse(storage?.getItem(`${KEY}${id}`) || 'null'); } catch { p = null; }
  if (!p) return { ok: false, reason: 'The Basin pressure handoff was not found in this browser (it is kept for the last five sends).' };
  if (p.schema !== BF_PRESSURE_SCHEMA) return { ok: false, reason: `The Basin pressure handoff has schema ${p.schema || 'none'}; this build reads ${BF_PRESSURE_SCHEMA}.` };
  const conv = ppfgUnit(p.unit?.pressure);
  if (!conv) return { ok: false, reason: unreadableUnitReason({ mnemonic: 'Basin pressure', unit: p.unit?.pressure }) };
  if (conv.needsTvd) return { ok: false, reason: `The Basin pressure handoff is in ${conv.unit}, a gradient or mud weight; it is read as pressure only.` };
  if (p.unit?.depth !== 'm') return { ok: false, reason: `The Basin pressure handoff depth unit is ${p.unit?.depth || 'missing'}; this build reads metres.` };
  const rows = (p.rows || []).filter((r) => Number.isFinite(r.tvdM)).map((r) => ({ tvdM: r.tvdM, hydrostaticMpa: conv.toMpa(r.hydrostatic), poreMpa: conv.toMpa(r.porePressure), overburdenMpa: conv.toMpa(r.overburden) }));
  return { ok: true, payload: p, rows };
}
