// Template view of a well's logs (Geoscience video Part B, 2026-10-17):
// the shared track painter (the same primitives as Petrophysics Studio and
// the Well Correlation section) on one canvas: depth axis, track headers,
// fills, curves and the well's tops. Wheel zooms about the cursor, drag
// pans, double-click shows the window again. White chart paper, like the
// quick view it sits beside.

import React, { useEffect, useRef, useState } from 'react';
import { trackGeometry } from '@/components/wells/trackRender';
import { PALETTES, visibleRange, paintDepthAxis, paintTrackColumn, paintTopMarker } from '@/components/wells/trackPainter';
import { topColor } from '@/components/wells/topColors';
import { unitText } from '../engine/displayUnits';

const AXIS_W = 56;
const HEADER_H = 50;
const TRACK_W = 150;

/**
 * @param {Object} p
 * @param {ArrayLike<number>} p.depth MD metres, ascending
 * @param {Array} p.tracks resolved template tracks (resolveTracks)
 * @param {Array} [p.tops] geo_wells_tops rows (md_m)
 * @param {{top: number, base: number}} p.window depth window, metres
 * @param {'m'|'ft'} [p.unit] display unit
 * @param {string} [p.templateId]
 */
export default function TemplateTracks({ depth, tracks, tops = [], window: win, unit = 'm', templateId = '', height = 560 }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [view, setView] = useState(win);
  const drag = useRef(null);
  useEffect(() => { setView(win); }, [win?.top, win?.base]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !view) return;
    const avail = wrapRef.current?.clientWidth || 0;
    const want = AXIS_W + Math.max(1, tracks.length) * TRACK_W;
    const cssW = Math.max(want, Math.min(avail, AXIS_W + Math.max(1, tracks.length) * 230));
    const cssH = height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const F = unit === 'ft' ? 1 / 0.3048 : 1;
    canvas.dataset.depthTop = String(view.top);
    canvas.dataset.depthBottom = String(view.base);
    canvas.dataset.axisUnit = unitText(unit);
    canvas.dataset.depthAxis = 'md';
    canvas.dataset.template = templateId;
    canvas.dataset.tracks = String(tracks.length);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const P = PALETTES.light;
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, cssW, cssH);
    const plotTop = HEADER_H;
    const plotH = cssH - plotTop - 6;
    const yOf = (d) => plotTop + ((d - view.top) / ((view.base - view.top) || 1)) * plotH;
    paintDepthAxis(ctx, { axisW: AXIS_W, plotTop, plotH, plotRight: cssW, vTop: view.top, vBase: view.base, yOf, F, title: `MD (${unitText(unit)})`, palette: P });
    const geom = trackGeometry(tracks, cssW, AXIS_W);
    const { i0, i1 } = visibleRange(depth, view.top, view.base);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, plotTop, cssW, plotH); ctx.rect(0, 0, cssW, HEADER_H); ctx.clip();
    paintTrackColumn(ctx, { tracks, geom, depth, yOf, i0, i1, headerH: HEADER_H, plotTop, plotH, palette: P });
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(0, plotTop, cssW, plotH); ctx.clip();
    for (const t of tops || []) {
      if (!Number.isFinite(t.md_m) || t.md_m < view.top || t.md_m > view.base) continue;
      paintTopMarker(ctx, { name: t.name, color: topColor(t.name), y: yOf(t.md_m), xLeft: AXIS_W, xRight: cssW - 1, tagMax: 160 });
    }
    ctx.restore();
  }, [depth, tracks, tops, view, unit, templateId, height]);

  const onWheel = (e) => {
    if (!view) return;
    const r = canvasRef.current.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientY - r.top - HEADER_H) / (r.height - HEADER_H)));
    const at = view.top + f * (view.base - view.top);
    const k = e.deltaY > 0 ? 1.2 : 1 / 1.2;
    const span = Math.max(3, (view.base - view.top) * k);
    setView({ top: at - f * span, base: at - f * span + span });
  };
  const onDown = (e) => { drag.current = { y: e.clientY, view }; };
  const onMove = (e) => {
    if (!drag.current) return;
    const r = canvasRef.current.getBoundingClientRect();
    const span = drag.current.view.base - drag.current.view.top;
    const dd = ((e.clientY - drag.current.y) / Math.max(1, r.height - HEADER_H)) * span;
    setView({ top: drag.current.view.top - dd, base: drag.current.view.base - dd });
  };
  const onUp = () => { drag.current = null; };

  return (
    <div ref={wrapRef} className="overflow-x-auto" data-canvas="chart">
      <canvas
        ref={canvasRef}
        data-testid="wdm-log-tracks"
        className="rounded border border-slate-300 bg-white cursor-grab"
        onWheel={onWheel}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        onDoubleClick={() => setView(win)}
      />
    </div>
  );
}
