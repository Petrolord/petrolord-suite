// Multi-track log viewer (Petrophysics Studio G2.3, fills PS1): shared
// depth axis, per-track linear/log scales with per-curve overrides
// (density-neutron overlay), two-color crossover + threshold fills,
// zone bands, tops markers, wheel zoom + drag pan, crosshair readout.
// Canvas, fill-height, dark workstation viewport (a viewport, not an
// analytic chart — crossplots are where the white chartTheme applies).
//
// Presentational: tracks/zones/tops come prepared from the controller;
// the viewer owns only its depth window and cursor.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { crossoverPolys, thresholdPolys, fillPolys } from '../viewer/fills';
import { drawCurve, xScaleFor, trackGeometry } from '../viewer/trackRender';
import { hitZoneEdgeAt } from '../viewer/hitTest';
import { depthLabel } from '../viewer/depthModes';
import { zoomAbout, panBy } from '@/components/wells/depthNavMath';

const AXIS_W = 56;        // depth axis gutter
const HEADER_H = 50;      // track header (title + scale rows + readout)
const PAD_TOP = 2;

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
const ZONE_COLORS = ['rgba(14,116,144,0.10)', 'rgba(217,119,6,0.10)', 'rgba(5,150,105,0.10)', 'rgba(190,24,93,0.10)'];

/**
 * @param {Object} p
 * @param {ArrayLike<number>} p.depth MD metres, ascending
 * @param {Array<{key: string, title: string, scale?: 'linear'|'log',
 *   min: number, max: number, unit?: string,
 *   curves: Array<{name: string, data: ArrayLike<number>, color: string,
 *     fillTo?: 'left'|'right', min?: number, max?: number,
 *     scale?: 'linear'|'log', style?: 'solid'|'dash'|'dot', lineWidth?: number}>,
 *   fills?: Array<{mode: 'crossover', a: number, b: number,
 *     positiveColor?: string, negativeColor?: string, opacity?: number}
 *     | {mode: 'threshold', a: number, value: number,
 *       side?: 'above'|'below', color: string, opacity?: number}>}>} p.tracks
 * @param {Array} [p.zones] geo_wells_zones rows
 * @param {Array} [p.tops] geo_wells_tops rows
 * @param {'m'|'ft'} [p.depthUnit] DISPLAY unit only — data stays metres
 * @param {(trackIndex: number) => void} [p.onTrackHeaderClick]
 * @param {?Set<number>} [p.selection] crossplot-brushed sample indexes
 * @param {?(md: number) => number} [p.tvdLookup] axis labels in TVD
 * @param {boolean} [p.isOwn] zone edges drag only on owned wells
 * @param {(zone, edge: 'top'|'base', newMd: number) => void} [p.onZoneEdge]
 */
