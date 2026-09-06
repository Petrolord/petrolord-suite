// Kriging in the workstation (Mapping MS5, 2026-09-06): choose a lag
// from the control-point spacing, fit a variogram model to the
// experimental semivariogram of the points, and word the result. Pure
// planning over the engines kriging module, no I/O.

import { experimentalVariogram, fitVariogram, variogramParams, VARIOGRAM_MODELS } from '@/lib/gridding/kriging';

export { VARIOGRAM_MODELS };
export const GRID_METHODS = Object.freeze([
  { key: 'tps', label: 'Thin-plate spline (exact through the wells)' },
  { key: 'kriging', label: 'Ordinary kriging (variogram, variance map)' },
]);

/** Median nearest-neighbour distance of the points (a lag that fills the bins). */
export function typicalSpacing(points) {
  const d = [];
  for (let i = 0; i < points.length; i++) {
    let best = Infinity;
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      const h = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      if (h > 0 && h < best) best = h;
    }
    if (Number.isFinite(best)) d.push(best);
  }
  if (!d.length) return 0;
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}

/**
 * Fit a variogram to the control points.
 * @returns {{model, range, sill, nugget, rmse, lag, bins:number, experimental}}
 */
export function fitVariogramFromPoints(points, { model = 'spherical', nugget = 0, nLags = 10 } = {}) {
  const pts = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  if (pts.length < 4) throw new Error('Fitting a variogram needs at least four control points.');
  const lag = typicalSpacing(pts);
  if (!(lag > 0)) throw new Error('The control points share one location; nothing to fit.');
  const experimental = experimentalVariogram(pts, { lag, nLags });
  if (experimental.length < 2) throw new Error('Too few occupied lag bins to fit a variogram; the points are too clustered.');
  const fit = fitVariogram(experimental, { model, nugget });
  return { ...fit, lag, bins: experimental.length, experimental };
}

/** Validated kriging options for the engine from the dock's text fields. */
export function krigingOptions(v) {
  const params = variogramParams({ model: v.model, range: Number(v.range), sill: Number(v.sill), nugget: Number(v.nugget || 0) });
  return { ...params, detrend: v.detrend !== false, neighbours: 24 };
}

/** One line for the status bar and provenance. */
export function describeVariogram(v, unitLabel = 'm') {
  const n = Number(v.nugget || 0);
  return `${v.model} variogram, range ${Number(v.range).toFixed(0)} ${unitLabel}, sill ${Number(v.sill).toFixed(2)}${n ? `, nugget ${n.toFixed(2)}` : ''}${v.detrend !== false ? ', trend removed' : ''}`;
}
