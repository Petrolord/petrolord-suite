// Scale and colour math for the trajectory views (section + plan).
//
// Tester case (Darm PlanB): a kickoff at 2,000 m building 3 deg/30 m to
// 6.6 deg looked like a sharp corner on the section view, because the
// old Recharts panel fitted VS and TVD independently (about 10:1 on
// that well). A well path is geometry: the default is true scale, with
// equal length per pixel on both axes, and any exaggeration is an
// explicit choice that is printed on the plot.
//
// Pure functions only (no DOM), so the charts, the PDF wall plot and
// the jest gates all share one definition.

import { extentOf } from './extent';

/**
 * Exaggeration presets. `ratio` is pixels-per-unit on the vertical
 * (TVD) axis divided by pixels-per-unit on the horizontal (VS) axis:
 * 1 is true scale, above 1 stretches TVD (vertical exaggeration),
 * below 1 stretches VS (horizontal exaggeration, the readable choice
 * for a deep near-vertical well that is a thin line at true scale).
 */
export const EXAGGERATION_OPTIONS = [
  { id: '1', ratio: 1, short: '1:1 true scale' },
  { id: 'h2', ratio: 1 / 2, short: 'VS 2x' },
  { id: 'h5', ratio: 1 / 5, short: 'VS 5x' },
  { id: 'h10', ratio: 1 / 10, short: 'VS 10x' },
  { id: 'v2', ratio: 2, short: 'TVD 2x' },
  { id: 'v5', ratio: 5, short: 'TVD 5x' },
  { id: 'v10', ratio: 10, short: 'TVD 10x' },
];

export const DEFAULT_EXAGGERATION = '1';

/** Preset by id; unknown ids fall back to true scale. */
export function exaggerationOption(id) {
  return EXAGGERATION_OPTIONS.find((o) => o.id === id) || EXAGGERATION_OPTIONS[0];
}

/**
 * The label printed inside the plot area so a screenshot carries the
 * scale. `ratio` is TVD px/unit over VS px/unit.
 */
export function exaggerationLabel(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0 || Math.abs(ratio - 1) < 1e-9) return 'True scale (1:1)';
  const fmt = (v) => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(1));
  return ratio > 1
    ? `Vertical exaggeration ${fmt(ratio)}x`
    : `Horizontal exaggeration ${fmt(1 / ratio)}x (VS stretched)`;
}

/**
 * Fit a world box into a pixel box with a fixed aspect: every world
 * unit on Y spans `ratio` times the pixels of a world unit on X. The
 * data box is padded, then the shorter side is widened (centred) until
 * the frame fills the pixel box exactly.
 *
 * @param {{minX,maxX,minY,maxY}} box  world extent (any may be equal)
 * @param {{w,h}} px                   drawable pixel size (> 0)
 * @param {number} ratio               Y px/unit over X px/unit (1 = true scale)
 * @param {{pad?:number, minSpan?:number}} opts
 * @returns {{minX,maxX,minY,maxY,sx,sy}} sx/sy in pixels per world unit
 */
export function fitAspectFrame(box, px, ratio = 1, { pad = 0.08, minSpan = 10 } = {}) {
  const r = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const w = Math.max(1, px.w);
  const h = Math.max(1, px.h);
  let { minX, maxX, minY, maxY } = box;
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) {
    minX = 0; maxX = minSpan; minY = 0; maxY = minSpan;
  }
  const spanX0 = Math.max(maxX - minX, minSpan);
  const spanY0 = Math.max(maxY - minY, minSpan);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const spanX = spanX0 * (1 + 2 * pad);
  const spanY = spanY0 * (1 + 2 * pad);
  // sx = px per X unit; sy = r * sx. The frame must hold both spans.
  const sx = Math.min(w / spanX, h / (spanY * r));
  const sy = sx * r;
  const halfX = w / sx / 2;
  const halfY = h / sy / 2;
  return {
    minX: cx - halfX, maxX: cx + halfX, minY: cy - halfY, maxY: cy + halfY, sx, sy,
  };
}