export default function TrackViewer({
  depth, tracks, zones = [], tops = [], depthUnit = 'm', onTrackHeaderClick,
  selection = null, tvdLookup = null, isOwn = false, onZoneEdge,
  view: viewProp, onViewChange,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const staticRef = useRef(null);              // offscreen cache of everything but the cursor layer
  const [size, setSize] = useState({ w: 0, h: 0 });
  // depth window [dTop, dBase] or null = full well; controlled when the
  // parent passes `view` (PT0: lets a navigator or a linked view drive it),
  // otherwise owned here exactly as before
  const [viewState, setViewState] = useState(null);
  const controlled = viewProp !== undefined;
  const view = controlled ? viewProp : viewState;
  const setView = useCallback((next) => {
    if (!controlled) setViewState(next);
    if (onViewChange) onViewChange(next);
  }, [controlled, onViewChange]);
  const [tick, setTick] = useState(0);         // bumps when the static layer was redrawn
  const [cursor, setCursor] = useState(null);  // {y, depthM, idx}
  const [zoneDrag, setZoneDrag] = useState(null); // {zone, edge, md}
  const dragRef = useRef(null);
  const movedRef = useRef(false);

  // display-unit factor: every LABEL multiplies by F, no data changes
  const F = depthUnit === 'ft' ? 1 / 0.3048 : 1;

  const dMin = depth.length ? depth[0] : 0;
  const dMax = depth.length ? depth[depth.length - 1] : 1;
  const [vTop, vBase] = view || [dMin, dMax];

  useEffect(() => { setView(null); setCursor(null); }, [depth]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const plotTop = HEADER_H + PAD_TOP;
  const plotH = Math.max(10, size.h - plotTop - 4);
  const yOf = useCallback(
    (d) => plotTop + ((d - vTop) / (vBase - vTop || 1)) * plotH,
    [plotTop, plotH, vTop, vBase],
  );
  const dOf = (y) => vTop + ((y - plotTop) / plotH) * (vBase - vTop);

  const geom = useMemo(() => trackGeometry(tracks, size.w), [tracks, size.w]);

  // STATIC layer (PT0): zones, axis, curves, fills and tops are drawn once
  // per data/view change into an offscreen canvas; the cursor layer below
  // composites it, so pointer moves no longer redraw every curve.
  useEffect(() => {
    if (!size.w || !size.h || !depth.length) return;
    const dpr = window.devicePixelRatio || 1;
    if (!staticRef.current) staticRef.current = document.createElement('canvas');
    const canvas = staticRef.current;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, size.w, size.h);

    const trackXs = geom.map((g) => g.x0);
    const trackWs = geom.map((g) => g.w);

    // zone bands under everything
    zones.forEach((z, zi) => {
      const y0 = yOf(Math.max(z.top_md_m, vTop));
      const y1 = yOf(Math.min(z.base_md_m, vBase));
      if (y1 < plotTop || y0 > plotTop + plotH) return;
      ctx.fillStyle = ZONE_COLORS[zi % ZONE_COLORS.length];
      ctx.fillRect(AXIS_W, Math.max(plotTop, y0), size.w - AXIS_W, Math.min(plotTop + plotH, y1) - Math.max(plotTop, y0));
      ctx.fillStyle = '#0369a1';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(z.name, AXIS_W + 4, Math.max(plotTop + 10, y0 + 11));
    });

    // depth axis + gridlines — the grid is chosen in DISPLAY units so
    // an ft axis lands on round feet
    ctx.strokeStyle = GRID;
    ctx.fillStyle = AXIS_TEXT;
    ctx.font = '10px sans-serif';
    const span = (vBase - vTop) * F;
    const step = 10 ** Math.floor(Math.log10(span / 6));
    const grid = span / step >= 30 ? step * 5 : span / step >= 12 ? step * 2 : step;
    for (let dv = Math.ceil((vTop * F) / grid) * grid; dv <= vBase * F; dv += grid) {
      const y = yOf(dv / F);
      ctx.beginPath();
      ctx.moveTo(AXIS_W, y);
      ctx.lineTo(size.w, y);
      ctx.stroke();
      ctx.textAlign = 'right';
      // TVD mode swaps the LABELS only — spacing stays MD, and the
      // axis title says so
      const label = tvdLookup ? tvdLookup(dv / F) * F : dv;
      ctx.fillText(Number.isFinite(label) ? String(Math.round(label)) : '—', AXIS_W - 4, y + 3);
    }
    ctx.save();
    ctx.translate(10, plotTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    const unitTxt = depthUnit === 'ft' ? 'ft' : 'm';
    ctx.fillText(tvdLookup ? `TVD (${unitTxt}) on MD spacing` : `MD (${unitTxt})`, 0, 0);
    ctx.restore();

    // crossplot-brushed selection: cyan ticks along the axis gutter
    if (selection && selection.size) {
      ctx.fillStyle = 'rgba(14,116,144,0.85)';
      for (let i = 0; i < depth.length - 1; i++) {
        if (!selection.has(i)) continue;
        if (depth[i] > vBase || depth[i + 1] < vTop) continue;
        const y = yOf(depth[i]);
        const y2 = yOf(depth[i + 1]);
        ctx.fillRect(AXIS_W - 3, y, 3, Math.max(1, y2 - y));
      }
    }

    // visible sample range
    let i0 = 0;
    while (i0 < depth.length - 1 && depth[i0] < vTop) i0++;
    let i1 = depth.length - 1;
    while (i1 > 0 && depth[i1] > vBase) i1--;
    i0 = Math.max(0, i0 - 1);
    i1 = Math.min(depth.length - 1, i1 + 1);

    tracks.forEach((track, ti) => {
      const x0 = trackXs[ti];
      const trackW = trackWs[ti];

      // header
      ctx.fillStyle = HEADER_BG;
      ctx.fillRect(x0, 0, trackW, HEADER_H);
      ctx.strokeStyle = FRAME;
      ctx.strokeRect(x0 + 0.5, 0.5, trackW - 1, HEADER_H - 1);
      ctx.strokeRect(x0 + 0.5, plotTop + 0.5, trackW - 1, plotH - 1);
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = TEXT;
      ctx.fillText(track.title, x0 + trackW / 2, 12);
      if (track.type !== 'strip') {
        // one scale row per distinct curve range (max two rows), in the
        // curve's color when it overrides the track scale
        ctx.font = '9px sans-serif';
        const rows = [];
        const seen = new Set();
        for (const curve of track.curves) {
          const min = curve.min ?? track.min;
          const max = curve.max ?? track.max;
          const scale = curve.scale ?? track.scale;
          const sig = `${min}|${max}|${scale}`;
          if (seen.has(sig)) continue;
          seen.add(sig);
          rows.push({
            min, max, scale,
            color: curve.min != null || curve.max != null ? curve.color : AXIS_TEXT,
          });
          if (rows.length === 2) break;
        }
        rows.forEach((r, ri) => {
          const y = 24 + ri * 9;
          ctx.fillStyle = r.color;
          ctx.textAlign = 'left';
          ctx.fillText(`${r.min}`, x0 + 4, y);
          ctx.textAlign = 'right';
          ctx.fillText(`${r.max}${r.scale === 'log' ? ' log' : ''}`, x0 + trackW - 4, y);
        });
      }

      // categorical strip track (facies): per-sample colored bands
      if (track.type === 'strip') {
        const data = track.curves[0].data;
        for (let i = i0; i < i1; i++) {
          const v = data[i];
          if (!Number.isFinite(v)) continue;
          const color = track.colors[Math.round(v) % track.colors.length];
          ctx.fillStyle = `${color}cc`;
          const y = yOf(depth[i]);
          const y2 = yOf(depth[i + 1]);
          ctx.fillRect(x0 + 2, y, trackW - 4, Math.max(1, y2 - y));
        }
        return;
      }

      const clampX = (x) => Math.min(x0 + trackW - 2, Math.max(x0 + 2, x));

      // fills under the curve lines (PS1): project each referenced
      // curve through its own scale, then build device-space polygons
      if (track.fills?.length) {
        const proj = (curve) => {
          const xsC = xScaleFor(track, curve, x0, trackW);
          const out = new Float64Array(i1 + 1).fill(NaN);
          for (let i = i0; i <= i1; i++) {
            const v = curve.data[i];
            if (!Number.isFinite(v)) continue;
            const x = xsC(v);
            if (Number.isFinite(x)) out[i] = clampX(x);
          }
          return out;
        };
        const ys = new Float64Array(i1 + 1).fill(NaN);
        for (let i = i0; i <= i1; i++) ys[i] = yOf(depth[i]);
        for (const f of track.fills) {
          const ca = track.curves[f.a];
          if (!ca) continue;
          const alpha = Math.round((f.opacity ?? 0.3) * 255).toString(16).padStart(2, '0');
          if (f.mode === 'crossover' && track.curves[f.b]) {
            const { pos, neg } = crossoverPolys(proj(ca), proj(track.curves[f.b]), ys, i0, i1);
            if (f.positiveColor) fillPolys(ctx, pos, `${f.positiveColor}${alpha}`);
            if (f.negativeColor) fillPolys(ctx, neg, `${f.negativeColor}${alpha}`);
          } else if (f.mode === 'threshold') {
            const xt = xScaleFor(track, ca, x0, trackW)(f.value);
            if (!Number.isFinite(xt)) continue;
            fillPolys(
              ctx,
              thresholdPolys(proj(ca), clampX(xt), ys, f.side || 'above', i0, i1),
              `${f.color}${alpha}`,
            );
          }
        }
      }

      // curves (shared renderer: decimates past 2 samples per pixel row)
      track.curves.forEach((curve) => {
        drawCurve(ctx, { track, curve, depth, yOf, i0, i1, x0, trackW, plotH });
      });
      ctx.lineWidth = 1;
    });

    // tops markers across all tracks
    for (const t of tops) {
      if (t.md_m < vTop || t.md_m > vBase) continue;
      const y = yOf(t.md_m);
      ctx.strokeStyle = TOP_LINE;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(AXIS_W, y);
      ctx.lineTo(size.w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = TOP_TEXT;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(t.name, size.w - 4, y - 3);
    }

    setTick((t) => t + 1);
  }, [size, depth, tracks, geom, zones, tops, vTop, vBase, yOf, plotTop, plotH, F, depthUnit, selection, tvdLookup]);

  // CURSOR layer: composite the static picture, then the header readouts,
  // the zone-edge drag preview and the crosshair (cheap on every move).
  useEffect(() => {
    const canvas = canvasRef.current;
    const stat = staticRef.current;
    if (!canvas || !stat || !size.w || !size.h || !depth.length) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== stat.width || canvas.height !== stat.height) {
      canvas.width = stat.width;
      canvas.height = stat.height;
      canvas.style.width = `${size.w}px`;
      canvas.style.height = `${size.h}px`;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(stat, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // per-track readout row in the header, spread across the track width
    // so overlaid curves never overprint each other
    if (cursor) {
      tracks.forEach((track, ti) => {
        const { x0, w: trackW } = geom[ti];
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        if (track.type === 'strip') {
          const v = track.curves[0].data[cursor.idx];
          ctx.fillStyle = TEXT;
          ctx.fillText(Number.isFinite(v) ? track.labels?.[Math.round(v)] ?? String(v) : '—', x0 + trackW / 2, 46);
          return;
        }
        const n = track.curves.length;
        track.curves.forEach((curve, ci) => {
          const v = curve.data[cursor.idx];
          ctx.fillStyle = curve.color;
          ctx.fillText(Number.isFinite(v) ? `${curve.name} ${v.toPrecision(4)}` : `${curve.name} —`, x0 + ((ci + 0.5) / n) * trackW, 46);
        });
      });
    }

    // zone-edge drag preview
    if (zoneDrag) {
      const y = yOf(zoneDrag.md);
      ctx.strokeStyle = '#0e7490';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(AXIS_W, y);
      ctx.lineTo(size.w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#0e7490';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${zoneDrag.zone.name} ${zoneDrag.edge} → ${depthLabel(zoneDrag.md, depthUnit)}`, AXIS_W + 4, y - 4);
    }

    // crosshair
    if (cursor && cursor.y >= plotTop && cursor.y <= plotTop + plotH) {
      ctx.strokeStyle = CROSSHAIR;
      ctx.beginPath();
      ctx.moveTo(AXIS_W, cursor.y);
      ctx.lineTo(size.w, cursor.y);
      ctx.stroke();
      ctx.fillStyle = TEXT_STRONG;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      const cLabel = tvdLookup ? tvdLookup(cursor.depthM) * F : cursor.depthM * F;
      ctx.fillText(Number.isFinite(cLabel) ? cLabel.toFixed(1) : '—', AXIS_W - 4, cursor.y - 4);
    }
  }, [tick, size, depth, tracks, geom, cursor, zoneDrag, yOf, plotTop, plotH, F, depthUnit, tvdLookup]);

  const nearestIdx = (d) => {
    // depth ascending, uniformish: binary search
    let lo = 0;
    let hi = depth.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (depth[mid] < d) lo = mid;
      else hi = mid;
    }
    return d - depth[lo] < depth[hi] - d ? lo : hi;
  };

  // zone-edge hit test (owned wells only): top/base line within 5px
  const zoneEdgeAt = (y) => (isOwn && onZoneEdge ? hitZoneEdgeAt(y, zones, yOf) : null);

  const onPointerMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (zoneDrag) {
      const md = Math.min(dMax, Math.max(dMin, dOf(y)));
      setZoneDrag((zd) => ({ ...zd, md }));
      return;
    }
    if (!dragRef.current) {
      canvasRef.current.style.cursor = zoneEdgeAt(y) ? 'row-resize' : 'crosshair';
    }
    if (dragRef.current) {
      movedRef.current = true;
      const dd = dOf(dragRef.current.y) - dOf(y);
      setView(panBy(dragRef.current.view, dd, [dMin, dMax]));
      return;
    }
    const d = dOf(y);
    if (d >= dMin && d <= dMax && depth.length) {
      setCursor({ y, depthM: d, idx: nearestIdx(d) });
    } else setCursor(null);
  };

  const onWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const d = dOf(e.clientY - rect.top);
    const factor = e.deltaY > 0 ? 1.25 : 0.8;
    const next = zoomAbout([vTop, vBase], d, factor, [dMin, dMax]);
    if (next !== null && next[0] === vTop && next[1] === vBase) return; // 2 m floor
    setView(next);
  };

  return (
    <div ref={wrapRef} className="h-full min-h-0 w-full relative overflow-hidden" data-testid="petro-tracks">
      <canvas
        ref={canvasRef}
        className="cursor-crosshair"
        data-testid="petro-tracks-canvas"
        onPointerMove={onPointerMove}
        onPointerDown={(e) => {
          movedRef.current = false;
          const y = e.clientY - canvasRef.current.getBoundingClientRect().top;
          const edge = zoneEdgeAt(y);
          if (edge) {
            setZoneDrag({ ...edge, md: edge.edge === 'top' ? edge.zone.top_md_m : edge.zone.base_md_m });
            e.currentTarget.setPointerCapture(e.pointerId);
            return;
          }
          dragRef.current = { y, view: [vTop, vBase] };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onClick={(e) => {
          if (movedRef.current || !onTrackHeaderClick || !tracks.length) return;
          const rect = canvasRef.current.getBoundingClientRect();
          if (e.clientY - rect.top > HEADER_H) return;
          const x = e.clientX - rect.left;
          if (x < AXIS_W) return;
          const g = trackGeometry(tracks, rect.width);
          for (let i = 0; i < g.length; i++) {
            if (x < g[i].x0 + g[i].w) { onTrackHeaderClick(i); return; }
          }
        }}
        onPointerUp={(e) => {
          if (zoneDrag) {
            const { zone, edge, md } = zoneDrag;
            setZoneDrag(null);
            e.currentTarget.releasePointerCapture(e.pointerId);
            onZoneEdge(zone, edge, Number(md.toFixed(2)));
            return;
          }
          dragRef.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerLeave={() => { setCursor(null); }}
        onWheel={onWheel}
        onDoubleClick={() => setView(null)}
      />
      <span className="absolute bottom-1 right-2 text-[10px] text-slate-600 pointer-events-none">
        wheel: zoom · drag: pan · double-click: full well
      </span>
    </div>
  );
}
