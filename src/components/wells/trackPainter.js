// Shared track painter (2026-09-03): the canvas primitives that draw a
// column of log tracks, extracted from the Petrophysics TrackViewer so the
// single-well viewer, the Field view and the Well Correlation section paint
// tracks identically (white printed-log palette, header scale rows, fills,
// curves, top tags, cursor readouts). Pure canvas drawing, no React, no
// document: callers own the canvas, the depth window and the pointer.
//
// `depth` is any monotonic ascending plotted-depth array (MD, displayed MD
// under a flattening shift, or TVDSS); nothing here assumes a uniform step.
// Constants and draw order reproduce TrackViewer exactly, so its pinned
// geometry (title y 12, scale rows y 24/33, readouts y 46, ramp legend at
// headerH - 4) survives the extraction.

import { crossoverPolys, thresholdPolys, fillPolys, makeRamp, rampStrips } from './fills';
import { drawCurve, xScaleFor } from './trackRender';

// Light palette (Suite chart standard, src/utils/chartTheme.js): white plot
// with slate grid and axes, so tracks read like a printed log.
export const PALETTES = {
  light: {
    bg: '#ffffff',
    headerBg: '#f1f5f9',           // slate-100
    frame: 'rgba(148,163,184,0.9)', // slate-400
    grid: 'rgba(203,213,225,0.9)',  // slate-300
    axisText: '#475569',           // slate-600
    text: '#1e293b',               // slate-800
    textStrong: '#0f172a',         // slate-900
    crosshair: 'rgba(71,85,105,0.7)',
  },
};

/**
 * Visible sample range [i0, i1] for a depth window, with one sample of
 * margin on each side so curves enter and leave the plot cleanly. Same
 * result as TrackViewer's linear scans, by binary search.
 */
export function visibleRange(depth, vTop, vBase) {
  const n = depth.length;
  if (!n) return { i0: 0, i1: -1 };
  // first index with depth >= vTop (capped at n - 1, as the scan was)
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (depth[mid] < vTop) lo = mid + 1; else hi = mid;
  }
  let i0 = lo;
  // last index with depth <= vBase (floored at 0, as the scan was)
  lo = 0;
  hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (depth[mid] > vBase) hi = mid - 1; else lo = mid;
  }
  let i1 = lo;
  i0 = Math.max(0, i0 - 1);
  i1 = Math.min(n - 1, i1 + 1);
  return { i0, i1 };
}

/**
 * Depth axis gutter: gridlines across the plot at round DISPLAY-unit
 * steps, labels right-aligned in the gutter, rotated title.
 * @param {Object} p
 * @param {number} p.F display factor applied to labels (ft: 1 / 0.3048)
 * @param {(dM: number) => number} [p.labelOf] label value for a plotted depth
 *   (default dM * F; a TVD label swap passes its own)
 */
