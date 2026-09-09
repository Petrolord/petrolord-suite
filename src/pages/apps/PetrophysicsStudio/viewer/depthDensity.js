// Curve-versus-depth density (Petrophysics Studio PT10b, 2026-09-09).
// Pure presentation math like viewer/stats.js: a 2D histogram of one
// curve against a depth reference, normalised to its fullest cell, and
// the outline of the populated region for a second-well overlay. No
// petrophysical constants; nothing a report quotes.
//
// Depths arrive in METRES of the chosen reference (MD, TVD or TVDSS
// through makeDepthAxes); the panel converts the display unit at the
// door and the plot labels in it. A depth the frame cannot place (NaN,
// above the first survey station) is dropped and counted in `unplaced`
// so the caption can say so.

import { M_PER_FT } from '@/components/wells/depthModes';

/** Default depth bin in metres for a display unit: 100 ft under ft, 25 m under m. */
export const defaultDepthBinM = (unit) => (unit === 'ft' ? 100 * M_PER_FT : 25);

/** Largest k with edges[k] <= v, as a bin index; -1 outside [edges[0], edges[last]]. */
export function binOf(edges, v) {
  const last = edges.length - 1;
  if (!(v >= edges[0]) || !(v <= edges[last])) return -1;
  if (v === edges[last]) return last - 1;
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (edges[mid] <= v) lo = mid; else hi = mid;
  }
  return lo;
}

function uniformEdges(lo, hi, n, log) {
  const out = new Float64Array(n + 1);
  if (log) {
    const l0 = Math.log10(lo);
    const l1 = Math.log10(hi);
    for (let k = 0; k <= n; k++) out[k] = 10 ** (l0 + ((l1 - l0) * k) / n);
    out[0] = lo;
    out[n] = hi;
    return out;
  }
  for (let k = 0; k <= n; k++) out[k] = lo + ((hi - lo) * k) / n;
  // pin both ends exactly: float error on the last edge would drop the maximum sample
  out[0] = lo;
  out[n] = hi;
  return out;
}

/**
 * Bin the finite, masked samples of `values` against `depth`.
 *
 * @param {Object} p
 * @param {ArrayLike<number>} p.values the curve
 * @param {ArrayLike<number>} p.depth depth of each sample in the chosen reference (metres)
 * @param {?Uint8Array} [p.mask] 1 keeps the sample (the crossplot zone filter)
 * @param {number} [p.xBins=100]
 * @param {number} [p.depthBin=25] depth bin height in metres
 * @param {?[number, number]} [p.xDomain] X edges span; default the data extent
 * @param {?[number, number]} [p.depthRange] keep samples with top <= depth <= base; default the data extent
 * @param {boolean} [p.log=false] bin X in log10 space (non-positive values excluded)
 * @param {?{xEdges: Float64Array, depthEdges: Float64Array}} [p.edges] bin on these
 *   edges instead (the overlay well shares the primary's so the two shapes compare)
 * @returns {{xEdges, depthEdges, xBins, depthBins, counts: Uint32Array,
 *   density: Float32Array, n, unplaced, maxCount, log}} density is counts / maxCount,
 *   so the fullest cell is exactly 1 and an empty cell 0; row-major by depth bin.
 */
