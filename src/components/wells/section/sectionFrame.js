// Section frame geometry (Well Correlation WC series, 2026-09-03): the
// pure helpers the multi-track cross-section adds on top of the vendored
// engine/section.js (which stays untouched and keeps its analytic tests).
//
// - depth reference: a well's plotted depth is MD, TVD or TVDSS per
//   sample through the registry depth frame (welldata/checkshots.js
//   makeDepthFrame); tops are re-expressed in the same reference so the
//   vendored computeFlattening / correlationPolyline / zoneSpan run
//   unchanged on "md_m" values that are really reference depths.
// - well spacing: equal columns, or columns whose centres sit in
//   proportion to the surface distance along the section path.
// - zone bands: fills between consecutive shown tops, or explicit pairs.
//
// Closed-form arithmetic only, hand-derivable tests (the G3.0 no-oracle
// rationale). Suite-local for now; upstream to petrolord-engines once the
// API settles (see WellCorrelation-STATUS.md).

import { zoneSpan, displayedDepth, topMd } from '@/pages/apps/WellCorrelation/engine/section';
import { invertShift } from '@/lib/stratigraphy/stretch';
import { unitToMetres } from '../../../../packages/engines/lib/crs/catalog';

export const DEPTH_REFS = ['md', 'tvd', 'tvdss'];
export const DEPTH_REF_LABEL = { md: 'MD', tvd: 'TVD', tvdss: 'TVDSS' };

/**
 * Accessor from measured depth to the plotted reference depth for one
 * well. MD is the identity; TVD and TVDSS go through the well's depth
 * frame (`well.frame`, from makeDepthFrame) and read NaN where the frame
 * cannot answer (above the first station, no frame at all).
 * @returns {(md: number) => number}
 */
export function depthOfFor(well, depthRef = 'md') {
  if (depthRef === 'md' || !well?.frame) return (md) => md;
  const key = depthRef === 'tvd' ? 'tvd' : 'tvdss';
  return (md) => {
    try {
      const v = well.frame.mdToTvdss(md)[key];
      return Number.isFinite(v) ? v : NaN;
    } catch {
      return NaN;
    }
  };
}

/**
 * Wells with their tops re-expressed in the reference (md_m holds the
 * reference depth; md_src keeps the measured depth). Tops the frame
 * cannot place are dropped from the frame copy (never mis-hung).
 */
export function toReferenceFrame(wells, depthRef = 'md') {
  if (depthRef === 'md') return wells;
  return wells.map((w) => {
    const depthOf = depthOfFor(w, depthRef);
    const tops = (w.tops || [])
      .map((t) => ({ ...t, md_src: t.md_m, md_m: depthOf(t.md_m) }))
      .filter((t) => Number.isFinite(t.md_m));
    return { ...w, tops };
  });
}

/** Plotted depth per sample: reference depth plus the flattening shift. */
export function displayedArray(mdArray, depthOf, shift) {
  const n = mdArray?.length || 0;
  const out = new Float64Array(n);
  const s = shift || 0;
  for (let i = 0; i < n; i++) out[i] = displayedDepth(depthOf(mdArray[i]), s);
  return out;
}

/** True when the finite values never decrease (what the painters need). */
export function isMonotonic(arr) {
  let prev = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!Number.isFinite(v)) continue;
    if (v < prev) return false;
    prev = v;
  }
  return true;
}

/**
 * Inverse of the plot: a displayed depth back to measured depth for a
 * well. MD is exact; TVD/TVDSS go through the frame and can be ambiguous
 * (an uphill well) or null (outside the well).
 * @returns {{md: number, ambiguous: boolean, extrapolated: boolean} | null}
 */
export function mdFromDisplayed(displayed, shift, well, depthRef = 'md') {
  const ref = invertShift(displayed, shift);
  if (!Number.isFinite(ref)) return null;
  if (depthRef === 'md' || !well?.frame) return { md: ref, ambiguous: false, extrapolated: false };
  const tvdss = depthRef === 'tvd' ? ref - (well.frame.kbM || 0) : ref;
  return well.frame.tvdssToMd(tvdss);
}

const xyNum = (v) => (v == null || v === '' ? NaN : Number(v));
const frameKey = (w) => (w?.crs ? String(w.crs).toUpperCase() : null);
const metresPer = (w) => {
  try { return unitToMetres(w?.xy_unit || 'm'); } catch { return NaN; } // 'deg' (geographic) has no metre scale
};

/**
 * Surface distances (m) between consecutive wells along the section.
 * AppUpgrade WC-U1-002: X/Y are in each well's CRS unit (m, ft, ftUS), so
 * they convert to metres first, and two wells in different CRSs (or a
 * geographic one) have no distance (NaN), never a mixed-frame number.
 */
