// Display units for Rock Physics Studio (RP0, 2026-09-06). The engine
// and every stored value stay SI (m/s, kg/m3, metres); these helpers
// convert at the UI edge. Velocity may show as a speed (m/s, ft/s) or
// as sonic slowness (us/ft, us/m); density as kg/m3 or g/cc; depth in
// the account's Geoscience depth unit (the Mapping setting) with a
// browser fallback. Pure, no I/O.

export const UNITS_KEY = 'rp.units';
const M_PER_FT = 0.3048;

export const VELOCITY_UNITS = Object.freeze([
  { key: 'm/s', label: 'm/s', kind: 'speed' },
  { key: 'ft/s', label: 'ft/s', kind: 'speed' },
  { key: 'us/ft', label: 'us/ft (slowness)', kind: 'slowness' },
  { key: 'us/m', label: 'us/m (slowness)', kind: 'slowness' },
]);
export const DENSITY_UNITS = Object.freeze([
  { key: 'kg/m3', label: 'kg/m3' },
  { key: 'g/cc', label: 'g/cc' },
]);
export const DEPTH_UNITS = Object.freeze(['m', 'ft']);
export const DEFAULT_UNITS = Object.freeze({ velocity: 'm/s', density: 'kg/m3', depth: 'ft' });

/** Read the remembered choices; unknown values fall back. */
export function readUnits(storage) {
  try {
    const raw = storage?.getItem(UNITS_KEY);
    const u = raw ? JSON.parse(raw) : {};
    return {
      velocity: VELOCITY_UNITS.some((v) => v.key === u.velocity) ? u.velocity : DEFAULT_UNITS.velocity,
      density: DENSITY_UNITS.some((v) => v.key === u.density) ? u.density : DEFAULT_UNITS.density,
      depth: DEPTH_UNITS.includes(u.depth) ? u.depth : DEFAULT_UNITS.depth,
    };
  } catch { return { ...DEFAULT_UNITS }; }
}

/** Velocity m/s -> display value (speed or slowness). */
export function velocityToDisplay(ms, unit) {
  if (!Number.isFinite(ms)) return NaN;
  switch (unit) {
    case 'ft/s': return ms / M_PER_FT;
    case 'us/ft': return ms > 0 ? 1e6 / (ms / M_PER_FT) : NaN;
    case 'us/m': return ms > 0 ? 1e6 / ms : NaN;
    default: return ms;
  }
}
/** Display velocity value -> m/s. */
export function velocityFromDisplay(v, unit) {
  if (!Number.isFinite(v)) return NaN;
  switch (unit) {
    case 'ft/s': return v * M_PER_FT;
    case 'us/ft': return v > 0 ? (1e6 / v) * M_PER_FT : NaN;
    case 'us/m': return v > 0 ? 1e6 / v : NaN;
    default: return v;
  }
}
export const densityToDisplay = (kg, unit) => (Number.isFinite(kg) ? (unit === 'g/cc' ? kg / 1000 : kg) : NaN);
export const densityFromDisplay = (v, unit) => (Number.isFinite(v) ? (unit === 'g/cc' ? v * 1000 : v) : NaN);
export const depthToDisplay = (m, unit) => (Number.isFinite(m) ? (unit === 'ft' ? m / M_PER_FT : m) : NaN);
export const depthFromDisplay = (v, unit) => (Number.isFinite(v) ? (unit === 'ft' ? v * M_PER_FT : v) : NaN);

/** Decimal places that keep the display honest per unit; an SI table
 *  keeps its own decimals (`siDigits`) so the oracle-anchored e2e
 *  literals stay exact. */
export const velocityDigits = (unit, siDigits = 1) => (unit === 'us/ft' || unit === 'us/m' ? 2 : unit === 'ft/s' ? 0 : siDigits);
export const densityDigits = (unit, siDigits = 1) => (unit === 'g/cc' ? 3 : siDigits);

export const velocityLabel = (unit) => (unit === 'us/ft' || unit === 'us/m' ? `Slowness (${unit})` : `Velocity (${unit})`);
export const fmtVelocity = (ms, unit, siDigits = 1) => { const v = velocityToDisplay(ms, unit); return Number.isFinite(v) ? v.toFixed(velocityDigits(unit, siDigits)) : '—'; };
export const fmtDensity = (kg, unit, siDigits = 1) => { const v = densityToDisplay(kg, unit); return Number.isFinite(v) ? v.toFixed(densityDigits(unit, siDigits)) : '—'; };
export const fmtDepth = (m, unit, digits = 1) => { const v = depthToDisplay(m, unit); return Number.isFinite(v) ? v.toFixed(digits) : '—'; };
/** Depth for a label: at most one decimal, no trailing zero (2060 m, 6758.5 ft). */
export const tidyDepth = (m, unit) => { const v = depthToDisplay(m, unit); return Number.isFinite(v) ? String(Number(v.toFixed(1))) : '—'; };
export const densityLabel = (unit) => `ρ (${unit === 'g/cc' ? 'g/cc' : 'kg/m³'})`;
export const depthLabel = (unit) => `MD (${unit})`;
