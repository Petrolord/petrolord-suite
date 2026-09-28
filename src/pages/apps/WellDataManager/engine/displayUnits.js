// Display depth unit for Well Data Manager (AppUpgrade WDM-U2-001).
//
// The registry stores every depth in metres (MD, TVD, TVDSS, KB, TD). A
// feet-based user reads and types feet everywhere in the app; only the
// numbers on screen and in exports convert. Two rules keep the stored
// data honest:
//
//   1. Conversion is the exact international foot (0.3048 m), the same
//      factor the LAS door and Well Correlation use (depthModes.js).
//   2. A value the user did not change is never re-derived from its
//      rounded display text: an editor saved with an untouched cell keeps
//      the stored metres bit for bit (parseDisplayed below). Without this,
//      opening the Tops grid in feet and pressing Save moved every top by
//      up to half a display digit.
//
// The choice is remembered per user on this device (localStorage keyed by
// the signed-in user id, like the theme), wrapped in try/catch because
// storage can be missing or blocked. Pure functions, no React.

import { M_PER_FT, toDisplay, fromDisplay } from '@/components/wells/depthModes';
import { EMPTY_VALUE } from '@/lib/emptyValue';

export { M_PER_FT };
export const DEPTH_UNITS = Object.freeze(['m', 'ft']);
export const DISPLAY_UNIT_PREFIX = 'petrolord.wdm.displayUnit.v1:';

/** 'ft' or 'm' (anything else reads as metres). */
export const normUnit = (u) => (u === 'ft' ? 'ft' : 'm');
export const unitText = (u) => (normUnit(u) === 'ft' ? 'ft' : 'm');

/** Stored metres -> display unit. */
export const toDisp = (m, unit) => toDisplay(Number(m), normUnit(unit));
/** Display unit -> stored metres. */
export const fromDisp = (v, unit) => fromDisplay(Number(v), normUnit(unit));

/** Table text for a stored depth: fixed digits in the display unit, or EMPTY_VALUE. */
export function fmtDepth(m, unit, digits = 1) {
  if (m === null || m === undefined || m === '' || !Number.isFinite(Number(m))) return EMPTY_VALUE;
  return toDisp(m, unit).toFixed(digits);
}

/** Editor cell text for a stored depth (trailing zeros trimmed); '' for none. */
export function editCell(m, unit, digits = 2) {
  if (m === null || m === undefined || m === '' || !Number.isFinite(Number(m))) return '';
  return String(Number(toDisp(m, unit).toFixed(digits)));
}

/**
 * Metres for a typed cell. When the text is exactly what the editor
 * showed for `originalM` in the same unit, the original metres come back
 * untouched (rule 2 above).
 * @returns {number} NaN when the text is not a number
 */
export function parseDisplayed(text, unit, originalM = null, digits = 2) {
  const t = String(text ?? '').trim();
  if (originalM !== null && originalM !== undefined && Number.isFinite(Number(originalM))
    && t === editCell(originalM, unit, digits)) {
    return Number(originalM);
  }
  if (t === '') return Number.NaN;
  const v = Number(t);
  return Number.isFinite(v) ? fromDisp(v, unit) : Number.NaN;
}

export const displayUnitKey = (userId) => `${DISPLAY_UNIT_PREFIX}${userId || 'anon'}`;

function storage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

export function readDisplayUnit(userId, store = storage()) {
  try {
    const v = store ? store.getItem(displayUnitKey(userId)) : null;
    return DEPTH_UNITS.includes(v) ? v : 'm';
  } catch {
    return 'm';
  }
}

export function writeDisplayUnit(userId, unit, store = storage()) {
  try {
    if (store) store.setItem(displayUnitKey(userId), normUnit(unit));
    return true;
  } catch {
    return false;
  }
}
