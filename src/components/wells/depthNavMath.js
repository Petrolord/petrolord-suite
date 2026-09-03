// Depth-window arithmetic shared by every vertical log viewer (Petrophysics
// TrackViewer and MultiWellTracks, Well Correlation CrossSection) and the
// DepthNavigator (PT0, 2026-09-03). A window is `[top, base]` in the
// viewer's displayed depth, or `null` meaning the full extent. Pure; the
// formulas are the ones the viewers used inline before (TrackViewer
// 2026-09-03 lines 388-416), lifted here so the three copies agree.

export const MIN_SPAN_M = 2;

export const isFull = (view, extent) => view == null
  || (view[0] <= extent[0] + 1e-9 && view[1] >= extent[1] - 1e-9);

/** Resolve a window to concrete numbers. */
export const resolveView = (view, extent) => (view == null ? [extent[0], extent[1]] : [view[0], view[1]]);

/** Shift a window back inside the extent without changing its span (or
 *  clip it when the span exceeds the extent). */
export function clampView([t, b], [dMin, dMax]) {
  let nt = t;
  let nb = b;
  const span = nb - nt;
  if (span >= dMax - dMin) return [dMin, dMax];
  if (nt < dMin) { nb += dMin - nt; nt = dMin; }
  if (nb > dMax) { nt -= nb - dMax; nb = dMax; }
  return [nt, nb];
}

/** Pan the window that was `view0` when the drag started by `dd` depth units. */
export function panBy(view0, dd, extent) {
  const [t0, b0] = resolveView(view0, extent);
  return clampView([t0 + dd, b0 + dd], extent);
}

/** Zoom about depth `d` by `factor` (> 1 zooms out). Returns null when the
 *  result covers the whole extent, matching the viewers' "null = full". */
export function zoomAbout(view, d, factor, extent, minSpan = MIN_SPAN_M) {
  const [vTop, vBase] = resolveView(view, extent);
  const [dMin, dMax] = extent;
  let nt = d - (d - vTop) * factor;
  let nb = d + (vBase - d) * factor;
  nt = Math.max(dMin, nt);
  nb = Math.min(dMax, nb);
  if (nb - nt < minSpan) return view;
  return nb - nt >= dMax - dMin ? null : [nt, nb];
}

/** Move one edge of the window (squeeze or stretch); the other edge stays. */
export function dragEdge(view0, edge, newD, extent, minSpan = MIN_SPAN_M) {
  const [t0, b0] = resolveView(view0, extent);
  const [dMin, dMax] = extent;
  if (edge === 'top') {
    const nt = Math.min(Math.max(dMin, newD), b0 - minSpan);
    return nt <= dMin + 1e-9 && b0 >= dMax - 1e-9 ? null : [nt, b0];
  }
  const nb = Math.max(Math.min(dMax, newD), t0 + minSpan);
  return t0 <= dMin + 1e-9 && nb >= dMax - 1e-9 ? null : [t0, nb];
}

/** Same span, recentred on `d`, clamped. */
export function centerOn(view, d, extent) {
  if (view == null) return null;
  const span = view[1] - view[0];
  return clampView([d - span / 2, d + span / 2], extent);
}

/** Keyboard pan by a fraction of the span (negative = up). */
export function stepPan(view, extent, fraction) {
  if (view == null) return null;
  return panBy(view, (view[1] - view[0]) * fraction, extent);
}

/** Navigator pixel mapping over the whole extent. */
export const navYOf = (d, [dMin, dMax], h) => ((d - dMin) / ((dMax - dMin) || 1)) * h;
export const navDOf = (y, [dMin, dMax], h) => dMin + (y / (h || 1)) * (dMax - dMin);

/** What a pointer at navigator y is over. */
export function hitNav(y, view, extent, h, handlePx = 6) {
  const [t, b] = resolveView(view, extent);
  const yt = navYOf(t, extent, h);
  const yb = navYOf(b, extent, h);
  if (Math.abs(y - yt) <= handlePx) return 'top';
  if (Math.abs(y - yb) <= handlePx) return 'base';
  if (y > yt && y < yb) return 'body';
  return 'outside';
}

/** Min/max of `values` per navigator pixel row over the extent (the
 *  miniature profile); rows without finite samples are NaN. */
export function decimateProfile(depth, values, extent, rows) {
  const mins = new Float64Array(rows).fill(NaN);
  const maxs = new Float64Array(rows).fill(NaN);
  if (!depth || !values || !rows) return { mins, maxs };
  const n = Math.min(depth.length, values.length);
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    const r = Math.min(rows - 1, Math.max(0, Math.floor(navYOf(depth[i], extent, rows))));
    if (!(mins[r] <= v)) mins[r] = Number.isNaN(mins[r]) ? v : Math.min(mins[r], v);
    if (!(maxs[r] >= v)) maxs[r] = Number.isNaN(maxs[r]) ? v : Math.max(maxs[r], v);
  }
  return { mins, maxs };
}
