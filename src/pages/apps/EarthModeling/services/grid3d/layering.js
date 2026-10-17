// The fine 3D grid's layers (Earth Modeling 3D grid upgrade, 2026-10-17;
// owner decision 2: 2.5 ft layers by default, 2 or 3 ft selectable, with
// follow-top, follow-base and proportional options).
//
// The grid is corner-point style on the model frame: each node of the frame
// is the centre of one column of cells (the node-centred convention every
// Earth Modeling volume uses, so the fine grid's volumes add up to the old
// ones), and each column is cut into layers between the zone's top and base:
//
//   proportional  n layers, n = the zone's mean thickness / the layer
//                 thickness (rounded, at least 1); each layer is the same
//                 fraction of the zone at every node, so layers thin and
//                 thicken with the zone
//   follow top    layers of the typed thickness hung from the zone top; the
//                 base truncates them (cells below it have no thickness)
//   follow base   layers of the typed thickness stacked up from the zone
//                 base; the top truncates them (onlap)
//
// Every layer of a zone shares one buffer of horizons: horizon k is the top
// of layer k and horizon k + 1 its base, so a zone of n layers holds n + 1
// depth grids, and each layer's top and base are views into that buffer.
// Pure, no I/O.

import { isNull } from '@/lib/gridding/gridmath';
import { NULL_VALUE } from '@/lib/gridding/numeric';

export const FT = 0.3048;
/** Layer thicknesses the dock offers, in feet (owner decision 2). */
export const LAYER_FT_OPTIONS = Object.freeze([2, 2.5, 3]);
export const LAYERING_STYLES = Object.freeze([
  { key: 'proportional', label: 'proportional' },
  { key: 'top', label: 'follow top' },
  { key: 'base', label: 'follow base' },
]);
/** The grid's defaults: 25 m cells, 2.5 ft proportional layers (owner decisions 1 and 2). */
export const GRID_DEFAULTS = Object.freeze({ enabled: true, cellM: 25, layerFt: 2.5, style: 'proportional' });
/** At most this many layers in one zone (a 500 ft zone at 2 ft). */
export const MAX_GRID_LAYERS = 250;

/** Live-node mean, max of a zone's thickness. */
export function thicknessStats(top, base) {
  let s = 0; let n = 0; let max = 0;
  for (let j = 0; j < top.length; j++) {
    if (isNull(top[j]) || isNull(base[j])) continue;
    const h = base[j] - top[j];
    if (!(h > 0)) continue;
    s += h; n += 1; if (h > max) max = h;
  }
  return { mean: n ? s / n : 0, max, nodes: n };
}

/** How many layers a zone gets for a style and a layer thickness (metres). */
export function layerCountFor(top, base, layerM, style = 'proportional') {
  const { mean, max } = thicknessStats(top, base);
  if (!(layerM > 0) || !(max > 0)) return 1;
  const n = style === 'proportional' ? Math.round(mean / layerM) : Math.ceil(max / layerM - 1e-9);
  return Math.max(1, Math.min(MAX_GRID_LAYERS, n));
}

/**
 * The horizons of one zone: n + 1 depth grids in one buffer (k = 0 the zone
 * top, k = n the zone base, null nodes null in every horizon).
 * @returns {{horizons: Float64Array, n: number}}
 */
export function zoneHorizons(top, base, n, layerM, style = 'proportional') {
  const N = top.length;
  const H = new Float64Array((n + 1) * N);
  for (let j = 0; j < N; j++) {
    const t = top[j]; const b = base[j];
    if (isNull(t) || isNull(b)) { for (let k = 0; k <= n; k++) H[k * N + j] = NULL_VALUE; continue; }
    const h = Math.max(0, b - t);
    for (let k = 0; k <= n; k++) {
      let z;
      if (k === 0) z = t;
      else if (k === n) z = t + h;
      else if (style === 'top') z = Math.min(t + k * layerM, t + h);
      else if (style === 'base') z = Math.max(t + h - (n - k) * layerM, t);
      else z = t + (h * k) / n;
      H[k * N + j] = z;
    }
  }
  return { horizons: H, n };
}

/**
 * The zone's layer frames (the shape modelBuild's layered volumes read):
 * {top, base, thickness, index, count}, top and base as views into the
 * shared horizons, thickness its own Float32 grid (null where the column is).
 */
export function gridLayerFrames(top, base, { layerM, style = 'proportional', n = null } = {}) {
  const count = n ?? layerCountFor(top, base, layerM, style);
  const { horizons } = zoneHorizons(top, base, count, layerM, style);
  const N = top.length;
  const frames = [];
  for (let k = 0; k < count; k++) {
    const t = horizons.subarray(k * N, (k + 1) * N);
    const b = horizons.subarray((k + 1) * N, (k + 2) * N);
    const th = new Float32Array(N);
    for (let j = 0; j < N; j++) th[j] = isNull(t[j]) || isNull(b[j]) ? NULL_VALUE : Math.max(0, b[j] - t[j]);
    frames.push({ top: t, base: b, thickness: th, index: k, count });
  }
  return { frames, horizons, count, style, layerM };
}

/**
 * Which layer a depth at a well falls in, given the zone's top and base at
 * the well (TVDSS m): the same rule as the model's horizons, so the logs
 * upscale into the cells they will be compared with.
 */
export function layerAtDepth(z, top, base, n, layerM, style = 'proportional') {
  const h = base - top;
  if (!(h > 0)) return -1;
  let k;
  if (style === 'top') k = Math.floor((z - top) / layerM);
  else if (style === 'base') k = n - 1 - Math.floor((base - z) / layerM);
  else k = Math.floor(((z - top) / h) * n);
  return Math.min(n - 1, Math.max(0, k));
}

/** The depth of the middle of layer k at a well (the control point's depth). */
export function layerMidDepth(k, top, base, n, layerM, style = 'proportional') {
  const h = base - top;
  if (style === 'top') return Math.min(base, top + (k + 0.5) * layerM);
  if (style === 'base') return Math.max(top, base - (n - k - 0.5) * layerM);
  return top + (h * (k + 0.5)) / n;
}
