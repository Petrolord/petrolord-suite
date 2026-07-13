// The cross-section viewport (Well Correlation G3.2): a log-track
// column per well, correlation lines connecting same-named tops across
// wells, zone fills between two correlated tops, draggable top markers,
// and datum flattening. Canvas, fill-height, dark workstation viewport
// (a viewport, not an analytic chart). Geometry comes from
// engine/section.js; this owns only the depth window, cursor, and the
// in-progress top drag.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  computeFlattening, displayedDepth, correlationPolyline, zoneSpan,
  displayedRange, depthToY, allTopNames,
} from '../engine/section';

const AXIS_W = 52;
const HEADER_H = 34;
const HANDLE_R = 5;            // top-marker grab handle radius
const GR_MIN = 0;
const GR_MAX = 150;
const TOP_COLORS = ['#22d3ee', '#fbbf24', '#34d399', '#f472b6', '#a78bfa', '#f87171', '#38bdf8'];

/**
 * @param {Object} p
 * @param {Array<{id,name,is_own,tops:Array,depth:Float64Array,gr:Float64Array}>} p.wells (in section order)
 * @param {{mode,topName?,datumM?}} p.datum
 * @param {string[]} p.shownTops correlation lines to draw
 * @param {?[string,string]} p.zonePair [topName, baseName] fill, or null
 * @param {(top: Object, newMdM: number) => void} p.onTopDrag  own-well only
 */
