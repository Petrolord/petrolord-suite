// Chromatograph readings and gas ratios (upgrade U2-002, closes WS-U1-021).
// A reading is an observation ('gas_chromatograph') holding C1 to C5 as
// read, with the unit they were read in. The ratios and their readings
// come from the engine (gasRatios.js: Haworth wetness, balance and
// character; Pixler C1/C2 to C1/C5) every time they are shown, so a stored
// record never carries a stale interpretation; the one-line text kept in
// the payload is what the daily report prints. The ratios are of like
// quantities, so ppm, percent and chromatograph units all serve as long as
// the seven components share the unit. Pure.

import { haworthRatios, haworthInterpretation, pixlerRatios, pixlerInterpretation, pixlerOilGravity, normaliseComponents, PPM_PER_PERCENT } from '@/lib/wellsite/gasRatios';
import { parseFieldNumber } from './units';

export const GAS_SUBTYPE = 'gas_chromatograph';
export const GAS_COMPONENTS = Object.freeze([
  { key: 'c1', label: 'C1', name: 'methane' }, { key: 'c2', label: 'C2', name: 'ethane' }, { key: 'c3', label: 'C3', name: 'propane' },
  { key: 'ic4', label: 'iC4', name: 'iso-butane' }, { key: 'nc4', label: 'nC4', name: 'normal butane' },
  { key: 'ic5', label: 'iC5', name: 'iso-pentane' }, { key: 'nc5', label: 'nC5', name: 'normal pentane' },
]);
export const GAS_UNITS = Object.freeze(['ppm', '%', 'units']);

/** Typed component text to numbers: blank is "not read" (left out), anything unreadable is an error. */
export function parseComponents(texts) {
  const out = {};
  const errors = [];
  for (const c of GAS_COMPONENTS) {
    const raw = texts ? texts[c.key] : undefined;
    if (raw == null || String(raw).trim() === '') continue;
    const v = typeof raw === 'number' ? raw : parseFieldNumber(raw);
    if (!Number.isFinite(v)) errors.push(`${c.label} is not a number.`);
    else out[c.key] = v;
  }
  return { components: out, errors };
}

/** Components in ppm when the unit allows it (percent x 10,000); null for chromatograph units. */
export function componentsPpm(components, unit) {
  if (unit === 'units') return null;
  const f = unit === '%' ? PPM_PER_PERCENT : 1;
  return Object.fromEntries(Object.entries(components).map(([k, v]) => [k, v * f]));
}

const f1 = (v, dp = 1) => (Number.isFinite(v) ? v.toFixed(dp) : 'n/a');
const lowerFirst = (t) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);

/**
 * The ratios and both readings for a set of components (or a stored record).
 * @returns {{ ok, errors, haworth: {wh,bh,ch,reading,notes}, pixler: {c1c2,c1c3,c1c4,c1c5,reading,gravity} }}
 */
export function gasReading(input) {
  const components = input && input.payload ? input.payload.components : input;
  const n = normaliseComponents(components || {});
  if (!n.ok) return { ok: false, errors: n.errors, haworth: null, pixler: null };
  const h = haworthRatios(components);
  const p = pixlerRatios(components);
  return {
    ok: true, errors: [], c4: n.c4, c5: n.c5,
    haworth: { wh: h.wh, bh: h.bh, ch: h.ch, reading: haworthInterpretation(h), notes: h.notes },
    pixler: { c1c2: p.c1c2, c1c3: p.c1c3, c1c4: p.c1c4, c1c5: p.c1c5, reading: pixlerInterpretation(p), gravity: pixlerOilGravity(p.c1c2) },
  };
}

/** One line: the components as read, the ratios and the two readings. */
export function gasText(components, unit) {
  const r = gasReading(components);
  const parts = GAS_COMPONENTS.filter((c) => Number.isFinite(components[c.key])).map((c) => `${c.label} ${components[c.key]}`).join(', ');
  if (!r.ok) return `Chromatograph ${parts} ${unit}`;
  const h = r.haworth; const p = r.pixler;
  return `Chromatograph ${parts} ${unit}. Wetness ${f1(h.wh)}, balance ${f1(h.bh)}, character ${f1(h.ch, 2)}: ${lowerFirst(h.reading.text)} (Haworth). C1/C2 ${f1(p.c1c2)}: ${lowerFirst(p.reading.text)} (Pixler). Indications, to be read with the cuttings and shows.`;
}

/** Record parameters for a chromatograph reading. */
export function chromatographParams({ components, unit = 'ppm', source = 'manual', note = null, depthEntry = null, depthKind = 'lagged_sample', sampleId = null }) {
  if (!GAS_UNITS.includes(unit)) throw new Error(`A chromatograph reading needs a unit of ${GAS_UNITS.join(', ')}.`);
  if (!['manual', 'external'].includes(source)) throw new Error('Source must be manual or external.');
  const n = normaliseComponents(components || {});
  if (!n.ok) throw new Error(n.errors[0]);
  if (!GAS_COMPONENTS.some((c) => components[c.key] > 0)) throw new Error('A chromatograph reading needs at least one component above zero.');
  if (unit === '%' && GAS_COMPONENTS.reduce((a, c) => a + (components[c.key] || 0), 0) > 100) throw new Error('The components add up to more than 100 percent. Check the unit: ppm readings are far larger than percent.');
  const p = { kind: 'observation', subtype: GAS_SUBTYPE, sampleId, payload: { components, unit, ppm: componentsPpm(components, unit), note: note || null, source, text: gasText(components, unit) } };
  if (depthEntry && Number.isFinite(depthEntry.value)) p.depth = { ...depthEntry, kind: depthKind };
  return p;
}

/** A chromatograph reading as table cells for the gas table and the strip log. */
export function gasRow(record) {
  const r = gasReading(record);
  return { id: record.id, mdM: record.md_calc_m, occurredAt: record.occurred_at, unit: record.payload.unit, components: record.payload.components, source: record.payload.source, ...r };
}
