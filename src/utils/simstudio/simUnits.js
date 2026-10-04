/**
 * Units of Reservoir Simulation Studio (SIM-U1; PL3, RL7), on the Suite unit
 * registry (src/lib/units): one conversion library, no private factors.
 *
 * Two kinds of values live in the app:
 *
 *  - The Model Builder form. It holds what the deck needs in the deck's
 *    unit system, FIELD (ft, psia, STB, Mscf, RB/STB, RB/Mscf, cP, 1/psi,
 *    lb/ft3, degF): composeDeck writes FIELD decks only. The unit system is a
 *    display and input concern: a field shows the stored FIELD value in the
 *    display unit and converts what is typed back before it reaches the form.
 *
 *  - Run results. summary.json holds the simulator's numbers in the deck's
 *    unit system (FIELD or METRIC, as the deck's RUNSPEC says; LAB and
 *    PVT-M are not read and are named so). Each vector is labelled in its
 *    deck unit and converted to the display unit.
 *
 * Two display systems: 'oilfield' and 'si'. A new case opens in the system
 * the Suite unit profile leans to (useProfileSystem('sim', ...)); a saved
 * case keeps the system it was saved with (form.unitSystem).
 *
 * Pure: no React.
 */
import { convert } from '@/lib/units/registry';

export const SIM_UNIT_SYSTEMS = Object.freeze(['oilfield', 'si']);
export const SIM_PROFILE_FAMILIES = Object.freeze(['liquidRate', 'gasRate', 'pressure', 'depth']);

const sys = (system) => (system === 'si' ? 'si' : 'oilfield');
const fam = (family, canon, si, labels) => ({ family, canon, unit: { oilfield: canon, si }, label: labels });
const same = (label, siLabel = label) => ({ family: null, label: { oilfield: label, si: siLabel } });

/**
 * Quantity kinds of the builder form and the results, in FIELD as stored.
 * `canon` is the registry unit of the stored (FIELD) value, `unit` the
 * registry unit shown per system, `label` what is printed.
 */
export const SIM_KINDS = Object.freeze({
  length: fam('depth', 'ft', 'm', { oilfield: 'ft', si: 'm' }),
  depth: fam('depth', 'ft', 'm', { oilfield: 'ft', si: 'm' }),
  pressure: fam('pressure', 'psi', 'kPa', { oilfield: 'psia', si: 'kPa' }),
  temperature: fam('temperature', 'degF', 'degC', { oilfield: 'degF', si: 'degC' }),
  oilRate: fam('liquidRate', 'STB/d', 'm3/d', { oilfield: 'STB/d', si: 'sm3/d' }),
  waterRate: fam('liquidRate', 'STB/d', 'm3/d', { oilfield: 'STB/d', si: 'sm3/d' }),
  gasRate: fam('gasRate', 'Mscf/d', '10^3 m3/d', { oilfield: 'Mscf/d', si: '10^3 sm3/d' }),
  resRate: fam('liquidRate', 'RB/d', 'm3/d', { oilfield: 'RB/d', si: 'rm3/d' }),
  oilVolume: fam('liquidVolume', 'STB', 'm3', { oilfield: 'STB', si: 'sm3' }),
  waterVolume: fam('liquidVolume', 'STB', 'm3', { oilfield: 'STB', si: 'sm3' }),
  gasVolume: fam('gasVolume', 'Mscf', '10^3 m3', { oilfield: 'Mscf', si: '10^3 sm3' }),
  resVolume: fam('liquidVolume', 'RB', 'm3', { oilfield: 'RB', si: 'rm3' }),
  gor: fam('gor', 'Mscf/STB', 'm3/m3', { oilfield: 'Mscf/STB', si: 'sm3/sm3' }),
  solutionGor: fam('gor', 'scf/STB', 'm3/m3', { oilfield: 'scf/STB', si: 'sm3/sm3' }),
  bo: fam('fvfOil', 'RB/STB', 'm3/m3', { oilfield: 'RB/STB', si: 'rm3/sm3' }),
  bg: fam('fvfGas', 'RB/Mscf', 'm3/m3', { oilfield: 'RB/Mscf', si: 'rm3/sm3' }),
  viscosity: fam('viscosity', 'cP', 'mPa.s', { oilfield: 'cP', si: 'mPa.s' }),
  compressibility: fam('compressibility', '1/psi', '1/kPa', { oilfield: '1/psi', si: '1/kPa' }),
  density: fam('density', 'lb/ft3', 'kg/m3', { oilfield: 'lb/ft3', si: 'kg/m3' }),
  permeability: same('mD'),
  fraction: same('fraction'),
  ift: same('dyn/cm', 'mN/m'),
  angle: same('deg'),
  api: same('degAPI'),
  gasSg: same('air = 1'),
  salinity: same('ppm'),
  years: same('years'),
  days: same('days'),
  count: same(''),
  ratio: same(''),
});