export function pathDistances(wells) {
  const out = [];
  for (let i = 0; i + 1 < wells.length; i++) {
    const a = wells[i];
    const b = wells[i + 1];
    const ka = frameKey(a);
    const kb = frameKey(b);
    const sa = metresPer(a);
    const sb = metresPer(b);
    const xy = [a?.surface_x, a?.surface_y, b?.surface_x, b?.surface_y].map(xyNum);
    const sameFrame = !(ka && kb && ka !== kb);
    out.push(sameFrame && Number.isFinite(sa) && Number.isFinite(sb) && xy.every(Number.isFinite)
      ? Math.hypot(xy[2] * sb - xy[0] * sa, xy[3] * sb - xy[1] * sa)
      : NaN);
  }
  return out;
}

/**
 * Why spacing by distance cannot be drawn for these wells, or null when it
 * can (WC-U1-002). The section then keeps equal columns and says this.
 */
export function spacingProblem(wells) {
  if (!wells || wells.length < 2) return null;
  const frames = [...new Set(wells.map(frameKey).filter(Boolean))];
  if (frames.length > 1) return `the wells are in different coordinate systems (${frames.join(', ')})`;
  const geo = wells.filter((w) => !Number.isFinite(metresPer(w))).map((w) => w.name);
  if (geo.length) return `${geo.join(', ')} ${geo.length === 1 ? 'has' : 'have'} geographic coordinates`;
  const unlocated = wells.filter((w) => !Number.isFinite(xyNum(w.surface_x)) || !Number.isFinite(xyNum(w.surface_y))).map((w) => w.name);
  if (unlocated.length) return `${unlocated.join(', ')} ${unlocated.length === 1 ? 'has' : 'have'} no surface location`;
  const d = pathDistances(wells);
  if (!(d.reduce((s, x) => s + x, 0) > 0)) return 'the wells share one surface location';
  return null;
}

/**
 * Column boxes for the wells across the plot band.
 * equal:        equal-width columns with a gap between them for the
 *               correlation lines (WC-U1-004; the G3 layout was contiguous).
 * proportional: column centres in proportion to the surface distance along
 *               the path (the Petrel "proportional to distance" spacing);
 *               columns keep a width of 70% of the equal width, never
 *               overlap, and each gap carries the distance it stands for.
 * Falls back to equal spacing when a distance is unknown or all zero.
 * @returns {Array<{x0: number, w: number, gapAfter: number, distM: number|null}>}
 */
export function columnLayout(wells, { mode = 'equal', plotLeft = 0, plotW = 0, minColPx = 40 } = {}) {
  const n = wells.length;
  if (!n) return [];
  const dists = pathDistances(wells);
  const total = dists.reduce((s, d) => s + d, 0);
  const equalW = plotW / n;
  const usable = mode === 'proportional' && n > 1 && dists.every((d) => Number.isFinite(d)) && total > 0;
  if (!usable) {
    // WC-U1-004: a gap between the columns carries the correlation lines
    // (a contiguous layout left them nowhere to run but over the tracks)
    const gap = n > 1 ? Math.max(8, Math.min(40, Math.round(equalW * 0.12))) : 0;
    const w = Math.max(1, (plotW - gap * (n - 1)) / n);
    return wells.map((_, i) => ({
      x0: plotLeft + i * (w + gap), w, gapAfter: i + 1 < n ? gap : 0, distM: i + 1 < n ? dists[i] ?? null : null,
    }));
  }
  const colW = Math.max(minColPx, equalW * 0.7);
  const span = Math.max(0, plotW - colW); // centres run from plotLeft + colW/2 to plotLeft + plotW - colW/2
  const cols = [];
  let cum = 0;
  let prevRight = -Infinity;
  for (let i = 0; i < n; i++) {
    if (i) cum += dists[i - 1];
    let x0 = plotLeft + (cum / total) * span;
    if (x0 < prevRight) x0 = prevRight; // never overlap a close pair
    cols.push({ x0, w: colW, gapAfter: 0, distM: i + 1 < n ? dists[i] : null });
    prevRight = x0 + colW;
  }
  // a pushed pair can run past the right edge (WC-U1-002): pull back from
  // the end so every column stays on the canvas and none overlaps
  const right = plotLeft + plotW;
  for (let i = n - 1; i >= 0; i--) {
    const limit = i === n - 1 ? right - colW : cols[i + 1].x0 - colW;
    if (cols[i].x0 > limit) cols[i].x0 = Math.max(plotLeft, limit);
  }
  for (let i = 0; i + 1 < n; i++) cols[i].gapAfter = Math.max(0, cols[i + 1].x0 - (cols[i].x0 + cols[i].w));
  return cols;
}

/**
 * Zone bands for one well in displayed depth. With `pairs` null, every
 * pair of consecutive shown tops present in the well becomes a band named
 * and coloured after its upper top; with explicit [[topName, baseName]]
 * pairs, one band per pair the well can supply.
 * @returns {Array<{name: string, upper: string, top: number, base: number}>}
 */