export default function CrossSection({ wells, datum, shownTops, zonePair, onTopDrag }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(null); // [dispTop, dispBase] | null = auto
  const dragRef = useRef(null);           // {top, wellIndex} | {pan:true,...}
  const [drag, setDrag] = useState(null); // preview {topId, displayed}

  const flattening = useMemo(() => computeFlattening(wells, datum), [wells, datum]);
  const shiftOf = useCallback(
    (id) => flattening.find((f) => f.id === id)?.shift ?? null,
    [flattening],
  );

  const autoRange = useMemo(() => {
    const logRanges = {};
    for (const w of wells) if (w.depth?.length) logRanges[w.id] = [w.depth[0], w.depth[w.depth.length - 1]];
    return displayedRange(wells, flattening, logRanges) || [0, 1];
  }, [wells, flattening]);
  const [vTop, vBase] = view || autoRange;
  useEffect(() => { setView(null); }, [datum]); // refit when the datum changes

  const topNames = useMemo(() => allTopNames(wells), [wells]);
  const colorOf = (name) => TOP_COLORS[topNames.indexOf(name) % TOP_COLORS.length];

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const plotTop = HEADER_H;
  const plotH = Math.max(10, size.h - plotTop - 6);
  const plotLeft = AXIS_W;
  const plotW = Math.max(10, size.w - AXIS_W);
  const colW = plotW / Math.max(1, wells.length);
  const yOf = useCallback((disp) => depthToY(disp, vTop, vBase, plotTop, plotH), [vTop, vBase, plotTop, plotH]);
  const dispToMd = (disp, id) => disp - (shiftOf(id) || 0);
  const yToDisp = (y) => vTop + ((y - plotTop) / plotH) * (vBase - vTop);

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
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, size.w, size.h);

    // zone fills (under everything)
    if (zonePair) {
      wells.forEach((w, i) => {
        const span = zoneSpan(w, shiftOf(w.id), zonePair[0], zonePair[1]);
        if (!span) return;
        const x0 = plotLeft + i * colW;
        ctx.fillStyle = 'rgba(52,211,153,0.10)';
        ctx.fillRect(x0, yOf(span.top), colW, yOf(span.base) - yOf(span.top));
      });
    }

    // depth axis
    ctx.strokeStyle = 'rgba(51,65,85,0.5)';
    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    const span = vBase - vTop;
    const stepBase = 10 ** Math.floor(Math.log10(span / 6));
    const grid = span / stepBase >= 5 ? 5 * stepBase : span / stepBase >= 2 ? 2 * stepBase : stepBase;
    for (let d = Math.ceil(vTop / grid) * grid; d <= vBase; d += grid) {
      const y = yOf(d);
      ctx.beginPath(); ctx.moveTo(AXIS_W, y); ctx.lineTo(size.w, y); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(d)), AXIS_W - 4, y + 3);
    }
    ctx.save();
    ctx.translate(11, plotTop + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(datum.mode === 'flatten' ? `flattened depth (m)` : 'MD (m)', 0, 0);
    ctx.restore();

    // datum line
    if (datum.mode === 'flatten' && Number.isFinite(datum.datumM)) {
      const y = yOf(datum.datumM);
      ctx.strokeStyle = 'rgba(226,232,240,0.5)';
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(AXIS_W, y); ctx.lineTo(size.w, y); ctx.stroke();
      ctx.setLineDash([]);
    }

    // well columns: header + GR track
    wells.forEach((w, i) => {
      const x0 = plotLeft + i * colW;
      const f = flattening.find((x) => x.id === w.id);
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(x0, 0, colW, HEADER_H);
      ctx.strokeStyle = 'rgba(51,65,85,0.9)';
      ctx.strokeRect(x0 + 0.5, 0.5, colW - 1, HEADER_H - 1);
      ctx.strokeRect(x0 + 0.5, plotTop + 0.5, colW - 1, plotH - 1);
      ctx.fillStyle = w.is_own ? '#cbd5e1' : '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${w.name}${w.is_own ? '' : ' (shared)'}`, x0 + colW / 2, 14);
      if (datum.mode === 'flatten' && !f.hasDatumTop) {
        ctx.fillStyle = '#f59e0b';
        ctx.font = '9px sans-serif';
        ctx.fillText('no datum top — true depth', x0 + colW / 2, 26);
      }

      // GR curve
      if (w.gr?.length && w.depth?.length) {
        const shift = f.shift;
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 1;
        ctx.beginPath();
        let pen = false;
        const pad = 5;
        for (let k = 0; k < w.gr.length; k++) {
          const v = w.gr[k];
          if (!Number.isFinite(v)) { pen = false; continue; }
          const disp = displayedDepth(w.depth[k], shift);
          if (disp < vTop - 5 || disp > vBase + 5) { pen = false; continue; }
          const x = x0 + pad + ((Math.min(GR_MAX, Math.max(GR_MIN, v)) - GR_MIN) / (GR_MAX - GR_MIN)) * (colW - 2 * pad);
          const y = yOf(disp);
          if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
        }
        ctx.stroke();
      }
    });

    // correlation lines + top markers
    for (const name of shownTops) {
      const line = correlationPolyline(wells, flattening, name);
      const color = colorOf(name);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      line.forEach((pt, idx) => {
        const cx = plotLeft + pt.wellIndex * colW + colW / 2;
        const y = yOf(pt.displayed);
        if (idx) ctx.lineTo(cx, y); else ctx.moveTo(cx, y);
      });
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // top markers per well (draggable handles for own wells)
    wells.forEach((w, i) => {
      const x0 = plotLeft + i * colW;
      const shift = flattening.find((x) => x.id === w.id).shift;
      for (const t of w.tops) {
        if (!shownTops.includes(t.name)) continue;
        const isDragging = drag && drag.topId === t.id;
        const disp = isDragging ? drag.displayed : displayedDepth(t.md_m, shift);
        if (disp < vTop || disp > vBase) continue;
        const y = yOf(disp);
        const color = colorOf(t.name);
        ctx.strokeStyle = color;
        ctx.beginPath(); ctx.moveTo(x0 + 2, y); ctx.lineTo(x0 + colW - 2, y); ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${t.name} ${Math.round(dispToMd(disp, w.id))}`, x0 + 4, y - 2);
        if (w.is_own) { // grab handle
          ctx.beginPath(); ctx.arc(x0 + colW - 8, y, HANDLE_R, 0, Math.PI * 2); ctx.fill();
        }
      }
    });
  }, [size, wells, flattening, datum, shownTops, zonePair, drag, vTop, vBase, colW, plotLeft, plotW, plotH, plotTop, yOf, colorOf, dispToMd, shiftOf]);

  const hitTop = (x, y) => {
    for (let i = 0; i < wells.length; i++) {
      const w = wells[i];
      if (!w.is_own) continue;
      const x0 = plotLeft + i * colW;
      const shift = flattening.find((f) => f.id === w.id).shift;
      const hx = x0 + colW - 8;
      if (Math.abs(x - hx) > HANDLE_R + 4) continue;
      for (const t of w.tops) {
        if (!shownTops.includes(t.name)) continue;
        const ty = yOf(displayedDepth(t.md_m, shift));
        if (Math.abs(y - ty) <= HANDLE_R + 4) return { top: t, wellId: w.id };
      }
    }
    return null;
  };

  const onDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = hitTop(x, y);
    if (hit) {
      dragRef.current = { kind: 'top', ...hit };
      setDrag({ topId: hit.top.id, displayed: displayedDepth(hit.top.md_m, shiftOf(hit.wellId)) });
    } else if (x > plotLeft && y > plotTop) {
      dragRef.current = { kind: 'pan', startY: y, view: [vTop, vBase] };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMove = (e) => {
    if (!dragRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (dragRef.current.kind === 'top') {
      setDrag({ topId: dragRef.current.top.id, displayed: yToDisp(y) });
    } else {
      const [t0, b0] = dragRef.current.view;
      const dd = yToDisp(dragRef.current.startY) - yToDisp(y);
      setView([t0 + dd, b0 + dd]);
    }
  };

  const onUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (d?.kind === 'top' && drag) {
      const newMd = dispToMd(drag.displayed, d.wellId);
      setDrag(null);
      if (Number.isFinite(newMd)) onTopDrag(d.top, Math.round(newMd * 100) / 100);
    } else {
      setDrag(null);
    }
  };

  const onWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const d = yToDisp(e.clientY - rect.top);
    const factor = e.deltaY > 0 ? 1.25 : 0.8;
    const nt = d - (d - vTop) * factor;
    const nb = d + (vBase - d) * factor;
    if (nb - nt < 2) return;
    setView([nt, nb]);
  };

  return (
    <div ref={wrapRef} className="h-full min-h-0 w-full relative overflow-hidden" data-testid="corr-section">
      <canvas
        ref={canvasRef}
        data-testid="corr-section-canvas"
        className="cursor-crosshair touch-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onDoubleClick={() => setView(null)}
        onWheel={onWheel}
      />
      <span className="absolute bottom-1 right-2 text-[10px] text-slate-600 pointer-events-none">
        drag a handle to move a top · drag background to pan · wheel zoom · double-click fit
      </span>
    </div>
  );
}