const kindOf = (kind) => SIM_KINDS[kind] || SIM_KINDS.ratio;

export const unitLabel = (kind, system) => kindOf(kind).label[sys(system)];

/** A stored FIELD value in the display unit of the system. */
export function toDisplay(kind, value, system) {
  const k = kindOf(kind);
  if (typeof value !== 'number' || !Number.isFinite(value) || !k.family || sys(system) === 'oilfield') return value;
  return convert(k.family, value, k.canon, k.unit.si);
}

/** A value typed in the display unit, as the stored FIELD value. */
export function fromDisplay(kind, value, system) {
  const k = kindOf(kind);
  if (typeof value !== 'number' || !Number.isFinite(value) || !k.family || sys(system) === 'oilfield') return value;
  return convert(k.family, value, k.unit.si, k.canon);
}

const trim = (v, digits) => String(parseFloat(v.toPrecision(digits)));

/** The stored value of an input, as the text its field shows (oilfield: as typed). */
export function inputText(kind, stored, system) {
  if (stored === '' || stored == null) return '';
  if (sys(system) === 'oilfield' || !kindOf(kind).family) return String(stored);
  const v = Number(stored);
  if (!Number.isFinite(v)) return String(stored);
  return trim(toDisplay(kind, v, system), 7);
}

/**
 * What a field holds, as the string to store ('' for a cleared field).
 * Oilfield text is stored as typed, so "1." and "-" survive key by key; in
 * SI, text that is not a number yet returns null (leave the form alone).
 */
export function inputStore(kind, text, system) {
  if (text === '' || text == null) return '';
  if (sys(system) === 'oilfield' || !kindOf(kind).family) return String(text);
  const v = Number(text);
  if (!Number.isFinite(v)) return null;
  return String(parseFloat(fromDisplay(kind, v, system).toPrecision(12)));
}

export const withUnit = (text, kind, system) => {
  const u = unitLabel(kind, system);
  return u ? `${text} (${u})` : text;
};

export function displayUnitsLine(system) {
  const s = sys(system);
  const u = (k) => unitLabel(k, s);
  return `${s === 'si' ? 'SI' : 'Oilfield'} (oil and water ${u('oilVolume')} and ${u('oilRate')}, gas ${u('gasVolume')} and ${u('gasRate')}, GOR ${u('gor')}, pressure ${u('pressure')}, depth ${u('depth')})`;
}

