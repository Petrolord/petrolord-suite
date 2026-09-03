// Multi-well field columns (Petrophysics Studio PS9, audit C1): one
// compact track column per selected well on a shared displayed-depth
// axis, structural or flattened on a chosen top (wellcorrelation
// engine shifts — wells lacking the datum top draw unflattened and
// say so, never silently mis-hung). Two stacked canvases: the STATIC
// layer holds grid, curves and tops; the OVERLAY layer redraws only
// the crosshair on pointer moves — the layering that keeps 8 wells
// cheap (the Seismolord annotations pattern).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { drawCurve } from '../viewer/trackRender';
import { displayedDepth } from '../engine/section';
import { zoomAbout, panBy } from '@/components/wells/depthNavMath';

// Light palette (Suite chart standard, src/utils/chartTheme.js): white
// plot with slate grid and axes, so tracks read like a printed log.
const BG = '#ffffff';
const HEADER_BG = '#f1f5f9';           // slate-100
const FRAME = 'rgba(148,163,184,0.9)'; // slate-400
const GRID = 'rgba(203,213,225,0.9)';  // slate-300
const AXIS_TEXT = '#475569';           // slate-600
const TEXT = '#1e293b';                // slate-800
const TEXT_STRONG = '#0f172a';         // slate-900
const CROSSHAIR = 'rgba(71,85,105,0.7)';
const TOP_LINE = '#d97706';            // amber-600
const TOP_TEXT = '#b45309';            // amber-700
const AXIS_W = 56;
const HEADER_H = 34;
const PAD_TOP = 2;

/**
 * @param {Object} p
 * @param {Array<{id, name, curves, tracks, tops, shift, hasDatumTop}>} p.wells
 *   tracks = resolved TrackViewer-shape tracks per well; shift from
 *   computeFlattening (null draws unflattened)
 */
