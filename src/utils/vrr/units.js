/**
 * Display units of the Voidage Replacement Monitor (VRR-U1, PL3, RL7), on
 * the Suite unit registry (src/lib/units): one conversion library, no
 * private factors.
 *
 * The engine (vrr.js, vrrLedger.js) and the saved project hold oilfield
 * units always: liquids in STB or bbl, gas in Mscf, reservoir voidage in RB,
 * Bo and Bw in RB/STB, Bg in RB/Mscf, Rs in scf/STB, pressure in psia,
 * temperature in degF. Material Balance Studio reads the pressure surveys
 * of a saved VRR project by id (`inputs.pressureSurveys[].p_psia`), so the
 * stored units never change. The unit system is a display and input
 * concern: a field shows the stored value in the display unit and converts
 * what is typed back before it reaches state.
 *
 * Two systems: 'oilfield' and 'si'. A new workspace opens in the system the
 * Suite unit profile leans to (useProfileSystem); a saved project keeps the
 * system it was saved with.
 *
 * The FVF basis, stated once (shared with Waterflood Design Studio): Bo and
 * Bw are reservoir volume per stock-tank volume, Bg reservoir volume per
 * standard gas volume; in SI all three are rm3/sm3, so Bo and Bw keep their
 * number and Bg is 0.0056146 times its RB/Mscf value.
 *
 * Pure: no React.
 */
import { convert } from '@/lib/units/registry';

export const VRR_UNIT_SYSTEMS = Object.freeze(['oilfield', 'si']);
/** The profile families the monitor follows, for useProfileSystem. */
export const VRR_PROFILE_FAMILIES = Object.freeze(['liquidVolume', 'gasVolume', 'pressure', 'fvfGas']);

const same = (label, siLabel = label) => ({ family: null, label: { oilfield: label, si: siLabel } });
const fam = (family, canon, si, labels) => ({ family, canon, unit: { oilfield: canon, si }, label: labels });

/**
 * Quantity kinds. `canon` is the registry unit the engine and the saved
 * project hold the value in; `unit` the registry unit shown per system;
 * `label` what is printed.
 */
export const VRR_KINDS = Object.freeze({
  oil: fam('liquidVolume', 'STB', 'm3', { oilfield: 'STB', si: 'sm3' }),
  water: fam('liquidVolume', 'bbl', 'm3', { oilfield: 'bbl', si: 'sm3' }),
  gas: fam('gasVolume', 'Mscf', '10^3 m3', { oilfield: 'Mscf', si: '10^3 sm3' }),
  reservoir: fam('liquidVolume', 'RB', 'm3', { oilfield: 'RB', si: 'rm3' }),
  pressure: fam('pressure', 'psi', 'kPa', { oilfield: 'psia', si: 'kPa' }),
  temperature: fam('temperature', 'degF', 'degC', { oilfield: 'degF', si: 'degC' }),
  depth: fam('depth', 'ft', 'm', { oilfield: 'ft', si: 'm' }),
  bo: fam('fvfOil', 'RB/STB', 'm3/m3', { oilfield: 'RB/STB', si: 'rm3/sm3' }),
  bw: fam('fvfOil', 'RB/STB', 'm3/m3', { oilfield: 'RB/STB', si: 'rm3/sm3' }),
  bg: fam('fvfGas', 'RB/Mscf', 'm3/m3', { oilfield: 'RB/Mscf', si: 'rm3/sm3' }),
  rs: fam('gor', 'scf/STB', 'm3/m3', { oilfield: 'scf/STB', si: 'sm3/sm3' }),
  dpdt: { family: 'pressure', canon: 'psi', unit: { oilfield: 'psi', si: 'kPa' }, label: { oilfield: 'psi/month', si: 'kPa/month' } },
  api: same('degAPI'),
  gasSg: same('air = 1'),
  salinity: same('ppm'),
  ratio: same(''),
  fraction: same('fraction'),
  count: same(''),
});

const kindOf = (kind) => VRR_KINDS[kind] || VRR_KINDS.ratio;
const sys = (system) => (system === 'si' ? 'si' : 'oilfield');

/** The printed unit of a kind in a system. */
export const unitLabel = (kind, system) => kindOf(kind).label[sys(system)];

/** A stored (oilfield) value in the display unit of the system. */
export function toDisplay(kind, value, system) {
  const k = kindOf(kind);
  if (typeof value !== 'number' || !Number.isFinite(value) || !k.family || sys(system) === 'oilfield') return value;
  return convert(k.family, value, k.canon, k.unit.si);
}

/** A value typed in the display unit, as the stored (oilfield) value. */
export function fromDisplay(kind, value, system) {
  const k = kindOf(kind);
  if (typeof value !== 'number' || !Number.isFinite(value) || !k.family || sys(system) === 'oilfield') return value;
  return convert(k.family, value, k.unit.si, k.canon);
}

const trim = (v, digits) => String(parseFloat(v.toPrecision(digits)));

/** The stored value of an input, as the text its field shows (oilfield: untouched). */
export function inputText(kind, stored, system) {
  if (stored === '' || stored == null) return '';
  if (sys(system) === 'oilfield' || !kindOf(kind).family) return String(stored);
  const v = Number(stored);
  if (!Number.isFinite(v)) return String(stored);
  return trim(toDisplay(kind, v, system), 7);
}

/**
 * What a field holds, as the string to store ('' for a cleared field).
 * Oilfield text is stored as typed, so "1." and "-" survive key by key;
 * in SI text that is not a number yet returns null (leave state alone).
 */
export function inputStore(kind, text, system) {
  if (text === '' || text == null) return '';
  if (sys(system) === 'oilfield' || !kindOf(kind).family) return String(text);
  const v = Number(text);
  if (!Number.isFinite(v)) return null;
  return String(parseFloat(fromDisplay(kind, v, system).toPrecision(12)));
}

/** "Oil (STB)": a column head, an axis title or a field label. */
export const withUnit = (text, kind, system) => {
  const u = unitLabel(kind, system);
  return u ? `${text} (${u})` : text;
};

/** The display units line of a report or a CSV header. */
export function displayUnitsLine(system) {
  const s = sys(system);
  const u = (k) => unitLabel(k, s);
  return `${s === 'si' ? 'SI' : 'Oilfield'} (oil ${u('oil')}, water ${u('water')}, gas ${u('gas')}, reservoir voidage ${u('reservoir')}, Bo and Bw ${u('bo')}, Bg ${u('bg')}, Rs ${u('rs')}, pressure ${u('pressure')}, temperature ${u('temperature')})`;
}

/** A units helper bound to one system, for components and builders. */
export function vrrUnits(system = 'oilfield') {
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