/** A units helper bound to one system, for components and builders. */
export function simUnits(system = 'oilfield') {
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

// ---- run results: vectors in the deck's unit system -------------------------

/** The deck unit systems a summary can be in, as RUNSPEC names them. */
export const DECK_SYSTEMS = Object.freeze(['FIELD', 'METRIC', 'LAB', 'PVT-M']);

/**
 * What each charted vector is, and its unit in a FIELD and a METRIC deck
 * (registry keys; the OPM manual's unit tables). The kind says how it is
 * shown in the display system.
 */
export const VECTOR_UNITS = Object.freeze({
  FOPR: { kind: 'oilRate', FIELD: 'STB/d', METRIC: 'm3/d' },
  FOPT: { kind: 'oilVolume', FIELD: 'STB', METRIC: 'm3' },
  FWPR: { kind: 'waterRate', FIELD: 'STB/d', METRIC: 'm3/d' },
  FWCT: { kind: 'fraction', FIELD: null, METRIC: null },
  FGPR: { kind: 'gasRate', FIELD: 'Mscf/d', METRIC: 'm3/d' },
  FGOR: { kind: 'gor', FIELD: 'Mscf/STB', METRIC: 'm3/m3' },
  FPR: { kind: 'pressure', FIELD: 'psi', METRIC: 'bar' },
  FWIR: { kind: 'waterRate', FIELD: 'STB/d', METRIC: 'm3/d' },
  FGIR: { kind: 'gasRate', FIELD: 'Mscf/d', METRIC: 'm3/d' },
  FWIT: { kind: 'waterVolume', FIELD: 'STB', METRIC: 'm3' },
  FGIT: { kind: 'gasVolume', FIELD: 'Mscf', METRIC: 'm3' },
  // SIM-U2-002: the cumulatives the sim-forecast-1 sender rebuilds a thinned series from
  FWPT: { kind: 'waterVolume', FIELD: 'STB', METRIC: 'm3' },
  // SIM-U2-004: an analytical aquifer's influx (in the volume units of its
  // initial volume: reservoir barrels, checked in the worker gate) and pressure
  AAQT: { kind: 'resVolume', FIELD: 'RB', METRIC: 'm3' },
  AAQR: { kind: 'resRate', FIELD: 'RB/d', METRIC: 'm3/d' },
  AAQP: { kind: 'pressure', FIELD: 'psi', METRIC: 'bar' },
  FGPT: { kind: 'gasVolume', FIELD: 'Mscf', METRIC: 'm3' },
  WOPR: { kind: 'oilRate', FIELD: 'STB/d', METRIC: 'm3/d' },
  WWPR: { kind: 'waterRate', FIELD: 'STB/d', METRIC: 'm3/d' },
  WGPR: { kind: 'gasRate', FIELD: 'Mscf/d', METRIC: 'm3/d' },
  WBHP: { kind: 'pressure', FIELD: 'psi', METRIC: 'bar' },
  WWCT: { kind: 'fraction', FIELD: null, METRIC: null },
  WWIR: { kind: 'waterRate', FIELD: 'STB/d', METRIC: 'm3/d' },
  WGIR: { kind: 'gasRate', FIELD: 'Mscf/d', METRIC: 'm3/d' },
});

const baseKey = (key) => (/^(F|W)[A-Z]+H$/.test(key) && VECTOR_UNITS[key.slice(0, -1)] ? key.slice(0, -1) : key);

/**
 * How one vector of a run is shown.
 * @param {string} key e.g. 'FOPR', 'WBHP', 'FOPRH'
 * @param {string} deckSystem 'FIELD' | 'METRIC' | other
 * @param {string} system the display system
 * @returns {{ok: boolean, kind: ?string, label: string, convert: (v: number) => number, reason: ?string}}
 */
export function vectorView(key, deckSystem, system) {
  const meta = VECTOR_UNITS[baseKey(key)];
  const s = sys(system);
  if (!meta) return { ok: false, kind: null, label: '', convert: (v) => v, reason: `${key} is not a charted vector.` };
  const k = kindOf(meta.kind);
  if (!k.family) return { ok: true, kind: meta.kind, label: k.label[s], convert: (v) => v, reason: null };
  const from = meta[deckSystem];
  if (!from) {
    return { ok: false, kind: meta.kind, label: `${deckSystem || 'unknown'} deck units`, convert: (v) => v, reason: `The deck is in ${deckSystem || 'an unknown'} units, which this app does not convert; values are shown as the simulator wrote them.` };
  }
  const to = k.unit[s];
  return {
    ok: true,
    kind: meta.kind,
    label: k.label[s],
    convert: (v) => (typeof v === 'number' && Number.isFinite(v) ? convert(k.family, v, from, to) : v),
    reason: null,
  };
}
