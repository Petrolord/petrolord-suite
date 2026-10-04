/**
 * Display units of EOR Screening (EOR-U1, PL3, RL7), on the Suite unit
 * registry (src/lib/units): one conversion library, no private factors
 * except the transmissibility product, which is depth times the identity
 * of cP and mPa.s.
 *
 * The engine (eorScreeningCalculations.js) and the saved project hold
 * oilfield units always: degAPI, cP, % PV, ft, md, degF, psia, STB. The
 * criteria of Taber, Martin and Seright (1997) are printed in those units,
 * so every boundary is compared in one system: a value typed in SI is
 * converted to oilfield before the engine sees it, and the engine compares
 * with a relative tolerance (atLeast / atMost) so a value that lands on a
 * limit through the conversion reads as on the limit.
 *
 * Two systems: 'oilfield' and 'si'. A new workspace opens in the system the
 * Suite unit profile leans to (useProfileSystem); a saved project keeps the
 * system it was saved with.
 *
 * Pure: no React.
 */
import { convert } from '@/lib/units/registry';

export const EOR_UNIT_SYSTEMS = Object.freeze(['oilfield', 'si']);
/** The profile families EOR Screening follows, for useProfileSystem. */
export const EOR_PROFILE_FAMILIES = Object.freeze(['depth', 'temperature', 'pressure', 'viscosity']);

const same = (label) => ({ family: null, label: { oilfield: label, si: label } });
const fam = (family, canon, si, labels) => ({ family, canon, unit: { oilfield: canon, si }, label: labels });

/** Quantity kinds: `canon` the stored unit, `unit` the shown unit per system, `label` what is printed. */
export const EOR_KINDS = Object.freeze({
  api: same('degAPI'),
  viscosity: fam('viscosity', 'cP', 'mPa.s', { oilfield: 'cp', si: 'mPa.s' }),
  saturation: same('% PV'),
  thickness: fam('depth', 'ft', 'm', { oilfield: 'ft', si: 'm' }),
  depth: fam('depth', 'ft', 'm', { oilfield: 'ft', si: 'm' }),
  permeability: fam('permeability', 'mD', 'mD', { oilfield: 'md', si: 'mD' }),
  temperature: fam('temperature', 'degF', 'degC', { oilfield: 'degF', si: 'degC' }),
  pressure: fam('pressure', 'psi', 'kPa', { oilfield: 'psia', si: 'kPa' }),
  ooip: { family: 'liquidVolume', canon: 'STB', unit: { oilfield: 'MMSTB', si: '10^6 m3' }, label: { oilfield: 'MMSTB', si: '10^6 sm3' } },
  // k h / mu: md ft / cp in oilfield, mD m / mPa.s in SI (the depth factor only)
  transmissibility: { family: 'depth', canon: 'ft', unit: { oilfield: 'ft', si: 'm' }, label: { oilfield: 'md-ft/cp', si: 'mD.m/mPa.s' } },
  ratio: same(''),
});

const kindOf = (kind) => EOR_KINDS[kind] || EOR_KINDS.ratio;
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

/** A number in the display unit, rounded for print (4 significant figures, no trailing zeros). */
export function showText(kind, stored, system, digits = 4) {
  if (!finite(stored)) return null;
  const v = toDisplay(kind, stored, system);
  const abs = Math.abs(v);
  if (abs >= 1000) return Math.round(v).toLocaleString('en-US');
  return trim(v, digits);
}

/** "Depth (ft)". */
export const withUnit = (text, kind, system) => {
  const u = unitLabel(kind, system);
  return u ? `${text} (${u})` : text;
};

/** The display units line of a report. */
export function displayUnitsLine(system) {
  const s = sys(system);
  const u = (k) => unitLabel(k, s);
  return `${s === 'si' ? 'SI' : 'Oilfield'} (gravity ${u('api')}, viscosity ${u('viscosity')}, saturation ${u('saturation')}, depth and thickness ${u('depth')}, permeability ${u('permeability')}, temperature ${u('temperature')}, pressure ${u('pressure')}, transmissibility ${u('transmissibility')}). Criteria are compared in oilfield units, as published.`;
}

/** A units helper bound to one system. */
export function eorUnits(system = 'oilfield') {
  const s = sys(system);
  return Object.freeze({
    system: s,
    label: (kind) => unitLabel(kind, s),
    show: (kind, value) => toDisplay(kind, value, s),
    store: (kind, value) => fromDisplay(kind, value, s),
    text: (kind, stored) => inputText(kind, stored, s),
    toState: (kind, text) => inputStore(kind, text, s),
    fmt: (kind, stored, digits) => showText(kind, stored, s, digits),
    head: (text, kind) => withUnit(text, kind, s),
    line: () => displayUnitsLine(s),
  });
}
