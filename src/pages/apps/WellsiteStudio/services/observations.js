// Manual rig and geological observations (WS4, spec section 21): the ten
// types Release 1 records by hand, each an observation record with its
// type as the subtype, a value with a unit or a text, the depth it
// refers to (bit depth or lagged sample depth) and its source (manual or
// externally observed). Continuous feeds are Release 2.

export const OBSERVATION_TYPES = Object.freeze([
  { code: 'total_gas', name: 'Total gas', numeric: true, units: ['%', 'ppm', 'units'], hotkey: 'G' },
  { code: 'connection_gas', name: 'Connection gas', numeric: true, units: ['%', 'ppm', 'units'], hotkey: 'C' },
  { code: 'trip_gas', name: 'Trip gas', numeric: true, units: ['%', 'ppm', 'units'], hotkey: 'T' },
  { code: 'rop_change', name: 'ROP change', numeric: true, units: ['ft/hr', 'm/hr'], hotkey: 'R' },
  { code: 'cavings', name: 'Cavings', numeric: false, hotkey: 'V', hint: 'size, shape, amount' },
  { code: 'shale_density', name: 'Shale density', numeric: true, units: ['g/cc'], hotkey: 'S' },
  { code: 'mud', name: 'Mud observation', numeric: false, hotkey: 'M', hint: 'weight, viscosity, losses' },
  { code: 'lwd', name: 'LWD observation', numeric: false, hotkey: 'L', hint: 'curve and what it did' },
  { code: 'drilling_parameter', name: 'Drilling parameter', numeric: false, hotkey: 'D', hint: 'parameter and value' },
  { code: 'note', name: 'Geological note', numeric: false, hotkey: 'N' },
]);
export const OBSERVATION_CODES = Object.freeze(OBSERVATION_TYPES.map((t) => t.code));
export const observationType = (code) => OBSERVATION_TYPES.find((t) => t.code === code) || null;
export const SOURCES = Object.freeze(['manual', 'external']);

/** Record parameters for an observation. depthEntry may be null (a note without a depth). */
export function observationParams({ type, value = null, unit = null, text = '', source = 'manual', depthEntry = null, depthKind = 'bit_depth', sampleId = null }) {
  const t = observationType(type);
  if (!t) throw new Error(`Unknown observation type ${type}.`);
  if (!SOURCES.includes(source)) throw new Error('Source must be manual or external.');
  if (t.numeric) {
    if (!Number.isFinite(value)) throw new Error(`${t.name} needs a numeric value.`);
    if (!t.units.includes(unit)) throw new Error(`${t.name} needs a unit of ${t.units.join(', ')}.`);
  } else if (!(text && text.trim())) throw new Error(`${t.name} needs a description.`);
  const p = { kind: 'observation', subtype: type, sampleId, payload: { value: t.numeric ? value : null, unit: t.numeric ? unit : null, text: text || null, source } };
  if (depthEntry && Number.isFinite(depthEntry.value)) p.depth = { ...depthEntry, kind: depthKind };
  return p;
}

/** One-line label for lists and reports. */
export function observationLabel(record) {
  const t = observationType(record.subtype) || { name: record.subtype };
  const pl = record.payload || {};
  if (Number.isFinite(pl.value)) return `${t.name} ${pl.value} ${pl.unit || ''}${pl.text ? `, ${pl.text}` : ''}`.trim();
  return `${t.name}: ${pl.text || ''}`;
}
