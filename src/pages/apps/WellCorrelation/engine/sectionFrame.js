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

import { zoneSpan, displayedDepth, topMd } from './section';

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
  const ref = displayed - (shift || 0);
  if (!Number.isFinite(ref)) return null;
  if (depthRef === 'md' || !well?.frame) return { md: ref, ambiguous: false, extrapolated: false };
  const tvdss = depthRef === 'tvd' ? ref - (well.frame.kbM || 0) : ref;
  return well.frame.tvdssToMd(tvdss);
}

/** Surface distances (m) between consecutive wells along the section. */
export function pathDistances(wells) {
  const out = [];
  for (let i = 0; i + 1 < wells.length; i++) {
    const a = wells[i];
    const b = wells[i + 1];
    const xy = [a?.surface_x, a?.surface_y, b?.surface_x, b?.surface_y].map((v) => (v == null || v === '' ? NaN : Number(v)));
    out.push(xy.every(Number.isFinite) ? Math.hypot(xy[2] - xy[0], xy[3] - xy[1]) : NaN);
  }
  return out;
}

/**
 * Column boxes for the wells across the plot band.
 * equal:        contiguous equal-width columns (the G3 layout).
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
    return wells.map((_, i) => ({
      x0: plotLeft + i * equalW, w: equalW, gapAfter: 0, distM: i + 1 < n ? dists[i] ?? null : null,
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
