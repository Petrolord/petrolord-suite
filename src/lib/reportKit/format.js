/**
 * Report Kit: the number formats a report prints. A value that is missing
 * or not finite prints as EMPTY_VALUE ('n/a'), never as a blank, a zero,
 * "NaN" or "undefined".
 */
import { EMPTY_VALUE } from '@/lib/emptyValue';

export { EMPTY_VALUE };

// Numbers only: a string is not silently read as a number, so a field that
// was never parsed prints as missing instead of as a value nobody checked.
const num = (v) => (typeof v === 'number' ? v : NaN);

/**
 * `n` significant figures. From 1,000 up the number is written out in full
 * with thousands separators (3,800) instead of toPrecision's "3.80e+3";
 * below that it keeps its trailing zeros (84.5, 6.40, 0.0150).
 */
export function sig(v, n = 3) {
  const x = num(v);
  if (!Number.isFinite(x)) return EMPTY_VALUE;
  const r = Number(x.toPrecision(n));
  return Math.abs(r) >= 1000 && Math.abs(r) < 1e15 ? r.toLocaleString('en-US') : x.toPrecision(n);
}

/** Fixed decimals: fixed(120.66, 1) is "120.7". */
export function fixed(v, digits = 2) {
  const x = num(v);
  return Number.isFinite(x) ? x.toFixed(digits) : EMPTY_VALUE;
}

/** Scientific notation with `digits` decimals: sci(0.0000123) is "1.230e-5". */
export function sci(v, digits = 3) {
  const x = num(v);
  return Number.isFinite(x) ? x.toExponential(digits) : EMPTY_VALUE;
}

/**
 * A number as a person would write it: up to `n` significant figures with
 * no trailing zeros, scientific outside 1e-3 .. 1e6 (1.2e-5).
 */
export function plain(v, n = 5) {
  const x = num(v);
  if (!Number.isFinite(x)) return EMPTY_VALUE;
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a < 1e-3 || a >= 1e6) return x.toExponential(3).replace(/\.?0+e/, 'e');
  return String(parseFloat(x.toPrecision(n)));
}

/** `n` significant figures with trailing zeros dropped and no separators: compact(84.50) is "84.5". For captions. */
export function compact(v, n = 3) {
  const x = num(v);
  return Number.isFinite(x) ? String(parseFloat(x.toPrecision(n))) : EMPTY_VALUE;
}

/** Thousands separators with fixed decimals: thousands(1234567.8, 1) is "1,234,567.8". */
export function thousands(v, digits = 0) {
  const x = num(v);
  return Number.isFinite(x)
    ? x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : EMPTY_VALUE;
}

/** A fraction as a percentage: percent(0.553) is "55%". */
export function percent(fraction, digits = 0) {
  const x = num(fraction);
  return Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : EMPTY_VALUE;
}

/**
 * "low to high" for a pair, each end through `fmt` (default three
 * significant figures as toPrecision writes them, the confidence interval
 * style). EMPTY_VALUE unless both ends are finite numbers.
 */
export function range(pair, fmt = (x) => Number(x).toPrecision(3)) {
  return Array.isArray(pair) && pair.length >= 2 && pair.every(Number.isFinite)
    ? `${fmt(pair[0])} to ${fmt(pair[1])}`
    : EMPTY_VALUE;
}

/** Trimmed text, or EMPTY_VALUE when there is none. */
export function orNA(v) {
  if (v == null) return EMPTY_VALUE;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : EMPTY_VALUE;
  const s = String(v).trim();
  return s || EMPTY_VALUE;
}

/** "Label (unit)", or the bare label for a dimensionless quantity. */
export const withUnit = (label, unit) => (unit ? `${label} (${unit})` : label);

/** "2026-10-02 09:00 UTC": the timestamp a report header prints. */
export const timestampUtc = (date = new Date()) => `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
