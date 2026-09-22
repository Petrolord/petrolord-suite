// Shared overlay color assignment for interpretation objects. Wells and
// surfaces are keyed by the object's index in its list. Horizons and
// faults use a STABLE fallback keyed by the row id (the lists sort newest
// first, so an index key recoloured every object whenever one was added);
// a colour chosen in the settings dialog (params.display.color) wins.

export const HORIZON_COLORS = ['#22d3ee', '#f59e0b', '#a3e635', '#f472b6', '#c084fc', '#fb7185'];
export const horizonColor = (index) => HORIZON_COLORS[index % HORIZON_COLORS.length];

export const FAULT_COLORS = ['#fb923c', '#e879f9', '#4ade80', '#f87171', '#38bdf8'];
export const faultColor = (index) => FAULT_COLORS[index % FAULT_COLORS.length];

export const WELL_COLORS = ['#fbbf24', '#34d399', '#f472b6', '#38bdf8', '#fb923c', '#e879f9'];
export const wellColor = (index) => WELL_COLORS[index % WELL_COLORS.length];

export const SURFACE_COLORS = ['#5eead4', '#fde047', '#93c5fd', '#fda4af', '#d8b4fe', '#bef264'];
export const surfaceColor = (index) => SURFACE_COLORS[index % SURFACE_COLORS.length];

/** FNV-1a hash of a string id, used to pick a palette slot that never
 *  depends on list order. */
export function idHash(id) {
  const str = String(id ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Palette colour for an id: the same id always gets the same colour. */
export const stableColor = (id, palette) => palette[idHash(id) % palette.length];

/** Horizon colour: the saved display colour, else the stable fallback. */
export const horizonColorFor = (row, display = null) => (
  (display || row?.params?.display || {}).color || stableColor(row?.id, HORIZON_COLORS)
);

/** Fault colour: the saved display colour, else the stable fallback. */
export const faultColorFor = (row, display = null) => (
  (display || row?.params?.display || {}).color || stableColor(row?.id, FAULT_COLORS)
);
