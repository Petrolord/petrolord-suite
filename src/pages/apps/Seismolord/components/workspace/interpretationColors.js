// Shared overlay color assignment for interpretation objects. Colors are
// keyed by the object's index in its list so the explorer tree, the 2D/3D
// overlays and the map all agree without persisting a color per row.

export const HORIZON_COLORS = ['#22d3ee', '#f59e0b', '#a3e635', '#f472b6', '#c084fc', '#fb7185'];
export const horizonColor = (index) => HORIZON_COLORS[index % HORIZON_COLORS.length];

export const FAULT_COLORS = ['#fb923c', '#e879f9', '#4ade80', '#f87171', '#38bdf8'];
export const faultColor = (index) => FAULT_COLORS[index % FAULT_COLORS.length];

export const WELL_COLORS = ['#fbbf24', '#34d399', '#f472b6', '#38bdf8', '#fb923c', '#e879f9'];
export const wellColor = (index) => WELL_COLORS[index % WELL_COLORS.length];
