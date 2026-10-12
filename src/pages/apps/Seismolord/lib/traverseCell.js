// The lattice cell under one traverse column. A traverse drawn in the Map
// window sits on whole cells, but a 2D line projected into the 3D carries
// fractional (il, xl) per trace and null where it leaves the survey: the
// fractional index read no pick, so 3D horizons never drew on 2D lines
// (2026-10-12, lesson F18). The nearest cell is used, -1 off the lattice.
export function traverseCell(pos, nIl, nXl) {
  if (!pos || !Number.isFinite(pos.il) || !Number.isFinite(pos.xl)) return -1;
  const i = Math.round(pos.il);
  const j = Math.round(pos.xl);
  if (i < 0 || i >= nIl || j < 0 || j >= nXl) return -1;
  return i * nXl + j;
}
