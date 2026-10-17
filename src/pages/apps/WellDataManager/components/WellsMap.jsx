// Well map: surface locations on a canvas (dark workstation viewport,
// like Seismolord's MapView — this is a navigation view, not an
// analytic chart, so the white chartTheme does not apply). Extent fits
// all wells with padding; clicking selects the nearest well.
//
// Part B 2026-10-17: the map fills the view's height, can lay a registry
// structure surface under the wells (colour-filled grid, contours and a
// colour bar, through the shared map painters of Mapping & Surface
// Studio), and wells at one location stack their labels so none overlap.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapTransform } from '@/components/maps/mapTransform';
import { lutOf } from '@/components/maps/lut';
import { rasterBitmap, paintRaster, contourPaths, paintContours, paintColorbar, nodeExtent, rasterUpsample } from '@/components/maps/mapPainter';
import { gridRange } from '@/lib/gridding/mapContours';

const PAD = 40;           // px inside the canvas
const HIT_RADIUS = 14;    // px pick tolerance

/** Wells with a usable surface location. A well may carry none (never
 *  imported with coordinates, or the Header tab cleared them, PT8), and
 *  Math.min would read a null as 0 and drag the extent to the origin. */
const coord = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
// WDM-U1-017: Number(null) is 0, so a cleared coordinate used to pass the
// finite test and put the well at the origin
export const mappable = (wells) => (wells || []).filter((w) => coord(w.surface_x) && coord(w.surface_y));

/**
 * What the map caption says about the frame and the wells left off it
 * (WDM-U1-011, WDM-U1-016): the coordinate systems and units actually in
 * use, a warning when wells sit in more than one (their positions are
 * then not comparable on one canvas), and how many wells have no surface
 * location and are not drawn.
 * @returns {{frame: string, mixed: boolean, undrawn: number}}
 */
export function mapFrameSummary(wells) {
  const all = wells || [];
  const drawn = mappable(all);
  const frames = new Map();
  for (const w of drawn) {
    const key = `${w.crs || 'CRS unknown'}|${w.xy_unit || 'm'}`;
    frames.set(key, (frames.get(key) || 0) + 1);
  }
  const labels = [...frames.keys()].map((k) => { const [c, u] = k.split('|'); return `${c}, ${u}`; });
  return {
    frame: labels.length ? labels.join('; ') : 'no located wells',
    mixed: frames.size > 1,
    undrawn: all.length - drawn.length,
  };
}

/** Surfaces the backdrop select offers: structure (depth or time) maps, newest first as listed. */
export const backdropSurfaces = (surfaces) => (surfaces || []).filter((s) => (s.kind || 'structure') === 'structure' && s.nx > 1 && s.ny > 1);

/** A registry surface row as a grid frame. */
export const specOfSurface = (s) => ({ x0: Number(s.origin_x), y0: Number(s.origin_y), dx: Number(s.dx), dy: Number(s.dy), nx: s.nx, ny: s.ny, ...(s.rotation_deg ? { rotation_deg: s.rotation_deg } : {}) });

/**
 * Label rows for wells drawn at (nearly) one screen point: wells within
 * `tol` px of an earlier well join its group and take the next label line,
 * so co-located wells (a pad, a re-entry, a copy) never overprint.
 * @param {Array<{id, px, py}>} pts in draw order
 * @returns {Map<string, number>} well id -> label line (0 = beside the symbol)
 */
export function stackLabels(pts, tol = 6) {
  const groups = [];
  const out = new Map();
  for (const p of pts) {
    const g = groups.find((q) => Math.hypot(q.px - p.px, q.py - p.py) <= tol);
    if (g) { out.set(p.id, g.n); g.n += 1; } else { groups.push({ px: p.px, py: p.py, n: 1 }); out.set(p.id, 0); }
  }
  return out;
}

const M_PER_FT = 0.3048;
/** Display factor for a surface's z values in the session unit (depth surfaces only). */
export function zDisplayFactor(zUnit, unit) {
  const z = String(zUnit || '').toLowerCase();
  if (unit === 'ft' && z === 'm') return 1 / M_PER_FT;
  if (unit === 'm' && (z === 'ft' || z === 'feet')) return M_PER_FT;
  return 1;
}

function fitExtent(wells, surfaceExtent = null) {
  const xs = wells.map((w) => Number(w.surface_x));
  const ys = wells.map((w) => Number(w.surface_y));
  if (surfaceExtent) { xs.push(surfaceExtent.x0, surfaceExtent.x1); ys.push(surfaceExtent.y0, surfaceExtent.y1); }
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  // degenerate extents (single well / colinear) get a nominal margin
  if (!(maxX - minX > 0)) { minX -= 250; maxX += 250; }
  if (!(maxY - minY > 0)) { minY -= 250; maxY += 250; }
  return { minX, maxX, minY, maxY };
}