export function depthDensityGrid({
  values, depth, mask = null, xBins = 100, depthBin = 25, xDomain = null, depthRange = null, log = false, edges = null,
}) {
  const nIn = Math.min(values?.length || 0, depth?.length || 0);
  const xs = [];
  const ds = [];
  let unplaced = 0;
  for (let i = 0; i < nIn; i++) {
    if (mask && !mask[i]) continue;
    const v = values[i];
    if (!Number.isFinite(v) || (log && v <= 0)) continue;
    const d = depth[i];
    if (!Number.isFinite(d)) { unplaced += 1; continue; }
    if (depthRange && (d < depthRange[0] || d > depthRange[1])) continue;
    xs.push(v);
    ds.push(d);
  }

  let xEdges;
  let depthEdges;
  if (edges) {
    ({ xEdges, depthEdges } = edges);
  } else {
    const nb = Math.max(1, Math.round(xBins) || 100);
    if (!xs.length) {
      return { xEdges: new Float64Array(0), depthEdges: new Float64Array(0), xBins: 0, depthBins: 0, counts: new Uint32Array(0), density: new Float32Array(0), n: 0, unplaced, maxCount: 0, log };
    }
    let lo;
    let hi;
    if (xDomain && Number.isFinite(xDomain[0]) && Number.isFinite(xDomain[1]) && xDomain[1] > xDomain[0] && !(log && xDomain[0] <= 0)) {
      [lo, hi] = xDomain;
    } else {
      lo = Infinity; hi = -Infinity;
      for (const v of xs) { if (v < lo) lo = v; if (v > hi) hi = v; }
      if (!(hi > lo)) { if (log) { lo /= 2; hi *= 2; } else { lo -= 0.5; hi += 0.5; } }
    }
    xEdges = uniformEdges(lo, hi, nb, log);
    const bin = depthBin > 0 && Number.isFinite(depthBin) ? depthBin : 25;
    let top;
    let base;
    if (depthRange) [top, base] = depthRange;
    else { top = Infinity; base = -Infinity; for (const d of ds) { if (d < top) top = d; if (d > base) base = d; } }
    const d0 = Math.floor(top / bin) * bin;
    const nD = Math.max(1, Math.floor((base - d0) / bin + 1e-9) + 1);
    depthEdges = new Float64Array(nD + 1);
    for (let k = 0; k <= nD; k++) depthEdges[k] = d0 + k * bin;
  }

  const nX = Math.max(0, xEdges.length - 1);
  const nD = Math.max(0, depthEdges.length - 1);
  const counts = new Uint32Array(nX * nD);
  let n = 0;
  let maxCount = 0;
  for (let k = 0; k < xs.length; k++) {
    const xi = binOf(xEdges, xs[k]);
    const di = binOf(depthEdges, ds[k]);
    if (xi < 0 || di < 0) continue;
    const c = (counts[di * nX + xi] += 1);
    n += 1;
    if (c > maxCount) maxCount = c;
  }
  const density = new Float32Array(counts.length);
  if (maxCount > 0) for (let i = 0; i < counts.length; i++) density[i] = counts[i] / maxCount;
  return { xEdges, depthEdges, xBins: nX, depthBins: nD, counts, density, n, unplaced, maxCount, log };
}

/**
 * Boundary of the populated cells as axis-aligned segments in data space:
 * an edge is drawn when exactly one of the two cells sharing it is
 * populated (the grid border counts as unpopulated). A solid a-by-b block
 * yields 2a + 2b segments.
 * @returns {Array<{x0: number, x1: number, d0: number, d1: number}>}
 */
export function envelopeOutline(grid) {
  const { xEdges, depthEdges, xBins: nX, depthBins: nD, counts } = grid;
  const out = [];
  if (!nX || !nD) return out;
  const pop = (di, xi) => di >= 0 && di < nD && xi >= 0 && xi < nX && counts[di * nX + xi] > 0;
  for (let di = 0; di < nD; di++) {
    for (let xi = 0; xi < nX; xi++) {
      if (!pop(di, xi)) continue;
      const xa = xEdges[xi];
      const xb = xEdges[xi + 1];
      const da = depthEdges[di];
      const db = depthEdges[di + 1];
      if (!pop(di - 1, xi)) out.push({ x0: xa, x1: xb, d0: da, d1: da });
      if (!pop(di + 1, xi)) out.push({ x0: xa, x1: xb, d0: db, d1: db });
      if (!pop(di, xi - 1)) out.push({ x0: xa, x1: xa, d0: da, d1: db });
      if (!pop(di, xi + 1)) out.push({ x0: xb, x1: xb, d0: da, d1: db });
    }
  }
  return out;
}
