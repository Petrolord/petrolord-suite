// Smooth model edges (Earth Modeling 3D grid upgrade, 2026-10-17). A map
// gridded inside the wells' hull has live nodes and null nodes; on the old
// frame each live node was a whole cell, so the model edge was the node
// staircase of the input map, and a finer cell only made a finer staircase
// INSIDE the old one (each fine node needs four live input nodes around it).
//
// The model edge is now the data limit traced halfway between the last
// live node and the first null one: the 0.5 level of the input's live mask,
// interpolated bilinearly (marching squares draws the same line). For a
// straight edge that is exactly where a node-centred cell of the input
// ends, so the fine grid keeps the old area; across a diagonal it is a
// straight line where the old cells made steps. To give the cells in the
// half-cell band past the last live node a depth, each input surface is
// first extrapolated by one ring of nodes (linear along each grid
// direction, the mean of the directions that have two live nodes behind
// them). Pure, no I/O.

import { isNull, sampleAtXY } from '@/lib/gridding/gridmath';
import { NULL_VALUE } from '@/lib/gridding/numeric';
import { contourPolylines } from '@/lib/gridding/mapContours';

/** The live mask of a grid (1 live, 0 null) as Float64. */
export function liveMask(z) {
  const m = new Float64Array(z.length);
  for (let j = 0; j < z.length; j++) m[j] = isNull(z[j]) ? 0 : 1;
  return m;
}

/**
 * One ring of extrapolation: every null node next to a live one takes the
 * mean linear extrapolation of the directions with two live nodes behind it
 * (or the live neighbour's value when none has two). Live nodes unchanged.
 */
export function extrapolateRing(z, nx, ny) {
  const out = Float64Array.from(z);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  const live = (c, r) => c >= 0 && r >= 0 && c < nx && r < ny && !isNull(z[r * nx + c]);
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const j = r * nx + c;
      if (!isNull(z[j])) continue;
      let s = 0; let n = 0; let s1 = 0; let n1 = 0;
      for (const [dc, dr] of dirs) {
        if (!live(c + dc, r + dr)) continue;
        const v1 = z[(r + dr) * nx + c + dc];
        s1 += v1; n1 += 1;
        if (live(c + 2 * dc, r + 2 * dr)) { s += 2 * v1 - z[(r + 2 * dr) * nx + c + 2 * dc]; n += 1; }
      }
      if (n) out[j] = s / n; else if (n1) out[j] = s1 / n1;
    }
  }
  return out;
}

/**
 * A surface on the model frame with the smooth edge: extrapolated one ring
 * on its own grid, resampled bilinearly, and null where its live mask
 * interpolates below one half.
 * @param {ArrayLike<number>} z the surface on its own grid
 * @param {object} spec its grid spec {x0, y0, dx, dy, nx, ny}
 * @param {object} target the model frame spec
 */
export function resampleSmooth(z, spec, target) {
  const ext = extrapolateRing(z, spec.nx, spec.ny);
  const mask = liveMask(z);
  const out = new Float64Array(target.nx * target.ny);
  for (let r = 0; r < target.ny; r++) {
    for (let c = 0; c < target.nx; c++) {
      const x = target.x0 + c * target.dx; const y = target.y0 + r * target.dy;
      const m = maskAt(mask, spec, x, y);
      if (!(m >= 0.5)) { out[r * target.nx + c] = NULL_VALUE; continue; }
      const v = sampleAtXY(ext, spec, x, y);
      out[r * target.nx + c] = isNull(v) ? NULL_VALUE : v;
    }
  }
  return out;
}

/** The live mask interpolated at a point: 0 outside the grid, the mask's bilinear value inside. */
export function maskAt(mask, spec, x, y) {
  const fx = (x - spec.x0) / spec.dx; const fy = (y - spec.y0) / spec.dy;
  const c0 = Math.floor(fx); const r0 = Math.floor(fy);
  const tx = fx - c0; const ty = fy - r0;
  const at = (c, r) => (c < 0 || r < 0 || c >= spec.nx || r >= spec.ny ? 0 : mask[r * spec.nx + c]);
  return (at(c0, r0) * (1 - tx) + at(c0 + 1, r0) * tx) * (1 - ty) + (at(c0, r0 + 1) * (1 - tx) + at(c0 + 1, r0 + 1) * tx) * ty;
}

/**
 * The frame the smooth edge needs: the top surface's extent grown by half
 * of its cell on every side (where a node-centred cell of the input ends),
 * at the model cell.
 */
export function smoothFrame(topSpec, cellM) {
  const cell = Number(cellM) > 0 ? Number(cellM) : Math.min(topSpec.dx, topSpec.dy);
  const x0 = topSpec.x0 - topSpec.dx / 2; const y0 = topSpec.y0 - topSpec.dy / 2;
  const extX = topSpec.nx * topSpec.dx; const extY = topSpec.ny * topSpec.dy;
  // nodes at the centres of cells of the model size inside the grown extent
  const nx = Math.max(2, Math.floor(extX / cell + 1e-9));
  const ny = Math.max(2, Math.floor(extY / cell + 1e-9));
  if (nx * ny > 4_000_000) throw new Error('That cell size makes more than four million nodes. Use a larger cell.');
  return { x0: x0 + cell / 2, y0: y0 + cell / 2, dx: cell, dy: cell, nx, ny };
}

/**
 * The data limit as closed rings in world coordinates (for the map, the
 * section and 3D outline): the 0.5 contour of a grid's live mask, padded so
 * rings close at the grid edge.
 * @returns {Array<Array<[number, number]>>}
 */
export function dataLimitRings(z, spec) {
  const nx = spec.nx + 2; const ny = spec.ny + 2;
  const pad = new Float32Array(nx * ny);
  for (let r = 0; r < spec.ny; r++) for (let c = 0; c < spec.nx; c++) pad[(r + 1) * nx + c + 1] = isNull(z[r * spec.nx + c]) ? 0 : 1;
  const lines = contourPolylines(pad, ny, nx, 0.5);
  return lines.map((L) => {
    const ring = [];
    for (let q = 0; q < L.length; q += 2) ring.push([spec.x0 + (L[q] - 1) * spec.dx, spec.y0 + (L[q + 1] - 1) * spec.dy]);
    return ring;
  }).filter((ring) => ring.length >= 4);
}

/**
 * Corner cutting (Chaikin): each pass replaces every segment by its quarter
 * and three-quarter points, so the 45-degree steps a marching-squares line
 * keeps on a coarse map round off into a smooth curve. Display only.
 */
export function chaikin(ring, passes = 3) {
  let r = ring;
  for (let p = 0; p < passes; p++) {
    const out = [];
    for (let q = 0; q < r.length; q++) {
      const [ax, ay] = r[q]; const [bx, by] = r[(q + 1) % r.length];
      out.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by], [0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]);
    }
    r = out;
  }
  return r;
}

/** The data limit of a model-frame grid itself (the built model's outline). */
export const modelOutline = (z, spec) => dataLimitRings(z, spec);