export function paintDepthAxis(ctx, {
  axisW, plotTop, plotH, plotRight, vTop, vBase, yOf, F = 1, labelOf, title, palette = PALETTES.light, titleX = 10,
}) {
  const label = labelOf || ((d) => d * F);
  ctx.strokeStyle = palette.grid;
  ctx.fillStyle = palette.axisText;
  ctx.font = '10px sans-serif';
  const span = (vBase - vTop) * F;
  const step = 10 ** Math.floor(Math.log10(span / 6));
  const grid = span / step >= 30 ? step * 5 : span / step >= 12 ? step * 2 : step;
  for (let dv = Math.ceil((vTop * F) / grid) * grid; dv <= vBase * F; dv += grid) {
    const y = yOf(dv / F);
    ctx.beginPath();
    ctx.moveTo(axisW, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
    ctx.textAlign = 'right';
    const v = label(dv / F);
    ctx.fillText(Number.isFinite(v) ? String(Math.round(v)) : '—', axisW - 4, y + 3);
  }
  if (title) {
    ctx.save();
    ctx.translate(titleX, plotTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(title, 0, 0);
    ctx.restore();
  }
}

/**
 * Track header band: background, frame, title (y 12) and up to two scale
 * rows (y 24 and 33), one per distinct curve range, in the curve colour
 * when the curve overrides the track scale.
 */
export function paintTrackHeader(ctx, { track, x0, w, headerH, palette = PALETTES.light }) {
  ctx.fillStyle = palette.headerBg;
  ctx.fillRect(x0, 0, w, headerH);
  ctx.strokeStyle = palette.frame;
  ctx.strokeRect(x0 + 0.5, 0.5, w - 1, headerH - 1);
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = palette.text;
  ctx.fillText(track.title, x0 + w / 2, 12);
  if (track.type === 'strip') return;
  ctx.font = '9px sans-serif';
  const rows = [];
  const seen = new Set();
  for (const curve of track.curves) {
    const min = curve.min ?? track.min;
    const max = curve.max ?? track.max;
    const scale = curve.scale ?? track.scale;
    const sig = `${min}|${max}|${scale}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    rows.push({
      min, max, scale,
      color: curve.min != null || curve.max != null ? curve.color : palette.axisText,
    });
    if (rows.length === 2) break;
  }
  rows.forEach((r, ri) => {
    const y = 24 + ri * 9;
    ctx.fillStyle = r.color;
    ctx.textAlign = 'left';
    ctx.fillText(`${r.min}`, x0 + 4, y);
    ctx.textAlign = 'right';
    ctx.fillText(`${r.max}${r.scale === 'log' ? ' log' : ''}`, x0 + w - 4, y);
  });
}

/**
 * Track plot body: frame, then a strip track's bands, or the fills (under
 * the lines) and the curves. `headerH` places a ramp fill's legend bar
 * under the header scale rows; pass null to skip the legend.
 */
export function paintTrackBody(ctx, {
  track, depth, yOf, i0, i1, x0, w, plotTop, plotH, headerH = null, palette = PALETTES.light,
}) {
  ctx.strokeStyle = palette.frame;
  ctx.strokeRect(x0 + 0.5, plotTop + 0.5, w - 1, plotH - 1);
  if (i1 < i0) return;

  // categorical strip track (facies): per-sample coloured bands
  if (track.type === 'strip') {
    const data = track.curves[0].data;
    for (let i = i0; i < i1; i++) {
      const v = data[i];
      if (!Number.isFinite(v)) continue;
      const color = track.colors[Math.round(v) % track.colors.length];
      ctx.fillStyle = `${color}cc`;
      const y = yOf(depth[i]);
      const y2 = yOf(depth[i + 1]);
      ctx.fillRect(x0 + 2, y, w - 4, Math.max(1, y2 - y));
    }
    return;
  }

  const clampX = (x) => Math.min(x0 + w - 2, Math.max(x0 + 2, x));

  // fills under the curve lines (PS1): project each referenced curve
  // through its own scale, then build device-space polygons
  if (track.fills?.length) {
    const proj = (curve) => {
      const xsC = xScaleFor(track, curve, x0, w);
      const out = new Float64Array(i1 + 1).fill(NaN);
      for (let i = i0; i <= i1; i++) {
        const v = curve.data[i];
        if (!Number.isFinite(v)) continue;
        const x = xsC(v);
        if (Number.isFinite(x)) out[i] = clampX(x);
      }
      return out;
    };
    const ys = new Float64Array(i1 + 1).fill(NaN);
    for (let i = i0; i <= i1; i++) ys[i] = yOf(depth[i]);
    for (const f of track.fills) {
      const ca = track.curves[f.a];
      if (!ca) continue;
      const alpha = Math.round((f.opacity ?? 0.3) * 255).toString(16).padStart(2, '0');
      if (f.mode === 'crossover' && track.curves[f.b]) {
        const { pos, neg } = crossoverPolys(proj(ca), proj(track.curves[f.b]), ys, i0, i1);
        if (f.positiveColor) fillPolys(ctx, pos, `${f.positiveColor}${alpha}`);
        if (f.negativeColor) fillPolys(ctx, neg, `${f.negativeColor}${alpha}`);
      } else if (f.mode === 'threshold') {
        const xt = xScaleFor(track, ca, x0, w)(f.value);
        if (!Number.isFinite(xt)) continue;
        const pa = proj(ca);
        const side = f.side || 'above';
        if (f.color) fillPolys(ctx, thresholdPolys(pa, clampX(xt), ys, side, i0, i1), `${f.color}${alpha}`);
        // PT6: the other side in color2 (GR cut-off: sand one colour, shale the other)
        if (f.color2) fillPolys(ctx, thresholdPolys(pa, clampX(xt), ys, side === 'above' ? 'below' : 'above', i0, i1), `${f.color2}${alpha}`);
      } else if (f.mode === 'ramp') {
        // PT6: strips coloured by the curve's own value
        const ramp = makeRamp(f.stops);
        if (!ramp) continue;
        const pa = proj(ca);
        const strips = rampStrips(pa, ys, i0, i1, plotH, ca.data, f.fillTo);
        const left = x0 + 2;
        const right = x0 + w - 2;
        ctx.save();
        ctx.globalAlpha = f.opacity ?? 0.85;
        for (const st of strips) {
          const c = ramp(st.v);
          if (!c) continue;
          ctx.fillStyle = c;
          // a hair of overlap hides antialiased seams between strips
          const h = Math.max(1, st.y1 - st.y0) + 0.7;
          if (f.fillTo === 'track') ctx.fillRect(left, st.y0, right - left, h);
          else if (f.fillTo === 'right') ctx.fillRect(st.xCurve, st.y0, Math.max(0, right - st.xCurve), h);
          else ctx.fillRect(left, st.y0, Math.max(0, st.xCurve - left), h);
        }
        ctx.restore();
        if (headerH != null) {
          // legend bar under the header scale rows: min colour to max colour
          const g = ctx.createLinearGradient(x0 + 4, 0, x0 + w - 4, 0);
          for (const st of f.stops) g.addColorStop(Math.min(1, Math.max(0, (st.value - ramp.lo) / (ramp.hi - ramp.lo))), st.color);
          ctx.fillStyle = g;
          ctx.fillRect(x0 + 4, headerH - 4, w - 8, 3);
        }
      }
    }
  }

  // curves (shared renderer: decimates past 2 samples per pixel row)
  track.curves.forEach((curve) => {
    drawCurve(ctx, { track, curve, depth, yOf, i0, i1, x0, trackW: w, plotH });
  });
  ctx.lineWidth = 1;
}

/**
 * A whole column of tracks: header band (when `headers`) and body per
 * track from a geometry array ([{x0, w}], see trackRender.trackGeometry).
 */
export function paintTrackColumn(ctx, {
  tracks, geom, depth, yOf, i0, i1, headerH, plotTop, plotH, palette = PALETTES.light, headers = true,
}) {
  tracks.forEach((track, ti) => {
    const { x0, w } = geom[ti];
    if (headers) paintTrackHeader(ctx, { track, x0, w, headerH, palette });
    paintTrackBody(ctx, { track, depth, yOf, i0, i1, x0, w, plotTop, plotH, headerH: headers ? headerH : null, palette });
  });
}

/**
 * Per-track readout row in the header (cursor values at sample `idx`),
 * spread across the track width so overlaid curves never overprint.
 */
export function paintReadouts(ctx, { tracks, geom, idx, y = 46, palette = PALETTES.light }) {
  tracks.forEach((track, ti) => {
    const { x0, w } = geom[ti];
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    if (track.type === 'strip') {
      const v = track.curves[0].data[idx];
      ctx.fillStyle = palette.text;
      ctx.fillText(Number.isFinite(v) ? track.labels?.[Math.round(v)] ?? String(v) : '—', x0 + w / 2, y);
      return;
    }
    const n = track.curves.length;
    track.curves.forEach((curve, ci) => {
      const v = curve.data[idx];
      ctx.fillStyle = curve.color;
      ctx.fillText(Number.isFinite(v) ? `${curve.name} ${v.toPrecision(4)}` : `${curve.name} —`, x0 + ((ci + 0.5) / n) * w, y);
    });
  });
}

/**
 * A top marker: dashed line across [xLeft, xRight] in the top's colour and
 * a name tag at the right edge (the tag is the drag handle on own wells,
 * shown by a grip glyph). Returns the tag box for hit tests.
 */
export function paintTopMarker(ctx, { name, color, y, xLeft, xRight, tagMax = 120, grip = false }) {
  ctx.font = '10px sans-serif';
  ctx.strokeStyle = color;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  ctx.moveTo(xLeft, y);
  ctx.lineTo(xRight, y);
  ctx.stroke();
  ctx.setLineDash([]);
  const tw = ctx.measureText(name).width;
  const tagW = Math.min(tagMax, tw + 18);
  const tx = xRight - tagW - 2;
  ctx.fillStyle = `${color}2e`;
  ctx.fillRect(tx, y - 13, tagW, 12);
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  if (grip) {
    for (let k = 0; k < 3; k++) ctx.fillRect(tx + 3, y - 11 + k * 3, 4, 1);
  }
  ctx.fillText(name, tx + (grip ? 10 : 4), y - 3, tagW - 12);
  return { tagLeft: tx, tagW, top: y - 13, height: 12 };
}
