// Depth display for the log viewers: units, labels, and the depth
// reference columns (MD / TVD / TVDSS) a track gutter can show.
//
// PS10's makeTvdLookup — which swapped the axis LABELS to TVD while the
// spacing stayed MD, and had to say so in the axis title — was retired by
// PT8 (2026-09-05) in favour of makeDepthAxes below: real side-by-side
// columns, so MD and TVD are read together instead of one standing in for
// the other. Sample indexing and every computation stay MD either way.

import { makeDepthFrame } from '../../../packages/engines/engines/welldata/checkshots';

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

// ---- depth tracks (PT8, 2026-09-05) ----------------------------------------
// MD, TVD and TVDSS side by side as their own columns, replacing the PS10
// axis-label swap that showed TVD values on MD spacing and had to caveat
// itself in the axis title. Plotting stays MD-linear — the columns label
// the SAME rows in their own reference, which is what a printed log does
// and what makes the relationship between them readable.
//
// The conversion is the canonical welldata frame (makeDepthFrame), the one
// the checkshot door and the LAS/CSV depth columns already use: TVD below
// KB, TVDSS = TVD - KB, a well with no survey is vertical, and past the
// last station the final tangent continues.

export const DEPTH_TRACK_KEYS = ['md', 'tvd', 'tvdss'];
export const DEPTH_TRACK_TITLE = { md: 'MD', tvd: 'TVD', tvdss: 'TVDSS' };

/**
 * Label functions for a set of depth columns.
 *
 * @param {Array<'md'|'tvd'|'tvdss'>} keys columns to show, in order; an
 *   empty or unrecognised set falls back to MD alone, so a viewer can
 *   never end up with no depth axis
 * @param {{deviation?: Array, kb_m?: number, td_md_m?: ?number}} [well]
 * @param {'m'|'ft'} [unit] DISPLAY unit for the labels
 * @returns {Array<{key, title, valueOf, labelOf}>} `valueOf` gives the
 *   depth in METRES in that reference (what the navigator wants),
 *   `labelOf` the DISPLAY value (what an axis prints). Both are NaN where
 *   the frame cannot place that MD (above the first survey station),
 *   which prints as an em dash rather than a guess.
 */
export function makeDepthAxes(keys, { well = null, unit = 'm' } = {}) {
  const wanted = (keys || []).filter((k) => DEPTH_TRACK_KEYS.includes(k));
  const cols = wanted.length ? wanted : ['md'];
  const needsFrame = cols.some((k) => k !== 'md');
  const frame = needsFrame
    ? makeDepthFrame({ deviation: well?.deviation, kbM: well?.kb_m ?? 0, tdMdM: well?.td_md_m })
    : null;
  // an MD outside the survey throws rather than guessing; the column
  // prints a dash there instead of taking the whole axis down
  const at = (mdM) => {
    try { return frame.mdToTvdss(mdM); } catch (e) { return null; }
  };
  const u = unit === 'ft' ? 'ft' : 'm';
  return cols.map((key) => {
    const valueOf = key === 'md'
      ? (mdM) => mdM
      : (mdM) => {
        const r = at(mdM);
        return r ? (key === 'tvd' ? r.tvd : r.tvdss) : NaN;
      };
    return {
      key,
      title: `${DEPTH_TRACK_TITLE[key]} (${u})`,
      valueOf,
      labelOf: (mdM) => toDisplay(valueOf(mdM), unit),
    };
  });
}