export function zoneBands(well, shift, shownTops, pairs = null) {
  if (pairs) {
    const out = [];
    for (const [a, b] of pairs) {
      const span = zoneSpan(well, shift, a, b);
      if (span) out.push({ name: `${a} to ${b}`, upper: a, top: span.top, base: span.base });
    }
    return out;
  }
  const present = (shownTops || [])
    .map((name) => ({ name, md: topMd(well, name) }))
    .filter((t) => t.md !== null)
    .map((t) => ({ name: t.name, d: displayedDepth(t.md, shift) }))
    .sort((p, q) => p.d - q.d);
  const out = [];
  for (let i = 0; i + 1 < present.length; i++) {
    if (present[i + 1].d > present[i].d) {
      out.push({ name: present[i].name, upper: present[i].name, top: present[i].d, base: present[i + 1].d });
    }
  }
  return out;
}

/**
 * Correlation line segments for one top (WC-U1-004): from the right edge of
 * a column at that well's depth to the left edge of the next column carrying
 * the top, so the line runs in the gaps and never over the log tracks (the
 * Petrel and Petra well section convention). Columns without the top in
 * between are bridged with a dashed segment.
 * @param {Array<{wellIndex: number, displayed: number}>} line correlationPolyline output
 * @param {Array<{x0: number, w: number}>} boxes column boxes
 * @param {(d: number) => number} yOf displayed depth to screen y
 * @returns {Array<{x1, y1, x2, y2, dashed: boolean}>}
 */
export function correlationSegments(line, boxes, yOf) {
  const out = [];
  for (let k = 0; k + 1 < line.length; k++) {
    const a = line[k];
    const b = line[k + 1];
    const ba = boxes[a.wellIndex];
    const bb = boxes[b.wellIndex];
    if (!ba || !bb) continue;
    out.push({ x1: ba.x0 + ba.w, y1: yOf(a.displayed), x2: bb.x0, y2: yOf(b.displayed), dashed: b.wellIndex - a.wellIndex > 1 });
  }
  return out;
}

/**
 * Notes a well column carries when its vertical reference rests on an
 * assumption (WC-U1-005, carried from WDM-U1-019): a TVD or TVDSS view of a
 * well with no deviation survey draws it vertical, and TVDSS of a well with
 * no KB equals TVD (the registry stores KB 0 when none was given).
 * @returns {string[]}
 */
export function frameNotes(well, depthRef = 'md') {
  if (depthRef === 'md') return [];
  const notes = [];
  if (!well?.frame || well.frame.isVertical) notes.push('no survey: vertical');
  if (depthRef === 'tvdss' && !(Number(well?.kb_m) > 0)) notes.push('no KB: TVDSS = TVD');
  return notes;
}

/**
 * A well's curves as the section reads them (WC-U1-003): curves a G1-era
 * import stored bottom-up (depth decreasing) come back reversed so depth
 * ascends and every value keeps its depth; the stored rows are untouched
 * (the owner repairs them in Well Data Manager, WDM-U2-010). Arrays with a
 * different length from the depth curve are left as they are.
 * @param {{curves: Object, logs: Object}} cw the curves cache entry
 * @returns {{curves: Object, logs: Object, reoriented: boolean}}
 */
export function orientSectionCurves(cw) {
  const depth = cw?.curves?.DEPT;
  if (!depth || depth.length < 2) return { ...cw, reoriented: false };
  let first = 0;
  while (first < depth.length && !Number.isFinite(depth[first])) first++;
  let last = depth.length - 1;
  while (last > first && !Number.isFinite(depth[last])) last--;
  if (!(last > first && depth[first] > depth[last])) return { ...cw, reoriented: false };
  const done = new Map();
  const flip = (arr) => {
    if (!arr || typeof arr.length !== 'number' || arr.length !== depth.length || typeof arr.slice !== 'function') return arr;
    if (!done.has(arr)) done.set(arr, arr.slice().reverse());
    return done.get(arr);
  };
  const map = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, flip(v)]));
  return { ...cw, curves: map(cw.curves), logs: map(cw.logs), reoriented: true };
}

const M_PER_CSS_PX = 0.0254 / 96;

/**
 * Vertical scale of the drawn window as 1:N at 96 CSS pixels per inch, N
 * rounded to three significant figures; null when the window is empty
 * (WC-U1-010, printed on the exported section).
 */
export function verticalScale(vTop, vBase, plotH) {
  const span = Math.abs(Number(vBase) - Number(vTop));
  if (!(span > 0) || !(plotH > 0)) return null;
  const n = (span / plotH) / M_PER_CSS_PX;
  const p = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 2);
  return Math.round(n / p) * p;
}
