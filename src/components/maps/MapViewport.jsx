// Shared map viewport (Mapping MS1, 2026-09-05): a metre-world map
// window on one canvas, used by Mapping & Surface Studio and Earth
// Modeling. Zoom at the cursor (wheel, +/-), drag to pan, double-click
// or 0 to fit, a live cursor readout (world X/Y and the value under the
// pointer), click-to-digitise while `drawing`, and a paint handle for
// titled PNGs. Every layer is a pure painter (mapPainter.js) over a
// MapTransform; this file owns the DOM, the pointer state and the
// caches only.
//
// e2e contract: the canvas carries data-scale / data-cx / data-cy /
// data-vw / data-vh / data-fit-pad / data-fit-scale / data-contour-step;
// its CSS box IS the viewport (border on the wrapper, never on the
// canvas), the fit is PAD 44 on the node extent centred with y up and
// is applied before the first click; a plain click (no movement) while
// drawing fires onMapClick({x, y}); double-click never refits while
// drawing.

import React, {
  forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { gridRange } from '@/lib/gridding/mapContours';
import { MapTransform, FIT_PAD } from './mapTransform';
import { lutOf } from './lut';
import {
  MAP_BG, nodeExtent, rasterBitmap, paintRaster, contourPaths, paintContours, paintWells,
  paintPolygons, paintCulture, paintColorbar, paintScaleBar, paintNorthArrow, paintAxes, sampleAtScreen,
} from './mapPainter';
import { mapPlotPng } from './mapPng';

const DRAG_PX = 3;
const ZOOM_STEP = 1.25;

const MapViewport = forwardRef(function MapViewport({
  spec, grid, wells = [], polygons = [], pendingVertices = [], drawing = false, onMapClick,
  cultureLayers = [], contours = true, contourStep = null, contourLabels = true,
  colormap = 'structure', reverse = false, showNames = true, posted = null,
  showLegend = true, showScaleBar = true, showNorth = true, showAxes = false,
  height = 'fill', testIdPrefix = 'map', zFormat = (v) => v.toFixed(1), zUnit = '',
  contourFormat = null, label = '', hint = '', onCameraChange,
}, ref) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const readoutRef = useRef(null);
  const tRef = useRef(null);
  if (!tRef.current) tRef.current = new MapTransform();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [camTick, setCamTick] = useState(0);
  const pointerRef = useRef(null);

  const lut = useMemo(() => lutOf({ colormap, reverse }), [colormap, reverse]);
  const range = useMemo(() => (grid ? gridRange(grid) : null), [grid]);
  const bitmap = useMemo(() => {
    if (!grid || !spec || !range || typeof document === 'undefined') return null;
    try { return rasterBitmap({ grid, spec, lut, zMin: range.zMin, zMax: range.zMax }); } catch { return null; }
  }, [grid, spec, lut, range]);
  const contourData = useMemo(
    () => (contours && grid && spec ? contourPaths(grid, spec, { step: contourStep }) : null),
    [contours, grid, spec, contourStep],
  );

  const bump = useCallback(() => {
    setCamTick((k) => k + 1);
    onCameraChange?.(tRef.current.getCamera());
  }, [onCameraChange]);

  // viewport size: the wrapper's content box
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (spec) tRef.current.setWorld(nodeExtent(spec));
    setCamTick((k) => k + 1);
  }, [spec]);

  useLayoutEffect(() => {
    tRef.current.setViewport(size.w, size.h);
    setCamTick((k) => k + 1);
  }, [size.w, size.h]);

  const fmtZ = useCallback((v) => `${zFormat(v)}${zUnit ? ` ${zUnit}` : ''}`, [zFormat, zUnit]);

  /** Paint the whole scene in CSS px onto a prepared context. */
  const paintScene = useCallback((ctx, w, h) => {
    const t = tRef.current;
    ctx.fillStyle = MAP_BG;
    ctx.fillRect(0, 0, w, h);
    if (!spec || !grid || !range) return;
    if (bitmap) paintRaster(ctx, { bitmap, spec, transform: t });
    if (contourData) paintContours(ctx, { contours: contourData, transform: t, labels: contourLabels, fmt: contourFormat || zFormat });
    if (cultureLayers.length) paintCulture(ctx, { layers: cultureLayers, transform: t });
    paintPolygons(ctx, { polygons, pending: pendingVertices, transform: t });
    paintWells(ctx, { wells, transform: t, showNames, posted, fmt: zFormat });
    if (showAxes) paintAxes(ctx, { transform: t, pad: FIT_PAD });
    if (showLegend) {
      const cbH = Math.max(40, h - 2 * FIT_PAD);
      paintColorbar(ctx, {
        x: w - 18, y: FIT_PAD, w: 10, h: cbH, lut, zMin: range.zMin, zMax: range.zMax,
        fmt: zFormat, unit: zUnit, step: contourData?.step || null, stepFmt: contourFormat || zFormat,
      });
    }
    if (showScaleBar) paintScaleBar(ctx, { x: 12, y: h - 12, transform: t, maxPx: Math.min(180, w / 3) });
    if (showNorth) paintNorthArrow(ctx, { x: 26, y: 30 });
    if (label) {
      ctx.save();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(label, showNorth ? 48 : 8, 6);
      ctx.restore();
    }
  }, [spec, grid, range, bitmap, contourData, contourLabels, zFormat, contourFormat, cultureLayers, polygons, pendingVertices, wells, showNames, posted, showAxes, showLegend, lut, zUnit, showScaleBar, showNorth, label]);

  // paint the live canvas
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !(size.w > 0) || !(size.h > 0)) return;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintScene(ctx, size.w, size.h);
    const t = tRef.current;
    canvas.dataset.scale = String(t.scale);
    canvas.dataset.fitScale = String(t.fitScale);
    canvas.dataset.cx = String(t.cx);
    canvas.dataset.cy = String(t.cy);
    canvas.dataset.vw = String(size.w);
    canvas.dataset.vh = String(size.h);
    canvas.dataset.fitPad = String(FIT_PAD);
    canvas.dataset.contourStep = String(contourData?.step ?? '');
  }, [paintScene, size.w, size.h, camTick, contourData]);

  useImperativeHandle(ref, () => ({
    transform: tRef.current,
    fit: () => { tRef.current.fit(); bump(); },
    toPng: ({ title, caption = '', scale = 2 } = {}) => mapPlotPng({
      paint: (ctx) => paintScene(ctx, size.w, size.h), width: size.w, height: size.h, title, caption, scale,
    }),
  }), [paintScene, size.w, size.h, bump]);

  // wheel zoom needs a non-passive listener
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      tRef.current.zoomAt(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, e.clientX - rect.left, e.clientY - rect.top);
      bump();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [bump]);

  const local = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const updateReadout = (sx, sy) => {
    const el = readoutRef.current;
    if (!el) return;
    if (!spec || !grid) { el.textContent = ''; return; }
    const s = sampleAtScreen(grid, spec, tRef.current, sx, sy);
    el.textContent = `X ${s.x.toFixed(0)}  Y ${s.y.toFixed(0)}  z ${s.z === null ? '—' : fmtZ(s.z)}`;
  };

  const onPointerDown = (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    const p = local(e);
    pointerRef.current = { x: p.x, y: p.y, lastX: p.x, lastY: p.y, moved: false, id: e.pointerId };
    canvasRef.current.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const p = local(e);
    const d = pointerRef.current;
    if (d) {
      if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) > DRAG_PX) d.moved = true;
      if (d.moved) {
        tRef.current.panBy(p.x - d.lastX, p.y - d.lastY);
        d.lastX = p.x; d.lastY = p.y;
        bump();
      }
      return;
    }
    updateReadout(p.x, p.y);
  };
  const onPointerUp = (e) => {
    const d = pointerRef.current;
    pointerRef.current = null;
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
    if (!d || d.moved) return;
    if (drawing && onMapClick) {
      const p = local(e);
      onMapClick(tRef.current.screenToWorld(p.x, p.y));
    }
  };
  const onPointerLeave = () => { if (readoutRef.current) readoutRef.current.textContent = ''; };
  const onDoubleClick = () => { if (drawing) return; tRef.current.fit(); bump(); };
  const onKeyDown = (e) => {
    const t = tRef.current;
    if (e.key === '+' || e.key === '=') { t.zoomAt(ZOOM_STEP, size.w / 2, size.h / 2); bump(); }
    else if (e.key === '-' || e.key === '_') { t.zoomAt(1 / ZOOM_STEP, size.w / 2, size.h / 2); bump(); }
    else if (e.key === '0') { t.fit(); bump(); }
    else return;
    e.preventDefault();
  };
  const zoomBy = (f) => { tRef.current.zoomAt(f, size.w / 2, size.h / 2); bump(); };

  const fill = height === 'fill';
  const btn = 'w-7 h-7 flex items-center justify-center rounded bg-slate-900/80 border border-slate-700 text-slate-300 hover:bg-slate-800';
  const p = testIdPrefix;
  return (
    <div className={`${fill ? 'h-full min-h-0' : ''} w-full flex flex-col`} data-testid={`${p}-wrap`}>
      <div
        ref={wrapRef}
        className={`relative w-full ${fill ? 'flex-1 min-h-0' : ''} rounded border border-slate-800 overflow-hidden`}
        style={fill ? undefined : { height }}
      >
        <canvas
          ref={canvasRef}
          data-testid={`${p}-canvas`}
          tabIndex={0}
          className={`block outline-none ${drawing ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerLeave}
          onDoubleClick={onDoubleClick}
          onKeyDown={onKeyDown}
        />
        <div className={`absolute left-2 ${showNorth ? 'top-14' : 'top-2'} flex flex-col gap-1`}>
          <button type="button" className={btn} title="Zoom in (+)" data-testid={`${p}-zoom-in`} onClick={() => zoomBy(ZOOM_STEP)}><ZoomIn className="w-3.5 h-3.5" /></button>
          <button type="button" className={btn} title="Zoom out (-)" data-testid={`${p}-zoom-out`} onClick={() => zoomBy(1 / ZOOM_STEP)}><ZoomOut className="w-3.5 h-3.5" /></button>
          <button type="button" className={btn} title="Fit (0, double-click)" data-testid={`${p}-fit`} onClick={() => { tRef.current.fit(); bump(); }}><Maximize2 className="w-3.5 h-3.5" /></button>
        </div>
        <div
          ref={readoutRef}
          data-testid={`${p}-readout`}
          className="absolute right-2 bottom-2 px-1.5 py-0.5 rounded bg-slate-900/80 text-[10px] font-mono text-slate-300 whitespace-pre pointer-events-none"
        />
      </div>
      {range && spec && (
        <p className="mt-1 text-[11px] text-slate-500 shrink-0" data-testid={`${p}-zrange`}>
          {label ? `${label} · ` : ''}z {zFormat(range.zMin)} to {zFormat(range.zMax)}{zUnit ? ` ${zUnit}` : ''} · {spec.nx}×{spec.ny} grid{hint ? ` · ${hint}` : ''}
        </p>
      )}
    </div>
  );
});

export default MapViewport;
