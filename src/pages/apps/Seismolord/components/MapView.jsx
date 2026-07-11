// MapView — the 2D map window (Petrel-style basemap): mapped horizons as
// color-filled structure maps with labeled-interval contours, fault
// traces, survey outline, IL/XL axes, north arrow, scale bar and a Z
// colorbar, all through the shared ViewTransform (pan / zoom / fit).
//
// Canvas-2D is fine here (the playbook's no-canvas-2D rule protects the
// SEISMIC panel): the fill is a cached offscreen bitmap per (horizon,
// colormap) and contours are cached marching-squares segments, so a
// camera frame is a drawImage + a few strokes.
//
// World space: x = crossline index, y = inline index (identical to the
// 2D time-slice view, so overlays and picking conventions carry over).
// The transform's "vexag" carries the ground aspect (m per inline step /
// m per crossline step), making distances isotropic on screen.

import React, {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import {
  ZoomIn, ZoomOut, Expand, Maximize, Minimize, Layers, Camera, Map as MapIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ViewTransform } from '../viewer/viewTransform';
import {
  drawAxes, drawScaleBar, drawNorthArrow, surveySpacing, northScreenDir,
} from '../viewer/annotations';
import { buildLut } from '../viewer/shaderChunks';
import {
  contourLevels, contourPolylines, buildMapPixels, gridRange,
} from '../viewer/mapContours';
import { NULL_VALUE } from '../engine/manifest';

const NULL_F32 = Math.fround(NULL_VALUE);
const PREFS_KEY = 'seismolord.mapPrefs.v1';
const DEFAULT_PREFS = {
  fill: true,
  contours: true,
  contourLabels: true,
  faults: true,
  outline: true,
  axes: true,
  grid: false,
  scaleBar: true,
  northArrow: true,
  colorbar: true,
};

/** Sequential maps that read as elevation — structure-map palette. */
const MAP_COLORMAPS = [
  { key: 'spectrum', label: 'Spectrum' },
  { key: 'jet', label: 'Rainbow' },
  { key: 'viridis', label: 'Viridis' },
  { key: 'plasma', label: 'Plasma' },
  { key: 'magma', label: 'Magma' },
  { key: 'hot_iron', label: 'Hot iron' },
  { key: 'cool_warm', label: 'Cool-Warm' },
  { key: 'grayscale', label: 'Grayscale' },
];

const loadPrefs = () => {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

const gutters = (showAxes) => (showAxes ? { left: 56, top: 24 } : { left: 0, top: 0 });

const INK = 'rgba(203, 213, 225, 0.92)';
const INK_DIM = 'rgba(148, 163, 184, 0.6)';

/**
 * @param {Object} p
 * @param {?Object} p.manifest volume manifest
 * @param {?Object} p.geom geomFromManifest() result
 * @param {Array<{id, name, grid: Float32Array, color: string}>} p.horizons
 *   VISIBLE horizons (pick grids in sample indices — converted to ms here)
 * @param {Array<{id, sticks, color: string}>} p.faults visible faults
 * @param {({ilIdx, xlIdx}) => void} [p.onNavigate] map click -> move the
 *   shared inline/crossline positions
 * @param {number} [p.height]
 */
function MapView({
  manifest, geom, horizons, faults, onNavigate, height = 560,
}) {
  const wrapRef = useRef(null);
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const transformRef = useRef(new ViewTransform());
  const rafRef = useRef(0);
  const dragRef = useRef(null);
  const propsRef = useRef({});
  const cacheRef = useRef(new Map());   // horizon id -> layer cache
  const readoutValsRef = useRef(null);
  const readoutHintRef = useRef(null);

  const [prefs, setPrefs] = useState(loadPrefs);
  const [colormap, setColormap] = useState('spectrum');
  const [activeId, setActiveId] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
  }, [prefs]);

  const g = gutters(prefs.axes);
  const spacing = useMemo(() => (manifest ? surveySpacing(manifest) : null), [manifest]);
  const northDir = useMemo(() => (manifest ? northScreenDir(manifest) : null), [manifest]);
  const lut = useMemo(() => buildLut(colormap), [colormap]);

  // the mapped (active) horizon follows visibility: keep the selection
  // while it stays visible, else fall back to the first visible horizon
  const active = useMemo(
    () => (horizons || []).find((h) => h.id === activeId) || (horizons || [])[0] || null,
    [horizons, activeId],
  );

  /** Layer cache: ms grid, range, contour segments, color-fill bitmap. */
  const layerFor = useCallback((h) => {
    if (!h || !geom || !manifest) return null;
    const dtMs = manifest.geometry.dt_us / 1000;
    let c = cacheRef.current.get(h.id);
    if (!c || c.grid !== h.grid) {
      const ms = new Float32Array(h.grid.length);
      for (let k = 0; k < h.grid.length; k++) {
        ms[k] = h.grid[k] === NULL_F32 ? NULL_F32 : h.grid[k] * dtMs;
      }
      const { zMin, zMax } = gridRange(ms);
      const { levels, step } = contourLevels(zMin ?? 0, zMax ?? 0, 12);
      c = {
        grid: h.grid,
        ms,
        zMin,
        zMax,
        levels,
        step,
        paths: levels.map((l) => contourPolylines(ms, geom.nIl, geom.nXl, l)),
        lutKey: null,
        bitmap: null,
      };
      cacheRef.current.set(h.id, c);
    }
    if (c.lutKey !== colormap && c.zMin != null) {
      const px = buildMapPixels(c.ms, geom.nIl, geom.nXl, lut, c.zMin, c.zMax);
      const bmp = document.createElement('canvas');
      bmp.width = geom.nXl;
      bmp.height = geom.nIl;
      bmp.getContext('2d').putImageData(
        new ImageData(px, geom.nXl, geom.nIl), 0, 0,
      );
      c.bitmap = bmp;
      c.lutKey = colormap;
    }
    return c;
  }, [geom, manifest, colormap, lut]);

  propsRef.current = {
    manifest, geom, horizons, faults, prefs, gutter: g, active, spacing, northDir,
  };

  // ---- drawing -----------------------------------------------------------

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const p = propsRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!p.geom || !p.manifest) return;
    const t = transformRef.current;
    const dpr = window.devicePixelRatio || 1;
    const gl = Math.round(p.gutter.left * dpr);
    const gt = Math.round(p.gutter.top * dpr);
    const layer = p.prefs.fill || p.prefs.contours || p.prefs.colorbar
      ? layerFor(p.active) : null;

    // data area (clipped, gutter-offset)
    ctx.save();
    ctx.translate(gl, gt);
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width - gl, canvas.height - gt);
    ctx.clip();

    if (p.prefs.fill && layer && layer.bitmap) {
      const o = t.worldToScreen(0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(layer.bitmap, o.x, o.y, p.geom.nXl * t.ppx, p.geom.nIl * t.ppy);
    }

    if (p.prefs.contours && layer && layer.levels.length) {
      const inkFor = (major) => (p.prefs.fill
        ? `rgba(15, 23, 42, ${major ? 0.85 : 0.5})`
        : `rgba(148, 163, 184, ${major ? 0.95 : 0.55})`);
      for (let k = 0; k < layer.levels.length; k++) {
        const major = Math.round(layer.levels[k] / layer.step) % 5 === 0;
        ctx.strokeStyle = inkFor(major);
        ctx.lineWidth = (major ? 1.6 : 1) * dpr;
        ctx.beginPath();
        for (const path of layer.paths[k]) {
          for (let i = 0; i < path.length; i += 2) {
            const s = t.worldToScreen(path[i] + 0.5, path[i + 1] + 0.5);
            if (i === 0) ctx.moveTo(s.x, s.y);
            else ctx.lineTo(s.x, s.y);
          }
        }
        ctx.stroke();
      }

      // value labels riding the MAJOR contours, spaced in screen pixels,
      // kept upright, with a halo so they read over fill or dark ground
      if (p.prefs.contourLabels) {
        ctx.font = `${Math.round(10 * dpr)}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3 * dpr;
        ctx.strokeStyle = p.prefs.fill
          ? 'rgba(255, 255, 255, 0.75)' : 'rgba(2, 6, 23, 0.9)';
        for (let k = 0; k < layer.levels.length; k++) {
          if (Math.round(layer.levels[k] / layer.step) % 5 !== 0) continue;
          ctx.fillStyle = inkFor(true);
          const text = String(Math.round(layer.levels[k]));
          for (const path of layer.paths[k]) {
            let acc = 0;
            let next = 90 * dpr;                 // first label ~90px in
            for (let i = 2; i < path.length; i += 2) {
              const a = t.worldToScreen(path[i - 2] + 0.5, path[i - 1] + 0.5);
              const b = t.worldToScreen(path[i] + 0.5, path[i + 1] + 0.5);
              const d = Math.hypot(b.x - a.x, b.y - a.y);
              while (d > 0 && acc + d >= next) {
                const f = (next - acc) / d;
                let ang = Math.atan2(b.y - a.y, b.x - a.x);
                if (ang > Math.PI / 2) ang -= Math.PI;
                if (ang < -Math.PI / 2) ang += Math.PI;
                ctx.save();
                ctx.translate(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
                ctx.rotate(ang);
                ctx.strokeText(text, 0, 0);
                ctx.fillText(text, 0, 0);
                ctx.restore();
                next += 280 * dpr;               // then every ~280px
              }
              acc += d;
            }
          }
        }
      }
    }

    if (p.prefs.faults) {
      const mk = Math.max(3, 1.5 * dpr);
      for (const f of p.faults || []) {
        ctx.strokeStyle = f.color;
        ctx.fillStyle = f.color;
        ctx.lineWidth = 1.6 * dpr;
        for (const stick of f.sticks || []) {
          const pts = stick.points || stick;
          ctx.beginPath();
          pts.forEach((q, i) => {
            const s = t.worldToScreen(q.xl + 0.5, q.il + 0.5);
            if (i === 0) ctx.moveTo(s.x, s.y);
            else ctx.lineTo(s.x, s.y);
            ctx.fillRect(s.x - mk / 2, s.y - mk / 2, mk, mk);
          });
          if (pts.length > 1) ctx.stroke();
        }
      }
    }

    if (p.prefs.outline) {
      const a = t.worldToScreen(0, 0);
      const b = t.worldToScreen(p.geom.nXl, p.geom.nIl);
      ctx.strokeStyle = INK_DIM;
      ctx.lineWidth = dpr;
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.setLineDash([]);
    }
    ctx.restore();

    // annotations over the gutters
    const geo = p.manifest.geometry;
    if (p.prefs.axes) {
      drawAxes(ctx, {
        transform: t,
        dpr,
        gutterLeft: gl,
        gutterTop: gt,
        xAxis: { title: 'XL', valueAtZero: geo.xl.min, valuePerCell: geo.xl.step },
        yAxis: { title: 'IL', valueAtZero: geo.il.min, valuePerCell: geo.il.step },
        grid: p.prefs.grid,
      });
    }
    if (p.prefs.scaleBar && p.spacing && p.spacing.xlSpacing > 0) {
      drawScaleBar(ctx, {
        x: gl + 14 * dpr,
        y: canvas.height - 12 * dpr,
        metersPerPx: p.spacing.xlSpacing / t.ppx,
        dpr,
        maxPx: 170 * dpr,
      });
    }
    if (p.prefs.northArrow && p.northDir) {
      drawNorthArrow(ctx, {
        x: canvas.width - 30 * dpr, y: gt + 30 * dpr, dir: p.northDir, dpr,
      });
    }

    if (p.prefs.colorbar && layer && layer.zMin != null && layer.bitmap) {
      // Z legend: shallow (zMin) at the top, matching the fill's LUT ends
      const h = Math.min(150 * dpr, canvas.height * 0.4);
      const w = 12 * dpr;
      const x = canvas.width - 24 * dpr;
      const y = canvas.height - h - 40 * dpr;
      const grad = ctx.createLinearGradient(0, y, 0, y + h);
      for (let i = 0; i <= 8; i++) {
        const li = Math.round((i / 8) * 255) * 4;
        grad.addColorStop(i / 8, `rgb(${lut[li]}, ${lut[li + 1]}, ${lut[li + 2]})`);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = INK_DIM;
      ctx.lineWidth = dpr;
      ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
      ctx.fillStyle = INK;
      ctx.font = `${Math.round(10 * dpr)}px ui-monospace, monospace`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(`${Math.round(layer.zMin)} ms`, x - 4 * dpr, y);
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${Math.round(layer.zMax)} ms`, x - 4 * dpr, y + h);
      if (layer.step) {
        ctx.textAlign = 'right';
        ctx.fillStyle = INK_DIM;
        ctx.fillText(`CI ${layer.step} ms`, x + w, y + h + 14 * dpr);
      }
    }

    if (p.active) {
      ctx.fillStyle = INK;
      ctx.font = `${Math.round(11 * dpr)}px ui-monospace, monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(p.active.name || 'Horizon', gl + 8 * dpr, canvas.height - 26 * dpr);
    }
  }, [layerFor, lut]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      draw();
    });
  }, [draw]);

  // ---- sizing / lifecycle --------------------------------------------------

  const resize = useCallback(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(viewport.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(viewport.clientHeight * dpr));
    const { gutter } = propsRef.current;
    transformRef.current.setViewport(
      Math.max(1, canvas.width - Math.round(gutter.left * dpr)),
      Math.max(1, canvas.height - Math.round(gutter.top * dpr)),
    );
  }, []);

  useLayoutEffect(() => {
    resize();
    draw();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => { resize(); draw(); });
    ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [resize, draw, prefs.axes]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  // world = survey lattice; ground aspect rides on the transform's vexag
  useEffect(() => {
    if (!geom) return;
    const t = transformRef.current;
    t.setWorld(geom.nXl, geom.nIl);
    if (spacing && spacing.xlSpacing > 0) {
      t.setVexag(spacing.ilSpacing / spacing.xlSpacing);
    }
    scheduleDraw();
  }, [geom, spacing, scheduleDraw]);

  // volume switch: drop stale layer caches
  useEffect(() => { cacheRef.current.clear(); }, [geom]);

  useEffect(() => { scheduleDraw(); }, [horizons, faults, prefs, colormap, active, scheduleDraw]);

  // ---- cursor readout / interactions --------------------------------------

  const toDevice = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const p = propsRef.current;
    return {
      sx: (e.clientX - rect.left) * dpr - p.gutter.left * dpr,
      sy: (e.clientY - rect.top) * dpr - p.gutter.top * dpr,
    };
  }, []);

  const pickAt = useCallback((sx, sy) => {
    const p = propsRef.current;
    if (!p.geom) return null;
    const w = transformRef.current.screenToWorld(sx, sy);
    const xlIdx = Math.floor(w.x);
    const ilIdx = Math.floor(w.y);
    const inData = xlIdx >= 0 && xlIdx < p.geom.nXl && ilIdx >= 0 && ilIdx < p.geom.nIl;
    return { ilIdx, xlIdx, inData };
  }, []);

  const setReadout = useCallback((hit) => {
    const vals = readoutValsRef.current;
    const hint = readoutHintRef.current;
    if (!vals || !hint) return;
    const p = propsRef.current;
    if (!hit || !hit.inData || !p.manifest) {
      vals.style.display = 'none';
      hint.style.display = '';
      return;
    }
    const geo = p.manifest.geometry;
    const c = geo.corners;
    let world = '';
    if (c?.first && p.spacing) {
      const wx = c.first.x + hit.xlIdx * p.spacing.dxPerXl;
      const wy = c.first.y + hit.ilIdx * p.spacing.dyPerIl;
      world = `X ${wx.toFixed(0)}   Y ${wy.toFixed(0)}   `;
    }
    let z = '';
    if (p.active) {
      const s = p.active.grid[hit.ilIdx * p.geom.nXl + hit.xlIdx];
      z = `   Z ${s === NULL_F32 ? 'null' : `${((s * geo.dt_us) / 1000).toFixed(1)} ms`}`;
    }
    vals.textContent = `${world}IL ${geo.il.min + hit.ilIdx * geo.il.step}   `
      + `XL ${geo.xl.min + hit.xlIdx * geo.xl.step}${z}`;
    vals.style.display = '';
    hint.style.display = 'none';
  }, []);

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const { sx, sy } = toDevice(e);
    dragRef.current = { lastX: sx, lastY: sy, moved: false };
  }, [toDevice]);

  const onPointerMove = useCallback((e) => {
    const { sx, sy } = toDevice(e);
    const d = dragRef.current;
    if (d) {
      const dx = sx - d.lastX;
      const dy = sy - d.lastY;
      if (!d.moved && Math.hypot(dx, dy) > 3) d.moved = true;
      if (d.moved) {
        transformRef.current.panBy(dx, dy);
        d.lastX = sx;
        d.lastY = sy;
        scheduleDraw();
      }
      return;
    }
    setReadout(pickAt(sx, sy));
  }, [toDevice, pickAt, setReadout, scheduleDraw]);

  const onPointerUp = useCallback((e) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.moved || e.button !== 0 || !onNavigate) return;
    const { sx, sy } = toDevice(e);
    const hit = pickAt(sx, sy);
    if (hit && hit.inData) onNavigate({ ilIdx: hit.ilIdx, xlIdx: hit.xlIdx });
  }, [toDevice, pickAt, onNavigate]);

  const onPointerLeave = useCallback(() => setReadout(null), [setReadout]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const { sx, sy } = toDevice(e);
      transformRef.current.zoomAt(e.deltaY > 0 ? 1 / 1.25 : 1.25, sx, sy);
      scheduleDraw();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [toDevice, scheduleDraw]);

  const onDoubleClick = useCallback((e) => {
    const { sx, sy } = toDevice(e);
    transformRef.current.zoomAt(2, sx, sy);
    scheduleDraw();
  }, [toDevice, scheduleDraw]);

  // ---- toolbar -------------------------------------------------------------

  const zoomCenter = (f) => {
    const t = transformRef.current;
    t.zoomAt(f, t.vw / 2, t.vh / 2);
    scheduleDraw();
  };
  const fitView = () => { transformRef.current.fit(); scheduleDraw(); };
  const togglePref = (key) => setPrefs((p0) => ({ ...p0, [key]: !p0[key] }));

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrapRef.current.requestFullscreen();
    } catch { /* unsupported */ }
  };
  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const screenshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw();
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'seismolord-map.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  };

  const hasData = Boolean(geom && manifest);
  const hasLayers = (horizons || []).length > 0 || (faults || []).length > 0;

  return (
    <div
      ref={wrapRef}
      data-testid="map-view"
      className={`flex flex-col ${isFullscreen ? 'h-screen bg-slate-950 p-2' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-1 mb-1">
        <Button variant="outline" size="sm" title="Zoom in (wheel)"
          onClick={() => zoomCenter(1.25)} disabled={!hasData}
        >
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" title="Zoom out"
          onClick={() => zoomCenter(1 / 1.25)} disabled={!hasData}
        >
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" title="Fit survey"
          onClick={fitView} disabled={!hasData}
        >
          <Expand className="w-4 h-4" />
        </Button>

        <span className="text-xs text-slate-400 ml-1">Horizon</span>
        <select
          className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs max-w-[160px]"
          value={active?.id || ''}
          onChange={(e) => setActiveId(e.target.value)}
          disabled={!(horizons || []).length}
          title="Mapped horizon (toggle visibility in the horizons list)"
        >
          {!(horizons || []).length && <option value="">none visible</option>}
          {(horizons || []).map((h) => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>

        <select
          className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs"
          value={colormap}
          onChange={(e) => setColormap(e.target.value)}
          disabled={!hasData}
          title="Map colormap"
        >
          {MAP_COLORMAPS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" title="Map layers">
              <Layers className="w-4 h-4 mr-1" />
              <span className="text-xs">Layers</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Map layers</DropdownMenuLabel>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.fill} onCheckedChange={() => togglePref('fill')}
            >
              Horizon color fill
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.contours} onCheckedChange={() => togglePref('contours')}
            >
              Contours
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.contourLabels}
              onCheckedChange={() => togglePref('contourLabels')}
              disabled={!prefs.contours}
            >
              Contour value labels
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.faults} onCheckedChange={() => togglePref('faults')}
            >
              Fault traces
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.outline} onCheckedChange={() => togglePref('outline')}
            >
              Survey outline
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Annotations</DropdownMenuLabel>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.axes} onCheckedChange={() => togglePref('axes')}
            >
              IL / XL axes
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.grid} onCheckedChange={() => togglePref('grid')}
              disabled={!prefs.axes}
            >
              Grid lines
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.scaleBar} onCheckedChange={() => togglePref('scaleBar')}
              disabled={!spacing}
            >
              Scale bar{!spacing ? ' (no coordinates)' : ''}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.northArrow} onCheckedChange={() => togglePref('northArrow')}
              disabled={!northDir}
            >
              North arrow{!northDir ? ' (no coordinates)' : ''}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.colorbar} onCheckedChange={() => togglePref('colorbar')}
            >
              Z colorbar
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" size="sm" onClick={screenshot}
          title="Save PNG snapshot" disabled={!hasData}
        >
          <Camera className="w-4 h-4" />
        </Button>

        <Button variant="outline" size="sm" onClick={toggleFullscreen}
          title="Fullscreen" className="ml-auto"
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </Button>
      </div>

      <div
        ref={viewportRef}
        className={`relative rounded-lg border border-slate-800 bg-slate-950 overflow-hidden
          ${isFullscreen ? 'flex-1' : ''}`}
        style={isFullscreen ? undefined : { height }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full block touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          onDoubleClick={onDoubleClick}
        />
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
            Select an ingested volume to open the map window.
          </div>
        )}
        {hasData && !hasLayers && (
          <div className="absolute inset-x-0 top-0 flex items-center justify-center pt-8
            pointer-events-none text-slate-500 text-sm"
          >
            <MapIcon className="w-4 h-4 mr-2" />
            Toggle a horizon or fault visible to map it.
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-400 font-mono mt-1 h-5">
        <span ref={readoutValsRef} className="whitespace-pre" style={{ display: 'none' }} />
        <span ref={readoutHintRef} className="text-slate-600">
          drag: pan · wheel: zoom · dbl-click: zoom in · click: move IL/XL there
        </span>
      </div>
    </div>
  );
}

// Memoized like SliceView/CubeView: ViewerPanel re-renders per slider tick.
export default React.memo(MapView);
