// Display units for Basin & Charge Modeling (BF3, 2026-09-06). The
// engine, the saved well and the goldens stay SI (metres, degrees C,
// Ma, mW/m2); these helpers convert at the UI edge. Depth follows the
// account's Geoscience depth unit through the backend with a browser
// fallback; temperature is C or F. Pure, no I/O.

export const UNITS_KEY = 'bf.units';
export const M_PER_FT = 0.3048;
export const DEPTH_UNITS = Object.freeze(['m', 'ft']);
export const TEMP_UNITS = Object.freeze(['C', 'F']);
export const DEFAULT_UNITS = Object.freeze({ depth: 'ft', temp: 'C' });

export function readUnits(storage) {
  try {
    const raw = storage?.getItem(UNITS_KEY);
    const u = raw ? JSON.parse(raw) : {};
    return {
      depth: DEPTH_UNITS.includes(u.depth) ? u.depth : DEFAULT_UNITS.depth,
      temp: TEMP_UNITS.includes(u.temp) ? u.temp : DEFAULT_UNITS.temp,
    };
  } catch { return { ...DEFAULT_UNITS }; }
}

export const depthToDisplay = (m, unit) => (Number.isFinite(m) ? (unit === 'ft' ? m / M_PER_FT : m) : NaN);
export const depthFromDisplay = (v, unit) => (Number.isFinite(v) ? (unit === 'ft' ? v * M_PER_FT : v) : NaN);
export const tempToDisplay = (c, unit) => (Number.isFinite(c) ? (unit === 'F' ? c * 1.8 + 32 : c) : NaN);
export const tempFromDisplay = (v, unit) => (Number.isFinite(v) ? (unit === 'F' ? (v - 32) / 1.8 : v) : NaN);
/** A temperature difference (an RMS misfit) scales without the offset. */
export const tempDeltaToDisplay = (dc, unit) => (Number.isFinite(dc) ? (unit === 'F' ? dc * 1.8 : dc) : NaN);

/** Enough decimals, no trailing zeros (1600 m, 5249.34 ft). */
export const tidy = (v, digits = 2) => (Number.isFinite(v) ? String(Number(v.toFixed(digits))) : '');
export const fmtDepth = (m, unit, digits = 0) => { const v = depthToDisplay(m, unit); return Number.isFinite(v) ? v.toFixed(digits) : '—'; };
export const fmtTemp = (c, unit, digits = 1) => { const v = tempToDisplay(c, unit); return Number.isFinite(v) ? v.toFixed(digits) : '—'; };

export const depthLabel = (unit, what = 'Depth') => `${what} (${unit})`;
export const tempLabel = (unit, what = 'Temperature') => `${what} (°${unit})`;
export const tempSymbol = (unit) => `°${unit}`;
