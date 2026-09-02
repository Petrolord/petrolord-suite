// Shared track-curve rendering (Petrophysics Studio PS9): the curve
// stroke + baseline-fill pass used by both the single-well TrackViewer
// and the multi-well field columns, with min/max decimation once the
// visible samples outrun the pixel rows (spikes stay visible, draw
// cost caps at O(pixels)). Pure canvas-drawing functions, no React.

export const DASHES = { dash: [6, 4], dot: [2, 3] };

// curve overrides win over the track scale, so one track can overlay
// differently-scaled curves (the classic density-neutron pair)
export function xScaleFor(track, curve, x0, w) {
  const pad = 4;
  const min = curve?.min ?? track.min;
  const max = curve?.max ?? track.max;
  const scale = curve?.scale ?? track.scale;
  if (scale === 'log') {
    const lmin = Math.log10(min);
    const lmax = Math.log10(max);
    return (v) => (v > 0
      ? x0 + pad + ((Math.log10(v) - lmin) / (lmax - lmin)) * (w - 2 * pad)
      : NaN);
  }
  return (v) => x0 + pad + ((v - min) / (max - min)) * (w - 2 * pad);
}

/**
 * Stroke one curve (and its baseline fill) into a track column.
 * Replicates the TrackViewer semantics exactly: per-curve scale
 * overrides, dash styles, x clamped to the track interior, NaN lifts
 * the pen. Decimates to per-pixel-row min/max segments when the
 * visible sample count exceeds 2 per pixel row.
 */
export function drawCurve(ctx, {
  track, curve, depth, yOf, i0, i1, x0, trackW, plotH,
}) {
  const xs = xScaleFor(track, curve, x0, trackW);
  const clampX = (x) => Math.min(x0 + trackW - 2, Math.max(x0 + 2, x));
  ctx.strokeStyle = curve.color;
  ctx.lineWidth = curve.lineWidth ?? 1.2;
  ctx.setLineDash(DASHES[curve.style] || []);

  const nVisible = i1 - i0 + 1;
  if (plotH > 0 && nVisible > 2 * plotH) {
    // min/max per pixel row: one vertical segment per row keeps every
    // spike visible at any zoom
    const rows = Math.max(1, Math.round(plotH));
    const mins = new Float64Array(rows).fill(Infinity);
    const maxs = new Float64Array(rows).fill(-Infinity);
    const y0 = yOf(depth[i0]);
    for (let i = i0; i <= i1; i++) {
      const v = curve.data[i];
      if (!Number.isFinite(v)) continue;
      const x = xs(v);
      if (!Number.isFinite(x)) continue;
      let r = Math.floor(yOf(depth[i]) - y0);
      if (r < 0) r = 0;
      if (r >= rows) r = rows - 1;
      const cx = clampX(x);
      if (cx < mins[r]) mins[r] = cx;
      if (cx > maxs[r]) maxs[r] = cx;
    }
    ctx.beginPath();
    for (let r = 0; r < rows; r++) {
      if (mins[r] > maxs[r]) continue;
      const y = y0 + r + 0.5;
      ctx.moveTo(mins[r], y);
      ctx.lineTo(Math.max(maxs[r], mins[r] + 0.6), y);
    }
    ctx.stroke();
  } else {
    ctx.beginPath();
    let pen = false;
    for (let i = i0; i <= i1; i++) {
      const v = curve.data[i];
      const x = Number.isFinite(v) ? xs(v) : NaN;
      if (!Number.isFinite(x)) { pen = false; continue; }
      const y = yOf(depth[i]);
      const cx = clampX(x);
      if (pen) ctx.lineTo(cx, y);
      else { ctx.moveTo(cx, y); pen = true; }
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  if (curve.fillTo) {
    const edge = curve.fillTo === 'left' ? x0 + 2 : x0 + trackW - 2;
    ctx.fillStyle = `${curve.color}30`;
    for (let i = i0; i < i1; i++) {
      const v = curve.data[i];
      if (!Number.isFinite(v)) continue;
      const x = clampX(xs(v));
      const y = yOf(depth[i]);
      const y2 = yOf(depth[i + 1]);
      ctx.fillRect(Math.min(edge, x), y, Math.abs(x - edge), Math.max(1, y2 - y));
    }
  }
  ctx.lineWidth = 1;
}
