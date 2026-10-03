/**
 * Display units of SCAL Studio (SCAL-U1, PL3), on the Suite unit registry
 * (src/lib/units): one conversion library, no private factors.
 *
 * The engine (packages/engines/engines/scal/scal.js) and the saved project
 * hold field units always: Pc in psi, IFT in dyn/cm, permeability in md,
 * depth and height in ft, temperature in degF. Four other apps read the
 * saved project directly (Petrophysics, Earth Modeling, Rock Physics,
 * ReservoirCalc Pro, through shmFromScalProject), so the stored units never
 * change. The unit system is a display and input concern: a field shows
 * the stored value in the display unit and converts what is typed back
 * before it reaches state.
 *
 * Two systems, as Fluid Systems Studio has: 'oilfield' and 'si'. A new
 * workspace opens in the system the Suite unit profile leans to
 * (useProfileSystem); a saved project keeps the system it was saved with.
 *
 * Pure: no React.
 */
import { convert } from '@/lib/units/registry';

export const SCAL_UNIT_SYSTEMS = Object.freeze(['oilfield', 'si']);
/** The profile families SCAL Studio follows, for useProfileSystem. */
export const SCAL_PROFILE_FAMILIES = Object.freeze(['capillaryPressure', 'depth', 'interfacialTension', 'temperature']);

const same = (label, siLabel = label) => ({ family: null, label: { oilfield: label, si: siLabel } });
const fam = (family, canon, si, labels) => ({ family, canon, unit: { oilfield: canon, si }, label: labels });

/**
 * Quantity kinds. `canon` is the registry unit the engine and the saved
 * project hold the value in; `unit` the registry unit shown per system;
 * `label` what is printed.
 */
export const SCAL_KINDS = Object.freeze({
  pc: fam('capillaryPressure', 'psi', 'kPa', { oilfield: 'psi', si: 'kPa' }),
  ift: fam('interfacialTension', 'dyne/cm', 'mN/m', { oilfield: 'dyn/cm', si: 'mN/m' }),
  length: fam('depth', 'ft', 'm', { oilfield: 'ft', si: 'm' }),
  temperature: fam('temperature', 'degF', 'degC', { oilfield: 'degF', si: 'degC' }),
  permeability: same('md', 'mD'),
  angle: same('deg'),
  fraction: same('frac'),
  gravity: same('water = 1'),
  dimensionless: same(''),
});

const kindOf = (kind) => SCAL_KINDS[kind] || SCAL_KINDS.dimensionless;
const sys = (system) => (system === 'si' ? 'si' : 'oilfield');

/** The printed unit of a kind in a system. */
export const unitLabel = (kind, system) => kindOf(kind).label[sys(system)];

/** An engine (field unit) value in the display unit of the system. */
export function toDisplay(kind, value, system) {
  const k = kindOf(kind);
  if (!Number.isFinite(value) || !k.family) return value;
  return convert(k.family, value, k.canon, k.unit[sys(system)]);
}

/** A value typed in the display unit, as the engine (field unit) value. */
export function fromDisplay(kind, value, system) {
  const k = kindOf(kind);
  if (!Number.isFinite(value) || !k.family) return value;
  return convert(k.family, value, k.unit[sys(system)], k.canon);
}

const trim = (v, digits) => String(parseFloat(v.toPrecision(digits)));

/**
 * The stored (field unit) value of an input, as the text its field shows.
 * In the oilfield system the stored text is shown untouched.
 */
export function inputText(kind, stored, system) {
  if (stored === '' || stored == null) return '';
  if (sys(system) === 'oilfield' || !kindOf(kind).family) return String(stored);
  const v = Number(stored);
  if (!Number.isFinite(v)) return String(stored);
  return trim(toDisplay(kind, v, system), 7);
}

/**
 * What a field holds, as the string to store (field units; '' for a
 * cleared field). Text that is not a number yet is stored as typed, so
 * "-" and "2." survive in the oilfield system (the studio's string form
 * state) and are not stored in a converted one.
 */
export function inputStore(kind, text, system) {
  if (text === '' || text == null) return '';
  if (sys(system) === 'oilfield' || !kindOf(kind).family) return String(text);
  const v = Number(text);
  if (!Number.isFinite(v)) return null; // not a number yet: leave state alone
  return String(parseFloat(fromDisplay(kind, v, system).toPrecision(12)));
}

/** "Pc (psi)": a column head, an axis title or a field label. */
export const withUnit = (text, kind, system) => {
  const u = unitLabel(kind, system);
  return u ? `${text} (${u})` : text;
};

/** The header line of a report or a CSV: the system and its units. */
export function displayUnitsLine(system) {
  const s = sys(system);
  return `${s === 'si' ? 'SI' : 'Oilfield'} (Pc ${unitLabel('pc', s)}, IFT ${unitLabel('ift', s)}, depth and height ${unitLabel('length', s)}, temperature ${unitLabel('temperature', s)}, permeability ${unitLabel('permeability', s)})`;
}

/** A units helper bound to one system, for components and builders. */
export function scalUnits(system = 'oilfield') {
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
