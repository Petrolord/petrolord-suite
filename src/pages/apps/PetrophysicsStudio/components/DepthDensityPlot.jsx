// Curve-versus-depth density image (Petrophysics Studio PT10b). ANALYTIC
// chart on the suite chartTheme (white ground, ChartLogo watermark), the
// same family as Crossplot.jsx, but a binned image rather than a scatter:
// each populated cell of viewer/depthDensity.js's grid is painted through
// the jet colour map (dark blue at 0 through cyan, green and yellow to red
// at 1), X ticks on top AND bottom, depth ticks left AND right, shallow at
// the top, a horizontal "Data density" colourbar underneath, and a second
// well's populated-region outline on the same bin edges. Hover reads the
// cell: X range, depth range, density, count.
//
// Default column: tall and narrow (plot width capped near 360 px and
// centred, height filling the panel); `wide` releases the cap.

import React, { useEffect, useRef, useState } from 'react';
import { CHART_COLORS } from '@/utils/chartTheme';
import { COLOR_MAPS } from '@/utils/colorMaps';
import ChartLogo from '@/components/charts/ChartLogo';
import { toDisplay, fromDisplay } from '@/components/wells/depthModes';
import { makeScale, ticksFor, fmtTick } from './crossplotScales';
import { binOf } from '../viewer/depthDensity';

const M = { l: 56, r: 56, t: 50, b: 74 };
const CAP_W = 360;
const OUTLINE = '#0f172a';

const jetFn = COLOR_MAPS.jet.fn;
export const jetCss = (t) => {
  const [r, g, b] = jetFn(Math.min(1, Math.max(0, t)));
  return `rgb(${r},${g},${b})`;
};

/**
 * @param {Object} p
 * @param {Object} p.grid depthDensityGrid result (metres in the reference)
 * @param {?Object} [p.overlay] a second grid on the SAME edges
 * @param {Array} [p.overlayOutline] envelopeOutline(overlay)
 * @param {string} [p.overlayName]
 * @param {string} p.wellName first title line
 * @param {string} p.curveLabel e.g. "PHIE (v/v)"
 * @param {string} p.refTitle e.g. "TVD (m)"
 * @param {'m'|'ft'} [p.unit] display unit for the depth axis
 * @param {boolean} [p.wide] release the width cap
 */