/** World box over point lists: [[x, y], ...] arrays, spread-free. */
export function boxOf(pointLists) {
  const xs = [];
  const ys = [];
  pointLists.forEach((pts) => (pts || []).forEach((p) => {
    if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) { xs.push(p[0]); ys.push(p[1]); }
  }));
  const ex = extentOf(xs);
  const ey = extentOf(ys);
  return { minX: ex.min, maxX: ex.max, minY: ey.min, maxY: ey.max };
}

/** A round grid step giving about `target` lines over `span`. */
export function niceStep(span, target = 6) {
  const raw = span / target;
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
  return step * mag;
}

// ---------------------------------------------------------------------------
// DLS colouring
// ---------------------------------------------------------------------------

/** Sequential single-hue ramp, light to dark (green 400 to 900) on the
 *  white chart surface; above the plan's Max DLS is a separate red with
 *  a heavier stroke, so it never relies on colour alone. */
export const DLS_RAMP = ['#4ade80', '#22c55e', '#16a34a', '#15803d', '#14532d'];
export const DLS_OVER_COLOR = '#dc2626';

// A build compiled at exactly Max DLS must not flag on float noise.
const OVER_TOL = 1e-6;

/**
 * Bin one DLS value against the scale top. `maxDls` is the plan's Max
 * DLS (design settings) when set; otherwise `scaleMax` (the plan's own
 * largest DLS) sets the ramp and nothing is flagged.
 * @returns {{bin:number, color:string, over:boolean}} bin 0..4, or 5 when over
 */
export function dlsColor(dls, { maxDls = null, scaleMax = null } = {}) {
  const v = Number.isFinite(dls) ? Math.max(0, dls) : 0;
  const hasMax = Number.isFinite(maxDls) && maxDls > 0;
  const top = hasMax ? maxDls : (Number.isFinite(scaleMax) && scaleMax > 0 ? scaleMax : 1);
  if (hasMax && v > maxDls * (1 + OVER_TOL) + 1e-9) {
    return { bin: DLS_RAMP.length, color: DLS_OVER_COLOR, over: true };
  }
  const bin = Math.min(DLS_RAMP.length - 1, Math.floor((v / top) * DLS_RAMP.length));
  return { bin, color: DLS_RAMP[bin], over: false };
}

/** Legend bins for a scale top: [{from, to, color}] plus the over bin. */
export function dlsLegendBins({ maxDls = null, scaleMax = null } = {}) {
  const hasMax = Number.isFinite(maxDls) && maxDls > 0;
  const top = hasMax ? maxDls : (Number.isFinite(scaleMax) && scaleMax > 0 ? scaleMax : 1);
  const step = top / DLS_RAMP.length;
  const bins = DLS_RAMP.map((color, i) => ({ from: i * step, to: (i + 1) * step, color, over: false }));
  if (hasMax) bins.push({ from: top, to: null, color: DLS_OVER_COLOR, over: true });
  return { top, hasMax, bins };
}

/**
 * Split a station path into runs of one DLS colour so the chart draws
 * a handful of polylines rather than one element per station. The DLS
 * on row i describes the interval ending at row i, so segment
 * (i-1 -> i) takes row i's value.
 *
 * @param {Array} rows   station rows
 * @param {(r)=>[number,number]} xy  row to world point
 * @param {(r)=>number} pickDls
 * @returns {Array<{color, over, points:[[x,y],...]}>}
 */
export function dlsRuns(rows, xy, pickDls, scale = {}) {
  const runs = [];
  if (!Array.isArray(rows) || rows.length < 2) return runs;
  let cur = null;
  for (let i = 1; i < rows.length; i++) {
    const c = dlsColor(pickDls(rows[i]), scale);
    const a = xy(rows[i - 1]);
    const b = xy(rows[i]);
    if (cur && cur.bin === c.bin) {
      cur.points.push(b);
    } else {
      cur = { bin: c.bin, color: c.color, over: c.over, points: [a, b] };
      runs.push(cur);
    }
  }
  return runs;
}