export default function MultiWellTracks({ wells, view: viewProp, onViewChange }) {
  const wrapRef = useRef(null);
  const staticRef = useRef(null);
  const overlayRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // [top, base] displayed depth or null = full; controlled when the parent
  // passes `view` (PT0), otherwise owned here as before
  const [viewState, setViewState] = useState(null);
  const controlled = viewProp !== undefined;
  const view = controlled ? viewProp : viewState;
  const setView = useCallback((next) => {
    if (!controlled) setViewState(next);
    if (onViewChange) onViewChange(next);
  }, [controlled, onViewChange]);
  const dragRef = useRef(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // displayed-depth extent across all wells
  let dMin = Infinity;
  let dMax = -Infinity;
  for (const w of wells) {
    const depth = w.curves.DEPT;
    if (!depth?.length) continue;
    const s = w.shift || 0;
    if (depth[0] + s < dMin) dMin = depth[0] + s;
    if (depth[depth.length - 1] + s > dMax) dMax = depth[depth.length - 1] + s;
  }
  if (!Number.isFinite(dMin)) { dMin = 0; dMax = 1; }
  const [vTop, vBase] = view || [dMin, dMax];

  useEffect(() => { setView(null); }, [wells.map((w) => w.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const plotTop = HEADER_H + PAD_TOP;
  const plotH = Math.max(10, size.h - plotTop - 4);
  const yOf = useCallback(
    (d) => plotTop + ((d - vTop) / (vBase - vTop || 1)) * plotH,
    [plotTop, plotH, vTop, vBase],
  );
  const dOf = (y) => vTop + ((y - plotTop) / plotH) * (vBase - vTop);

  // STATIC layer: grid + columns + curves + tops
  useEffect(() => {
    const canvas = staticRef.current;
    if (!canvas || !size.w || !size.h || !wells.length) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, size.w, size.h);

    // depth axis
    ctx.strokeStyle = GRID;
    ctx.fillStyle = AXIS_TEXT;
    ctx.font = '10px sans-serif';
    const span = vBase - vTop;
    const step = 10 ** Math.floor(Math.log10(span / 6));
    const grid = span / step >= 30 ? step * 5 : span / step >= 12 ? step * 2 : step;
    for (let d = Math.ceil(vTop / grid) * grid; d <= vBase; d += grid) {
      const y = yOf(d);
      ctx.beginPath(); ctx.moveTo(AXIS_W, y); ctx.lineTo(size.w, y); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(d)), AXIS_W - 4, y + 3);
    }
    ctx.save();
    ctx.translate(10, plotTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Displayed depth (m)', 0, 0);
    ctx.restore();

    const colW = (size.w - AXIS_W) / wells.length;
    wells.forEach((well, wi) => {
      const cx0 = AXIS_W + wi * colW;
      // column header
      ctx.fillStyle = HEADER_BG;
      ctx.fillRect(cx0, 0, colW, HEADER_H);
      ctx.strokeStyle = FRAME;
      ctx.strokeRect(cx0 + 0.5, 0.5, colW - 1, HEADER_H - 1);
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = TEXT;
      ctx.textAlign = 'center';
      ctx.fillText(well.name, cx0 + colW / 2, 13, colW - 8);
      if (well.shift === null) {
        ctx.font = '9px sans-serif';
        ctx.fillStyle = TOP_TEXT;
        ctx.fillText('no datum top — unflattened', cx0 + colW / 2, 26, colW - 8);
      }

      const depth = well.curves.DEPT;
      if (!depth?.length || !well.tracks.length) return;
      const s = well.shift || 0;
      const yOfWell = (md) => yOf(displayedDepth(md, s));
      // visible sample range in this well's MD
      let i0 = 0;
      while (i0 < depth.length - 1 && depth[i0] + s < vTop) i0++;
      let i1 = depth.length - 1;
      while (i1 > 0 && depth[i1] + s > vBase) i1--;
      i0 = Math.max(0, i0 - 1);
      i1 = Math.min(depth.length - 1, i1 + 1);
      if (i1 <= i0) return;

      const totalRatio = well.tracks.reduce((acc, t) => acc + (t.width || 1), 0) || 1;
      let tx = cx0;
      for (const track of well.tracks) {
        const tw = ((track.width || 1) / totalRatio) * colW;
        ctx.strokeStyle = FRAME;
        ctx.strokeRect(tx + 0.5, plotTop + 0.5, tw - 1, plotH - 1);
        // tiny track label
        ctx.font = '9px sans-serif';
        ctx.fillStyle = AXIS_TEXT;
        ctx.textAlign = 'center';
        ctx.fillText(track.title, tx + tw / 2, plotTop + 9, tw - 4);
        for (const curve of track.curves) {
          drawCurve(ctx, {
            track, curve, depth, yOf: yOfWell, i0, i1, x0: tx, trackW: tw, plotH,
          });
        }
        tx += tw;
      }

      // tops markers within this column
      for (const t of well.tops || []) {
        const dd = displayedDepth(t.md_m, s);
        if (dd < vTop || dd > vBase) continue;
        const y = yOf(dd);
        ctx.strokeStyle = TOP_LINE;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(cx0, y); ctx.lineTo(cx0 + colW, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = TOP_TEXT;
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(t.name, cx0 + 3, y - 2, colW - 6);
      }
    });
  }, [size, wells, vTop, vBase, yOf, plotTop, plotH]);

  // OVERLAY layer: crosshair only — cheap on every pointer move
  const drawOverlay = useCallback((cursorY) => {
    const canvas = overlayRef.current;
    if (!canvas || !size.w || !size.h) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (cursorY === null || cursorY < plotTop || cursorY > plotTop + plotH) return;
    ctx.strokeStyle = CROSSHAIR;
    ctx.beginPath(); ctx.moveTo(AXIS_W, cursorY); ctx.lineTo(size.w, cursorY); ctx.stroke();
    ctx.fillStyle = TEXT_STRONG;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(dOf(cursorY).toFixed(1), AXIS_W - 4, cursorY - 4);
  }, [size, plotTop, plotH, vTop, vBase]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerMove = (e) => {
    const rect = overlayRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (dragRef.current) {
      const dd = dOf(dragRef.current.y) - dOf(y);
      setView(panBy(dragRef.current.view, dd, [dMin, dMax]));
      return;
    }
    drawOverlay(y);
  };

  const onWheel = (e) => {
    e.preventDefault();
    const rect = overlayRef.current.getBoundingClientRect();
    const d = dOf(e.clientY - rect.top);
    const factor = e.deltaY > 0 ? 1.25 : 0.8;
    const next = zoomAbout([vTop, vBase], d, factor, [dMin, dMax]);
    if (next !== null && next[0] === vTop && next[1] === vBase) return;
    setView(next);
  };

  return (
    <div ref={wrapRef} className="h-full min-h-0 w-full relative overflow-hidden" data-testid="petro-field-tracks">
      <canvas ref={staticRef} className="absolute inset-0" />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 cursor-crosshair"
        data-testid="petro-field-canvas"
        onPointerMove={onPointerMove}
        onPointerDown={(e) => {
          dragRef.current = { y: e.clientY - overlayRef.current.getBoundingClientRect().top, view: [vTop, vBase] };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => { dragRef.current = null; e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerLeave={() => drawOverlay(null)}
        onWheel={onWheel}
        onDoubleClick={() => setView(null)}
      />
      <span className="absolute bottom-1 right-2 text-[10px] text-slate-600 pointer-events-none">
        wheel: zoom · drag: pan · double-click: full extent
      </span>
    </div>
  );
}
