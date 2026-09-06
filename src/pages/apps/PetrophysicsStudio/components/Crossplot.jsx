// Crossplot canvas (Petrophysics Studio G2.4, interactivity PS1).
// ANALYTIC chart — white background on the suite chartTheme constants,
// ChartLogo watermark (the DCA/RB/EPE standard), unlike the dark
// workstation viewports. Canvas rather than Recharts because the
// interactions (facies polygon drawing, log-log Pickett, zoom/pan,
// nearest-point identify) need direct hit control; the constants keep
// it visually one family with the rest of the suite's charts.
//
// PS1 adds: z-color with a colorbar, wheel zoom + drag pan in domain
// space (log-aware, owned by the parent through onDomainsChange),
// and a nearest-point hover tooltip.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CHART_COLORS } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';

const M = { l: 52, t: 12, b: 34 }; // left/top/bottom margins; right depends on the colorbar
const CBAR_W = 10;
const HIT_PX = 8;

function makeScale(domain, span, log, reverse) {
  const [d0, d1] = domain;
  const l0 = log ? Math.log10(d0) : d0;
  const l1 = log ? Math.log10(d1) : d1;
  const fwd = (v) => {
    const lv = log ? (v > 0 ? Math.log10(v) : NaN) : v;
    const f = (lv - l0) / (l1 - l0);
    return (reverse ? 1 - f : f) * span;
  };
  const inv = (px) => {
    let f = px / span;
    if (reverse) f = 1 - f;
    const lv = l0 + f * (l1 - l0);
    return log ? 10 ** lv : lv;
  };
  return { fwd, inv };
}

function ticksFor(domain, log) {
  if (log) {
    const out = [];
    for (let e = Math.ceil(Math.log10(domain[0])); 10 ** e <= domain[1] * 1.0001; e++) out.push(10 ** e);
    return out;
  }
  const span = domain[1] - domain[0];
  const raw = span / 6;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = raw / mag >= 5 ? 5 * mag : raw / mag >= 2 ? 2 * mag : mag;
  const out = [];
  for (let v = Math.ceil(domain[0] / step) * step; v <= domain[1] + 1e-9; v += step) out.push(v);
  return out;
}

const fmtTick = (v) => (Math.abs(v) >= 1000 ? String(v) : String(Number(v.toPrecision(3))));

/**
 * @param {Object} p
 * @param {Array<{x: number, y: number, color: string, depthM?: number, zv?: number}>} p.points
 * @param {[number, number]} p.xDomain @param {[number, number]} p.yDomain
 * @param {boolean} [p.xLog] @param {boolean} [p.yLog]
 * @param {boolean} [p.yReverse] e.g. RHOB increasing downward
 * @param {Array<{name: string, pts: Array<{x,y}>, color?: string, dash?: number[]}>} [p.overlays]
 * @param {Array<{name: string, color: string, polygon: Array<[number, number]>}>} [p.polygons]
 * @param {Array<[number, number]>} [p.draftPolygon] in-progress facies outline
 * @param {(xy: {x: number, y: number}) => void} [p.onPlotClick]
 * @param {{title: string, domain: [number, number], mapFn: (t: number) => string}} [p.colorbar]
 * @param {Array<{name: string, color: string}>} [p.legend] swatch key drawn
 *   inside the plot (PT8: which zone each colour is)
 * @param {(next: {x: [number, number], y: [number, number]} | null) => void} [p.onDomainsChange]
 *   enables wheel zoom + drag pan; null means reset to defaults
 */
