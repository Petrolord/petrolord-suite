// Histogram canvas (Petrophysics Studio PS7). ANALYTIC chart — white
// chartTheme + ChartLogo, one family with the crossplots. Filled bars
// for the primary series, stepped outlines for overlays, a cumulative
// frequency curve on the right axis, percentile markers, and
// DRAGGABLE cutoff lines that preview live and commit on release
// (the classic IP cutoff-picking loop).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CHART_COLORS } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';

const M = { l: 46, r: 44, t: 12, b: 30 };
const GRAB_PX = 6;

/**
 * @param {Object} p
 * @param {Array<{name: string, color: string, outline?: boolean,
 *   hist: {edges: Float64Array, counts: Uint32Array, n: number}}>} p.series
 *   series[0] is the primary (filled); the rest draw as outlines
 * @param {Float64Array} [p.cumulative] fractions per primary bin
 * @param {boolean} [p.log] x binned in log10 space
 * @param {string} p.xLabel
 * @param {Array<{key: string, label: string, value: number, color: string}>} [p.thresholds]
 * @param {(key: string, value: number) => void} [p.onThresholdChange]
 * @param {Array<{p: number, value: number}>} [p.percentiles]
 */
export default function HistogramChart({
  series, cumulative = null, log = false, xLabel,
  thresholds = [], onThresholdChange, percentiles = [],
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState(null); // {key, value}
  const [hover, setHover] = useState(null); // {px, lines}

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const prim = series[0];
  const edges = prim?.hist.edges;
  const plotW = Math.max(10, size.w - M.l - M.r);
  const plotH = Math.max(10, size.h - M.t - M.b);
  const tLo = edges?.length ? (log ? Math.log10(edges[0]) : edges[0]) : 0;
  const tHi = edges?.length ? (log ? Math.log10(edges[edges.length - 1]) : edges[edges.length - 1]) : 1;
  const X = useCallback(
    (v) => M.l + (((log ? Math.log10(v) : v) - tLo) / (tHi - tLo || 1)) * plotW,
    [log, tLo, tHi, plotW],
  );
  const invX = useCallback((px) => {
    const t = tLo + ((px - M.l) / plotW) * (tHi - tLo);
    return log ? 10 ** t : t;
  }, [log, tLo, tHi, plotW]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w || !size.h || !prim) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = CHART_COLORS.background;
    ctx.fillRect(0, 0, size.w, size.h);

    let maxC = 1;
    for (const s of series) for (const c of s.hist.counts) if (c > maxC) maxC = c;
    const Y = (c) => M.t + plotH - (c / maxC) * plotH;

    // frame + count axis
    ctx.strokeStyle = CHART_COLORS.grid;
    ctx.fillStyle = CHART_COLORS.axisText;
    ctx.font = '10px sans-serif';
    for (let g = 0; g <= 4; g++) {
      const c = (maxC * g) / 4;
      const y = Y(c);
      ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(M.l + plotW, y); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(c)), M.l - 4, y + 3);
      ctx.textAlign = 'left';
      ctx.fillText(`${g * 25}%`, M.l + plotW + 4, y + 3);
    }
    ctx.strokeStyle = CHART_COLORS.axisLine;
    ctx.strokeRect(M.l + 0.5, M.t + 0.5, plotW - 1, plotH - 1);
    ctx.fillStyle = CHART_COLORS.axisLabel;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(xLabel, M.l + plotW / 2, size.h - 6);

    // x ticks on bin edges (about 6)
    ctx.fillStyle = CHART_COLORS.axisText;
    ctx.font = '10px sans-serif';
    const step = Math.max(1, Math.round((edges.length - 1) / 6));
    for (let b = 0; b < edges.length; b += step) {
      const x = X(edges[b]);
      ctx.textAlign = 'center';
      ctx.fillText(String(Number(edges[b].toPrecision(3))), x, M.t + plotH + 13);
    }

    // primary bars, then overlay outlines
    series.forEach((s, si) => {
      const { counts } = s.hist;
      const e = s.hist.edges;
      if (si === 0 && !s.outline) {
        ctx.fillStyle = `${s.color}66`;
        ctx.strokeStyle = s.color;
        for (let b = 0; b < counts.length; b++) {
          if (!counts[b]) continue;
          const x0 = X(e[b]);
          const x1 = X(e[b + 1]);
          const y = Y(counts[b]);
          ctx.fillRect(x0, y, Math.max(1, x1 - x0 - 1), M.t + plotH - y);
        }
      } else {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 1.4;
        if (s.dash) ctx.setLineDash(s.dash);
        ctx.beginPath();
        for (let b = 0; b < counts.length; b++) {
          const x0 = X(e[b]);
          const x1 = X(e[b + 1]);
          const y = Y(counts[b]);
          if (b === 0) ctx.moveTo(x0, M.t + plotH);
          ctx.lineTo(x0, y);
          ctx.lineTo(x1, y);
        }
        ctx.lineTo(X(e[counts.length]), M.t + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
      }
    });

    // cumulative curve (right axis)
    if (cumulative) {
      ctx.strokeStyle = '#0f766e';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let b = 0; b < cumulative.length; b++) {
        const x = X(edges[b + 1]);
        const y = M.t + plotH - cumulative[b] * plotH;
        if (b === 0) ctx.moveTo(X(edges[0]), M.t + plotH);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // percentile markers
    ctx.fillStyle = CHART_COLORS.axisText;
    ctx.font = '9px sans-serif';
    for (const pm of percentiles) {
      if (!Number.isFinite(pm.value)) continue;
      const x = X(pm.value);
      ctx.strokeStyle = 'rgba(100,116,139,0.6)';
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x, M.t); ctx.lineTo(x, M.t + plotH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'center';
      ctx.fillText(`P${pm.p}`, x, M.t + 9);
    }

    // threshold lines (drag preview wins over the committed value)
    for (const th of thresholds) {
      const value = drag?.key === th.key ? drag.value : th.value;
      if (!Number.isFinite(value)) continue;
      const x = X(value);
      ctx.strokeStyle = th.color;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x, M.t); ctx.lineTo(x, M.t + plotH); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = th.color;
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${th.label} ${Number(value.toPrecision(3))}`, x + 3, M.t + plotH - 4);
    }

    // series legend
    ctx.font = '10px sans-serif';
    let lx = M.l + 6;
    for (const s of series) {
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, M.t + 4, 8, 8);
      ctx.fillStyle = CHART_COLORS.axisText;
      ctx.textAlign = 'left';
      const label = `${s.name} (${s.hist.n})`;
      ctx.fillText(label, lx + 11, M.t + 11);
      lx += 20 + ctx.measureText(label).width;
    }
  }, [size, series, cumulative, log, xLabel, thresholds, percentiles, drag, X, plotW, plotH, edges, prim]);

  const thresholdAt = (px) => {
    let best = null;
    for (const th of thresholds) {
      if (!Number.isFinite(th.value)) continue;
      const d = Math.abs(X(th.value) - px);
      if (d <= GRAB_PX && (!best || d < best.d)) best = { th, d };
    }
    return best?.th || null;
  };

  const onPointerMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (drag) {
      const v = Math.min(edges[edges.length - 1], Math.max(edges[0], invX(px)));
      setDrag({ ...drag, value: v });
      return;
    }
    canvasRef.current.style.cursor = thresholdAt(px) ? 'col-resize' : 'default';
    if (px >= M.l && px <= M.l + plotW && prim) {
      const v = invX(px);
      setHover({ px, value: v });
    } else setHover(null);
  };

  const onPointerDown = (e) => {
    if (!onThresholdChange) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const th = thresholdAt(e.clientX - rect.left);
    if (!th) return;
    setDrag({ key: th.key, value: th.value });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerUp = (e) => {
    if (!drag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    onThresholdChange(drag.key, Number(drag.value.toPrecision(4)));
    setDrag(null);
  };

  return (
    <div ref={wrapRef} className="h-full min-h-0 w-full relative overflow-hidden bg-white">
      <canvas
        ref={canvasRef}
        data-testid="petro-histogram-canvas"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { setHover(null); }}
      />
      {hover && !drag && (
        <div
          className="absolute pointer-events-none rounded border border-slate-300 bg-white/95 px-1.5 py-0.5 text-[10px] text-slate-600 shadow"
          style={{ left: Math.min(hover.px + 8, Math.max(0, size.w - 90)), top: M.t + 18 }}
        >
          {Number(hover.value.toPrecision(4))}
        </div>
      )}
      <ChartLogo />
    </div>
  );
}
