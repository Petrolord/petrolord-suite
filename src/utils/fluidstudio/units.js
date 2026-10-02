/**
 * Display units of Fluid Systems Studio (FLUID-U1, PL3), on the Suite unit
 * registry (src/lib/units): one conversion library, no private factors.
 *
 * The engines and the saved project are oilfield always (psia, degF,
 * scf/STB, RB/STB, cP, 1/psi), which is the validated state. The unit
 * system is a display and input concern: a field shows the stored value in
 * the display unit and converts what is typed back before it reaches state.
 *
 * Two systems, as Well Test Analysis Studio has: 'oilfield' and 'si'. A new
 * workspace opens in the system the Suite unit profile leans to
 * (useProfileSystem); a saved project keeps the system it was saved with.
 *
 * Gas formation volume factor: the engine holds RB/scf. It is shown in
 * RB/Mscf (oilfield) or m3/m3 (SI) on every screen, in both CSV files and in
 * the report, so one basis is stated everywhere.
 *
 * Pure: no React.
 */
import { convert } from '@/lib/units/registry';

export const FLUID_UNIT_SYSTEMS = Object.freeze(['oilfield', 'si']);
export const FLUID_PROFILE_FAMILIES = Object.freeze(['pressure', 'temperature', 'gor', 'fvfOil', 'viscosity', 'compressibility']);

const same = (label, siLabel = label) => ({ family: null, label: { oilfield: label, si: siLabel } });
const fam = (family, canon, si, labels) => ({ family, canon, unit: { oilfield: canon, si }, label: labels });

/**
 * Quantity kinds. `canon` is the registry unit the engine holds the value
 * in; `unit` the registry unit shown per system; `label` what is printed.
 */
export const FLUID_KINDS = Object.freeze({
  pressure: fam('pressure', 'psi', 'kPa', { oilfield: 'psia', si: 'kPa (abs)' }),
  temperature: fam('temperature', 'degF', 'degC', { oilfield: 'degF', si: 'degC' }),
  gor: fam('gor', 'scf/STB', 'm3/m3', { oilfield: 'scf/STB', si: 'm3/m3' }),
  fvfOil: fam('fvfOil', 'RB/STB', 'm3/m3', { oilfield: 'RB/STB', si: 'm3/m3' }),
  fvfWater: fam('fvfOil', 'RB/STB', 'm3/m3', { oilfield: 'RB/STB', si: 'm3/m3' }),
  // engine value is RB/scf: scaled to the registry's RB/Mscf before converting
  fvfGas: { ...fam('fvfGas', 'RB/Mscf', 'm3/m3', { oilfield: 'RB/Mscf', si: 'm3/m3' }), engineScale: 1000 },
  viscosity: fam('viscosity', 'cP', 'mPa.s', { oilfield: 'cP', si: 'mPa.s' }),
  compressibility: fam('compressibility', '1/psi', '1/kPa', { oilfield: '1/psi', si: '1/kPa' }),
  liquidRate: fam('liquidRate', 'STB/d', 'm3/d', { oilfield: 'STB/d', si: 'm3/d' }),
  gasRate: fam('gasRate', 'Mscf/d', '10^3 m3/d', { oilfield: 'Mscf/d', si: '10^3 m3/d' }),
  density: fam('density', 'lb/ft3', 'kg/m3', { oilfield: 'lb/ft3', si: 'kg/m3' }),
  length: fam('depth', 'ft', 'm', { oilfield: 'ft', si: 'm' }),
  api: same('degAPI'),
  gasGravity: same('air = 1'),
  salinity: same('ppm'),
  molePercent: same('mol%'),
  fraction: same(''),
  ift: same('dyn/cm', 'mN/m'),
  molecularWeight: same('lb/lb-mol', 'kg/kmol'),
  dimensionless: same(''),
});

const kindOf = (kind) => FLUID_KINDS[kind] || FLUID_KINDS.dimensionless;
const sys = (system) => (system === 'si' ? 'si' : 'oilfield');

/** The printed unit of a kind in a system. */
export const unitLabel = (kind, system) => kindOf(kind).label[sys(system)];

/** An engine (oilfield) value in the display unit of the system. */
export function toDisplay(kind, value, system) {
  const k = kindOf(kind);
  if (!Number.isFinite(value)) return value;
  const v = k.engineScale ? value * k.engineScale : value;
  if (!k.family) return v;
  return convert(k.family, v, k.canon, k.unit[sys(system)]);
}

/** A value typed in the display unit, as the engine (oilfield) value. */
export function fromDisplay(kind, value, system) {
  const k = kindOf(kind);
  if (!Number.isFinite(value)) return value;
  const v = k.family ? convert(k.family, value, k.unit[sys(system)], k.canon) : value;
  return k.engineScale ? v / k.engineScale : v;
}

/** A temperature DIFFERENCE (subcooling, a tolerance) in the display unit. */
export const toDisplayDelta = (kind, value, system) => (
  kind === 'temperature' && sys(system) === 'si' && Number.isFinite(value) ? value / 1.8 : toDisplay(kind, value, system)
);

const trim = (v, digits) => String(parseFloat(v.toPrecision(digits)));

/**
 * The stored (oilfield) value of an input as the text its field shows.
 * In the oilfield system the stored value is shown untouched.
 */
export function inputText(kind, stored, system) {
  if (stored === '' || stored == null) return '';
  if (sys(system) === 'oilfield' && !kindOf(kind).engineScale) return String(stored);
  const v = Number(stored);
  if (!Number.isFinite(v)) return String(stored);
  return trim(toDisplay(kind, v, system), 10);
}

/**
 * What a field holds, as the value to store (oilfield number, or null for
 * a cleared field). Text that is not a number yet is not stored.
 */
export function inputValue(kind, text, system) {
  if (text === '' || text == null) return null;
  const v = Number(text);
  if (!Number.isFinite(v)) return null;
  if (sys(system) === 'oilfield' && !kindOf(kind).engineScale) return v;
  return parseFloat(fromDisplay(kind, v, system).toPrecision(12));
}

/** "Pressure (psia)": a column head, an axis title or a field label. */
export const withUnit = (text, kind, system) => {
  const u = unitLabel(kind, system);
  return u ? `${text} (${u})` : text;
};

/** The header line of a report or a CSV: the system and its units. */
export function displayUnitsLine(system) {
  const s = sys(system);
  const list = ['pressure', 'temperature', 'gor', 'fvfOil', 'fvfGas', 'viscosity', 'compressibility'].map((k) => unitLabel(k, s));
  return `${s === 'si' ? 'SI / metric' : 'Oilfield'}: ${[...new Set(list)].join(', ')}; Bg in ${unitLabel('fvfGas', s)}`;
}

/** A units helper bound to one system, for components and builders. */
export function fluidUnits(system = 'oilfield') {
  const s = sys(system);
  return Object.freeze({
    system: s,
    label: (kind) => unitLabel(kind, s),
    show: (kind, value) => toDisplay(kind, value, s),
    showDelta: (kind, value) => toDisplayDelta(kind, value, s),
    store: (kind, value) => fromDisplay(kind, value, s),
    text: (kind, stored) => inputText(kind, stored, s),
    value: (kind, text) => inputValue(kind, text, s),
    head: (text, kind) => withUnit(text, kind, s),
    line: () => displayUnitsLine(s),
  });
}