export default function Crossplot({
  points, xLabel, yLabel, xDomain, yDomain,
  xLog = false, yLog = false, yReverse = false,
  overlays = [], polygons = [], draftPolygon = null, onPlotClick,
  colorbar = null, legend = [], onDomainsChange,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tooltip, setTooltip] = useState(null); // {px, py, lines}
  const screenPtsRef = useRef([]);
  const dragRef = useRef(null); // {px, py, xDomain, yDomain, moved}

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const mr = colorbar ? 52 : 12;
  const plotW = Math.max(10, size.w - M.l - mr);
  const plotH = Math.max(10, size.h - M.t - M.b);
  const sx = useCallback(makeScale(xDomain, plotW, xLog, false).fwd, [xDomain, plotW, xLog]);
  const sy = useCallback(makeScale(yDomain, plotH, yLog, !yReverse).fwd, [yDomain, plotH, yLog, yReverse]);
  // canvas y grows downward: non-reversed axes need the flip

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w || !size.h) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = CHART_COLORS.background;
    ctx.fillRect(0, 0, size.w, size.h);

    const X = (v) => M.l + sx(v);
    const Y = (v) => M.t + sy(v);

    // grid + ticks
    ctx.strokeStyle = CHART_COLORS.grid;
    ctx.fillStyle = CHART_COLORS.axisText;
    ctx.font = '10px sans-serif';
    for (const v of ticksFor(xDomain, xLog)) {
      const x = X(v);
      if (x < M.l - 0.5 || x > M.l + plotW + 0.5) continue;
      ctx.beginPath(); ctx.moveTo(x, M.t); ctx.lineTo(x, M.t + plotH); ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(fmtTick(v), x, M.t + plotH + 14);
    }
    for (const v of ticksFor(yDomain, yLog)) {
      const y = Y(v);
      if (y < M.t - 0.5 || y > M.t + plotH + 0.5) continue;
      ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(M.l + plotW, y); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(fmtTick(v), M.l - 5, y + 3);
    }
    ctx.strokeStyle = CHART_COLORS.axisLine;
    ctx.strokeRect(M.l + 0.5, M.t + 0.5, plotW - 1, plotH - 1);
    ctx.fillStyle = CHART_COLORS.axisLabel;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(xLabel, M.l + plotW / 2, size.h - 6);
    ctx.save();
    ctx.translate(12, M.t + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();

    // colorbar in the right gutter
    if (colorbar) {
      const cbX = M.l + plotW + 14;
      for (let i = 0; i < plotH; i++) {
        ctx.fillStyle = colorbar.mapFn(1 - i / (plotH - 1));
        ctx.fillRect(cbX, M.t + i, CBAR_W, 1.5);
      }
      ctx.strokeStyle = CHART_COLORS.axisLine;
      ctx.strokeRect(cbX + 0.5, M.t + 0.5, CBAR_W - 1, plotH - 1);
      ctx.fillStyle = CHART_COLORS.axisText;
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(fmtTick(colorbar.domain[1]), cbX + CBAR_W + 3, M.t + 8);
      ctx.fillText(fmtTick(colorbar.domain[0]), cbX + CBAR_W + 3, M.t + plotH - 1);
      ctx.save();
      ctx.translate(cbX + CBAR_W + 14, M.t + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText(colorbar.title, 0, 0);
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(M.l, M.t, plotW, plotH);
    ctx.clip();

    // overlays (lithology / iso-Sw / iso-BVW / fitted lines)
    for (const ov of overlays) {
      ctx.strokeStyle = ov.color || CHART_COLORS.axisLine;
      ctx.setLineDash(ov.dash || [5, 4]);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ov.pts.forEach((pt, i) => {
        const x = X(pt.x);
        const y = Y(pt.y);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      const last = ov.pts[ov.pts.length - 1];
      ctx.fillStyle = ov.color || CHART_COLORS.axisText;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(ov.name, X(last.x) + 3, Y(last.y) - 3);
    }

    // facies polygons
    for (const poly of polygons) {
      ctx.strokeStyle = poly.color;
      ctx.fillStyle = `${poly.color}18`;
      ctx.beginPath();
      poly.polygon.forEach(([px, py], i) => {
        const x = X(px);
        const y = Y(py);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const [lx, ly] = poly.polygon[0];
      ctx.fillStyle = poly.color;
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(poly.name, X(lx) + 4, Y(ly) - 4);
    }

    // in-progress polygon
    if (draftPolygon && draftPolygon.length) {
      ctx.strokeStyle = '#0891b2';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      draftPolygon.forEach(([px, py], i) => {
        const x = X(px);
        const y = Y(py);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      for (const [px, py] of draftPolygon) {
        ctx.fillStyle = '#0891b2';
        ctx.beginPath();
        ctx.arc(X(px), Y(py), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // sample points; keep projected positions for the hover hit-test
    const screenPts = [];
    for (const pt of points) {
      const x = X(pt.x);
      const y = Y(pt.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < M.l || x > M.l + plotW || y < M.t || y > M.t + plotH) continue;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
      screenPts.push({ sx: x, sy: y, pt });
    }
    screenPtsRef.current = screenPts;
    ctx.restore();

    // swatch key, top-left inside the plot, on a panel so it stays legible
    // over dense point clouds (PT8)
    if (legend.length) {
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      const rowH = 13;
      const w = Math.min(
        plotW - 12,
        16 + Math.max(...legend.map((l) => ctx.measureText(l.name).width)),
      );
      const h = legend.length * rowH + 6;
      const lx = M.l + 8;
      const ly = M.t + 8;
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fillRect(lx, ly, w, h);
      ctx.strokeStyle = CHART_COLORS.axisLine;
      ctx.strokeRect(lx + 0.5, ly + 0.5, w - 1, h - 1);
      legend.forEach((l, i) => {
        const ry = ly + 4 + i * rowH;
        ctx.fillStyle = l.color;
        ctx.fillRect(lx + 4, ry + 2, 7, 7);
        ctx.fillStyle = CHART_COLORS.axisText;
        ctx.fillText(l.name, lx + 15, ry + 9, w - 19);
      });
    }
  }, [size, points, overlays, polygons, draftPolygon, xDomain, yDomain, xLog, yLog, yReverse, xLabel, yLabel, sx, sy, plotW, plotH, colorbar, legend]);

  // domain transform helpers: express pan/zoom as pixel-space maps and
  // pull the new endpoints back through the CURRENT scales, so linear,
  // log and reversed axes all behave without special cases
  const remapDomains = useCallback((mapPx, mapPy) => {
    const xS = makeScale(xDomain, plotW, xLog, false);
    const yS = makeScale(yDomain, plotH, yLog, !yReverse);
    return {
      x: [xS.inv(mapPx(xS.fwd(xDomain[0]))), xS.inv(mapPx(xS.fwd(xDomain[1])))],
      y: [yS.inv(mapPy(yS.fwd(yDomain[0]))), yS.inv(mapPy(yS.fwd(yDomain[1])))],
    };
  }, [xDomain, yDomain, plotW, plotH, xLog, yLog, yReverse]);

  const hitTest = (px, py) => {
    let best = null;
    let bestD2 = HIT_PX * HIT_PX;
    for (const sp of screenPtsRef.current) {
      const d2 = (sp.sx - px) ** 2 + (sp.sy - py) ** 2;
      if (d2 < bestD2) { bestD2 = d2; best = sp; }
    }
    return best;
  };

  const onPointerMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const drag = dragRef.current;
    if (drag && onDomainsChange) {
      const dx = px - drag.px;
      const dy = py - drag.py;
      if (!drag.moved && dx * dx + dy * dy < 9) return;
      drag.moved = true;
      setTooltip(null);
      // pan: shift the pixel frame by the drag delta from the drag-start domains
      const xS = makeScale(drag.xDomain, plotW, xLog, false);
      const yS = makeScale(drag.yDomain, plotH, yLog, !yReverse);
      onDomainsChange({
        x: [xS.inv(xS.fwd(drag.xDomain[0]) - dx), xS.inv(xS.fwd(drag.xDomain[1]) - dx)],
        y: [yS.inv(yS.fwd(drag.yDomain[0]) - dy), yS.inv(yS.fwd(drag.yDomain[1]) - dy)],
      });
      return;
    }
    const hit = hitTest(px, py);
    if (!hit) { setTooltip(null); return; }
    const { pt } = hit;
    const lines = [];
    if (pt.depthM != null) lines.push(`${pt.depthM.toFixed(1)} m MD`);
    lines.push(`${xLabel}: ${Number(pt.x.toPrecision(4))}`);
    lines.push(`${yLabel}: ${Number(pt.y.toPrecision(4))}`);
    if (colorbar && pt.zv != null && Number.isFinite(pt.zv)) {
      lines.push(`${colorbar.title}: ${Number(pt.zv.toPrecision(4))}`);
    }
    setTooltip({ px: hit.sx, py: hit.sy, lines });
  };

  const onWheel = (e) => {
    if (!onDomainsChange) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left - M.l;
    const cy = e.clientY - rect.top - M.t;
    if (cx < 0 || cx > plotW || cy < 0 || cy > plotH) return;
    const k = e.deltaY > 0 ? 1.25 : 0.8;
    setTooltip(null);
    onDomainsChange(remapDomains((p) => cx + (p - cx) * k, (p) => cy + (p - cy) * k));
  };

  const onPointerDown = (e) => {
    dragRef.current = {
      px: e.clientX - canvasRef.current.getBoundingClientRect().left,
      py: e.clientY - canvasRef.current.getBoundingClientRect().top,
      xDomain, yDomain, moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerUp = (e) => {
    const drag = dragRef.current;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (drag?.moved || !onPlotClick) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left - M.l;
    const py = e.clientY - rect.top - M.t;
    if (px < 0 || px > plotW || py < 0 || py > plotH) return;
    const x = makeScale(xDomain, plotW, xLog, false).inv(px);
    const y = makeScale(yDomain, plotH, yLog, !yReverse).inv(py);
    onPlotClick({ x, y });
  };

  return (
    <div ref={wrapRef} className="h-full min-h-0 w-full relative overflow-hidden bg-white">
      <canvas
        ref={canvasRef}
        data-testid="petro-crossplot-canvas"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { setTooltip(null); dragRef.current = null; }}
        onWheel={onWheel}
        onDoubleClick={onDomainsChange && !onPlotClick ? () => onDomainsChange(null) : undefined}
      />
      {tooltip && (
        <div
          data-testid="petro-crossplot-tooltip"
          className="absolute pointer-events-none rounded border border-slate-300 bg-white/95 px-2 py-1 text-[10px] text-slate-700 shadow"
          style={{
            left: Math.min(tooltip.px + 10, Math.max(0, size.w - 130)),
            top: Math.max(0, tooltip.py - 10 - tooltip.lines.length * 13),
          }}
        >
          {tooltip.lines.map((l) => <div key={l}>{l}</div>)}
        </div>
      )}
      {onDomainsChange && (
        <span className="absolute bottom-1 left-14 text-[10px] text-slate-400 pointer-events-none">
          wheel: zoom · drag: pan{onPlotClick ? '' : ' · double-click: reset'}
        </span>
      )}
      <ChartLogo />
    </div>
  );
}
