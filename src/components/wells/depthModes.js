// TVD axis labels (Petrophysics Studio PS10). The registry's
// geo_wells.deviation ([{md, inc, azi}]) drives an md -> TVD lookup
// through the validated minimum-curvature kernel (drilling
// surveyMath — no new math). DISPLAY-ONLY, and honest about it: v1
// keeps MD-linear plotting and swaps the axis LABELS to TVD, so the
// spacing is MD spacing; the axis title says so. Sample indexing and
// every computation stay MD.

import { computeWellPath, positionAtMd } from '../../../packages/engines/engines/drilling/surveyMath';

/** md -> TVD lookup from a deviation survey, or null when the well
 *  has no usable survey (fewer than 2 stations). MDs outside the
 *  survey extent return NaN. */
export function makeTvdLookup(deviation) {
  if (!Array.isArray(deviation) || deviation.length < 2) return null;
  const stations = deviation
    .map((d) => ({ md: Number(d.md), inc: Number(d.inc) || 0, azi: Number(d.azi) || 0 }))
    .filter((s) => Number.isFinite(s.md))
    .sort((a, b) => a.md - b.md);
  if (stations.length < 2) return null;
  const path = computeWellPath(stations);
  return (md) => positionAtMd(stations, path, md)?.tvd ?? NaN;
}

// ---- display units (PT0, 2026-09-03) -------------------------------------
// Internal depths are metres MD; only labels and typed values convert.

export const M_PER_FT = 0.3048;

/** Metres -> display unit. */
export const toDisplay = (mdM, unit) => (unit === 'ft' ? mdM / M_PER_FT : mdM);
/** Display unit -> metres. */
export const fromDisplay = (v, unit) => (unit === 'ft' ? v * M_PER_FT : v);
/** "2040.0 m" / "6692.9 ft". */
export const depthLabel = (mdM, unit = 'm', digits = 1) => (
  Number.isFinite(mdM) ? `${toDisplay(mdM, unit).toFixed(digits)} ${unit === 'ft' ? 'ft' : 'm'}` : '—'
);

/**
 * Nearest logged depth to `mdM`, for snap-to-sample when a top or a zone
 * edge is dragged (PT8, 2026-09-05). `depth` is the ascending sample
 * array; returns `mdM` unchanged when there is nothing to snap to, so a
 * caller can hand it any well.
 */
export function snapToSample(mdM, depth) {
  if (!Number.isFinite(mdM) || !depth || depth.length === 0) return mdM;
  if (depth.length === 1) return depth[0];
  let lo = 0;
  let hi = depth.length - 1;
  if (mdM <= depth[lo]) return depth[lo];
  if (mdM >= depth[hi]) return depth[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (depth[mid] < mdM) lo = mid; else hi = mid;
  }
  return mdM - depth[lo] <= depth[hi] - mdM ? depth[lo] : depth[hi];
}
