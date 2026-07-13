// Surface engine (Mapping & Surface Studio G4.1): registry data ->
// control points, grid spec derivation, bilinear resample to a common
// frame, and two-surface / scalar math. The gridding itself is the
// shared, byte-golden-validated engine (src/lib/gridding); this layer
// is the app-specific glue around it. Pure functions, no I/O.
//
// Grid convention (matches src/lib/gridding): z is a row-major
// Float32Array of nx*ny, z[r*nx + c], with world x[c] = x0 + c*dx and
// y[r] = y0 + r*dy. NULL_VALUE (1e30) marks empty nodes.

import { NULL_VALUE } from '@/lib/gridding/numeric';

const isNull = (v) => !Number.isFinite(v) || Math.abs(v) >= 1e29;

/**
 * Control points {x,y,z} for a named top across wells (a structure
 * map): surface X/Y from the well, z = the top's MD. Wells lacking the
 * top are skipped.
 * @param {Array<{surface_x,surface_y,tops:Array<{name,md_m}>}>} wells
 */
export function topsToPoints(wells, topName) {
  const pts = [];
  for (const w of wells) {
    const t = (w.tops || []).find((x) => x.name === topName);
    if (t && Number.isFinite(t.md_m) && Number.isFinite(w.surface_x)) {
      pts.push({ x: w.surface_x, y: w.surface_y, z: t.md_m, well: w.name });
    }
  }
  return pts;
}

/**
 * Control points from a zone attribute (an attribute map): z =
 * geo_wells_zones.properties[key] for the named zone on each well.
 * @param {Array} wells each {surface_x,surface_y,zones:[{name,properties}]}
 */
export function zoneAttrToPoints(wells, zoneName, key) {
  const pts = [];
  for (const w of wells) {
    const z = (w.zones || []).find((x) => x.name === zoneName);
    const v = z?.properties?.[key];
    if (Number.isFinite(v) && Number.isFinite(w.surface_x)) {
      pts.push({ x: w.surface_x, y: w.surface_y, z: v, well: w.name });
    }
  }
  return pts;
}

/**
 * A grid spec bounding the control points, cell size cellM, padded by
 * padCells on each side. nx/ny capped so nx*ny stays sane.
 * @returns {{x0,y0,dx,dy,nx,ny}}
 */
export function specForPoints(points, cellM, padCells = 2) {
  if (!points.length) throw new Error('No control points to grid.');
  if (!(cellM > 0)) throw new Error('Cell size must be positive.');
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const x0 = minX - padCells * cellM;
  const y0 = minY - padCells * cellM;
  const nx = Math.max(2, Math.ceil((maxX - minX) / cellM) + 1 + 2 * padCells);
  const ny = Math.max(2, Math.ceil((maxY - minY) / cellM) + 1 + 2 * padCells);
  return { x0, y0, dx: cellM, dy: cellM, nx, ny };
}

/** Attach world x[]/y[] axis arrays to a spec+z for the export writers
 *  (which expect {x, y, z, nx, ny, dx, dy}). */
export function gridObject(spec, z) {
  const x = Array.from({ length: spec.nx }, (_, c) => spec.x0 + c * spec.dx);
  const y = Array.from({ length: spec.ny }, (_, r) => spec.y0 + r * spec.dy);
  return { x, y, z, nx: spec.nx, ny: spec.ny, dx: spec.dx, dy: spec.dy };
}

/**
 * Bilinear resample z (on specA) onto specB's frame. A target node
 * outside specA, or whose 4 source neighbours include a null, becomes
 * null. Reproduces any bilinear (hence linear) field exactly.
 * @returns {Float32Array} length specB.nx*specB.ny
 */
export function resampleTo(z, specA, specB) {
  const out = new Float32Array(specB.nx * specB.ny);
  for (let r = 0; r < specB.ny; r++) {
    const wy = specB.y0 + r * specB.dy;
    const fy = (wy - specA.y0) / specA.dy;
    for (let c = 0; c < specB.nx; c++) {
      const wx = specB.x0 + c * specB.dx;
      const fx = (wx - specA.x0) / specA.dx;
      out[r * specB.nx + c] = bilinear(z, specA.nx, specA.ny, fx, fy);
    }
  }
  return out;
}

function bilinear(z, nx, ny, fx, fy) {
  if (fx < 0 || fy < 0 || fx > nx - 1 || fy > ny - 1) return NULL_VALUE;
  const c0 = Math.floor(fx);
  const r0 = Math.floor(fy);
  const tx = fx - c0;
  const ty = fy - r0;
  const c1 = tx > 0 ? c0 + 1 : c0;   // only reach the next node when actually weighted
  const r1 = ty > 0 ? r0 + 1 : r0;   // so an exact node hit needs only that node
  const v00 = z[r0 * nx + c0];
  const v01 = z[r0 * nx + c1];
  const v10 = z[r1 * nx + c0];
  const v11 = z[r1 * nx + c1];
  if (isNull(v00) || isNull(v01) || isNull(v10) || isNull(v11)) return NULL_VALUE;
  return (v00 * (1 - tx) + v01 * tx) * (1 - ty) + (v10 * (1 - tx) + v11 * tx) * ty;
}

/** Elementwise a op b on the SAME spec; null if either side null. */
export function combine(zA, zB, op) {
  if (zA.length !== zB.length) throw new Error('Surfaces must share a grid frame — resample first.');
  const fn = { subtract: (a, b) => a - b, add: (a, b) => a + b }[op];
  if (!fn) throw new Error(`Unknown surface op "${op}".`);
  const out = new Float32Array(zA.length);
  for (let i = 0; i < zA.length; i++) {
    out[i] = (isNull(zA[i]) || isNull(zB[i])) ? NULL_VALUE : fn(zA[i], zB[i]);
  }
  return out;
}

/** Isochore = deeper − shallower (both MD positive-down => thickness). */
export const isochore = (zDeep, zShallow) => combine(zDeep, zShallow, 'subtract');

/** z + k on every live node. */
export function scalarAdd(z, k) {
  const out = new Float32Array(z.length);
  for (let i = 0; i < z.length; i++) out[i] = isNull(z[i]) ? NULL_VALUE : z[i] + k;
  return out;
}

/** min / max / mean / live-node count over a grid. */
export function surfaceStats(z) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let n = 0;
  for (const v of z) {
    if (isNull(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v; n += 1;
  }
  return n ? { min, max, mean: sum / n, count: n } : { min: null, max: null, mean: null, count: 0 };
}
