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

const NULL_F32 = Math.fround(NULL_VALUE);

/** '#rrggbb' -> [r, g, b] in 0..1 (renderer color uniforms). */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return [1, 1, 1];
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/**
 * Triangulate a horizon pick grid into a surface mesh. Null picks make
 * holes: a triangle is emitted only when all three corners are live, and
 * the quad diagonal is chosen so a single null corner still yields the
 * one valid triangle.
 *
 * Large grids are decimated by an integer stride per axis so the vertex
 * lattice stays at most maxDim x maxDim (last row/column always kept, so
 * the mesh reaches the survey edge).
 *
 * @param {Float32Array} grid nIl x nXl sample indices, 1e30 nulls
 * @param {{nIl:number, nXl:number, ns:number}} geom
 * @param {{maxDim?: number}} [opts]
 * @returns {{positions: Float32Array, indices: Uint32Array,
 *            vertexCount: number, triangleCount: number}}
 */
export function horizonMesh(grid, geom, opts = {}) {
  const { nIl, nXl, ns } = geom;
  const maxDim = opts.maxDim || 512;
  const stepIl = Math.max(1, Math.ceil(nIl / maxDim));
  const stepXl = Math.max(1, Math.ceil(nXl / maxDim));

  // decimated lattice rows/cols (last real line always included)
  const rows = [];
  for (let i = 0; i < nIl; i += stepIl) rows.push(i);
  if (rows[rows.length - 1] !== nIl - 1) rows.push(nIl - 1);
  const cols = [];
  for (let x = 0; x < nXl; x += stepXl) cols.push(x);
  if (cols[cols.length - 1] !== nXl - 1) cols.push(nXl - 1);

  const nR = rows.length;
  const nC = cols.length;
  const positions = new Float32Array(nR * nC * 3);
  const live = new Uint8Array(nR * nC);
  for (let r = 0; r < nR; r++) {
    const il = rows[r];
    for (let c = 0; c < nC; c++) {
      const xl = cols[c];
      const s = grid[il * nXl + xl];
      const v = r * nC + c;
      if (s === NULL_F32 || !Number.isFinite(s)) continue;
      live[v] = 1;
      positions[v * 3] = (xl + 0.5) / nXl;
      positions[v * 3 + 1] = -(s + 0.5) / ns;
      positions[v * 3 + 2] = (il + 0.5) / nIl;
    }
  }

  const idx = [];
  for (let r = 0; r < nR - 1; r++) {
    for (let c = 0; c < nC - 1; c++) {
      const a = r * nC + c;          // (r, c)
      const b = r * nC + c + 1;      // (r, c+1)
      const d = (r + 1) * nC + c;    // (r+1, c)
      const e = (r + 1) * nC + c + 1; // (r+1, c+1)
      // try both diagonals independently so one null corner keeps the
      // other triangle
      if (live[a] && live[b] && live[e]) idx.push(a, b, e);
      if (live[a] && live[e] && live[d]) idx.push(a, e, d);
      else if (!live[e] && live[a] && live[b] && live[d]) idx.push(a, b, d);
      else if (!live[a] && live[b] && live[e] && live[d]) idx.push(b, e, d);
    }
  }

  return {
    positions,
    indices: Uint32Array.from(idx),
    vertexCount: nR * nC,
    triangleCount: idx.length / 3,
  };
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
