/**
 * Display units of the Well Spacing Optimizer (WS-U1, PL3, RL7), on the
 * Suite unit registry (src/lib/units): one conversion library, no private
 * factors.
 *
 * The engine (wellSpacingCalculations.js, wellspacing/drainage.js) and the
 * saved project hold oilfield units always: acres, ft, degF, psia, scf/STB,
 * STB/d, RB/STB, cp, 1/psi, md. A value typed in SI is converted to
 * oilfield before the engine sees it. Money stays in US dollars in both
 * systems, oil priced per stock-tank barrel and gas per Mscf, as the
 * screening economics engine takes them; the units line says so.
 *
 * Two systems: 'oilfield' and 'si'. A new workspace opens in the system the
 * Suite unit profile leans to (useProfileSystem); a saved project keeps the
 * system it was saved with.
 *
 * Pure: no React.
 */
import { convert } from '@/lib/units/registry';

export const WS_UNIT_SYSTEMS = Object.freeze(['oilfield', 'si']);
/** The profile families Well Spacing follows, for useProfileSystem. */
export const WS_PROFILE_FAMILIES = Object.freeze(['area', 'depth', 'pressure', 'liquidRate']);

const same = (label) => ({ family: null, label: { oilfield: label, si: label } });
const fam = (family, canon, si, labels) => ({ family, canon, unit: { oilfield: canon, si }, label: labels });

/** Quantity kinds: `canon` the stored unit, `unit` the shown unit per system, `label` what is printed. */
export const WS_KINDS = Object.freeze({
  area: fam('area', 'acre', 'ha', { oilfield: 'acres', si: 'ha' }),
  spacing: fam('area', 'acre', 'ha', { oilfield: 'acres/well', si: 'ha/well' }),
  thickness: fam('depth', 'ft', 'm', { oilfield: 'ft', si: 'm' }),
  length: fam('depth', 'ft', 'm', { oilfield: 'ft', si: 'm' }),
  temperature: fam('temperature', 'degF', 'degC', { oilfield: 'degF', si: 'degC' }),
  pressure: fam('pressure', 'psi', 'kPa', { oilfield: 'psia', si: 'kPa' }),
  // WS-U2-006: a pressure difference (a drop, a gauge resolution): no absolute basis
  pressureDiff: fam('pressure', 'psi', 'kPa', { oilfield: 'psi', si: 'kPa' }),
  gor: fam('gor', 'scf/STB', 'm3/m3', { oilfield: 'scf/STB', si: 'sm3/sm3' }),
  rate: fam('liquidRate', 'STB/d', 'm3/d', { oilfield: 'STB/d', si: 'sm3/d' }),
  eur: fam('liquidVolume', 'MSTB', '10^3 m3', { oilfield: 'Mbbl', si: '10^3 sm3' }),
  volume: fam('liquidVolume', 'MMSTB', '10^6 m3', { oilfield: 'MMSTB', si: '10^6 sm3' }),
  fvf: fam('fvfOil', 'RB/STB', 'm3/m3', { oilfield: 'RB/STB', si: 'rm3/sm3' }),
  viscosity: fam('viscosity', 'cP', 'mPa.s', { oilfield: 'cp', si: 'mPa.s' }),
  compressibility: fam('compressibility', '1/psi', '1/kPa', { oilfield: '1/psi', si: '1/kPa' }),
  permeability: fam('permeability', 'mD', 'mD', { oilfield: 'md', si: 'mD' }),
  percent: same('%'),
  fraction: same('fraction'),
  api: same('degAPI'),
  gasGravity: same('air = 1'),
  skin: same(''),
  wellCost: same('US$ per well'),
  opex: same('US$ per well per year'),
  oilPrice: same('US$/STB'),
  gasPrice: same('US$/Mscf'),
  declinePct: same('% per year, effective'),
  years: same('years'),
  days: same('days'),
  money: same('US$ million'),
  moneyPerWell: same('US$ million per well'),
  costPerBbl: same('US$/STB'),
  wells: same('wells'),
  wellsPerYear: same('wells per year'),
  rigs: same('rigs'),
  wellsPerRig: same('wells per rig per year'),
  ratio: same(''),
});

