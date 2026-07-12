// SliceView — one seismic viewport: WebGL slice + 2D interpretation
// overlay + annotation layer (axes / scale bar / north arrow / colorbar)
// + toolbar + cursor readout, all coordinated by a shared ViewTransform.
//
// Architecture note (deliberate seam for future work): SliceView is
// self-contained per viewport — a Petrel-style tri-panel (inline +
// crossline + time slice side by side), synced cursors between views, or
// a well-tie window are all "render more SliceViews and share/observe
// their transforms". ViewerPanel stays the DATA owner (volume, slice
// assembly, horizon/fault business logic); SliceView owns only how the
// slice is LOOKED AT. New overlays must map through the transform —
// never through canvas proportions.

import React, {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import {
  ZoomIn, ZoomOut, Expand, Maximize, Minimize, Layers, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { SliceRenderer } from '../viewer/SliceRenderer';
import { snapPick } from '../engine/horizonTrack';
import { projectStickToTraverse } from '../engine/traverse';
import { projectWellToSection } from '../engine/wellSection';
import { ViewTransform, MIN_ZOOM, MAX_ZOOM } from '../viewer/viewTransform';
import {
  drawAxes, drawScaleBar, drawNorthArrow, drawColorbar,
  surveySpacing, northScreenDir,
} from '../viewer/annotations';
import { NULL_VALUE } from '../engine/manifest';

const NULL_F32 = Math.fround(NULL_VALUE);
// v2: interpolate now defaults ON (shader bicubic, no GPU extension
// needed). v1 sessions all persisted interpolate:false (the old default),
// so that key is dropped when migrating — every other pref carries over.
const PREFS_KEY = 'seismolord.viewerPrefs.v2';
const LEGACY_PREFS_KEY = 'seismolord.viewerPrefs.v1';
const DEFAULT_PREFS = {
  axes: true,
  grid: false,
  scaleBar: true,
  northArrow: true,
  colorbar: true,
  readout: true,
  crosshair: false,
  interpolate: true,
};
const VEXAG_OPTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 8, 12, 20];

const loadPrefs = () => {
  try {
    const v2 = localStorage.getItem(PREFS_KEY);
    if (v2) return { ...DEFAULT_PREFS, ...JSON.parse(v2) };
    const legacy = JSON.parse(localStorage.getItem(LEGACY_PREFS_KEY) || '{}');
    delete legacy.interpolate;
    return { ...DEFAULT_PREFS, ...legacy };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

/** Gutter sizes in CSS px (0 when axes are hidden). */
const gutters = (showAxes) => (showAxes ? { left: 52, top: 24 } : { left: 0, top: 0 });

/**
 * @param {Object} p
 * @param {?Object} p.slice assembleSlice() result for the current view;
 *   traverse slices additionally carry `positions` ({il,xl} per column)
 *   and `stepM` (ground metres per column, null without coordinates)
 * @param {?Object} p.geom geomFromManifest() result
 * @param {?Object} p.manifest volume manifest (axis values, corners)
 * @param {'inline'|'xline'|'time'|'traverse'} p.orientation traverse
 *   supports the PAINT modes ('manual'/'erase' — picks resolve to IL/XL
 *   through slice.positions, and onPick additionally carries the path
 *   `trace` so erasers can brush along the path); seed/fault picking and
 *   slice stepping stay section-only (callers pass no seed pickMode /
 *   onStepSlice); fault sticks render where they fall within the path
 *   corridor (projectStickToTraverse)
 * @param {number} p.sliceIndex
 * @param {{colormap:string, gain:number, polarity:number, clip:number,
 *          traceBalance:boolean}} p.display clip is ABSOLUTE amplitude
 * @param {{horizons:Array<{grid:Float32Array,color:string}>,
 *          faults:Array<{sticks:Array,color:string}>,
 *          draftSticks:Array, seedPick:?Object,
 *          wells?:Array<{name, color, points:Array, tops:Array}>}}
 *   p.overlays wells carry wellSection lattice paths: corridor-projected
 *   polylines + labeled top ticks on sections/traverses, intersection
 *   markers on time slices
 * @param {?string} p.pickMode null | 'seed' | 'fault' | 'manual' | 'erase'
 *   ('manual'/'erase' are PAINT modes: onPick streams during a drag and
 *   onPickEnd fires when the stroke lifts, so editors can commit an op)
 * @param {?{mode: string, window: number}} p.ghost when set (manual
 *   picking), a ghost marker previews the snapped pick position under
 *   the cursor before any click — circle = snapped to an event, square
 *   = no event nearby (the raw click position would be used)
 * @param {boolean} p.loading
 * @param {(pick:{ilIdx:number,xlIdx:number,sample:number}) => void} p.onPick
 * @param {(delta:number) => void} p.onStepSlice
 * @param {string} [p.emptyHint] placeholder text when there is no slice
 *   (the Traverse window explains its draw-on-map flow here)
 * @param {number} [p.height] viewport CSS height when not fullscreen
 * @param {number} [p.vexag] controlled vertical exaggeration (shared with
 *   the 3D window); omit for the legacy uncontrolled behavior
 * @param {(v:number) => void} [p.onVexagChange]
 */
function SliceView({
  slice, geom, manifest, orientation, sliceIndex, display, overlays,
  pickMode, ghost, loading, onPick, onPickEnd, onStepSlice, height = 520,
  vexag: vexagProp, onVexagChange, emptyHint,
}) {
  const wrapRef = useRef(null);        // fullscreen target (toolbar + view)
  const viewportRef = useRef(null);    // the canvas container
  const glCanvasRef = useRef(null);
  const overlayRef = useRef(null);     // interpretation overlay (inner)
  const annoRef = useRef(null);        // annotations (full viewport)
  const rendererRef = useRef(null);
  const transformRef = useRef(new ViewTransform());
  const rafRef = useRef(0);
  const dragRef = useRef(null);        // {mode:'pan'|'band', ...}
  const cursorRef = useRef(null);      // {sx, sy} device px in inner area
  const propsRef = useRef({});         // latest props for ref-driven redraws
  // Per-frame HUD text goes STRAIGHT to the DOM: a React state update per
  // camera frame / pointer move re-renders the whole component and is what
  // made the controls stutter (dev-mode React renders are 10-40ms each).
  const zoomPctRef = useRef(null);     // toolbar "123%" span
  const readoutValsRef = useRef(null); // cursor readout values span
  const readoutHintRef = useRef(null); // cursor readout hint span
  const timeMatchesRef = useRef(new WeakMap()); // horizon grid -> time-slice cells
  const stickProjRef = useRef(new WeakMap());   // stick -> traverse projection
  const wellProjRef = useRef(new WeakMap());    // well points -> traverse projection
  // Adaptive render resolution: backing-store px per CSS px, starting at
  // devicePixelRatio and stepped down (never below 1) when sustained
  // interaction frames run slow. Frame cost is dominated by backing-store
  // area — hi-dpi displays on weak / software-rendered GPUs are exactly
  // where the camera controls "hang" (measured: identical scene at dpr 1
  // holds 60fps where dpr 2 drops to 10fps on software GL).
  const scaleRef = useRef(null);       // null until first resize (needs dpr)
  const steadyScaleRef = useRef(null); // learned interaction scale (≤ dpr)
  const idleTimerRef = useRef(0);      // pending full-res restore
  const perfRef = useRef({ lastT: 0, ema: 16.7 });

  const [prefs, setPrefs] = useState(loadPrefs);
  // Rare, boundary-only state (button disabling, select value) — changes a
  // handful of times per interaction instead of every frame.
  const [hud, setHud] = useState({ atMinZoom: true, atMaxZoom: false, vexag: 1 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [glError, setGlError] = useState(null);

  const g = gutters(prefs.axes);
  const isSection = orientation !== 'time';

  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
  }, [prefs]);

  // Latest props snapshot so rAF/pointer handlers never see stale closures.
  propsRef.current = {
    slice, geom, manifest, orientation, sliceIndex, display, overlays,
    pickMode, ghost, prefs, gutter: g,
  };

  // ---- axis metadata per orientation ----------------------------------
  const axes = useMemo(() => {
    if (!manifest) return null;
    const gm = manifest.geometry;
    const il = { title: 'IL', valueAtZero: gm.il.min, valuePerCell: gm.il.step };
    const xl = { title: 'XL', valueAtZero: gm.xl.min, valuePerCell: gm.xl.step };
    const twt = { title: 'ms', valueAtZero: 0, valuePerCell: gm.dt_us / 1000 };
    if (orientation === 'inline') return { x: xl, y: twt };
    if (orientation === 'xline') return { x: il, y: twt };
    if (orientation === 'traverse') {
      // columns are equal ground steps along the drawn line; without
      // coordinates the axis falls back to plain trace numbering
      const x = slice?.stepM
        ? { title: 'm', valueAtZero: 0, valuePerCell: slice.stepM }
        : { title: 'trace', valueAtZero: 0, valuePerCell: 1 };
      return { x, y: twt };
    }
    return { x: xl, y: il };
  }, [manifest, orientation, slice]);

  const spacing = useMemo(() => (manifest ? surveySpacing(manifest) : null), [manifest]);
  const northDir = useMemo(() => (manifest ? northScreenDir(manifest) : null), [manifest]);

  // ---- drawing ---------------------------------------------------------

  const drawOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    const p = propsRef.current;
    if (!overlay || !p.geom) return;
    const t = transformRef.current;
    const ctx = overlay.getContext('2d');
    const dpr = scaleRef.current || window.devicePixelRatio || 1;  // render scale
    const W = overlay.width;
    const H = overlay.height;
    ctx.clearRect(0, 0, W, H);
    const lw = Math.max(1.5, 1.5 * dpr);
    const { geom: gm, orientation: ori, sliceIndex: idx, overlays: ov } = p;
    const vis = t.visibleRect();

    for (const { grid, color } of ov.horizons) {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = lw;
      if (ori !== 'time') {
        const posn = ori === 'traverse' ? p.slice?.positions : null;
        if (ori === 'traverse' && !posn) continue;
        const nTraces = ori === 'inline' ? gm.nXl
          : ori === 'xline' ? gm.nIl : posn.length;
        const t0 = Math.max(0, Math.floor(vis.x0) - 1);
        const t1 = Math.min(nTraces - 1, Math.ceil(vis.x0 + vis.w) + 1);
        ctx.beginPath();
        let pen = false;
        for (let tr = t0; tr <= t1; tr++) {
          const cell = ori === 'inline' ? idx * gm.nXl + tr
            : ori === 'xline' ? tr * gm.nXl + idx
              : posn[tr].il * gm.nXl + posn[tr].xl;
          const z = grid[cell];
          if (z === NULL_F32) { pen = false; continue; }
          const s = t.worldToScreen(tr + 0.5, z + 0.5);
          if (pen) ctx.lineTo(s.x, s.y);
          else { ctx.moveTo(s.x, s.y); pen = true; }
        }
        ctx.stroke();
      } else {
        // The full-grid scan (nIl x nXl cells) is far too slow to run per
        // camera frame on real surveys — cache the matching cells per
        // (grid, slice index) and only project the matches each frame.
        let mt = timeMatchesRef.current.get(grid);
        if (!mt || mt.idx !== idx || mt.nXl !== gm.nXl || mt.nIl !== gm.nIl) {
          const pts = [];
          for (let i = 0; i < gm.nIl; i++) {
            for (let x = 0; x < gm.nXl; x++) {
              const z = grid[i * gm.nXl + x];
              if (z !== NULL_F32 && Math.abs(z - idx) <= 0.5) pts.push(x, i);
            }
          }
          mt = { idx, nIl: gm.nIl, nXl: gm.nXl, pts: Int32Array.from(pts) };
          timeMatchesRef.current.set(grid, mt);
        }
        const i0 = Math.max(0, Math.floor(vis.y0));
        const i1 = Math.min(gm.nIl - 1, Math.ceil(vis.y0 + vis.h));
        const x0 = Math.max(0, Math.floor(vis.x0));
        const x1 = Math.min(gm.nXl - 1, Math.ceil(vis.x0 + vis.w));
        const m = Math.max(3, 1.5 * dpr);
        for (let q = 0; q < mt.pts.length; q += 2) {
          const x = mt.pts[q];
          const i = mt.pts[q + 1];
          if (x < x0 || x > x1 || i < i0 || i > i1) continue;
          const s = t.worldToScreen(x + 0.5, i + 0.5);
          ctx.fillRect(s.x - m / 2, s.y - m / 2, m, m);
        }
      }
    }

    const drawSticks = (sticks, color, dashed) => {
      const posn = ori === 'traverse' ? p.slice?.positions : null;
      if (ori === 'traverse' && !posn) return;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = lw;
      ctx.setLineDash(dashed ? [6 * dpr, 4 * dpr] : []);
      const mk = Math.max(4, 2 * dpr);
      for (const stick of sticks) {
        const pts = stick.points || stick;
        if (ori === 'traverse') {
          // stick points within the path corridor draw at their nearest
          // column, pen-breaking where the stick leaves it. The
          // O(points × columns) projection is cached per (stick, path) —
          // never per camera frame.
          let c = stickProjRef.current.get(stick);
          if (!c || c.positions !== posn) {
            c = { positions: posn, proj: projectStickToTraverse(pts, posn) };
            stickProjRef.current.set(stick, c);
          }
          if (!c.proj) continue;
          ctx.beginPath();
          let pen = false;
          let drawn = 0;
          for (const q of c.proj) {
            if (!q) { pen = false; continue; }
            const s = t.worldToScreen(q.trace + 0.5, q.s + 0.5);
            if (pen) ctx.lineTo(s.x, s.y);
            else { ctx.moveTo(s.x, s.y); pen = true; }
            ctx.fillRect(s.x - mk / 2, s.y - mk / 2, mk, mk);
            drawn += 1;
          }
          if (drawn > 1) ctx.stroke();
          continue;
        }
        if (ori !== 'time') {
          const near = pts.filter((q) => (ori === 'inline'
            ? Math.abs(q.il - idx) <= 1 : Math.abs(q.xl - idx) <= 1));
          if (near.length === 0) continue;
          ctx.beginPath();
          near.forEach((q, i) => {
            const tr = ori === 'inline' ? q.xl : q.il;
            const s = t.worldToScreen(tr + 0.5, q.s + 0.5);
            if (i === 0) ctx.moveTo(s.x, s.y);
            else ctx.lineTo(s.x, s.y);
            ctx.fillRect(s.x - mk / 2, s.y - mk / 2, mk, mk);
          });
          if (near.length > 1) ctx.stroke();
        } else {
          for (const q of pts) {
            if (Math.abs(q.s - idx) > 2) continue;
            const s = t.worldToScreen(q.xl + 0.5, q.il + 0.5);
            ctx.fillRect(s.x - mk / 2, s.y - mk / 2, mk, mk);
          }
        }
      }
      ctx.setLineDash([]);
    };
    for (const f of ov.faults) drawSticks(f.sticks, f.color, false);
    if (ov.draftSticks.length) drawSticks(ov.draftSticks, '#fbbf24', true);

    // wells: corridor-projected paths (pen-breaking outside ~1.5 cells,
    // off-survey and out-of-window samples) + labeled top ticks. On
    // traverses the O(points x columns) projection is cached per
    // (points, path) like fault sticks; on sections the filter is a
    // linear pass, same as the sticks' near filter.
    if (ov.wells && ov.wells.length) {
      const posn = ori === 'traverse' ? p.slice?.positions : null;
      ctx.font = `${Math.round(10 * dpr)}px ui-monospace, monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const w of ov.wells) {
        if (ori === 'traverse' && !posn) break;
        ctx.strokeStyle = w.color;
        ctx.fillStyle = w.color;
        ctx.lineWidth = Math.max(2, 1.8 * dpr);
        if (ori === 'time') {
          const m = Math.max(3, 1.5 * dpr);
          for (const q of w.points) {
            if (q.s == null || Math.abs(q.s - idx) > 2) continue;
            const s = t.worldToScreen(q.xl + 0.5, q.il + 0.5);
            ctx.fillRect(s.x - m / 2, s.y - m / 2, m, m);
          }
          continue;
        }
        let proj;
        if (ori === 'traverse') {
          let c = wellProjRef.current.get(w.points);
          if (!c || c.positions !== posn) {
            c = { positions: posn, proj: projectStickToTraverse(w.points, posn) };
            wellProjRef.current.set(w.points, c);
          }
          proj = c.proj;
        } else {
          proj = projectWellToSection(w.points, ori, idx);
        }
        if (proj) {
          ctx.beginPath();
          let pen = false;
          for (const q of proj) {
            if (!q || q.s == null) { pen = false; continue; }
            const s = t.worldToScreen(q.trace + 0.5, q.s + 0.5);
            if (pen) ctx.lineTo(s.x, s.y);
            else { ctx.moveTo(s.x, s.y); pen = true; }
          }
          ctx.stroke();
        }
        for (const tp of w.tops || []) {
          const tv = ori === 'traverse'
            ? projectStickToTraverse([tp], posn)
            : projectWellToSection([tp], ori, idx);
          const at = tv && tv[0];
          if (!at || at.s == null) continue;
          const s = t.worldToScreen(at.trace + 0.5, at.s + 0.5);
          const h = 5 * dpr;
          ctx.beginPath();
          ctx.moveTo(s.x - h, s.y);
          ctx.lineTo(s.x + h, s.y);
          ctx.stroke();
          ctx.lineWidth = 3 * dpr;
          ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
          ctx.strokeText(tp.name, s.x + h + 2 * dpr, s.y);
          ctx.fillText(tp.name, s.x + h + 2 * dpr, s.y);
          ctx.strokeStyle = w.color;
          ctx.lineWidth = Math.max(2, 1.8 * dpr);
        }
      }
    }

    if (ov.seedPick && ori !== 'time' && ori !== 'traverse') {
      const onSlice = ori === 'inline'
        ? ov.seedPick.ilIdx === idx : ov.seedPick.xlIdx === idx;
      if (onSlice) {
        const tr = ori === 'inline' ? ov.seedPick.xlIdx : ov.seedPick.ilIdx;
        const s = t.worldToScreen(tr + 0.5, ov.seedPick.sample + 0.5);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 6 * dpr, 0, Math.PI * 2);
        ctx.moveTo(s.x - 10 * dpr, s.y); ctx.lineTo(s.x + 10 * dpr, s.y);
        ctx.moveTo(s.x, s.y - 10 * dpr); ctx.lineTo(s.x, s.y + 10 * dpr);
        ctx.stroke();
      }
    }

    // ghost pick preview (manual mode): where the click WOULD land —
    // computed from the on-hand slice trace, no fetches. Traverse
    // columns share the section layout (data[col*ns+s]), so the same
    // subarray works there.
    const cur = cursorRef.current;
    if (p.ghost && cur && ori !== 'time' && p.slice
      && (ori !== 'traverse' || p.slice.positions)) {
      const w = t.screenToWorld(cur.sx, cur.sy);
      const nTraces = ori === 'inline' ? gm.nXl
        : ori === 'xline' ? gm.nIl : p.slice.positions.length;
      const trace = Math.floor(w.x);
      if (trace >= 0 && trace < nTraces && w.y >= 0 && w.y < gm.ns) {
        const trData = p.slice.data.subarray(trace * gm.ns, (trace + 1) * gm.ns);
        const hit = snapPick(trData, w.y, p.ghost);
        const sSnap = t.worldToScreen(trace + 0.5, (hit ? hit.sample : w.y) + 0.5);
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
        ctx.lineWidth = 1.5 * dpr;
        if (hit && Math.abs(hit.sample - w.y) > 0.05) {
          const sRaw = t.worldToScreen(trace + 0.5, w.y + 0.5);
          ctx.setLineDash([3 * dpr, 3 * dpr]);
          ctx.beginPath();
          ctx.moveTo(sRaw.x, sRaw.y);
          ctx.lineTo(sSnap.x, sSnap.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        if (hit) ctx.arc(sSnap.x, sSnap.y, 4.5 * dpr, 0, Math.PI * 2);
        else ctx.rect(sSnap.x - 4 * dpr, sSnap.y - 4 * dpr, 8 * dpr, 8 * dpr);
        ctx.moveTo(sSnap.x - 10 * dpr, sSnap.y);
        ctx.lineTo(sSnap.x - 5.5 * dpr, sSnap.y);
        ctx.moveTo(sSnap.x + 5.5 * dpr, sSnap.y);
        ctx.lineTo(sSnap.x + 10 * dpr, sSnap.y);
        ctx.stroke();
      }
    }
  }, []);

  const drawAnnotations = useCallback(() => {
    const anno = annoRef.current;
    const p = propsRef.current;
    if (!anno) return;
    const ctx = anno.getContext('2d');
    ctx.clearRect(0, 0, anno.width, anno.height);
    if (!p.geom || !axes) return;
    const t = transformRef.current;
    const dpr = scaleRef.current || window.devicePixelRatio || 1;  // render scale
    const gl = Math.round(p.gutter.left * dpr);
    const gt = Math.round(p.gutter.top * dpr);
    const pr = p.prefs;

    if (pr.axes) {
      drawAxes(ctx, {
        transform: t, dpr, gutterLeft: gl, gutterTop: gt,
        xAxis: axes.x, yAxis: axes.y, grid: pr.grid,
      });
    }

    if (pr.scaleBar && spacing) {
      // horizontal ground distance: crosslines on inline/time views,
      // inlines on crossline views, the resample step along traverses
      // (sections' vertical axis is time — no ground scale there).
      const perCell = p.orientation === 'traverse' ? (p.slice?.stepM || 0)
        : p.orientation === 'xline' ? spacing.ilSpacing : spacing.xlSpacing;
      if (perCell > 0) {
        drawScaleBar(ctx, {
          x: gl + 14 * dpr, y: anno.height - 12 * dpr,
          metersPerPx: perCell / t.ppx, dpr, maxPx: 170 * dpr,
        });
      }
    }

    if (pr.northArrow && p.orientation === 'time' && northDir) {
      drawNorthArrow(ctx, {
        x: anno.width - 30 * dpr, y: gt + 30 * dpr, dir: northDir, dpr,
      });
    }

    if (pr.colorbar && rendererRef.current) {
      const h = Math.min(150 * dpr, anno.height * 0.4);
      drawColorbar(ctx, {
        x: anno.width - 24 * dpr, y: anno.height - h - 24 * dpr,
        w: 12 * dpr, h, lut: rendererRef.current.lut,
        ampAtEnds: p.display.clip / Math.max(p.display.gain, 1e-12), dpr,
      });
    }

    if (pr.crosshair && cursorRef.current) {
      const { sx, sy } = cursorRef.current;
      ctx.save();
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(gl, gt + sy); ctx.lineTo(anno.width, gt + sy);
      ctx.moveTo(gl + sx, gt); ctx.lineTo(gl + sx, anno.height);
      ctx.stroke();
      ctx.restore();
    }

    const band = dragRef.current;
    if (band && band.mode === 'band' && band.x1 !== undefined) {
      ctx.save();
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.9)';
      ctx.fillStyle = 'rgba(34, 211, 238, 0.12)';
      ctx.lineWidth = dpr;
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      const x = gl + Math.min(band.x0, band.x1);
      const y = gt + Math.min(band.y0, band.y1);
      const w = Math.abs(band.x1 - band.x0);
      const h = Math.abs(band.y1 - band.y0);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }
  }, [axes, spacing, northDir]);

  /** Push the camera to the shader and repaint every layer. */
  const applyView = useCallback(() => {
    const t = transformRef.current;
    if (rendererRef.current) {
      rendererRef.current.setView(t.viewUniform());
      rendererRef.current.render();
    }
    drawOverlay();
    drawAnnotations();
    if (zoomPctRef.current) {
      zoomPctRef.current.textContent = `${Math.round(t.zoom * 100)}%`;
    }
    const atMinZoom = t.zoom <= MIN_ZOOM;
    const atMaxZoom = t.zoom >= MAX_ZOOM;
    setHud((h) => (h.atMinZoom === atMinZoom && h.atMaxZoom === atMaxZoom
      && h.vexag === t.vexag
      ? h : { atMinZoom, atMaxZoom, vexag: t.vexag }));
  }, [drawOverlay, drawAnnotations]);

  // ---- sizing ----------------------------------------------------------
  const resizeCanvases = useCallback(() => {
    const viewport = viewportRef.current;
    const glCanvas = glCanvasRef.current;
    const overlay = overlayRef.current;
    const anno = annoRef.current;
    if (!viewport || !glCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    if (scaleRef.current == null) scaleRef.current = dpr;
    const scale = Math.min(scaleRef.current, dpr);
    const cw = viewport.clientWidth;
    const ch = viewport.clientHeight;
    const { gutter } = propsRef.current;
    const iw = Math.max(1, cw - gutter.left);
    const ih = Math.max(1, ch - gutter.top);
    glCanvas.width = Math.round(iw * scale);
    glCanvas.height = Math.round(ih * scale);
    overlay.width = glCanvas.width;
    overlay.height = glCanvas.height;
    anno.width = Math.round(cw * scale);
    anno.height = Math.round(ch * scale);
    transformRef.current.setViewport(glCanvas.width, glCanvas.height);
  }, []);

  /**
   * Called once per interactive frame with the rAF timestamp: when a
   * CONTINUOUS interaction (gap < 200ms between redraws) sustains a slow
   * frame EMA, drop the render scale one notch and repaint. The learned
   * scale sticks for the interaction (steadyScaleRef) so the next drag
   * re-enters it after ONE full-res frame instead of re-paying the slow
   * ramp; scheduleIdleRestore() brings the RESTING image back to full
   * devicePixelRatio, so downgrades cost interactive sharpness only.
   */
  const adaptQuality = useCallback((t) => {
    const q = perfRef.current;
    const dt = q.lastT ? t - q.lastT : 0;
    q.lastT = t;
    if (dt <= 0 || dt > 200) return;
    const steady = steadyScaleRef.current;
    if (steady != null && steady < (scaleRef.current || 1)) {
      scaleRef.current = steady;      // re-enter the learned scale at once
      q.ema = 16.7;
      resizeCanvases();
      applyView();
      return;
    }
    q.ema = 0.8 * q.ema + 0.2 * dt;
    if (q.ema > 32 && (scaleRef.current || 1) > 1) {
      scaleRef.current = Math.max(1, scaleRef.current * 0.75);
      steadyScaleRef.current = scaleRef.current;
      q.ema = 16.7;
      resizeCanvases();
      applyView();          // resize clears the canvases — repaint now
    }
  }, [resizeCanvases, applyView]);

  /** ~250ms after the last interactive frame: one repaint at full dpr. */
  const scheduleIdleRestore = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = 0;
      const dpr = window.devicePixelRatio || 1;
      if ((scaleRef.current || dpr) >= dpr) return;
      // probe upward so a machine that got faster sheds the downgrade
      steadyScaleRef.current = Math.min(dpr, (steadyScaleRef.current || dpr) * 1.25);
      scaleRef.current = dpr;
      resizeCanvases();
      applyView();
    }, 250);
  }, [resizeCanvases, applyView]);

  const scheduleView = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame((t) => {
      rafRef.current = 0;
      applyView();
      adaptQuality(t);
      scheduleIdleRestore();
    });
  }, [applyView, adaptQuality, scheduleIdleRestore]);

  useLayoutEffect(() => {
    resizeCanvases();
    applyView();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      resizeCanvases();
      applyView();
    });
    ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [resizeCanvases, applyView, prefs.axes]);

  // ---- renderer lifecycle ----------------------------------------------
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (rendererRef.current) {
      rendererRef.current.destroy();
      rendererRef.current = null;
    }
  }, []);

  // upload the slice + camera world when the slice changes
  useEffect(() => {
    if (!slice || !geom || !glCanvasRef.current) return;
    try {
      if (!rendererRef.current) {
        rendererRef.current = new SliceRenderer(glCanvasRef.current);
        rendererRef.current.onRestore = () => scheduleView();
      }
      setGlError(null);
    } catch (e) {
      setGlError(e.message);
      return;
    }
    const t = transformRef.current;
    if (isSection) t.setWorld(slice.height, slice.width);   // traces x samples
    else t.setWorld(slice.width, slice.height);             // crosslines x inlines
    rendererRef.current.setSlice(slice, isSection);
    applyView();
  }, [slice, geom, isSection, applyView, scheduleView]);

  // display params (shader-only, no re-upload). `slice` is a dep because
  // the renderer is CREATED by the slice effect above: without it, params
  // set before the first slice (renderer still null) would never be
  // applied and the renderer would keep its constructor defaults.
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.setColormap(display.colormap);
    r.setParams({
      gain: display.gain,
      polarity: display.polarity,
      clip: display.clip,
      traceBalance: display.traceBalance,
      interpolate: prefs.interpolate,
    });
    scheduleView();
  }, [slice, display, prefs.interpolate, scheduleView]);

  // overlays / prefs / ghost mode changed -> repaint 2D layers
  useEffect(() => { scheduleView(); }, [overlays, prefs, ghost, scheduleView]);

  // controlled exaggeration (shared with the 3D window)
  useEffect(() => {
    if (vexagProp == null) return;
    const t = transformRef.current;
    if (t.vexag !== vexagProp) {
      t.setVexag(vexagProp);
      scheduleView();
    }
  }, [vexagProp, scheduleView]);

  // ---- interactions ------------------------------------------------------
  const toDevice = useCallback((e) => {
    const rect = overlayRef.current.getBoundingClientRect();
    const dpr = scaleRef.current || window.devicePixelRatio || 1;  // render scale
    return { sx: (e.clientX - rect.left) * dpr, sy: (e.clientY - rect.top) * dpr };
  }, []);

  /** Device screen point -> {ilIdx, xlIdx, sample|null, inData} */
  const pickAt = useCallback((sx, sy) => {
    const p = propsRef.current;
    if (!p.geom) return null;
    const w = transformRef.current.screenToWorld(sx, sy);
    const gm = p.geom;
    if (p.orientation === 'traverse') {
      const posn = p.slice?.positions;
      if (!posn) return null;
      const trace = Math.floor(w.x);
      const sample = w.y;
      const inData = trace >= 0 && trace < posn.length && sample >= 0 && sample < gm.ns;
      const cl = Math.min(Math.max(trace, 0), posn.length - 1);
      return {
        ilIdx: posn[cl].il,
        xlIdx: posn[cl].xl,
        sample: Math.min(Math.max(sample, 0), gm.ns - 1e-3),
        inData,
        trace: cl,
      };
    }
    if (p.orientation !== 'time') {
      const nTraces = p.orientation === 'inline' ? gm.nXl : gm.nIl;
      const trace = Math.floor(w.x);
      const sample = w.y;
      const inData = trace >= 0 && trace < nTraces && sample >= 0 && sample < gm.ns;
      return {
        ilIdx: p.orientation === 'inline' ? p.sliceIndex : Math.min(Math.max(trace, 0), gm.nIl - 1),
        xlIdx: p.orientation === 'inline' ? Math.min(Math.max(trace, 0), gm.nXl - 1) : p.sliceIndex,
        sample: Math.min(Math.max(sample, 0), gm.ns - 1e-3),
        inData,
      };
    }
    const xlIdx = Math.floor(w.x);
    const ilIdx = Math.floor(w.y);
    const inData = xlIdx >= 0 && xlIdx < gm.nXl && ilIdx >= 0 && ilIdx < gm.nIl;
    return {
      ilIdx: Math.min(Math.max(ilIdx, 0), gm.nIl - 1),
      xlIdx: Math.min(Math.max(xlIdx, 0), gm.nXl - 1),
      sample: p.sliceIndex,
      inData,
    };
  }, []);

  /** Ref-driven readout: no React re-render per pointer move. */
  const setCursorReadout = useCallback((info) => {
    const vals = readoutValsRef.current;
    const hint = readoutHintRef.current;
    if (!vals || !hint) return;
    if (info) {
      vals.textContent = `IL ${info.il}   XL ${info.xl}   ${info.ms.toFixed(1)} ms   `
        + `amp ${info.amp === null ? 'null' : info.amp.toExponential(3)}`;
      vals.style.display = '';
      hint.style.display = 'none';
    } else {
      vals.style.display = 'none';
      hint.style.display = '';
    }
  }, []);

  const updateCursorInfo = useCallback((sx, sy) => {
    const p = propsRef.current;
    const hit = pickAt(sx, sy);
    if (!hit || !hit.inData || !p.slice || !p.manifest) {
      setCursorReadout(null);
      return;
    }
    const gm = p.geom;
    const geo = p.manifest.geometry;
    const sampleIdx = Math.floor(hit.sample);
    let amp;
    if (p.orientation === 'inline') amp = p.slice.data[hit.xlIdx * gm.ns + sampleIdx];
    else if (p.orientation === 'xline') amp = p.slice.data[hit.ilIdx * gm.ns + sampleIdx];
    else if (p.orientation === 'traverse') amp = p.slice.data[hit.trace * gm.ns + sampleIdx];
    else amp = p.slice.data[hit.ilIdx * gm.nXl + hit.xlIdx];
    setCursorReadout({
      il: geo.il.min + hit.ilIdx * geo.il.step,
      xl: geo.xl.min + hit.xlIdx * geo.xl.step,
      ms: (p.orientation === 'time' ? p.sliceIndex : hit.sample) * (geo.dt_us / 1000),
      amp: amp === NULL_F32 ? null : amp,
    });
  }, [pickAt, setCursorReadout]);

  const isPaintMode = pickMode === 'manual' || pickMode === 'erase';

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();                       // middle-drag: no autoscroll
    e.currentTarget.setPointerCapture(e.pointerId);
    const { sx, sy } = toDevice(e);
    if (e.shiftKey && e.button === 0) {
      dragRef.current = { mode: 'band', x0: sx, y0: sy };
    } else if (isPaintMode && e.button === 0) {
      // paint stroke: stream picks from the very first point
      dragRef.current = { mode: 'paint' };
      const hit = pickAt(sx, sy);
      if (hit && hit.inData && onPick) onPick(hit);
    } else {
      dragRef.current = {
        mode: 'pan', lastX: sx, lastY: sy, moved: false, button: e.button,
      };
    }
  }, [toDevice, isPaintMode, pickAt, onPick]);

  const onPointerMove = useCallback((e) => {
    const { sx, sy } = toDevice(e);
    cursorRef.current = { sx, sy };
    const d = dragRef.current;
    if (d && d.mode === 'pan') {
      const dx = sx - d.lastX;
      const dy = sy - d.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 0) {
        if (!d.moved && Math.hypot(dx, dy) > 3) d.moved = true;
        if (d.moved) {
          transformRef.current.panBy(dx, dy);
          d.lastX = sx;
          d.lastY = sy;
          scheduleView();
        }
      }
    } else if (d && d.mode === 'band') {
      d.x1 = sx;
      d.y1 = sy;
      scheduleView();
    } else if (d && d.mode === 'paint') {
      const hit = pickAt(sx, sy);
      if (hit && hit.inData && onPick) onPick(hit);
    } else {
      updateCursorInfo(sx, sy);
      if (propsRef.current.prefs.crosshair || propsRef.current.ghost) scheduleView();
    }
  }, [toDevice, scheduleView, updateCursorInfo, pickAt, onPick]);

  const onPointerUp = useCallback((e) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.mode === 'paint') {
      if (onPickEnd) onPickEnd();
      return;
    }
    const { sx, sy } = toDevice(e);
    if (d.mode === 'band') {
      if (d.x1 !== undefined && Math.abs(d.x1 - d.x0) > 8 && Math.abs(d.y1 - d.y0) > 8) {
        transformRef.current.zoomToRect(d.x0, d.y0, d.x1, d.y1);
      }
      scheduleView();
      return;
    }
    if (!d.moved && d.button === 0 && propsRef.current.pickMode) {
      const hit = pickAt(sx, sy);
      if (hit && hit.inData && onPick) onPick(hit);
    }
    scheduleView();   // clears any band remnants, syncs HUD
  }, [toDevice, pickAt, onPick, onPickEnd, scheduleView]);

  const onPointerLeave = useCallback(() => {
    cursorRef.current = null;
    setCursorReadout(null);
    if (propsRef.current.prefs.crosshair || propsRef.current.ghost) scheduleView();
  }, [scheduleView, setCursorReadout]);

  const onDoubleClick = useCallback((e) => {
    const { sx, sy } = toDevice(e);
    transformRef.current.zoomAt(2, sx, sy);
    scheduleView();
  }, [toDevice, scheduleView]);

  // non-passive wheel: zoom at cursor; Shift+wheel steps slices
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      if (e.shiftKey) {
        if (onStepSlice) onStepSlice(e.deltaY > 0 ? 1 : -1);
        return;
      }
      const rect = el.getBoundingClientRect();
      const dpr = scaleRef.current || window.devicePixelRatio || 1;  // render scale
      const sx = (e.clientX - rect.left) * dpr;
      const sy = (e.clientY - rect.top) * dpr;
      transformRef.current.zoomAt(e.deltaY > 0 ? 1 / 1.25 : 1.25, sx, sy);
      scheduleView();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scheduleView, onStepSlice]);

  const onKeyDown = useCallback((e) => {
    const t = transformRef.current;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      if (onStepSlice) { onStepSlice(-1); e.preventDefault(); }
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      if (onStepSlice) { onStepSlice(1); e.preventDefault(); }
    } else if (e.key === '+' || e.key === '=') {
      t.zoomAt(1.25, t.vw / 2, t.vh / 2);
      scheduleView();
    } else if (e.key === '-') {
      t.zoomAt(1 / 1.25, t.vw / 2, t.vh / 2);
      scheduleView();
    } else if (e.key === '0') {
      t.fit();
      scheduleView();
    }
  }, [onStepSlice, scheduleView]);

  // ---- toolbar actions ---------------------------------------------------
  const zoomCenter = (f) => {
    const t = transformRef.current;
    t.zoomAt(f, t.vw / 2, t.vh / 2);
    scheduleView();
  };
  const fitView = () => { transformRef.current.fit(); scheduleView(); };
  const setVexag = (v) => {
    transformRef.current.setVexag(v);
    scheduleView();
    if (onVexagChange) onVexagChange(v);
  };

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

  const togglePref = (key) => setPrefs((p0) => ({ ...p0, [key]: !p0[key] }));

  // ---- render ------------------------------------------------------------
  return (
    <div
      ref={wrapRef}
      className={`flex flex-col ${isFullscreen ? 'h-screen bg-slate-950 p-2' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-1 mb-1">
        <Button variant="outline" size="sm" title="Zoom in (+ / wheel)"
          onClick={() => zoomCenter(1.25)} disabled={!slice}
        >
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" title="Zoom out (-)"
          onClick={() => zoomCenter(1 / 1.25)} disabled={!slice || hud.atMinZoom}
        >
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" title="Fit to window (0)"
          onClick={fitView} disabled={!slice}
        >
          <Expand className="w-4 h-4" />
        </Button>
        <span
          ref={zoomPctRef}
          className="text-xs text-slate-400 w-14 text-center tabular-nums"
        >
          100%
        </span>

        <span className="text-xs text-slate-400 ml-1">V.exag</span>
        <select
          className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs"
          value={String(hud.vexag)}
          onChange={(e) => setVexag(Number(e.target.value))}
          disabled={!slice}
          title="Vertical exaggeration (relative to fit)"
        >
          {(VEXAG_OPTIONS.includes(hud.vexag) ? VEXAG_OPTIONS
            : [...VEXAG_OPTIONS, hud.vexag].sort((a, b) => a - b)).map((v) => (
              <option key={v} value={String(v)}>{`x${v}`}</option>
          ))}
        </select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" title="Display layers">
              <Layers className="w-4 h-4 mr-1" />
              <span className="text-xs">Layers</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Annotations</DropdownMenuLabel>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()} checked={prefs.axes}
              onCheckedChange={() => togglePref('axes')}
            >
              Axes ({isSection ? 'line / TWT' : 'XL / IL'})
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()} checked={prefs.grid}
              onCheckedChange={() => togglePref('grid')} disabled={!prefs.axes}
            >
              Grid lines
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()} checked={prefs.scaleBar}
              onCheckedChange={() => togglePref('scaleBar')} disabled={!spacing}
            >
              Scale bar{!spacing ? ' (no coordinates)' : ''}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()} checked={prefs.northArrow}
              onCheckedChange={() => togglePref('northArrow')}
              disabled={isSection || !northDir}
            >
              North arrow{isSection ? ' (time slice)' : !northDir ? ' (no coordinates)' : ''}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()} checked={prefs.colorbar}
              onCheckedChange={() => togglePref('colorbar')}
            >
              Amplitude colorbar
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Cursor & rendering</DropdownMenuLabel>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()} checked={prefs.readout}
              onCheckedChange={() => togglePref('readout')}
            >
              Position readout
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()} checked={prefs.crosshair}
              onCheckedChange={() => togglePref('crosshair')}
            >
              Crosshair
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()} checked={prefs.interpolate}
              onCheckedChange={() => togglePref('interpolate')}
            >
              Smooth interpolation
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" size="sm" onClick={toggleFullscreen}
          title="Fullscreen" className="ml-auto"
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </Button>
      </div>

      <div
        ref={viewportRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={`relative rounded-lg border border-slate-800 bg-slate-950 overflow-hidden
          outline-none focus:border-slate-600 ${isFullscreen ? 'flex-1' : ''}`}
        style={isFullscreen ? undefined : { height }}
      >
        <div
          className="absolute"
          style={{ left: g.left, top: g.top, right: 0, bottom: 0 }}
        >
          <canvas ref={glCanvasRef} className="w-full h-full block" />
          <canvas
            ref={overlayRef}
            className={`absolute inset-0 w-full h-full touch-none ${pickMode
              ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            onDoubleClick={onDoubleClick}
          />
        </div>
        <canvas ref={annoRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        {!slice && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-8 text-slate-500 text-sm">
            {emptyHint || 'Select an ingested volume to view sections.'}
          </div>
        )}
        {loading && (
          <div className="absolute top-2 right-2 text-cyan-300">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}
        {glError && (
          <div className="absolute inset-x-0 bottom-0 bg-red-950/80 text-red-300 text-xs p-2">
            {glError}
          </div>
        )}
      </div>

      {prefs.readout && (
        <div className="flex items-center gap-4 text-xs text-slate-400 font-mono mt-1 h-5">
          {/* both spans are ref-driven (setCursorReadout) so pointer moves
              never re-render the component */}
          <span ref={readoutValsRef} className="whitespace-pre" style={{ display: 'none' }} />
          <span ref={readoutHintRef} className="text-slate-600">
            drag: pan · wheel: zoom · Shift+drag: zoom box · Shift+wheel / arrows: step slice
            · dbl-click: zoom in
          </span>
          {hud.atMaxZoom && <span className="text-amber-500">max zoom</span>}
        </div>
      )}
    </div>
  );
}

// Memoized: ViewerPanel re-renders on every gain/clip slider tick, loading
// flip and list update — none of that should re-render the viewport when
// the actual viewer props (all memoized upstream) are unchanged.
export default React.memo(SliceView);
