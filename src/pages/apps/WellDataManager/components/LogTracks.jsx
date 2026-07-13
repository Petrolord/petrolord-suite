// Log quick-view tracks: side-by-side canvas strips, depth down, one
// curve per track (Petrel-style QC view). Dark workstation viewport —
// like WellsMap this is a navigation/QC view inside the workstation,
// not an analytic chart, so the white chartTheme does not apply.
//
// Depth axis: start_md_m + i*step_m when the log is regular; for
// irregular logs (step_m null) samples plot by index and the axis says
// so — the quick-view never pretends to a depth it doesn't have.

import React, { useEffect, useRef } from 'react';

const TRACK_W = 130;
const GUTTER = 54;      // left depth-axis gutter
const HEADER_H = 34;

function finiteRange(data) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!(max >= min)) return null;
  if (max === min) { min -= 0.5; max += 0.5; }
  return { min, max };
}

/**
 * @param {Object} p
 * @param {Array<{log: Object, data: Float32Array}>} p.tracks curves to
 *   draw, in order; log is the geo_wells_logs row shape
 * @param {number} [p.height]
 */
export default function LogTracks({ tracks, height = 420 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssW = GUTTER + Math.max(1, tracks.length) * TRACK_W;
    const cssH = height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, cssW, cssH);
    if (!tracks.length) {
      ctx.fillStyle = '#475569';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Tick curves in the table to plot them', cssW / 2, cssH / 2);
      return;
    }

    const plotTop = HEADER_H;
    const plotH = cssH - plotTop - 8;

    // shared depth axis when every plotted log is regular and agrees
    const regular = tracks.every((t) => t.log.step_m != null);
    const start = Math.min(...tracks.map((t) => t.log.start_md_m ?? 0));
    const stop = Math.max(...tracks.map((t) => t.log.stop_md_m ?? t.data.length));
    const maxN = Math.max(...tracks.map((t) => t.data.length));
    const depthOf = (t, i) => (regular ? t.log.start_md_m + i * t.log.step_m : i);
    const axisMin = regular ? start : 0;
    const axisMax = regular ? stop : maxN - 1;
    const yOf = (d) => plotTop + ((d - axisMin) / (axisMax - axisMin || 1)) * plotH;

    // depth gridlines + labels
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.5)';
    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    const nTicks = 8;
    for (let k = 0; k <= nTicks; k++) {
      const d = axisMin + (k / nTicks) * (axisMax - axisMin);
      const y = yOf(d);
      ctx.beginPath();
      ctx.moveTo(GUTTER, y);
      ctx.lineTo(cssW, y);
      ctx.stroke();
      ctx.fillText(regular ? `${Math.round(d)}` : `#${Math.round(d)}`, GUTTER - 4, y + 3);
    }
    ctx.save();
    ctx.translate(11, plotTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(regular ? 'MD (m)' : 'sample index', 0, 0);
    ctx.restore();

    const COLORS = ['#22d3ee', '#fbbf24', '#34d399', '#f472b6', '#a78bfa', '#f87171'];
    tracks.forEach((t, ti) => {
      const x0 = GUTTER + ti * TRACK_W;
      const color = COLORS[ti % COLORS.length];
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.9)';
      ctx.strokeRect(x0 + 0.5, plotTop + 0.5, TRACK_W - 1, plotH - 1);

      const range = finiteRange(t.data);
      ctx.fillStyle = color;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${t.log.mnemonic}${t.log.unit ? ` (${t.log.unit})` : ''}`, x0 + TRACK_W / 2, 13);
      ctx.fillStyle = '#64748b';
      ctx.font = '9px sans-serif';
      if (range) {
        ctx.textAlign = 'left';
        ctx.fillText(range.min.toPrecision(4), x0 + 3, 26);
        ctx.textAlign = 'right';
        ctx.fillText(range.max.toPrecision(4), x0 + TRACK_W - 3, 26);
      }
      if (!range) return;

      const PADX = 6;
      const xOf = (v) => x0 + PADX + ((v - range.min) / (range.max - range.min)) * (TRACK_W - 2 * PADX);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      let pen = false; // NaN gaps break the polyline
      for (let i = 0; i < t.data.length; i++) {
        const v = t.data[i];
        if (!Number.isFinite(v)) { pen = false; continue; }
        const x = xOf(v);
        const y = yOf(depthOf(t, i));
        if (pen) ctx.lineTo(x, y);
        else { ctx.moveTo(x, y); pen = true; }
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    });
  }, [tracks, height]);

  return (
    <div className="overflow-x-auto">
      <canvas ref={canvasRef} data-testid="wdm-log-tracks" className="rounded border border-slate-800" />
    </div>
  );
}
