/**
 * Display units of the Recovery Factor Estimator (RF-U1-008; PL3, RL7), on
 * the Suite unit registry (src/lib/units): one conversion library, no
 * private factors.
 *
 * The engine and the saved project hold oilfield units always: area acres,
 * thickness ft, pressure psia, permeability md, viscosity cP, Bo RB/STB, Bgi
 * ft3/scf (= rcf/scf), OOIP STB, OGIP scf. The unit system is a display and
 * input concern: a field shows the stored value in the display unit and
 * converts what is typed back before it reaches state.
 *
 * Two systems, 'oilfield' and 'si'. A new project opens in the system the
 * Suite unit profile leans to (useProfileSystem); a saved project keeps the
 * system it was saved with.
 *
 * Pure: no React.
 */
import { convert } from '@/lib/units/registry';

export const RF_UNIT_SYSTEMS = Object.freeze(['oilfield', 'si']);
/** The profile families the estimator follows, for useProfileSystem. */
export const RF_PROFILE_FAMILIES = Object.freeze(['depth', 'area', 'pressure', 'liquidVolume']);

const same = (oil, si = oil) => ({ family: null, label: { oilfield: oil, si } });
const fam = (family, canon, si, labels) => ({ family, canon, unit: { oilfield: canon, si }, label: labels });

/** Quantity kinds: `canon` is the registry unit the engine and the saved project hold. */
export const RF_KINDS = Object.freeze({
  length: fam('depth', 'ft', 'm', { oilfield: 'ft', si: 'm' }),
  area: fam('area', 'acre', 'ha', { oilfield: 'acres', si: 'ha' }),
  pressure: fam('pressure', 'psi', 'kPa', { oilfield: 'psia', si: 'kPa(a)' }),
  fvfOil: fam('fvfOil', 'RB/STB', 'm3/m3', { oilfield: 'RB/STB', si: 'rm3/sm3' }),
  // Bgi is held in reservoir ft3 per scf; rcf/scf and rm3/sm3 are the same ratio
  fvfGasCf: fam('fvfGas', 'rcf/scf', 'm3/m3', { oilfield: 'ft3/scf', si: 'rm3/sm3' }),
  oilVolume: fam('liquidVolume', 'STB', 'm3', { oilfield: 'STB', si: 'sm3' }),
  oilVolumeMM: fam('liquidVolume', 'MMSTB', '10^6 m3', { oilfield: 'MMSTB', si: '10^6 sm3' }),
  gasVolume: fam('gasVolume', 'scf', 'm3', { oilfield: 'scf', si: 'sm3' }),
  gasVolumeB: fam('gasVolume', 'Bscf', '10^9 m3', { oilfield: 'Bscf', si: '10^9 sm3' }),
  rockVolume: fam('rockVolume', 'acre-ft', '10^6 m3', { oilfield: 'acre-ft', si: '10^6 m3' }),
  resVolumeMM: fam('liquidVolume', 'MMRB', '10^6 m3', { oilfield: 'MMRB', si: '10^6 rm3' }),
  permeability: same('md', 'mD'),
  viscosity: same('cP', 'mPa.s'),
  fraction: same('frac'),
  z: same(''),
  dimensionless: same(''),
});

const sys = (system) => (system === 'si' ? 'si' : 'oilfield');
const kindOf = (kind) => RF_KINDS[kind] || RF_KINDS.dimensionless;

/** The printed unit of a kind in a system. */
export function unitLabel(kind, system) {
  return kindOf(kind).label[sys(system)];
}

/** An engine (oilfield) value in the display unit. */
export function toDisplay(kind, value, system) {
  if (!Number.isFinite(value)) return value;
  const k = kindOf(kind);
  if (!k.family) return value;
  return convert(k.family, value, k.canon, k.unit[sys(system)]);
}

/** A display-unit value as the engine (oilfield) value. */
export function fromDisplay(kind, value, system) {
  if (!Number.isFinite(value)) return value;
  const k = kindOf(kind);
  if (!k.family) return value;
  return convert(k.family, value, k.unit[sys(system)], k.canon);
}

const trim = (v, digits) => String(parseFloat(v.toPrecision(digits)));

/** The text a field shows for a stored (oilfield) string; untouched in oilfield. */
export function displayInputString(kind, stored, system) {
  if (stored === '' || stored == null) return '';
  if (sys(system) === 'oilfield' || !kindOf(kind).family) return String(stored);
  const v = Number(stored);
  if (!Number.isFinite(v)) return String(stored);
  return trim(toDisplay(kind, v, system), 7);
}

/**
 * What a field holds, as the string to store (oilfield; '' when cleared), or
 * undefined when the text is not a number yet ("-", "2e", "abc"): the shared
 * draft hook keeps that text in the box and stores nothing.
 */
export function storeInputString(kind, text, system) {
  const s = String(text ?? '').trim();
  if (s === '') return '';
  const v = Number(s.replace(',', '.'));
  if (!Number.isFinite(v)) return undefined;
  if (sys(system) === 'oilfield' || !kindOf(kind).family) return s.replace(',', '.');
  return String(parseFloat(fromDisplay(kind, v, system).toPrecision(12)));
}

/** "Bo (RB/STB)". */
export const withUnit = (text, kind, system) => {
  const u = unitLabel(kind, system);
  return u ? `${text} (${u})` : text;
};

export function displayUnitsLine(system) {
  return sys(system) === 'si'
    ? 'SI (area ha, thickness m, pressure kPa absolute, FVF rm3/sm3, volumes sm3, permeability mD, viscosity mPa.s)'
    : 'Oilfield (area acres, thickness ft, pressure psia, Bo RB/STB, Bgi ft3/scf, volumes STB and scf, permeability md, viscosity cP)';
}

/** A units helper bound to one system, for components and builders. */
export function rfUnits(system = 'oilfield') {
  const s = sys(system);
  return Object.freeze({
    system: s,
    label: (kind) => unitLabel(kind, s),
    show: (kind, value) => toDisplay(kind, value, s),
    store: (kind, value) => fromDisplay(kind, value, s),
    text: (kind, stored) => displayInputString(kind, stored, s),
    toState: (kind, text) => storeInputString(kind, text, s),
    head: (text, kind) => withUnit(text, kind, s),
    line: () => displayUnitsLine(s),
  });
}
