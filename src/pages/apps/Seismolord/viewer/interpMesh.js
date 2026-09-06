// Interpretation geometry for the 3D cube window — horizon pick grids
// as triangle meshes, fault sticks as polylines and lofted ribbon
// surfaces. Pure math, no WebGL (jest-tested); CubeRenderer consumes
// the outputs.
//
// All positions are in NORMALIZED cube space, matching planeQuad's
// texel-centre convention exactly:
//   x = (xl + 0.5) / nXl        (in [0, 1], scaled by ext.X in the shader)
//   y = -(s + 0.5) / ns         (in [-1, 0], scaled by ext.D — time down)
//   z = (il + 0.5) / nIl        (in [0, 1], scaled by ext.Z)
// so a vexag / extent change is a uniform update, never a re-upload.

import { NULL_VALUE } from '../engine/manifest';
import { gridMesh } from '@/components/viewer3d/gridMesh';

const NULL_F32 = Math.fround(NULL_VALUE);

export { hexToRgb } from '@/components/viewer3d/gridMesh';

/**
 * Triangulate a horizon pick grid into a surface mesh (the shared
 * gridMesh with this window's texel-centre mapping; null picks make
 * holes, large grids decimate to maxDim x maxDim).
 * @param {Float32Array} grid nIl x nXl sample indices, 1e30 nulls
 * @param {{nIl:number, nXl:number, ns:number}} geom
 * @param {{maxDim?: number}} [opts]
 * @returns {{positions: Float32Array, indices: Uint32Array,
 *            vertexCount: number, triangleCount: number}}
 */
export function horizonMesh(grid, geom, opts = {}) {
  const { nIl, nXl, ns } = geom;
  const { positions, indices, vertexCount, triangleCount } = gridMesh(grid, nIl, nXl, (il, xl, s) => (
    (s === NULL_F32 || !Number.isFinite(s)) ? null : [(xl + 0.5) / nXl, -(s + 0.5) / ns, (il + 0.5) / nIl]
  ), { maxDim: opts.maxDim || 512 });
  return { positions, indices, vertexCount, triangleCount };
}

/** One fault pick -> normalized cube-space [x, y, z]. */
const stickPoint = (q, geom) => [
  (q.xl + 0.5) / geom.nXl,
  -(q.s + 0.5) / geom.ns,
  (q.il + 0.5) / geom.nIl,
];

/**
 * Fault sticks as a line-segment soup (GL_LINES layout, xyz pairs) in
 * normalized cube space.
 * @param {Array<{points: {il,xl,s}[]}|Array>} sticks
 * @returns {Float32Array}
 */
export function faultPolylines(sticks, geom) {
  const out = [];
  for (const stick of sticks || []) {
    const pts = (stick.points || stick).map((q) => stickPoint(q, geom));
    for (let i = 0; i + 1 < pts.length; i++) {
      out.push(...pts[i], ...pts[i + 1]);
    }
  }
  return Float32Array.from(out);
}

/**
 * Well lattice path -> line-segment soup (GL_LINES, xyz pairs) in
 * normalized cube space, same texel-centre convention as stickPoint.
 * Points without a time (s == null: above datum, off-survey, below the
 * window) break the polyline — consistent with the 2D pen-break rule.
 *
 * @param {{il:number, xl:number, s:?number}[]} points
 * @returns {Float32Array}
 */
export function wellPolylines(points, geom) {
  const out = [];
  let prev = null;
  for (const q of points || []) {
    if (q.s == null) { prev = null; continue; }
    const p = stickPoint(q, geom);
    if (prev) out.push(...prev, ...p);
    prev = p;
  }
  return Float32Array.from(out);
}

/**
 * Well top markers -> small axis-aligned 3D crosses (GL_LINES soup) at
 * each top's cube-space position.
 * @param {{il:number, xl:number, s:number}[]} tops
 * @returns {Float32Array}
 */
export function wellTopMarkers(tops, geom, half = 0.015) {
  const out = [];
  for (const t of tops || []) {
    if (t.s == null) continue;
    const [x, y, z] = stickPoint(t, geom);
    out.push(x - half, y, z, x + half, y, z);
    out.push(x, y - half, z, x, y + half, z);
    out.push(x, y, z - half, x, y, z + half);
  }
  return Float32Array.from(out);
}

/**
 * Resample a polyline to exactly k points, uniform in arc length.
 * @param {number[][]} pts xyz points (>= 1)
 * @returns {number[][]} k xyz points
 */
export function resamplePolyline(pts, k) {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: k }, () => [...pts[0]]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(
      pts[i][0] - pts[i - 1][0],
      pts[i][1] - pts[i - 1][1],
      pts[i][2] - pts[i - 1][2],
    ));
  }
  const total = cum[cum.length - 1];
  const out = [];
  let seg = 0;
  for (let j = 0; j < k; j++) {
    const target = total * (k === 1 ? 0 : j / (k - 1));
    while (seg < pts.length - 2 && cum[seg + 1] < target) seg++;
    const span = cum[seg + 1] - cum[seg];
    const t = span > 0 ? (target - cum[seg]) / span : 0;
    out.push([
      pts[seg][0] + t * (pts[seg + 1][0] - pts[seg][0]),
      pts[seg][1] + t * (pts[seg + 1][1] - pts[seg][1]),
      pts[seg][2] + t * (pts[seg + 1][2] - pts[seg][2]),
    ]);
  }
  return out;
}

/**
 * Loft a fault's sticks into a ribbon surface: each stick is resampled
 * to `samples` points; consecutive sticks (in stored order) are joined
 * with a triangle strip. Stick i+1 is reversed when that shortens the
 * join (hand-picked sticks have no guaranteed direction). Faults with a
 * single stick produce an empty mesh (lines only).
 *
 * @param {Array<{points: {il,xl,s}[]}|Array>} sticks
 * @param {{nIl:number, nXl:number, ns:number}} geom
 * @param {{samples?: number}} [opts]
 * @returns {{positions: Float32Array, indices: Uint32Array}}
 */
export function faultRibbonMesh(sticks, geom, opts = {}) {
  const samples = opts.samples || 16;
  const rails = (sticks || [])
    .map((stick) => (stick.points || stick).map((q) => stickPoint(q, geom)))
    .filter((pts) => pts.length >= 2)
    .map((pts) => resamplePolyline(pts, samples));
  if (rails.length < 2) {
    return { positions: new Float32Array(0), indices: new Uint32Array(0) };
  }

  // orient each rail to match the previous one
  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  for (let i = 1; i < rails.length; i++) {
    let same = 0;
    let flipped = 0;
    for (let j = 0; j < samples; j++) {
      same += dist2(rails[i - 1][j], rails[i][j]);
      flipped += dist2(rails[i - 1][j], rails[i][samples - 1 - j]);
    }
    if (flipped < same) rails[i].reverse();
  }

  const positions = new Float32Array(rails.length * samples * 3);
  rails.forEach((rail, i) => rail.forEach((p, j) => {
    positions.set(p, (i * samples + j) * 3);
  }));
  const idx = [];
  for (let i = 0; i < rails.length - 1; i++) {
    for (let j = 0; j < samples - 1; j++) {
      const a = i * samples + j;
      const b = a + 1;
      const c = a + samples;
      const d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  return { positions, indices: Uint32Array.from(idx) };
}
