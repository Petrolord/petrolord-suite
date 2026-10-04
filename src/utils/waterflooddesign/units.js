/**
 * Display units of Waterflood Design Studio (Waterflood U1, PL3 and RL7), on
 * the Suite unit registry (src/lib/units): one conversion library, no
 * private factors.
 *
 * The engines and the saved project hold oilfield units always: thickness
 * ft, area acres (flow area ft2), rates RB/d (injection), STB/d and bbl/d
 * (surveillance), Bo and Bw RB/STB, Bg RB/Mscf, Rs scf/STB, pressure psi,
 * volumes STB and RB. The unit system is a display and input concern: a
 * field shows the stored value in the display unit and converts what is
 * typed back before it reaches state (the SCAL Studio pattern).
 *
 * Two systems: 'oilfield' and 'si'. A new project opens in the system the
 * Suite unit profile leans to (useProfileSystem); a saved project keeps the
 * system it was saved with.
 *
 * Pure: no React.
 */
import { convert } from '@/lib/units/registry';

export const WF_UNIT_SYSTEMS = Object.freeze(['oilfield', 'si']);
/** The profile families Waterflood follows, for useProfileSystem. */
export const WF_PROFILE_FAMILIES = Object.freeze(['depth', 'liquidRate', 'pressure', 'liquidVolume']);

const same = (oil, si = oil) => ({ family: null, label: { oilfield: oil, si } });
const fam = (family, canon, si, labels) => ({ family, canon, unit: { oilfield: canon, si }, label: labels });

/** Quantity kinds: `canon` is the registry unit the engine and the saved project hold. */
export const WF_KINDS = Object.freeze({
  length: fam('depth', 'ft', 'm', { oilfield: 'ft', si: 'm' }),
  area: fam('area', 'acre', 'ha', { oilfield: 'acres', si: 'ha' }),
  flowArea: fam('area', 'ft2', 'm2', { oilfield: 'ft2', si: 'm2' }),
  resRate: fam('liquidRate', 'RB/d', 'm3/d', { oilfield: 'RB/d', si: 'rm3/d' }),
  oilRate: fam('liquidRate', 'STB/d', 'm3/d', { oilfield: 'STB/d', si: 'sm3/d' }),
  waterRate: fam('liquidRate', 'bbl/d', 'm3/d', { oilfield: 'bbl/d', si: 'm3/d' }),
  gasRate: fam('gasRate', 'Mscf/d', 'm3/d', { oilfield: 'Mscf/d', si: 'sm3/d' }),
  fvfOil: fam('fvfOil', 'RB/STB', 'm3/m3', { oilfield: 'RB/STB', si: 'rm3/sm3' }),
  fvfGas: fam('fvfGas', 'RB/Mscf', 'm3/m3', { oilfield: 'RB/Mscf', si: 'rm3/sm3' }),
  gor: fam('gor', 'scf/STB', 'm3/m3', { oilfield: 'scf/STB', si: 'sm3/sm3' }),
  pressure: fam('pressure', 'psi', 'kPa', { oilfield: 'psi', si: 'kPa' }),
  oilVolume: fam('liquidVolume', 'STB', 'm3', { oilfield: 'STB', si: 'sm3' }),
  oilVolumeK: fam('liquidVolume', 'MSTB', '10^3 m3', { oilfield: 'MSTB', si: '10^3 sm3' }),
  waterVolume: fam('liquidVolume', 'bbl', 'm3', { oilfield: 'bbl', si: 'm3' }),
  resVolume: fam('liquidVolume', 'RB', 'm3', { oilfield: 'RB', si: 'rm3' }),
  resVolumeK: fam('liquidVolume', 'MRB', '10^3 m3', { oilfield: 'MRB', si: '10^3 rm3' }),
  gasVolume: fam('gasVolume', 'Mscf', 'm3', { oilfield: 'Mscf', si: 'sm3' }),
  permeability: same('md', 'mD'),
  viscosity: same('cP', 'mPa.s'),
  fraction: same('frac'),
  gravity: same('water = 1'),
  angle: same('deg'),
  days: same('d'),
  years: same('yr'),
  dimensionless: same(''),
});

