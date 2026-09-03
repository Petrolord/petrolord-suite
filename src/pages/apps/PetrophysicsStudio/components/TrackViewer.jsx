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
import { hitZoneEdgeAt, hitTopAt } from '../viewer/hitTest';
import { topColor } from '@/components/wells/topColors';
import TopNamePopover from '@/components/wells/TopNamePopover';
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
  // PT3: tops are shown by name with a colour and can be picked, dragged
  // (on the right-edge name tag) and named here; pickMode 'top' | 'zone'
  // is owned by the controller (Esc clears it through onPickCancel)
  topStyles = null, pickMode = null, onTopCreate, onTopMove, onZonePick, onPickCancel, topNames = [],
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
  const [topDrag, setTopDrag] = useState(null);   // {top, md}
  const [pick, setPick] = useState(null);         // zone pick: {top: md}
  const [popover, setPopover] = useState(null);   // {x, y, kind, mdM | topMdM/baseMdM, defaultName}
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

  // tops to draw: visibility and colour by name (topStyles), else all tops
  // in the deterministic palette
  const shownTops = useMemo(() => {
    const st = topStyles || { showAll: true, byName: {} };
    if (st.showAll === false) return [];
    return (tops || [])
      .filter((t) => !st.byName?.[String(t.name).trim().replace(/\s+/g, ' ').toLowerCase()]?.hidden)
      .map((t) => ({ ...t, color: topColor(t.name, { overrides: st.byName || {} }) }));
  }, [tops, topStyles]);
  const TAG_MAX = 120;
  const tagLeft = Math.max(AXIS_W, size.w - TAG_MAX - 4);

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

    // tops markers across all tracks: a dashed line in the top's colour and
    // a name tag at the right edge (the tag is the drag handle on own wells)
    ctx.font = '10px sans-serif';
    for (const t of shownTops) {
      if (t.md_m < vTop || t.md_m > vBase) continue;
      const y = yOf(t.md_m);
      ctx.strokeStyle = t.color;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(AXIS_W, y);
      ctx.lineTo(size.w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      const tw = ctx.measureText(t.name).width;
      const tagW = Math.min(TAG_MAX, tw + 18);
      const tx = size.w - tagW - 2;
      ctx.fillStyle = `${t.color}2e`;
      ctx.fillRect(tx, y - 13, tagW, 12);
      ctx.fillStyle = t.color;
      ctx.textAlign = 'left';
      if (isOwn && onTopMove) {
        // grip glyph
        for (let k = 0; k < 3; k++) ctx.fillRect(tx + 3, y - 11 + k * 3, 4, 1);
      }
      ctx.fillText(t.name, tx + (isOwn && onTopMove ? 10 : 4), y - 3, tagW - 12);
    }

    setTick((t) => t + 1);
  }, [size, depth, tracks, geom, zones, shownTops, vTop, vBase, yOf, plotTop, plotH, F, depthUnit, selection, tvdLookup, isOwn, onTopMove]);

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

    // top drag preview
    if (topDrag) {
      const y = yOf(topDrag.md);
      ctx.strokeStyle = topDrag.top.color || TOP_LINE;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(AXIS_W, y);
      ctx.lineTo(size.w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = topDrag.top.color || TOP_TEXT;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${topDrag.top.name} → ${depthLabel(topDrag.md, depthUnit)}`, AXIS_W + 4, y - 4);
    }

    // pick previews: a new top at the cursor, or the zone band being picked
    if (pickMode && cursor && cursor.y >= plotTop && cursor.y <= plotTop + plotH) {
      ctx.strokeStyle = '#0e7490';
      ctx.setLineDash([4, 3]);
      if (pickMode === 'zone' && pick) {
        const y0 = Math.min(yOf(pick.top), cursor.y);
        const y1 = Math.max(yOf(pick.top), cursor.y);
        ctx.fillStyle = 'rgba(14,116,144,0.10)';
        ctx.fillRect(AXIS_W, y0, size.w - AXIS_W, Math.max(1, y1 - y0));
        ctx.beginPath(); ctx.moveTo(AXIS_W, yOf(pick.top)); ctx.lineTo(size.w, yOf(pick.top)); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(AXIS_W, cursor.y); ctx.lineTo(size.w, cursor.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#0e7490';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(pickMode === 'zone' ? (pick ? 'click to set the zone base' : 'click to set the zone top') : 'click to place a top', AXIS_W + 4, cursor.y - 4);
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
  }, [tick, size, depth, tracks, geom, cursor, zoneDrag, topDrag, pick, pickMode, yOf, plotTop, plotH, F, depthUnit, tvdLookup]);

  // Esc leaves a pick mode / closes the name popover
  useEffect(() => {
    if (!pickMode && !popover) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (popover) { setPopover(null); if (pickMode === 'zone') setPick(null); return; }
      setPick(null);
      if (onPickCancel) onPickCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickMode, popover, onPickCancel]);
  useEffect(() => { if (!pickMode) { setPick(null); setPopover(null); } }, [pickMode]);

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

  // hit tests: a top only in its right-edge tag zone, a zone edge anywhere
  const zoneEdgeAt = (y) => (isOwn && onZoneEdge ? hitZoneEdgeAt(y, zones, yOf) : null);
  const topAt = (x, y) => (isOwn && onTopMove && !pickMode ? hitTopAt({ x, y }, shownTops, yOf, { tagLeft, tol: 5 }) : null);
  const clampMd = (md) => Math.min(dMax, Math.max(dMin, md));
  const nearestTopAbove = (mdM) => {
    let best = null;
    for (const t of shownTops) if (t.md_m <= mdM + 1e-9 && (!best || t.md_m > best.md_m)) best = t;
    return best;
  };

  const onPointerMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (topDrag) {
      setTopDrag((td) => ({ ...td, md: clampMd(dOf(y)) }));
      return;
    }
    if (zoneDrag) {
      const md = clampMd(dOf(y));
      setZoneDrag((zd) => ({ ...zd, md }));
      return;
    }
    if (!dragRef.current) {
      canvasRef.current.style.cursor = pickMode ? 'copy' : topAt(x, y) ? 'grab' : zoneEdgeAt(y) ? 'row-resize' : 'crosshair';
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

  const onPointerDown = (e) => {
    movedRef.current = false;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (popover) setPopover(null);
    if (!pickMode) {
      const top = topAt(x, y);
      if (top) {
        setTopDrag({ top, md: top.md_m });
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      const edge = zoneEdgeAt(y);
      if (edge) {
        setZoneDrag({ ...edge, md: edge.edge === 'top' ? edge.zone.top_md_m : edge.zone.base_md_m });
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }
    dragRef.current = { y, view: [vTop, vBase] };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerUp = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (topDrag) {
      const { top, md } = topDrag;
      setTopDrag(null);
      e.currentTarget.releasePointerCapture(e.pointerId);
      if (Math.abs(md - top.md_m) > 1e-9) onTopMove(top, Number(md.toFixed(2)));
      return;
    }
    if (zoneDrag) {
      const { zone, edge, md } = zoneDrag;
      setZoneDrag(null);
      e.currentTarget.releasePointerCapture(e.pointerId);
      onZoneEdge(zone, edge, Number(md.toFixed(2)));
      return;
    }
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    // pick modes act on a click (not a pan) inside the plot
    if (pickMode && !movedRef.current && y > plotTop && y <= plotTop + plotH) {
      const mdM = Number(clampMd(dOf(y)).toFixed(2));
      const px = Math.min(Math.max(8, x + 8), Math.max(8, size.w - 236));
      const py = Math.min(Math.max(8, y + 8), Math.max(8, size.h - 110));
      if (pickMode === 'top') {
        setPopover({ x: px, y: py, kind: 'top', mdM, defaultName: '' });
      } else if (pickMode === 'zone') {
        if (!pick) { setPick({ top: mdM }); return; }
        const topMdM = Math.min(pick.top, mdM);
        const baseMdM = Math.max(pick.top, mdM);
        const above = nearestTopAbove(topMdM);
        setPopover({ x: px, y: py, kind: 'zone', topMdM, baseMdM, defaultName: above ? above.name : `Zone ${(zones || []).length + 1}` });
      }
    }
  };

  const onPopoverConfirm = (name) => {
    const pv = popover;
    setPopover(null);
    if (!pv) return;
    if (pv.kind === 'top' && onTopCreate) onTopCreate(pv.mdM, name);
    if (pv.kind === 'zone' && onZonePick) { onZonePick(pv.topMdM, pv.baseMdM, name); setPick(null); }
  };

  return (
    <div ref={wrapRef} className="h-full min-h-0 w-full relative overflow-hidden" data-testid="petro-tracks" data-pick-mode={pickMode || ''}>
      <canvas
        ref={canvasRef}
        className="cursor-crosshair"
        data-testid="petro-tracks-canvas"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onClick={(e) => {
          if (movedRef.current || !onTrackHeaderClick || !tracks.length || pickMode) return;
          const rect = canvasRef.current.getBoundingClientRect();
          if (e.clientY - rect.top > HEADER_H) return;
          const x = e.clientX - rect.left;
          if (x < AXIS_W) return;
          const g = trackGeometry(tracks, rect.width);
          for (let i = 0; i < g.length; i++) {
            if (x < g[i].x0 + g[i].w) { onTrackHeaderClick(i); return; }
          }
        }}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { setCursor(null); }}
        onWheel={onWheel}
        onDoubleClick={() => { if (!pickMode) setView(null); }}
      />
      {popover && (
        <TopNamePopover
          x={popover.x}
          y={popover.y}
          title={popover.kind === 'top'
            ? `New top at ${depthLabel(popover.mdM, depthUnit)}`
            : `New zone ${depthLabel(popover.topMdM, depthUnit)} to ${depthLabel(popover.baseMdM, depthUnit)}`}
          defaultValue={popover.defaultName}
          names={popover.kind === 'top' ? topNames : shownTops.map((t) => t.name)}
          placeholder={popover.kind === 'top' ? 'Top name' : 'Zone name'}
          onConfirm={onPopoverConfirm}
          onCancel={() => { setPopover(null); if (pickMode === 'zone') setPick(null); }}
          testIdPrefix={popover.kind === 'top' ? 'petro-top' : 'petro-zone-pick'}
        />
      )}
      <span className="absolute bottom-1 right-2 text-[10px] text-slate-600 pointer-events-none">
        {pickMode === 'top' ? 'click: place a top · Esc: finish'
          : pickMode === 'zone' ? 'click the zone top, then its base · Esc: finish'
            : 'wheel: zoom · drag: pan · double-click: full well'}
      </span>
    </div>
  );
}
