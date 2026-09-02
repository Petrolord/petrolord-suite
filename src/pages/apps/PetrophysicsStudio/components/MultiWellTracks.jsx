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

const AXIS_W = 56;
const HEADER_H = 34;
const PAD_TOP = 2;

/**
 * @param {Object} p
 * @param {Array<{id, name, curves, tracks, tops, shift, hasDatumTop}>} p.wells
 *   tracks = resolved TrackViewer-shape tracks per well; shift from
 *   computeFlattening (null draws unflattened)
 */
export default function MultiWellTracks({ wells }) {
  const wrapRef = useRef(null);
  const staticRef = useRef(null);
  const overlayRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(null); // [top, base] displayed depth
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
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, size.w, size.h);

    // depth axis
    ctx.strokeStyle = 'rgba(51,65,85,0.5)';
    ctx.fillStyle = '#64748b';
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
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(cx0, 0, colW, HEADER_H);
      ctx.strokeStyle = 'rgba(51,65,85,0.9)';
      ctx.strokeRect(cx0 + 0.5, 0.5, colW - 1, HEADER_H - 1);
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.textAlign = 'center';
      ctx.fillText(well.name, cx0 + colW / 2, 13, colW - 8);
      if (well.shift === null) {
        ctx.font = '9px sans-serif';
        ctx.fillStyle = '#f59e0b';
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
        ctx.strokeStyle = 'rgba(51,65,85,0.6)';
        ctx.strokeRect(tx + 0.5, plotTop + 0.5, tw - 1, plotH - 1);
        // tiny track label
        ctx.font = '9px sans-serif';
        ctx.fillStyle = '#64748b';
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
        ctx.strokeStyle = '#f59e0b';
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(cx0, y); ctx.lineTo(cx0 + colW, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#fbbf24';
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
    ctx.strokeStyle = 'rgba(148,163,184,0.7)';
    ctx.beginPath(); ctx.moveTo(AXIS_W, cursorY); ctx.lineTo(size.w, cursorY); ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(dOf(cursorY).toFixed(1), AXIS_W - 4, cursorY - 4);
  }, [size, plotTop, plotH, vTop, vBase]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerMove = (e) => {
    const rect = overlayRef.current.getBoundingClientRect();
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
    drawOverlay(y);
  };

  const onWheel = (e) => {
    e.preventDefault();
    const rect = overlayRef.current.getBoundingClientRect();
    const d = dOf(e.clientY - rect.top);
    const factor = e.deltaY > 0 ? 1.25 : 0.8;
    let nt = d - (d - vTop) * factor;
    let nb = d + (vBase - d) * factor;
    nt = Math.max(dMin, nt);
    nb = Math.min(dMax, nb);
    if (nb - nt < 2) return;
    setView(nb - nt >= dMax - dMin ? null : [nt, nb]);
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
