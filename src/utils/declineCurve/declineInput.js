// A decline a person types (DCA U2-004, and the terminal decline of U2-001).
//
// The engines take one thing: the NOMINAL (instantaneous) decline per day.
// People state declines three ways, and the three are different numbers for
// the same curve (SPEE REP #6, "Definition of Decline Curve Parameters",
// Table 1):
//
//   nominal             D, the instantaneous -dq/dt / q, per period
//   effective, tangent  De = 1 - exp(-D) over one period: the share of rate
//                       lost in one period by an exponential of nominal D
//                       (the basis of a terminal decline, whose tail IS an
//                       exponential)
//   effective, secant   Desi = 1 - (1 + b D)^(-1/b) over one period: the share
//                       of rate lost in the first period by the hyperbolic of
//                       nominal Di and exponent b (the basis ARIES and most
//                       reserves reports quote a hyperbolic Di in)
//
// The PERIOD is the unit: '%/yr' (a percent per year), '1/yr', '1/month' (a
// twelfth of a 365.25-day year) or '1/d'. A nominal decline scales linearly
// with the period, so it converts through the registry's `declineRate`
// family. An effective decline does not (8 percent a year is not 8/12
// percent a month), so it is turned into the nominal of ITS OWN period first
// (src/lib/units/decline.js for the tangent form) and only that nominal goes
// through the registry. Nothing here hides the basis inside a "unit".
//
// Pure. Pinned against SPEE REP #6 Table 1 and the CED P03-004 worked
// examples in declineInput.test.js.
import { convert } from '@/lib/units/registry';
import { nominalFromEffective, effectiveFromNominal } from '@/lib/units/decline';

export const DECLINE_BASES = Object.freeze(['nominal', 'effective-tangent', 'effective-secant']);
export const DECLINE_INPUT_UNITS = Object.freeze(['%/yr', '1/yr', '1/month', '1/d']);

/** The words a basis prints as. */
export const DECLINE_BASIS_WORDS = Object.freeze({
  nominal: 'nominal',
  'effective-tangent': 'effective (tangent, the exponential form)',
  'effective-secant': 'effective (secant, the hyperbolic form with this b)',
});

/** Short words for a picker. */
export const DECLINE_BASIS_SHORT = Object.freeze({
  nominal: 'Nominal',
  'effective-tangent': 'Effective (tangent)',
  'effective-secant': 'Effective (secant)',
});

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

// a typed value as a fraction of its period, and the period as a registry unit
const asFraction = (value, unit) => (unit === '%/yr' ? value / 100 : value);
const periodUnit = (unit) => (unit === '%/yr' ? '1/yr' : unit);

/** Nominal decline per period from a secant effective decline over that period (SPEE REP #6). */
export function nominalFromSecant(effective, b) {
  if (!finite(effective) || effective < 0 || effective >= 1) return NaN;
  if (!finite(b) || b < 0) return NaN;
  if (b === 0) return nominalFromEffective(effective);
  return (Math.pow(1 - effective, -b) - 1) / b;
}

/** Secant effective decline over one period from the nominal per that period. */
export function secantFromNominal(nominal, b) {
  if (!finite(nominal) || nominal < 0 || !finite(b) || b < 0) return NaN;
  if (b === 0) return effectiveFromNominal(nominal);
  return 1 - Math.pow(1 + b * nominal, -1 / b);
}

/**
 * A typed decline to the engine's nominal per day.
 * @param {{value: number, unit?: string, basis?: string}} typed
 * @param {number} [b] the Arps exponent, for the secant basis
 * @returns {number} nominal per day, NaN when the entry cannot be read
 */
export function nominalPerDayFromTyped(typed, b = 0) {
  if (!typed || !finite(Number(typed.value))) return NaN;
  const value = Number(typed.value);
  const unit = DECLINE_INPUT_UNITS.includes(typed.unit) ? typed.unit : '%/yr';
  const basis = DECLINE_BASES.includes(typed.basis) ? typed.basis : 'nominal';
  if (value < 0) return NaN;
  if (basis === 'nominal') return convert('declineRate', value, unit, '1/d');
  const fraction = asFraction(value, unit);
  const perPeriod = basis === 'effective-tangent' ? nominalFromEffective(fraction) : nominalFromSecant(fraction, b);
  return finite(perPeriod) ? convert('declineRate', perPeriod, periodUnit(unit), '1/d') : NaN;
}

/**
 * The engine's nominal per day in a typed unit and basis (the inverse).
 * @returns {number} the value a person would type, NaN when it has none
 */
export function typedFromNominalPerDay(diPerDay, { unit = '%/yr', basis = 'nominal' } = {}, b = 0) {
  if (!finite(diPerDay) || diPerDay < 0) return NaN;
  if (basis === 'nominal') return convert('declineRate', diPerDay, '1/d', unit);
  const perPeriod = convert('declineRate', diPerDay, '1/d', periodUnit(unit));
  const fraction = basis === 'effective-tangent' ? effectiveFromNominal(perPeriod) : secantFromNominal(perPeriod, b);
  return unit === '%/yr' ? fraction * 100 : fraction;
}

const g = (v, digits = 4) => (finite(v) ? String(parseFloat(v.toPrecision(digits))) : 'n/a');

/**
 * One phrase: "8 %/yr effective (tangent, the exponential form), nominal
 * 8.338 %/yr (0.0002283 per day)".
 */
export function describeTypedDecline(typed, b = 0) {
  if (!typed || !finite(Number(typed.value))) return 'not set';
  const unit = DECLINE_INPUT_UNITS.includes(typed.unit) ? typed.unit : '%/yr';
  const basis = DECLINE_BASES.includes(typed.basis) ? typed.basis : 'nominal';
  const perDay = nominalPerDayFromTyped(typed, b);
  const typedText = `${g(Number(typed.value), 6)} ${unit} ${DECLINE_BASIS_WORDS[basis]}`;
  if (basis === 'nominal') return `${typedText} (${g(perDay)} per day)`;
  return `${typedText}, nominal ${g(convert('declineRate', perDay, '1/d', '%/yr'))} %/yr (${g(perDay)} per day)`;
}

/** A terminal decline as stored on a forecast: {value, unit, basis} or null. */
export function normaliseTerminalDecline(v) {
  if (!v || typeof v !== 'object' || !finite(Number(v.value)) || !(Number(v.value) > 0)) return null;
  return {
    value: Number(v.value),
    unit: DECLINE_INPUT_UNITS.includes(v.unit) ? v.unit : '%/yr',
    basis: v.basis === 'nominal' ? 'nominal' : 'effective-tangent',
  };
}

/** The terminal decline Dmin per day of a forecast config, or null when none is set. */
export function terminalDeclinePerDay(config) {
  const t = normaliseTerminalDecline(config?.terminalDecline);
  if (!t) return null;
  const d = nominalPerDayFromTyped(t);
  return finite(d) && d > 0 ? d : null;
}
