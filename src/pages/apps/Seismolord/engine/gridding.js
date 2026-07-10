// Surface gridding (Phase 4): thin-plate spline interpolation of
// scattered picks onto a regular grid, masked to the convex hull of the
// control points plus a maximum extrapolation distance. Nodes outside
// the mask are NULL_VALUE — the playbook null that propagates and never
// enters statistics or sums.
//
// Pure math, worker-safe, no I/O. Column/row order conventions live in
// surfaceExport.js, not here: this module's grid is z[row * nx + col]
// with row 0 at the minimum Y (south) — matching the oracle's model.

import { NULL_VALUE } from './manifest';

const NULL_F32 = Math.fround(NULL_VALUE);

/** TPS radial basis U(r) = r^2 log r^2 (0 at r = 0). */
const tpsU = (r2) => (r2 > 0 ? r2 * Math.log(r2) : 0);

/**
 * Dense Gaussian elimination with partial pivoting. A is n x n (row
 * major, mutated), b length n (mutated); returns the solution in b.
 */
function solveDense(A, b, n) {
  for (let col = 0; col < n; col++) {
    let pivot = col;
    let best = Math.abs(A[col * n + col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(A[r * n + col]);
      if (v > best) { best = v; pivot = r; }
    }
    if (best < 1e-12) throw new Error('Gridding system is singular — control points may be collinear or duplicated.');
    if (pivot !== col) {
      for (let c = col; c < n; c++) {
        const t = A[col * n + c];
        A[col * n + c] = A[pivot * n + c];
        A[pivot * n + c] = t;
      }
      const t = b[col]; b[col] = b[pivot]; b[pivot] = t;
    }
    const inv = 1 / A[col * n + col];
    for (let r = col + 1; r < n; r++) {
      const f = A[r * n + col] * inv;
      if (f === 0) continue;
      for (let c = col; c < n; c++) A[r * n + c] -= f * A[col * n + c];
      b[r] -= f * b[col];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= A[r * n + c] * b[c];
    b[r] = s / A[r * n + r];
  }
  return b;
}

/**
 * Thin the control set to at most maxControl points by keeping one point
 * per cell of a coarse grid (dense TPS is O(N^3); beyond ~1000 points the
 * decimated fit is indistinguishable at seismic pick density).
 * @returns {{points: Array, dropped: number}}
 */
export function decimateControls(points, maxControl) {
  if (points.length <= maxControl) return { points, dropped: 0 };
  let xmin = Infinity; let xmax = -Infinity; let ymin = Infinity; let ymax = -Infinity;
  for (const p of points) {
    if (p.x < xmin) xmin = p.x;
    if (p.x > xmax) xmax = p.x;
    if (p.y < ymin) ymin = p.y;
    if (p.y > ymax) ymax = p.y;
  }
  const cells = Math.ceil(Math.sqrt(maxControl));
  const cw = (xmax - xmin) / cells || 1;
  const ch = (ymax - ymin) / cells || 1;
  const byCell = new Map();
  for (const p of points) {
    const key = `${Math.min(cells - 1, Math.floor((p.x - xmin) / cw))}:`
      + `${Math.min(cells - 1, Math.floor((p.y - ymin) / ch))}`;
    if (!byCell.has(key)) byCell.set(key, p);
  }
  const kept = [...byCell.values()];
  return { points: kept, dropped: points.length - kept.length };
}

/** Andrew monotone-chain convex hull; returns hull vertices CCW. */
export function convexHull(points) {
  const pts = [...points].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (pts.length <= 2) return pts;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

const insideHull = (hull, x, y) => {
  // CCW hull: point is inside iff it is left of (or on) every edge
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
  }
  return true;
};

/**
 * Fit a thin-plate spline to control points.
 * @param {{x:number,y:number,z:number}[]} points
 * @returns {(x: number, y: number) => number}
 */
export function fitTps(points) {
  const n = points.length;
  if (n < 3) throw new Error('Gridding needs at least 3 control points.');
  const m = n + 3;
  const A = new Float64Array(m * m);
  const b = new Float64Array(m);
  for (let i = 0; i < n; i++) {
    const pi = points[i];
    for (let j = 0; j < n; j++) {
      const dx = pi.x - points[j].x;
      const dy = pi.y - points[j].y;
      A[i * m + j] = tpsU(dx * dx + dy * dy);
    }
    A[i * m + n] = 1;
    A[i * m + n + 1] = pi.x;
    A[i * m + n + 2] = pi.y;
    A[(n) * m + i] = 1;
    A[(n + 1) * m + i] = pi.x;
    A[(n + 2) * m + i] = pi.y;
    b[i] = pi.z;
  }
  const sol = solveDense(A, b, m);
  const w = sol.slice(0, n);
  const [a0, ax, ay] = [sol[n], sol[n + 1], sol[n + 2]];
  return (x, y) => {
    let s = a0 + ax * x + ay * y;
    for (let i = 0; i < n; i++) {
      const dx = x - points[i].x;
      const dy = y - points[i].y;
      s += w[i] * tpsU(dx * dx + dy * dy);
    }
    return s;
  };
}

/**
 * Grid scattered points with TPS + hull/extrapolation masking.
 *
 * @param {{x:number,y:number,z:number}[]} rawPoints
 * @param {{x0:number,y0:number,dx:number,dy:number,nx:number,ny:number}} spec
 * @param {{maxControl?: number, maxExtrapolation?: number,
 *          onProgress?: (done:number,total:number)=>void}} [opts]
 *   maxExtrapolation: nodes farther than this from every control point
 *   are nulled even inside the hull (default 2 grid cells).
 * @returns {{z: Float32Array, live: number, controlCount: number,
 *            dropped: number, zMin: number|null, zMax: number|null}}
 */
export function gridSurface(rawPoints, spec, opts = {}) {
  const {
    maxControl = 700,
    maxExtrapolation = 2 * Math.max(spec.dx, spec.dy),
    onProgress,
  } = opts;
  const clean = rawPoints.filter((p) => Number.isFinite(p.z) && Math.abs(p.z) < 1.0e29);
  const { points, dropped } = decimateControls(clean, maxControl);
  const tps = fitTps(points);
  const hull = convexHull(points);
  const maxExtrap2 = maxExtrapolation * maxExtrapolation;

  const { nx, ny } = spec;
  const z = new Float32Array(nx * ny).fill(NULL_F32);
  let live = 0;
  let zMin = Infinity;
  let zMax = -Infinity;
  const total = nx * ny;
  for (let r = 0; r < ny; r++) {
    const y = spec.y0 + r * spec.dy;
    for (let c = 0; c < nx; c++) {
      const x = spec.x0 + c * spec.dx;
      if (!insideHull(hull, x, y)) continue;
      let near = false;
      for (let i = 0; i < points.length; i++) {
        const dx = x - points[i].x;
        const dy = y - points[i].y;
        if (dx * dx + dy * dy <= maxExtrap2) { near = true; break; }
      }
      if (!near) continue;
      const v = tps(x, y);
      z[r * nx + c] = v;
      const vf = z[r * nx + c];
      if (vf < zMin) zMin = vf;
      if (vf > zMax) zMax = vf;
      live += 1;
    }
    if (onProgress && r % 8 === 0) onProgress(r * nx, total);
  }
  if (onProgress) onProgress(total, total);
  return {
    z,
    live,
    controlCount: points.length,
    dropped,
    zMin: live ? zMin : null,
    zMax: live ? zMax : null,
  };
}

/**
 * Convert a horizon pick grid to world-coordinate control points.
 *
 * Assumes the survey's X axis runs along crosslines and Y along inlines
 * (the corner coordinates in the manifest define the spacing) — true for
 * unrotated surveys; rotated-geometry support is a recorded follow-up.
 *
 * @param {Float32Array} picks sample indices, nIl x nXl, 1e30 nulls
 * @param {{nIl:number,nXl:number}} geom
 * @param {{first:{x:number,y:number}, last:{x:number,y:number}}} corners
 * @param {(sample: number) => number} sampleToZ e.g. TWT ms or depth ft
 */
export function picksToPoints(picks, geom, corners, sampleToZ) {
  const dxl = geom.nXl > 1 ? (corners.last.x - corners.first.x) / (geom.nXl - 1) : 0;
  const dil = geom.nIl > 1 ? (corners.last.y - corners.first.y) / (geom.nIl - 1) : 0;
  const out = [];
  for (let i = 0; i < geom.nIl; i++) {
    for (let x = 0; x < geom.nXl; x++) {
      const s = picks[i * geom.nXl + x];
      if (s === NULL_F32) continue;
      out.push({
        x: corners.first.x + x * dxl,
        y: corners.first.y + i * dil,
        z: sampleToZ(s),
      });
    }
  }
  return out;
}