const PRIVATE = '#fbbf24';
const SHARED = '#34d399';

export default function WellsMap({ wells, selectedId, onSelect, height = 480, backend = null, unit = 'm' }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const placedRef = useRef([]); // [{id, px, py}] for hit-testing
  const [fillH, setFillH] = useState(0);
  const [surfaces, setSurfaces] = useState(null);
  const [surfaceId, setSurfaceId] = useState('');
  const [surface, setSurface] = useState(null); // {row, grid, spec}
  const [surfaceErr, setSurfaceErr] = useState(null);

  const placed = useMemo(() => mappable(wells), [wells]);
  const summary = useMemo(() => mapFrameSummary(wells), [wells]);
  const surfExtent = useMemo(() => (surface ? nodeExtent(surface.spec) : null), [surface]);
  const extent = useMemo(() => (placed.length || surfExtent ? fitExtent(placed, surfExtent) : null), [placed, surfExtent]);

  // the backdrop choices (none when the backend has no surface registry)
  useEffect(() => {
    if (!backend?.listSurfaces) return undefined;
    let cancelled = false;
    backend.listSurfaces().then((rows) => { if (!cancelled) setSurfaces(backdropSurfaces(rows)); }).catch(() => { if (!cancelled) setSurfaces([]); });
    return () => { cancelled = true; };
  }, [backend]);

  useEffect(() => {
    setSurfaceErr(null);
    if (!surfaceId || !backend?.downloadSurfaceGrid) { setSurface(null); return undefined; }
    const row = (surfaces || []).find((s) => s.id === surfaceId);
    if (!row) { setSurface(null); return undefined; }
    let cancelled = false;
    backend.downloadSurfaceGrid(row)
      .then((grid) => { if (!cancelled) setSurface({ row, grid, spec: specOfSurface(row) }); })
      .catch((e) => { if (!cancelled) { setSurface(null); setSurfaceErr(e.message); } });
    return () => { cancelled = true; };
  }, [surfaceId, surfaces, backend]);

  // fill the view's height (the caption and the backdrop row sit below)
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return undefined;
    const host = wrap.parentElement;
    const measure = () => {
      const h = (host?.clientHeight || 0) - 90;
      setFillH(h > 300 ? h : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (host) ro.observe(host);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const cssW = wrap.clientWidth || 640;
    const cssH = fillH || height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.dataset.surface = surface ? surface.row.name : '';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, cssW, cssH);

    placedRef.current = [];
    if (!extent) {
      ctx.fillStyle = '#475569';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No wells to map yet', cssW / 2, cssH / 2);
      return;
    }

    const { minX, maxX, minY, maxY } = extent;
    // uniform scale (metres are metres in both axes), Y up; the colour bar
    // takes a strip on the right when a surface is shown
    const barW = surface ? 70 : 0;
    const t = new MapTransform();
    t.setWorld({ x0: minX, y0: minY, x1: maxX, y1: maxY });
    t.setViewport(cssW - barW, cssH);
    t.fit({ pad: PAD });
    const toPx = (x, y) => { const s = t.worldToScreen(x, y); return { px: s.x, py: s.y }; };

    if (surface) {
      const { grid, spec, row } = surface;
      const { zMin, zMax } = gridRange(grid);
      const lut = lutOf({ colormap: 'structure' });
      if (zMax > zMin) {
        try {
          const bitmap = rasterBitmap({ grid, spec, lut, zMin, zMax, upsample: rasterUpsample(spec, 512) });
          paintRaster(ctx, { bitmap, spec, transform: t });
        } catch { /* no offscreen canvas (jsdom): contours and bar still draw */ }
        const F = zDisplayFactor(row.z_unit, unit);
        const shown = F === 1 ? (row.z_unit || '') : unit;
        const contours = contourPaths(grid, spec, { target: 14 });
        paintContours(ctx, { contours, transform: t, fmt: (v) => String(Math.round(v * F)), minor: 'rgba(15, 23, 42, 0.45)', major: 'rgba(15, 23, 42, 0.85)' });
        paintColorbar(ctx, { x: cssW - barW + 44, y: 40, w: 12, h: Math.max(80, cssH - 110), lut, zMin, zMax, fmt: (v) => String(Math.round(v * F)), unit: shown, step: contours.step, stepFmt: (v) => String(Math.round(v * F)) });
      }
    }

    // grid: round world step near 1/5 of the extent (light over a surface)
    const targetStep = Math.max(maxX - minX, maxY - minY) / 5;
    const step = 10 ** Math.floor(Math.log10(targetStep));
    const gridStep = targetStep / step >= 5 ? 5 * step : targetStep / step >= 2 ? 2 * step : step;
    ctx.strokeStyle = surface ? 'rgba(226, 232, 240, 0.18)' : 'rgba(51, 65, 85, 0.5)';
    ctx.fillStyle = surface ? '#cbd5e1' : '#475569';
    ctx.font = '10px sans-serif';
    ctx.lineWidth = 1;
    const vr = t.visibleRect();
    for (let gx = Math.ceil(vr.x0 / gridStep) * gridStep; gx <= vr.x1; gx += gridStep) {
      const { px } = toPx(gx, 0);
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, cssH); ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillText(String(Math.round(gx)), px + 2, cssH - 4);
    }
    for (let gy = Math.ceil(vr.y0 / gridStep) * gridStep; gy <= vr.y1; gy += gridStep) {
      const { py } = toPx(0, gy);
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(cssW - barW, py); ctx.stroke();
      ctx.fillText(String(Math.round(gy)), 4, py - 2);
    }

    for (const w of placed) {
      const { px, py } = toPx(Number(w.surface_x), Number(w.surface_y));
      placedRef.current.push({ id: w.id, px, py });
    }
    const lines = stackLabels(placedRef.current);
    ctx.lineJoin = 'round';
    for (const w of placed) {
      const p = placedRef.current.find((q) => q.id === w.id);
      const sel = w.id === selectedId;
      const line = lines.get(w.id) || 0;
      if (line === 0) {
        ctx.beginPath();
        ctx.arc(p.px, p.py, sel ? 7 : 5.5, 0, Math.PI * 2);
        ctx.fillStyle = w.organization_id ? SHARED : PRIVATE;
        ctx.fill();
        ctx.lineWidth = sel ? 2.5 : 1.5;
        ctx.strokeStyle = sel ? '#22d3ee' : '#ffffff';
        ctx.stroke();
      }
      ctx.font = sel ? 'bold 12px sans-serif' : '12px sans-serif';
      ctx.textAlign = 'left';
      const ly = p.py + 4 + line * 14;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)';
      ctx.strokeText(w.name, p.px + 10, ly);
      ctx.fillStyle = sel ? '#a5f3fc' : '#e2e8f0';
      ctx.fillText(w.name, p.px + 10, ly);
    }
  }, [placed, selectedId, extent, height, fillH, surface, unit]);

  const pick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best = null;
    for (const p of placedRef.current) {
      const d = Math.hypot(p.px - x, p.py - y);
      if (d <= HIT_RADIUS && (!best || d < best.d)) best = { id: p.id, d };
    }
    if (best) onSelect(best.id);
  };

  return (
    <div ref={wrapRef} className="w-full">
      <canvas
        ref={canvasRef}
        data-testid="wdm-map"
        data-canvas="dark"
        className="rounded-pl-canvas border border-pl-border cursor-pointer"
        onClick={pick}
      />
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-pl-muted">
        {backend?.listSurfaces && (
          <label className="flex items-center gap-1">Backdrop
            <select className="rounded border border-pl-border bg-pl-surface px-1 py-0.5 text-pl-text max-w-[22rem]" value={surfaceId}
              onChange={(e) => setSurfaceId(e.target.value)} data-testid="wdm-map-surface">
              <option value="">None</option>
              {(surfaces || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        {surfaceErr && <span className="text-pl-danger-text" data-testid="wdm-map-surface-error">{surfaceErr}</span>}
        <p data-testid="wdm-map-caption">
          Surface locations ({summary.frame}). Amber = private, green = org-shared; click a well to open it.
          {summary.undrawn > 0 && ` ${summary.undrawn} well${summary.undrawn === 1 ? ' has' : 's have'} no surface location and ${summary.undrawn === 1 ? 'is' : 'are'} not drawn.`}
          {surface && ` Backdrop: ${surface.row.name}, contoured.`}
        </p>
      </div>
      {summary.mixed && (
        <p className="mt-1 text-[11px] text-pl-warning-text" data-testid="wdm-map-mixed">
          These wells are stored in more than one coordinate system, so their positions here are not comparable. Assign or reproject them to the Project CRS.
        </p>
      )}
    </div>
  );
}