const kindOf = (kind) => WS_KINDS[kind] || WS_KINDS.ratio;
const sys = (system) => (system === 'si' ? 'si' : 'oilfield');
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** The printed unit of a kind in a system. */
export const unitLabel = (kind, system) => kindOf(kind).label[sys(system)];

/** A stored (oilfield) value in the display unit of the system. */
export function toDisplay(kind, value, system) {
  const k = kindOf(kind);
  const to = k.unit?.[sys(system)];
  if (!finite(value) || !k.family || !to || to === k.canon) return value;
  return convert(k.family, value, k.canon, to);
}

/** A value in the display unit, as the stored (oilfield) value. */
export function fromDisplay(kind, value, system) {
  const k = kindOf(kind);
  const from = k.unit?.[sys(system)];
  if (!finite(value) || !k.family || !from || from === k.canon) return value;
  return convert(k.family, value, from, k.canon);
}

const trim = (v, digits) => String(parseFloat(Number(v).toPrecision(digits)));

/** The stored value of an input as the text its field shows when no draft is live. */
export function inputText(kind, stored, system) {
  if (stored === '' || stored == null) return '';
  const v = Number(stored);
  if (!Number.isFinite(v)) return String(stored);
  const k = kindOf(kind);
  if (!k.family || k.unit[sys(system)] === k.canon) return String(stored);
  return trim(toDisplay(kind, v, system), 7);
}

/**
 * Typed text as the string to store: '' for a cleared field, undefined
 * when the text is not a number yet ("-", ".", "2e"), else the oilfield
 * value as a string. "2." stores 2; the draft keeps "2." in the box.
 */
export function inputStore(kind, text, system) {
  const s = String(text ?? '').trim().replace(',', '.');
  if (s === '') return '';
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  const k = kindOf(kind);
  if (!k.family || k.unit[sys(system)] === k.canon) return String(n);
  return String(parseFloat(fromDisplay(kind, n, system).toPrecision(12)));
}

/** A number in the display unit, rounded for print (significant figures, thousands separated). */
export function showText(kind, stored, system, digits = 4) {
  if (!finite(stored)) return null;
  const v = toDisplay(kind, stored, system);
  const r = parseFloat(Number(v).toPrecision(digits));
  return Math.abs(r) >= 1000 ? r.toLocaleString('en-US', { maximumFractionDigits: 12 }) : String(r);
}

/** A number in the display unit with fixed decimals, thousands separated ("1,885.8"). */
export function fixedText(kind, stored, system, decimals = 1) {
  if (!finite(stored)) return null;
  const v = toDisplay(kind, stored, system);
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** "Spacing (acres/well)". */
export const withUnit = (text, kind, system) => {
  const u = unitLabel(kind, system);
  return u ? `${text} (${u})` : text;
};

/** The display units line of a report. */
export function displayUnitsLine(system) {
  const s = sys(system);
  const u = (k) => unitLabel(k, s);
  return `${s === 'si' ? 'SI' : 'Oilfield'} (area ${u('area')}, spacing ${u('spacing')}, thickness and distance ${u('length')}, pressure ${u('pressure')}, temperature ${u('temperature')}, GOR ${u('gor')}, rate ${u('rate')}, EUR ${u('eur')}, FVF ${u('fvf')}, viscosity ${u('viscosity')}, compressibility ${u('compressibility')}, permeability ${u('permeability')}). Money in US$: oil per STB, gas per Mscf, in both systems. The engine computes in oilfield units.`;
}

/** A units helper bound to one system. */
export function wsUnits(system = 'oilfield') {
  const s = sys(system);
  return Object.freeze({
    system: s,
    label: (kind) => unitLabel(kind, s),
    show: (kind, value) => toDisplay(kind, value, s),
    store: (kind, value) => fromDisplay(kind, value, s),
    text: (kind, stored) => inputText(kind, stored, s),
    toState: (kind, text) => inputStore(kind, text, s),
    fmt: (kind, stored, digits) => showText(kind, stored, s, digits),
    fixed: (kind, stored, decimals) => fixedText(kind, stored, s, decimals),
    head: (text, kind) => withUnit(text, kind, s),
    line: () => displayUnitsLine(s),
  });
}
