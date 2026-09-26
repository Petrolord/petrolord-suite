// Depth conversion tied to the wells (Mapping T1 MAP-T1-009 and E5,
// 2026-09-26): the routine Niger Delta method. At each well that carries
// the top, its depth below datum and the time surface's TWT there give an
// average velocity; the velocities are gridded over the time surface with
// a spline in tension (velocity varies smoothly, and tension keeps a few
// wells from overshooting), and depth = Vavg * TWT / 2 node by node, so
// the map honours every well. The residual table (well elevation minus
// map elevation) is the QC a mapper reads after any conversion or grid;
// for any other conversion a residual correction (Earth Modeling's
// residualField) spreads the mis-ties over the map. Engine math lives in
// the engines repo (engines/mapping/wellTie.js, lib/gridding/tensionSpline.js).

import { averageVelocityTies, depthFromAverageVelocity, tieResiduals, residualStats } from '../engine/wellTie';
import { gridTensionSpline } from '@/lib/gridding/tensionSpline';
import { residualField, applyCorrection, defaultRadius } from '@/pages/apps/EarthModeling/engine/adjust';
import { topsToControlPoints } from '../engine/surface';
import { worldToGridIndex, isNull } from '@/lib/gridding/gridmath';

/**
 * The map's value at a point from its LIVE surrounding nodes only
 * (weighted by their bilinear weights), so a well on the edge of a
 * hull-masked map still reads the map beside it; null when no surrounding
 * node is live.
 */
export function sampleLive(z, spec, x, y) {
  const { fx, fy } = worldToGridIndex(spec, x, y);
  if (!(fx >= -0.5 && fy >= -0.5 && fx <= spec.nx - 0.5 && fy <= spec.ny - 0.5)) return null;
  const c0 = Math.max(0, Math.min(spec.nx - 2, Math.floor(fx)));
  const r0 = Math.max(0, Math.min(spec.ny - 2, Math.floor(fy)));
  const u = Math.max(0, Math.min(1, fx - c0));
  const v = Math.max(0, Math.min(1, fy - r0));
  let w = 0; let s = 0;
  const add = (val, wt) => { if (!isNull(val) && wt > 0) { w += wt; s += wt * val; } };
  add(z[r0 * spec.nx + c0], (1 - u) * (1 - v));
  add(z[r0 * spec.nx + c0 + 1], u * (1 - v));
  add(z[(r0 + 1) * spec.nx + c0], (1 - u) * v);
  add(z[(r0 + 1) * spec.nx + c0 + 1], u * v);
  return w > 0 ? s / w : null;
}

/** Residual rows (well elevation minus map elevation, metres) read with sampleLive. */
export function mapResiduals(wells, zM, spec) {
  return (wells || []).filter((w) => Number.isFinite(w.depthM)).map((w) => {
    const m = sampleLive(zM, spec, w.x, w.y);
    const wellZ = -w.depthM;
    return { well: w.well, x: w.x, y: w.y, wellZ, mapZ: m, residualM: m == null ? null : wellZ - m };
  });
}

/** Wells carrying `top` as {well, x, y, depthM (below datum, positive)} at the borehole. */
export function wellDepthsForTop(wells, top) {
  const r = topsToControlPoints(wells, top, { depthRef: 'tvdss', placement: 'borehole' });
  return { wells: r.points.map((p) => ({ well: p.well, x: p.x, y: p.y, depthM: -p.z })), skipped: r.skipped };
}

/**
 * @param {{twtMs: ArrayLike<number>, spec: object, wells: Array<{well,x,y,depthM}>, tension?: number}} p
 * @returns {{zM: Float64Array, ties: Array, skipped: Array, residuals: Array, stats: object, vRange: [number, number]}}
 */
export function convertWithWellVelocity({ twtMs, spec, wells, tension = 0.5 }) {
  const { ties, skipped } = averageVelocityTies(wells, twtMs, spec);
  if (ties.length < 3) {
    throw new Error(`Average velocity needs at least 3 wells with the top inside the time surface; ${ties.length} ${ties.length === 1 ? 'has' : 'have'} it.`);
  }
  const v = gridTensionSpline(ties.map((t) => ({ x: t.x, y: t.y, z: t.vavg })), spec, { tension, mask: 'none' });
  const zM = depthFromAverageVelocity(twtMs, v.z);
  const residuals = mapResiduals(wells, zM, spec);
  const vs = ties.map((t) => t.vavg);
  return { zM, ties, skipped, residuals, stats: residualStats(residuals), vRange: [Math.min(...vs), Math.max(...vs)] };
}

/**
 * Correct a depth map (elevation, metres) to the wells: the mis-ties are
 * spread by a Franke-Little field over `radius` (default three times the
 * median well spacing).
 * @returns {{zM: Float32Array|Float64Array, before: object, after: object, residuals: Array, radius: number}}
 */
export function correctToWells({ zM, spec, wells, radius = null }) {
  const before = tieResiduals(wells, zM, spec);
  const R = radius ?? defaultRadius(before);
  const { field } = residualField(before.filter((r) => r.residualM != null), spec, R);
  const corrected = applyCorrection(zM, field);
  const after = tieResiduals(wells, corrected, spec);
  return { zM: corrected, before: residualStats(before), after: residualStats(after), residuals: after, radius: R };
}

export { tieResiduals, residualStats };
