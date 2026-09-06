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
