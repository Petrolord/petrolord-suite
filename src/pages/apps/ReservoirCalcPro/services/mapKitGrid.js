// The shared Mapping map kit in ReservoirCalc Pro (upgrade U2-009, the E2
// item). RCP's own grids ({x[], y[], z[ny][nx]}) and registry lattices
// become the kit's { spec, grid } (row-major Float32, the 1e30 null), so
// RCP's 2D view is the same viewport Mapping and Earth Modeling use:
// zoom at the cursor, pan, fit, readout, labelled contours, colour bar,
// scale bar in metres, north arrow, titled PNG. Pure.

import { latticeOf } from './lattice';
import { depthFactor, scaleFlatZ } from './depthDisplay';

export const NULL_Z = 1e30;

/** An RCP grid object as the kit's spec and grid, or null. */
export function kitFromRcpGrid(g) {
  if (!g || !Array.isArray(g.x) || !Array.isArray(g.y) || !Array.isArray(g.z)) return null;
  const nx = g.x.length; const ny = g.y.length;
  if (nx < 2 || ny < 2 || g.z.length !== ny) return null;
  const dx = g.cellWidth || (g.x[nx - 1] - g.x[0]) / (nx - 1);
  const dy = g.cellHeight || (g.y[ny - 1] - g.y[0]) / (ny - 1);
  const grid = new Float32Array(nx * ny);
  for (let r = 0; r < ny; r++) {
    const row = g.z[r] || [];
    for (let c = 0; c < nx; c++) {
      const v = Number(row[c]);
      grid[r * nx + c] = Number.isFinite(v) ? v : NULL_Z;
    }
  }
  return { spec: { x0: g.x[0], y0: g.y[0], dx, dy, nx, ny }, grid };
}

/**
 * The structure layer of a surface: its registry lattice when it kept one
 * (U2-005, metres elevation, its own frame and rotation), else RCP's grid.
 * With displayUnit, Z is shown in that unit (the project's: ft in Field).
 */
export function kitForSurface(surface, rcpGrid, displayUnit = null) {
  const L = latticeOf(surface);
  let k = null;
  if (L) k = { spec: L.spec, grid: L.z, unit: 'm', source: 'lattice' };
  else {
    const g = kitFromRcpGrid(rcpGrid);
    k = g ? { ...g, unit: surface?.depthUnit || null, source: 'gridded' } : null;
  }
  if (!k || !displayUnit || !k.unit || k.unit === displayUnit) return k;
  return { ...k, grid: scaleFlatZ(k.grid, depthFactor(k.unit, displayUnit)), unit: displayUnit };
}

/** AOIs as the kit's polygons (world vertices), the active one marked. */
export function kitPolygons(aois = [], activeAoiId = null) {
  return aois
    .filter((a) => a?.visible !== false && Array.isArray(a?.vertices) && a.vertices.length >= 3)
    .map((a) => ({ vertices: a.vertices, color: a.id === activeAoiId ? '#22d3ee' : '#eab308', name: a.name }));
}
