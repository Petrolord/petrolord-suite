// Deterministic top (marker) colours shared by Petrophysics Studio and Well
// Correlation (PT0, 2026-09-03). The same top name gets the same hue on the
// white Petrophysics plot and the dark correlation plot, on every well,
// with no coordination: index-aligned light/dark palettes chosen by a hash
// of the normalised name. Per-name overrides (user picks) win.

export const TOP_PALETTE_LIGHT = ['#b45309', '#0e7490', '#047857', '#be185d', '#6d28d9', '#b91c1c', '#0369a1', '#a16207', '#15803d', '#c2410c', '#4338ca', '#0f766e'];
export const TOP_PALETTE_DARK = ['#fbbf24', '#22d3ee', '#34d399', '#f472b6', '#a78bfa', '#f87171', '#38bdf8', '#fde047', '#4ade80', '#fb923c', '#818cf8', '#2dd4bf'];

export const topKey = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** FNV-1a over the normalised name; stable across sessions and apps. */
export function hashName(name) {
  const s = topKey(name);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function topColor(name, { theme = 'light', overrides = {} } = {}) {
  const o = overrides && overrides[topKey(name)];
  if (o && typeof o === 'object' && o.color) return o.color;
  if (typeof o === 'string' && o) return o;
  const palette = theme === 'dark' ? TOP_PALETTE_DARK : TOP_PALETTE_LIGHT;
  return palette[hashName(name) % palette.length];
}
