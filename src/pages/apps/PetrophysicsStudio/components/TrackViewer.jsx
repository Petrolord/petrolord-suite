// Multi-track log viewer (Petrophysics Studio G2.3, fills PS1): shared
// depth axis, per-track linear/log scales with per-curve overrides
// (density-neutron overlay), two-color crossover + threshold fills,
// zone bands, tops markers, wheel zoom + drag pan, crosshair readout.
// Canvas, fill-height, dark workstation viewport (a viewport, not an
// analytic chart — crossplots are where the white chartTheme applies).
//
// Presentational: tracks/zones/tops come prepared from the controller;
// the viewer owns only its depth window and cursor.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { crossoverPolys, thresholdPolys, fillPolys } from '../viewer/fills';

const AXIS_W = 56;        // depth axis gutter
const HEADER_H = 50;      // track header (title + scale rows + readout)
const PAD_TOP = 2;

const ZONE_COLORS = ['rgba(34,211,238,0.10)', 'rgba(251,191,36,0.10)', 'rgba(52,211,153,0.10)', 'rgba(244,114,182,0.10)'];

const DASHES = { dash: [6, 4], dot: [2, 3] };

// curve overrides win over the track scale, so one track can overlay
// differently-scaled curves (the classic density-neutron pair)
function xScale(track, curve, x0, w) {
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
 * @param {Object} p
 * @param {ArrayLike<number>} p.depth MD metres, ascending
 * @param {Array<{key: string, title: string, scale?: 'linear'|'log',
 *   min: number, max: number, unit?: string,
 *   curves: Array<{name: string, data: ArrayLike<number>, color: string,
 *     fillTo?: 'left'|'right', min?: number, max?: number,
 *     scale?: 'linear'|'log', style?: 'solid'|'dash'|'dot', lineWidth?: number}>,
 *   fills?: Array<{mode: 'crossover', a: number, b: number,
 *     positiveColor?: string, negativeColor?: string, opacity?: number}
 *     | {mode: 'threshold', a: number, value: number,
 *       side?: 'above'|'below', color: string, opacity?: number}>}>} p.tracks
 * @param {Array} [p.zones] geo_wells_zones rows
 * @param {Array} [p.tops] geo_wells_tops rows
 * @param {'m'|'ft'} [p.depthUnit] DISPLAY unit only — data stays metres
 * @param {(trackIndex: number) => void} [p.onTrackHeaderClick]
 */
export default function TrackViewer({
  depth, tracks, zones = [], tops = [], depthUnit = 'm', onTrackHeaderClick,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(null);      // [dTop, dBase] or null = full
  const [cursor, setCursor] = useState(null);  // {y, depthM, idx}
  const dragRef = useRef(null);
  const movedRef = useRef(false);

  // display-unit factor: every LABEL multiplies by F, no data changes
  const F = depthUnit === 'ft' ? 1 / 0.3048 : 1;

  const dMin = depth.length ? depth[0] : 0;
  const dMax = depth.length ? depth[depth.length - 1] : 1;
  const [vTop, vBase] = view || [dMin, dMax];

  useEffect(() => { setView(null); setCursor(null); }, [depth]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const plotTop = HEADER_H + PAD_TOP;
  const plotH = Math.max(10, size.h - plotTop - 4);
  const yOf = useCallback(
    (d) => plotTop + ((d - vTop) / (vBase - vTop || 1)) * plotH,
    [plotTop, plotH, vTop, vBase],
  );
  const dOf = (y) => vTop + ((y - plotTop) / plotH) * (vBase - vTop);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w || !size.h || !depth.length) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, size.w, size.h);

    // proportional track widths from the layout ratios
    const totalRatio = tracks.reduce((s, t) => s + (t.width || 1), 0) || 1;
    const plotWTotal = size.w - AXIS_W;
    const trackXs = [];
    const trackWs = [];
    let xAcc = AXIS_W;
    for (const t of tracks) {
      const w = ((t.width || 1) / totalRatio) * plotWTotal;
      trackXs.push(xAcc);
      trackWs.push(w);
      xAcc += w;
    }

    // zone bands under everything
    zones.forEach((z, zi) => {
      const y0 = yOf(Math.max(z.top_md_m, vTop));
      const y1 = yOf(Math.min(z.base_md_m, vBase));
      if (y1 < plotTop || y0 > plotTop + plotH) return;
      ctx.fillStyle = ZONE_COLORS[zi % ZONE_COLORS.length];
      ctx.fillRect(AXIS_W, Math.max(plotTop, y0), size.w - AXIS_W, Math.min(plotTop + plotH, y1) - Math.max(plotTop, y0));
      ctx.fillStyle = '#7dd3fc';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(z.name, AXIS_W + 4, Math.max(plotTop + 10, y0 + 11));
    });

    // depth axis + gridlines — the grid is chosen in DISPLAY units so
    // an ft axis lands on round feet
    ctx.strokeStyle = 'rgba(51,65,85,0.5)';
    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    const span = (vBase - vTop) * F;
    const step = 10 ** Math.floor(Math.log10(span / 6));
    const grid = span / step >= 30 ? step * 5 : span / step >= 12 ? step * 2 : step;
    for (let dv = Math.ceil((vTop * F) / grid) * grid; dv <= vBase * F; dv += grid) {
      const y = yOf(dv / F);
      ctx.beginPath();
      ctx.moveTo(AXIS_W, y);
      ctx.lineTo(size.w, y);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(dv)), AXIS_W - 4, y + 3);
    }
    ctx.save();
    ctx.translate(10, plotTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(depthUnit === 'ft' ? 'MD (ft)' : 'MD (m)', 0, 0);
    ctx.restore();

    // visible sample range
    let i0 = 0;
    while (i0 < depth.length - 1 && depth[i0] < vTop) i0++;
    let i1 = depth.length - 1;
    while (i1 > 0 && depth[i1] > vBase) i1--;
    i0 = Math.max(0, i0 - 1);
    i1 = Math.min(depth.length - 1, i1 + 1);

    tracks.forEach((track, ti) => {
      const x0 = trackXs[ti];
      const trackW = trackWs[ti];

      // header
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(x0, 0, trackW, HEADER_H);
      ctx.strokeStyle = 'rgba(51,65,85,0.9)';
      ctx.strokeRect(x0 + 0.5, 0.5, trackW - 1, HEADER_H - 1);
      ctx.strokeRect(x0 + 0.5, plotTop + 0.5, trackW - 1, plotH - 1);
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(track.title, x0 + trackW / 2, 12);
      if (track.type !== 'strip') {
        // one scale row per distinct curve range (max two rows), in the
        // curve's color when it overrides the track scale
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
            color: curve.min != null || curve.max != null ? curve.color : '#64748b',
          });
          if (rows.length === 2) break;
        }
        rows.forEach((r, ri) => {
          const y = 24 + ri * 9;
          ctx.fillStyle = r.color;
          ctx.textAlign = 'left';
          ctx.fillText(`${r.min}`, x0 + 4, y);
          ctx.textAlign = 'right';
          ctx.fillText(`${r.max}${r.scale === 'log' ? ' log' : ''}`, x0 + trackW - 4, y);
        });
      }

      // categorical strip track (facies): per-sample colored bands
      if (track.type === 'strip') {
        const data = track.curves[0].data;
        for (let i = i0; i < i1; i++) {
          const v = data[i];
          if (!Number.isFinite(v)) continue;
          const color = track.colors[Math.round(v) % track.colors.length];
          ctx.fillStyle = `${color}cc`;
          const y = yOf(depth[i]);
          const y2 = yOf(depth[i + 1]);
          ctx.fillRect(x0 + 2, y, trackW - 4, Math.max(1, y2 - y));
        }
        if (cursor) {
          const v = data[cursor.idx];
          ctx.font = '10px sans-serif';
          ctx.fillStyle = '#cbd5e1';
          ctx.textAlign = 'center';
          ctx.fillText(
            Number.isFinite(v) ? track.labels?.[Math.round(v)] ?? String(v) : '—',
            x0 + trackW / 2, 46,
          );
        }
        return;
      }

      const clampX = (x) => Math.min(x0 + trackW - 2, Math.max(x0 + 2, x));

      // fills under the curve lines (PS1): project each referenced
      // curve through its own scale, then build device-space polygons
      if (track.fills?.length) {
        const proj = (curve) => {
          const xsC = xScale(track, curve, x0, trackW);
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
            const xt = xScale(track, ca, x0, trackW)(f.value);
            if (!Number.isFinite(xt)) continue;
            fillPolys(
              ctx,
              thresholdPolys(proj(ca), clampX(xt), ys, f.side || 'above', i0, i1),
              `${f.color}${alpha}`,
            );
          }
        }
      }

      // curves
      track.curves.forEach((curve, ci) => {
        const xs = xScale(track, curve, x0, trackW);
        ctx.strokeStyle = curve.color;
        ctx.lineWidth = curve.lineWidth ?? 1.2;
        ctx.setLineDash(DASHES[curve.style] || []);
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

        // cursor readout in the header, spread across the track width
        // so overlaid curves never overprint each other
        if (cursor) {
          const v = curve.data[cursor.idx];
          const n = track.curves.length;
          ctx.font = '10px sans-serif';
          ctx.fillStyle = curve.color;
          ctx.textAlign = 'center';
          ctx.fillText(
            Number.isFinite(v) ? `${curve.name} ${v.toPrecision(4)}` : `${curve.name} —`,
            x0 + ((ci + 0.5) / n) * trackW, 46,
          );
        }
      });
      ctx.lineWidth = 1;
    });

    // tops markers across all tracks
    for (const t of tops) {
      if (t.md_m < vTop || t.md_m > vBase) continue;
      const y = yOf(t.md_m);
      ctx.strokeStyle = '#f59e0b';
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(AXIS_W, y);
      ctx.lineTo(size.w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fbbf24';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(t.name, size.w - 4, y - 3);
    }

    // crosshair
    if (cursor && cursor.y >= plotTop && cursor.y <= plotTop + plotH) {
      ctx.strokeStyle = 'rgba(148,163,184,0.7)';
      ctx.beginPath();
      ctx.moveTo(AXIS_W, cursor.y);
      ctx.lineTo(size.w, cursor.y);
      ctx.stroke();
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText((cursor.depthM * F).toFixed(1), AXIS_W - 4, cursor.y - 4);
    }
  }, [size, depth, tracks, zones, tops, vTop, vBase, cursor, yOf, plotTop, plotH, F, depthUnit]);

  const nearestIdx = (d) => {
    // depth ascending, uniformish: binary search
    let lo = 0;
    let hi = depth.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (depth[mid] < d) lo = mid;
      else hi = mid;
    }
    return d - depth[lo] < depth[hi] - d ? lo : hi;
  };

  const onPointerMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (dragRef.current) {
      movedRef.current = true;
      const dd = dOf(dragRef.current.y) - dOf(y);
      const [t0, b0] = dragRef.current.view;
      let nt = t0 + dd;
      let nb = b0 + dd;
      if (nt < dMin) { nb += dMin - nt; nt = dMin; }
      if (nb > dMax) { nt -= nb - dMax; nb = dMax; }
      setView([nt, nb]);
      return;
    }
    const d = dOf(y);
    if (d >= dMin && d <= dMax && depth.length) {
      setCursor({ y, depthM: d, idx: nearestIdx(d) });
    } else setCursor(null);
  };

  const onWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const d = dOf(e.clientY - rect.top);
    const factor = e.deltaY > 0 ? 1.25 : 0.8;
    let nt = d - (d - vTop) * factor;
    let nb = d + (vBase - d) * factor;
    nt = Math.max(dMin, nt);
    nb = Math.min(dMax, nb);
    if (nb - nt < 2) return; // 2 m floor
    setView(nb - nt >= dMax - dMin ? null : [nt, nb]);
  };

  return (
    <div ref={wrapRef} className="h-full min-h-0 w-full relative overflow-hidden" data-testid="petro-tracks">
      <canvas
        ref={canvasRef}
        className="cursor-crosshair"
        data-testid="petro-tracks-canvas"
        onPointerMove={onPointerMove}
        onPointerDown={(e) => {
          movedRef.current = false;
          dragRef.current = { y: e.clientY - canvasRef.current.getBoundingClientRect().top, view: [vTop, vBase] };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onClick={(e) => {
          if (movedRef.current || !onTrackHeaderClick || !tracks.length) return;
          const rect = canvasRef.current.getBoundingClientRect();
          if (e.clientY - rect.top > HEADER_H) return;
          const x = e.clientX - rect.left - AXIS_W;
          if (x < 0) return;
          const totalRatio = tracks.reduce((s, t) => s + (t.width || 1), 0) || 1;
          const plotW = rect.width - AXIS_W;
          let acc = 0;
          for (let i = 0; i < tracks.length; i++) {
            acc += ((tracks[i].width || 1) / totalRatio) * plotW;
            if (x < acc) { onTrackHeaderClick(i); return; }
          }
        }}
        onPointerUp={(e) => { dragRef.current = null; e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerLeave={() => { setCursor(null); }}
        onWheel={onWheel}
        onDoubleClick={() => setView(null)}
      />
      <span className="absolute bottom-1 right-2 text-[10px] text-slate-600 pointer-events-none">
        wheel: zoom · drag: pan · double-click: full well
      </span>
    </div>
  );
}
