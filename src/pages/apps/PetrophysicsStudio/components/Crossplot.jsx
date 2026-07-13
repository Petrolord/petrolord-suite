// Crossplot canvas (Petrophysics Studio G2.4). ANALYTIC chart — white
// background on the suite chartTheme constants, ChartLogo watermark
// (the DCA/RB/EPE standard), unlike the dark workstation viewports.
// Canvas rather than Recharts because the interactions (facies polygon
// drawing, log-log Pickett) need direct hit control; the constants
// keep it visually one family with the rest of the suite's charts.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CHART_COLORS } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';

const M = { l: 52, r: 12, t: 12, b: 34 }; // plot margins

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
 * @param {Array<{x: number, y: number, color: string}>} p.points
 * @param {[number, number]} p.xDomain @param {[number, number]} p.yDomain
 * @param {boolean} [p.xLog] @param {boolean} [p.yLog]
 * @param {boolean} [p.yReverse] e.g. RHOB increasing downward
 * @param {Array<{name: string, pts: Array<{x,y}>, color?: string, dash?: number[]}>} [p.overlays]
 * @param {Array<{name: string, color: string, polygon: Array<[number, number]>}>} [p.polygons]
 * @param {Array<[number, number]>} [p.draftPolygon] in-progress facies outline
 * @param {(xy: {x: number, y: number}) => void} [p.onPlotClick]
 */
export default function Crossplot({
  points, xLabel, yLabel, xDomain, yDomain,
  xLog = false, yLog = false, yReverse = false,
  overlays = [], polygons = [], draftPolygon = null, onPlotClick,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const plotW = Math.max(10, size.w - M.l - M.r);
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
      ctx.beginPath(); ctx.moveTo(x, M.t); ctx.lineTo(x, M.t + plotH); ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(fmtTick(v), x, M.t + plotH + 14);
    }
    for (const v of ticksFor(yDomain, yLog)) {
      const y = Y(v);
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

    ctx.save();
    ctx.beginPath();
    ctx.rect(M.l, M.t, plotW, plotH);
    ctx.clip();

    // overlays (lithology / iso-Sw / fitted lines)
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

    // sample points
    for (const pt of points) {
      const x = X(pt.x);
      const y = Y(pt.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }, [size, points, overlays, polygons, draftPolygon, xDomain, yDomain, xLog, yLog, yReverse, xLabel, yLabel, sx, sy, plotW, plotH]);

  const handleClick = (e) => {
    if (!onPlotClick) return;
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
      <canvas ref={canvasRef} data-testid="petro-crossplot-canvas" onClick={handleClick} />
      <ChartLogo />
    </div>
  );
}