// Composite kinds of the Hall plot: pressure-time integral and its slope
// over injected volume. Converted through the registry pieces.
const HALL = {
  hallIntegral: { label: { oilfield: 'psi.d', si: 'kPa.d' }, factor: (s) => (s === 'si' ? convert('pressure', 1, 'psi', 'kPa') : 1) },
  hallSlope: {
    label: { oilfield: 'psi.d/bbl', si: 'kPa.d/m3' },
    factor: (s) => (s === 'si' ? convert('pressure', 1, 'psi', 'kPa') / convert('liquidVolume', 1, 'bbl', 'm3') : 1),
  },
};

const sys = (system) => (system === 'si' ? 'si' : 'oilfield');
const kindOf = (kind) => WF_KINDS[kind] || WF_KINDS.dimensionless;

/** The printed unit of a kind in a system. */
export function unitLabel(kind, system) {
  if (HALL[kind]) return HALL[kind].label[sys(system)];
  return kindOf(kind).label[sys(system)];
}

/** An engine (oilfield) value in the display unit. */
export function toDisplay(kind, value, system) {
  if (!Number.isFinite(value)) return value;
  if (HALL[kind]) return value * HALL[kind].factor(sys(system));
  const k = kindOf(kind);
  if (!k.family) return value;
  return convert(k.family, value, k.canon, k.unit[sys(system)]);
}

/** A display-unit value as the engine (oilfield) value. */
export function fromDisplay(kind, value, system) {
  if (!Number.isFinite(value)) return value;
  if (HALL[kind]) return value / HALL[kind].factor(sys(system));
  const k = kindOf(kind);
  if (!k.family) return value;
  return convert(k.family, value, k.unit[sys(system)], k.canon);
}

const trim = (v, digits) => String(parseFloat(v.toPrecision(digits)));

/** The stored (oilfield) text of an input as its field shows it; untouched in oilfield. */
export function inputText(kind, stored, system) {
  if (stored === '' || stored == null) return '';
  if (sys(system) === 'oilfield' || (!kindOf(kind).family && !HALL[kind])) return String(stored);
  const v = Number(stored);
  if (!Number.isFinite(v)) return String(stored);
  return trim(toDisplay(kind, v, system), 7);
}

/**
 * What a field holds, as the string to store (oilfield; '' when cleared).
 * In oilfield the text is stored as typed ("-" and "2." survive); in SI text
 * that is not yet a number is not stored (null: leave state alone).
 */
export function inputStore(kind, text, system) {
  if (text === '' || text == null) return '';
  if (sys(system) === 'oilfield' || (!kindOf(kind).family && !HALL[kind])) return String(text);
  const v = Number(String(text).replace(',', '.'));
  if (!Number.isFinite(v)) return null;
  return String(parseFloat(fromDisplay(kind, v, system).toPrecision(12)));
}

/** "Bo (RB/STB)". */
export const withUnit = (text, kind, system) => {
  const u = unitLabel(kind, system);
  return u ? `${text} (${u})` : text;
};

export function displayUnitsLine(system) {
  const s = sys(system);
  return s === 'si'
    ? 'SI (thickness m, area ha, rates rm3/d and sm3/d, FVF rm3/sm3, pressure kPa, volumes sm3 and rm3)'
    : 'Oilfield (thickness ft, area acres, rates RB/d and STB/d, FVF RB/STB, Bg RB/Mscf, pressure psi, volumes STB and RB)';
}

/** A units helper bound to one system, for components and builders. */
export function wfUnits(system = 'oilfield') {
  const s = sys(system);
  return Object.freeze({
    system: s,
    label: (kind) => unitLabel(kind, s),
    show: (kind, value) => toDisplay(kind, value, s),
    store: (kind, value) => fromDisplay(kind, value, s),
    text: (kind, stored) => inputText(kind, stored, s),
    toState: (kind, text) => inputStore(kind, text, s),
    head: (text, kind) => withUnit(text, kind, s),
    line: () => displayUnitsLine(s),
  });
}
