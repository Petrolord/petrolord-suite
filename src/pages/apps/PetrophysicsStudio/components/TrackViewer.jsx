// Multi-track log viewer (Petrophysics Studio G2.3): shared depth
// axis, per-track linear/log scales, curve fills, zone bands, tops
// markers, wheel zoom + drag pan, crosshair readout. Canvas,
// fill-height, dark workstation viewport (a viewport, not an analytic
// chart — crossplots are where the white chartTheme applies, G2.4).
//
// Presentational: tracks/zones/tops come prepared from the controller;
// the viewer owns only its depth window and cursor.

import React, { useCallback, useEffect, useRef, useState } from 'react';

const AXIS_W = 56;        // depth axis gutter
const HEADER_H = 40;      // track header (title + scale + readout)
const PAD_TOP = 2;

const ZONE_COLORS = ['rgba(34,211,238,0.10)', 'rgba(251,191,36,0.10)', 'rgba(52,211,153,0.10)', 'rgba(244,114,182,0.10)'];

function xScale(track, x0, w) {
  const pad = 4;
  if (track.scale === 'log') {
    const lmin = Math.log10(track.min);
    const lmax = Math.log10(track.max);
    return (v) => (v > 0
      ? x0 + pad + ((Math.log10(v) - lmin) / (lmax - lmin)) * (w - 2 * pad)
      : NaN);
  }
  return (v) => x0 + pad + ((v - track.min) / (track.max - track.min)) * (w - 2 * pad);
}

/**
 * @param {Object} p
 * @param {ArrayLike<number>} p.depth MD metres, ascending
 * @param {Array<{key: string, title: string, scale?: 'linear'|'log',
 *   min: number, max: number, unit?: string,
 *   curves: Array<{name: string, data: ArrayLike<number>, color: string, fillTo?: 'left'|'right'}>}>} p.tracks
 * @param {Array} [p.zones] geo_wells_zones rows
 * @param {Array} [p.tops] geo_wells_tops rows
 */
export default function TrackViewer({ depth, tracks, zones = [], tops = [] }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(null);      // [dTop, dBase] or null = full
  const [cursor, setCursor] = useState(null);  // {y, depthM, idx}
  const dragRef = useRef(null);

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

    const trackW = (size.w - AXIS_W) / Math.max(1, tracks.length);

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

    // depth axis + gridlines
    ctx.strokeStyle = 'rgba(51,65,85,0.5)';
    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    const span = vBase - vTop;
    const step = 10 ** Math.floor(Math.log10(span / 6));
    const grid = span / step >= 30 ? step * 5 : span / step >= 12 ? step * 2 : step;
    for (let d = Math.ceil(vTop / grid) * grid; d <= vBase; d += grid) {
      const y = yOf(d);
      ctx.beginPath();
      ctx.moveTo(AXIS_W, y);
      ctx.lineTo(size.w, y);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(d)), AXIS_W - 4, y + 3);
    }
    ctx.save();
    ctx.translate(10, plotTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('MD (m)', 0, 0);
    ctx.restore();

    // visible sample range
    let i0 = 0;
    while (i0 < depth.length - 1 && depth[i0] < vTop) i0++;
    let i1 = depth.length - 1;
    while (i1 > 0 && depth[i1] > vBase) i1--;
    i0 = Math.max(0, i0 - 1);
    i1 = Math.min(depth.length - 1, i1 + 1);

    tracks.forEach((track, ti) => {
      const x0 = AXIS_W + ti * trackW;
      const xs = xScale(track, x0, trackW);

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
        ctx.font = '9px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'left';
        ctx.fillText(`${track.min}`, x0 + 4, 24);
        ctx.textAlign = 'right';
        ctx.fillText(`${track.max}${track.scale === 'log' ? ' log' : ''}`, x0 + trackW - 4, 24);
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
            x0 + trackW / 2, 36,
          );
        }
        return;
      }

      // curves
      for (const curve of track.curves) {
        ctx.strokeStyle = curve.color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        let pen = false;
        for (let i = i0; i <= i1; i++) {
          const v = curve.data[i];
          const x = Number.isFinite(v) ? xs(v) : NaN;
          if (!Number.isFinite(x)) { pen = false; continue; }
          const y = yOf(depth[i]);
          const cx = Math.min(x0 + trackW - 2, Math.max(x0 + 2, x));
          if (pen) ctx.lineTo(cx, y);
          else { ctx.moveTo(cx, y); pen = true; }
        }
        ctx.stroke();

        if (curve.fillTo) {
          const edge = curve.fillTo === 'left' ? x0 + 2 : x0 + trackW - 2;
          ctx.fillStyle = `${curve.color}30`;
          for (let i = i0; i < i1; i++) {
            const v = curve.data[i];
            if (!Number.isFinite(v)) continue;
            const x = Math.min(x0 + trackW - 2, Math.max(x0 + 2, xs(v)));
            const y = yOf(depth[i]);
            const y2 = yOf(depth[i + 1]);
            ctx.fillRect(Math.min(edge, x), y, Math.abs(x - edge), Math.max(1, y2 - y));
          }
        }

        // cursor readout in the header
        if (cursor) {
          const v = curve.data[cursor.idx];
          ctx.font = '10px sans-serif';
          ctx.fillStyle = curve.color;
          ctx.textAlign = 'center';
          ctx.fillText(
            Number.isFinite(v) ? `${curve.name} ${v.toPrecision(4)}` : `${curve.name} —`,
            x0 + trackW / 2, 36,
          );
        }
      }
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
      ctx.fillText(cursor.depthM.toFixed(1), AXIS_W - 4, cursor.y - 4);
    }
  }, [size, depth, tracks, zones, tops, vTop, vBase, cursor, yOf, plotTop, plotH]);

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
          dragRef.current = { y: e.clientY - canvasRef.current.getBoundingClientRect().top, view: [vTop, vBase] };
          e.currentTarget.setPointerCapture(e.pointerId);
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
