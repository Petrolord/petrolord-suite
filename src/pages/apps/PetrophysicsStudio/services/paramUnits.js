// Parameter units at the door (AppUpgrade PETRO-U2-002, PETRO-U1-022,
// 2026-09-29). The engines take sonic slowness in us/m, temperatures in
// degC and the BHT depth in metres, and the interpretation state stays in
// those units whatever the user types. A petrophysicist working in feet
// (Techlog or IP in field units, every US log header) reads matrix
// slowness as 55.5 us/ft and temperatures in degF; converting 55.5 us/ft to
// 182.09 us/m by hand is where typing errors come from.
//
// This module converts at the display layer only:
//  - display = engine value in the chosen system, shown to 12 significant
//    figures so float noise never reaches the field (182 us/m reads 55.4736);
//  - a field left as displayed keeps its stored value bit for bit (the
//    exact round trip: opening the panel in field units and pressing Apply
//    changes nothing);
//  - a typed value converts once into the engine unit.
// Conversions are exact definitions: 1 ft = 0.3048 m; degF = degC x 9/5 + 32.

export const UNIT_SYSTEMS = Object.freeze(['si', 'field']);

/** Which parameters carry a unit that differs between the systems. */
export const PARAM_UNIT_KIND = Object.freeze({
  dtMa: 'slowness', dtFl: 'slowness',
  surfaceTempC: 'temperature', bhtC: 'temperature', rwRefTempC: 'temperature',
  bhtDepthM: 'depth',
});

export const UNIT_LABELS = Object.freeze({
  si: { slowness: 'µs/m', temperature: '°C', depth: 'm' },
  field: { slowness: 'µs/ft', temperature: '°F', depth: 'ft' },
});

const M_PER_FT = 0.3048;

const TO_FIELD = {
  slowness: (v) => v * M_PER_FT,          // us/m -> us/ft
  temperature: (v) => (v * 9) / 5 + 32,   // degC -> degF
  depth: (v) => v / M_PER_FT,             // m -> ft
};
const FROM_FIELD = {
  slowness: (v) => v / M_PER_FT,
  temperature: (v) => ((v - 32) * 5) / 9,
  depth: (v) => v * M_PER_FT,
};

const clean = (v) => Number(Number(v).toPrecision(12));

/** The number a field shows for an engine value (12 significant figures). */
export function toDisplayValue(key, value, system = 'si') {
  const kind = PARAM_UNIT_KIND[key];
  if (!kind || system !== 'field' || typeof value !== 'number' || !Number.isFinite(value)) return value;
  return clean(TO_FIELD[kind](value));
}

/** The engine value for a number typed in the display system. */
export function fromDisplayValue(key, value, system = 'si') {
  const kind = PARAM_UNIT_KIND[key];
  if (!kind || system !== 'field' || typeof value !== 'number' || !Number.isFinite(value)) return value;
  return FROM_FIELD[kind](value);
}

/** A parameter set as the panel shows it (unit fields converted). */
export function toDisplayDraft(values, system = 'si') {
  if (system !== 'field') return { ...values };
  const out = { ...values };
  for (const key of Object.keys(PARAM_UNIT_KIND)) if (key in out) out[key] = toDisplayValue(key, out[key], system);
  return out;
}

/**
 * One draft entry back to its engine value. A unit field whose text is
 * still the displayed form of the committed value returns the committed
 * value itself, so an untouched field never drifts by a rounding step.
 * @param {string} key
 * @param {number} parsed the number the user's text parses to
 * @param {number|number[]} committed the stored engine value (or candidates)
 */
export function engineValue(key, parsed, committed, system = 'si') {
  if (!PARAM_UNIT_KIND[key] || system !== 'field') return parsed;
  // several candidates (a zone's own value and the global one): the text
  // that shows either keeps it exactly
  for (const c of Array.isArray(committed) ? committed : [committed]) {
    if (Number.isFinite(c) && parsed === toDisplayValue(key, c, system)) return c;
  }
  return fromDisplayValue(key, parsed, system);
}

/** The unit a key shows in a system, or null when it has none that changes. */
export const unitFor = (key, system = 'si') => {
  const kind = PARAM_UNIT_KIND[key];
  return kind ? UNIT_LABELS[system === 'field' ? 'field' : 'si'][kind] : null;
};

/** A field label with its SI unit replaced by the display system's. */
export function labelInSystem(label, key, system = 'si') {
  const kind = PARAM_UNIT_KIND[key];
  if (!kind || system !== 'field') return label;
  return String(label).replace(`(${UNIT_LABELS.si[kind]})`, `(${UNIT_LABELS.field[kind]})`);
}
