// The layer cake's boundary grids for depth conversion. A boundary horizon
// with a small interior hole (a tuned or rejected patch, a gap the tracker
// left) used to null that column's boundary, so the layer above extended to
// the next boundary there and the converted depth jumped: bullseyes on depth
// maps and streaks on depth sections. Interior holes are now filled by the
// same membrane interpolation as the Fill holes tool before conversion. The
// uninterpreted exterior (a horizon that stops at a fault or covers part of
// the survey) stays null, so the engine convention still applies there.
import { fillHorizonHoles } from '../engine/horizonTrack';

/**
 * @param {Float32Array|null} grid boundary picks (sample indices, 1e30 nulls)
 * @param {{nIl:number, nXl:number}} geom
 * @returns {Float32Array|null} a new grid with interior holes filled
 */
export function boundaryGridForDepth(grid, geom) {
  if (!grid || !geom) return grid || null;
  return fillHorizonHoles(grid, geom.nIl, geom.nXl).grid;
}
