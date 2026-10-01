// Display units for Wellsite Studio: the store is SI metres MD below KB;
// each well has a default entry form (unit, reference, datum) and the
// account depth unit is the fallback for display. Pure.

import { M_PER_FT } from '@/lib/wellsite/depth';

export const UNITS_KEY = 'ws.units';
export const DEPTH_UNITS = Object.freeze(['m', 'ft']);

export function readUnits(storage, fallbackDepth = 'ft') {
  try {
    const raw = storage?.getItem(UNITS_KEY);
    const u = raw ? JSON.parse(raw) : {};
    return { depth: DEPTH_UNITS.includes(u.depth) ? u.depth : fallbackDepth };
  } catch { return { depth: fallbackDepth }; }
}
export function writeUnits(storage, units) {
  try { storage?.setItem(UNITS_KEY, JSON.stringify(units)); } catch { /* storage may be unavailable */ }
}
export const depthToDisplay = (m, unit) => (Number.isFinite(m) ? (unit === 'ft' ? m / M_PER_FT : m) : NaN);
export const depthFromDisplay = (v, unit) => (Number.isFinite(v) ? (unit === 'ft' ? v * M_PER_FT : v) : NaN);
export const depthDigits = (unit) => (unit === 'ft' ? 0 : 1);
export function fmtDepth(m, unit, digits = depthDigits(unit)) {
  const v = depthToDisplay(m, unit);
  return Number.isFinite(v) ? `${v.toFixed(digits)} ${unit}` : '';
}

// WS-U1-008 (2026-10-01): drillers write hole, bit and liner sizes as
// fractions ("12 1/4", "8-1/2", "17½") and a European keyboard types "12,25".
// Number() refused every one of them, so the rig configuration failed with
// "needs a positive inside diameter" on the sizes a rig actually uses.
const UNICODE_FRACTIONS = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };
/** A typed field number: plain, comma decimal, a fraction or a whole number with a fraction, a trailing in or " ignored. NaN when unreadable. */
export function parseFieldNumber(text) {
  if (text == null) return NaN;
  if (typeof text === 'number') return text;
  let t = String(text).trim().replace(/\s*(in|inch|inches|")$/i, '').trim();
  if (!t) return NaN;
  for (const [ch, v] of Object.entries(UNICODE_FRACTIONS)) {
    if (t.endsWith(ch)) {
      const whole = t.slice(0, -1).trim().replace(/-$/, '').trim();
      const w = whole ? Number(whole) : 0;
      return Number.isFinite(w) ? w + v : NaN;
    }
  }
  if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
  const plain = Number(t);
  if (Number.isFinite(plain)) return plain;
  const m = t.match(/^(\d+)(?:\s+|\s*-\s*)(\d+)\s*\/\s*(\d+)$/) || t.match(/^()(\d+)\s*\/\s*(\d+)$/);
  if (m) {
    const den = Number(m[3]);
    if (!(den > 0)) return NaN;
    return (m[1] ? Number(m[1]) : 0) + Number(m[2]) / den;
  }
  return NaN;
}