export default function DepthDensityPlot({
  grid, overlay = null, overlayOutline = [], overlayName = '', wellName = 'Well', curveLabel = '', refTitle = 'MD (m)', unit = 'm', wide = false,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tooltip, setTooltip] = useState(null);
  const geomRef = useRef(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const empty = !grid || !grid.xBins || !grid.depthBins;
  const xDomain = empty ? [0, 1] : [grid.xEdges[0], grid.xEdges[grid.xBins]];
  const dDomain = empty ? [0, 1] : [grid.depthEdges[0], grid.depthEdges[grid.depthBins]];
  const log = !!grid?.log;

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

    const avail = Math.max(10, size.w - M.l - M.r);
    const plotW = wide ? avail : Math.min(CAP_W, avail);
    const x0 = M.l + (avail - plotW) / 2;
    const plotH = Math.max(10, size.h - M.t - M.b);
    const y0 = M.t;
    const xS = makeScale(xDomain, plotW, log, false);
    const dS = makeScale(dDomain, plotH, false, false); // shallow at the top: depth grows down the canvas
    geomRef.current = { x0, y0, plotW, plotH, xS, dS };
    const X = (v) => x0 + xS.fwd(v);
    const Y = (d) => y0 + dS.fwd(d);

    // title: well over "{curve} vs {ref} cross-plot"
    ctx.fillStyle = CHART_COLORS.axisLabel;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(wellName, x0 + plotW / 2, 14);
    ctx.font = '11px sans-serif';
    ctx.fillStyle = CHART_COLORS.axisText;
    const outlineNote = overlay && overlayOutline?.length ? ` · outline: ${overlayName}` : '';
    ctx.fillText(`${curveLabel} vs ${refTitle.replace(/ \(.*\)$/, '')} cross-plot${outlineNote}`, x0 + plotW / 2, 28);

    // light grey grid first, so the density cells sit on top of it
    const xTicks = ticksFor(xDomain, log).filter((v) => { const x = X(v); return x >= x0 - 0.5 && x <= x0 + plotW + 0.5; });
    const dispDomain = [toDisplay(dDomain[0], unit), toDisplay(dDomain[1], unit)];
    const dTicks = ticksFor(dispDomain, false).filter((dv) => { const y = Y(fromDisplay(dv, unit)); return y >= y0 - 0.5 && y <= y0 + plotH + 0.5; });
    ctx.strokeStyle = CHART_COLORS.grid;
    for (const v of xTicks) { const x = X(v); ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + plotH); ctx.stroke(); }
    for (const dv of dTicks) { const y = Y(fromDisplay(dv, unit)); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + plotW, y); ctx.stroke(); }

    // cells
    if (!empty) {
      const { xEdges, depthEdges, xBins, depthBins, density } = grid;
      for (let di = 0; di < depthBins; di++) {
        const ya = Y(depthEdges[di]);
        const yb = Y(depthEdges[di + 1]);
        for (let xi = 0; xi < xBins; xi++) {
          const t = density[di * xBins + xi];
          if (!(t > 0)) continue;
          const xa = X(xEdges[xi]);
          const xb = X(xEdges[xi + 1]);
          ctx.fillStyle = jetCss(t);
          ctx.fillRect(xa, ya, Math.max(0.6, xb - xa + 0.4), Math.max(0.6, yb - ya + 0.4));
        }
      }
    }

    // tick labels: X on top and bottom, depth on left and right (display unit)
    ctx.fillStyle = CHART_COLORS.axisText;
    ctx.font = '10px sans-serif';
    for (const v of xTicks) {
      const x = X(v);
      ctx.textAlign = 'center';
      ctx.fillText(fmtTick(v), x, y0 - 5);
      ctx.fillText(fmtTick(v), x, y0 + plotH + 13);
    }
    for (const dv of dTicks) {
      const y = Y(fromDisplay(dv, unit));
      ctx.textAlign = 'right';
      ctx.fillText(fmtTick(dv), x0 - 5, y + 3);
      ctx.textAlign = 'left';
      ctx.fillText(fmtTick(dv), x0 + plotW + 5, y + 3);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = CHART_COLORS.axisLine;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW - 1, plotH - 1);

    // overlay well: outline of its populated region on the same edges
    if (overlay && overlayOutline?.length) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, plotW, plotH);
      ctx.clip();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const s of overlayOutline) {
        ctx.moveTo(X(s.x0), Y(s.d0));
        ctx.lineTo(X(s.x1), Y(s.d1));
      }
      ctx.stroke();
      ctx.restore();
      ctx.lineWidth = 1;
    }

    // axis titles
    ctx.fillStyle = CHART_COLORS.axisLabel;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(curveLabel, x0 + plotW / 2, y0 + plotH + 27);
    ctx.save();
    ctx.translate(14, y0 + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(refTitle, 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(size.w - 12, y0 + plotH / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(refTitle, 0, 0);
    ctx.restore();

    // horizontal colourbar beneath the plot
    const cbY = y0 + plotH + 36;
    const cbH = 8;
    for (let i = 0; i < plotW; i++) {
      ctx.fillStyle = jetCss(i / Math.max(1, plotW - 1));
      ctx.fillRect(x0 + i, cbY, 1.5, cbH);
    }
    ctx.strokeStyle = CHART_COLORS.axisLine;
    ctx.strokeRect(x0 + 0.5, cbY + 0.5, plotW - 1, cbH - 1);
    ctx.fillStyle = CHART_COLORS.axisText;
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('0', x0, cbY + cbH + 10);
    ctx.textAlign = 'right';
    ctx.fillText('1', x0 + plotW, cbY + cbH + 10);
    ctx.textAlign = 'center';
    ctx.fillText('Data density', x0 + plotW / 2, cbY + cbH + 10);
  }, [grid, overlay, overlayOutline, overlayName, size, wellName, curveLabel, refTitle, unit, wide, empty, log, xDomain[0], xDomain[1], dDomain[0], dDomain[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerMove = (e) => {
    const g = geomRef.current;
    if (!g || empty) { setTooltip(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const xv = g.xS.inv(px - g.x0);
    const dv = g.dS.inv(py - g.y0);
    const xi = binOf(grid.xEdges, xv);
    const di = binOf(grid.depthEdges, dv);
    if (xi < 0 || di < 0) { setTooltip(null); return; }
    const c = grid.counts[di * grid.xBins + xi];
    const u = unit === 'ft' ? 'ft' : 'm';
    const lines = [
      `${curveLabel}: ${fmtTick(grid.xEdges[xi])} to ${fmtTick(grid.xEdges[xi + 1])}`,
      `${refTitle.replace(/ \(.*\)$/, '')}: ${toDisplay(grid.depthEdges[di], unit).toFixed(1)} to ${toDisplay(grid.depthEdges[di + 1], unit).toFixed(1)} ${u}`,
      `density ${(grid.density[di * grid.xBins + xi]).toFixed(2)} · ${c} sample${c === 1 ? '' : 's'}`,
    ];
    if (overlay) {
      const oc = overlay.counts[di * overlay.xBins + xi] || 0;
      lines.push(`${overlayName}: ${oc} sample${oc === 1 ? '' : 's'}`);
    }
    setTooltip({ px, py, lines });
  };

  return (
    <div ref={wrapRef} className="relative h-full w-full min-h-0" data-testid="petro-density-wrap">
      <canvas
        ref={canvasRef}
        data-testid="petro-density-canvas"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setTooltip(null)}
      />
      {tooltip && (
        <div
          data-testid="petro-density-tooltip"
          className="absolute pointer-events-none rounded border border-slate-300 bg-white/95 px-2 py-1 text-[10px] text-slate-700 shadow"
          style={{ left: Math.min(tooltip.px + 10, Math.max(0, size.w - 180)), top: Math.max(0, tooltip.py - 10 - tooltip.lines.length * 13) }}
        >
          {tooltip.lines.map((l) => <div key={l}>{l}</div>)}
        </div>
      )}
      <ChartLogo />
    </div>
  );
}
