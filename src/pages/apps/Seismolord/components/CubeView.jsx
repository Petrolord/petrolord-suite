// CubeView — the 3D window: survey cube wireframe + any combination of
// the inline / crossline / time slice planes (or the whole cube as its
// six boundary faces), orbit camera, axis annotations, dark/light
// background, screenshot, fullscreen.
//
// Sync contract with the 2D viewer (deliberate): DATA and DISPLAY state
// are shared — slice indices, colormap, gain/clip/polarity/balance and
// vertical exaggeration arrive as props, so moving the 2D slice slider
// or any display control updates the 3D planes live, and stepping a
// plane here (Shift+wheel over it) pushes back through onChangeIndex.
// CAMERAS stay independent: a 2D zoom rectangle has no meaningful
// equivalent in an orbiting perspective camera, and forcing one would
// fight the user. Clicking a plane selects that orientation in 2D
// (onSelectPlane) — that is the deliberate 3D -> 2D navigation gesture.

import React, {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import {
  ZoomIn, ZoomOut, Expand, Maximize, Minimize, Layers, Loader2,
  Sun, Moon, Camera,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { CubeRenderer } from '../viewer/CubeRenderer';
import {
  OrbitCamera, cubeExtents, planeQuad, cubeEdges, intersectQuad, niceTicks,
} from '../viewer/cube3d';
import {
  horizonMesh, faultPolylines, faultRibbonMesh, hexToRgb,
  wellPolylines, wellTopMarkers,
} from '../viewer/interpMesh';
import { surveySpacing, northLocalDir } from '../viewer/annotations';
import { assembleSlice } from '../engine/sliceAssembly';
import { ABORTED } from '../engine/brickCache';
import { NULL_VALUE } from '../engine/manifest';

const NULL_F32 = Math.fround(NULL_VALUE);
const PREFS_KEY = 'seismolord.cubePrefs.v1';
const DEFAULT_PREFS = {
  inline: true,
  xline: true,
  time: false,
  faces: false,
  labels: true,
  smooth: true,
  horizons: true,
  faults: true,
  wells: true,
  gizmo: true,
  bg: 'dark',
};

// axis gizmo colors: XL (model +x), IL (model +z), Z/time (model -y, down)
const GIZMO_AXES = [
  { key: 'xl', label: 'XL', dir: [1, 0, 0], color: '#f87171' },
  { key: 'il', label: 'IL', dir: [0, 0, 1], color: '#4ade80' },
  { key: 'z', label: 'Z', dir: [0, -1, 0], color: '#60a5fa' },
];
const ORIENTATIONS = ['inline', 'xline', 'time'];
// boundary faces for the "entire cube" look: [plane id, orientation, which end]
const FACES = [
  ['fIl0', 'inline', 0], ['fIl1', 'inline', 1],
  ['fXl0', 'xline', 0], ['fXl1', 'xline', 1],
  ['fT0', 'time', 0], ['fT1', 'time', 1],
];

const loadPrefs = () => {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

const INK = {
  dark: 'rgba(203, 213, 225, 0.92)',
  light: 'rgba(51, 65, 85, 0.95)',
};

/**
 * @param {Object} p
 * @param {?Object} p.geom geomFromManifest() result
 * @param {?Object} p.manifest volume manifest
 * @param {?Function} p.getBrick (i,j,k) => Promise<Float32Array>
 * @param {{inline:number, xline:number, time:number}} p.indices
 * @param {(orientation:string, index:number) => void} [p.onChangeIndex]
 * @param {{colormap, gain, polarity, clip, traceBalance}} p.display
 * @param {number} p.vexag shared vertical exaggeration
 * @param {Array<{id, name, grid: Float32Array, color: string}>} [p.horizons]
 *   VISIBLE horizons (shared visibility state with the 2D window)
 * @param {Array<{id, sticks, color: string}>} [p.faults] visible faults
 * @param {Array<{id, name, color, points: Array, tops: Array}>} [p.wells]
 *   visible wells' lattice paths (wellSection.buildWellLatticePath) —
 *   drawn as cube-space polylines with 3D-cross top markers
 * @param {(orientation:string) => void} [p.onSelectPlane]
 * @param {() => void} [p.onRendered] fired after each GL frame (harness)
 * @param {number} [p.height]
 */
function CubeView({
  geom, manifest, getBrick, indices, onChangeIndex, display, vexag,
  horizons, faults, wells, onSelectPlane, onRendered, height = 520,
  depthConv = null,
}) {
  const wrapRef = useRef(null);
  const viewportRef = useRef(null);
  const glCanvasRef = useRef(null);
  const overlayRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(new OrbitCamera());
  const rafRef = useRef(0);
  const dragRef = useRef(null);          // {mode:'orbit'|'pan', x, y, moved}
  const hoverPlaneRef = useRef(null);    // plane id under the cursor
  const planesMetaRef = useRef(new Map()); // id -> {orientation, index, slice}
  const seqRef = useRef({ inline: 0, xline: 0, time: 0, faces: 0 });
  const facesCacheRef = useRef(new Map()); // `${o}-${idx}` -> slice
  const fittedRef = useRef(false);
  const scaleRef = useRef(null);
  const perfRef = useRef({ lastT: 0, ema: 16.7 });
  const idleTimerRef = useRef(0);
  const readoutRef = useRef(null);
  const propsRef = useRef({});
  const hzCacheRef = useRef(new Map());    // horizon id -> {grid, mesh}
  const fltCacheRef = useRef(new Map());   // fault id -> {sticks, lines, ribbon}
  const wellCacheRef = useRef(new Map());  // well id -> {points, lines, tops}
  const activeHzRef = useRef(new Set());   // mesh ids currently in the renderer
  const activeFltRef = useRef(new Set());
  const activeWellRef = useRef(new Set());
  const gizmoRef = useRef(null);           // {cx, cy, r, tips:[{x,y,axis}]} device px

  const [prefs, setPrefs] = useState(loadPrefs);
  const [busy, setBusy] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [glError, setGlError] = useState(null);

  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
  }, [prefs]);

  const ext = useMemo(
    () => (geom ? cubeExtents(manifest, geom, vexag) : null),
    [manifest, geom, vexag],
  );
  const spacing = useMemo(() => (manifest ? surveySpacing(manifest) : null), [manifest]);
  const northLocal = useMemo(() => (manifest ? northLocalDir(manifest) : null), [manifest]);

  propsRef.current = {
    geom, manifest, ext, prefs, display, indices, spacing, northLocal,
    depthConv,
  };

  // ---- rendering --------------------------------------------------------

  const drawOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    const p = propsRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    gizmoRef.current = null;
    if (!p.geom || !p.ext || !p.manifest) return;
    const cam = cameraRef.current;
    const W = overlay.width;
    const H = overlay.height;
    const dpr = scaleRef.current || window.devicePixelRatio || 1;
    const mvp = cam.viewProj(W, H);
    const ink = INK[p.prefs.bg];
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.font = `${Math.round(10 * dpr)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ---- axis orientation gizmo (bottom-left, camera-locked) ----------
    if (p.prefs.gizmo) {
      const t = [p.ext.X / 2, -p.ext.D / 2, p.ext.Z / 2];
      const c0 = cam.project(mvp, t, W, H);
      if (c0) {
        const R = 26 * dpr;
        const cx = 44 * dpr;
        const cy = H - 44 * dpr;
        const eps = 0.25;
        const axes = GIZMO_AXES.map((a) => {
          const s = cam.project(mvp, [
            t[0] + a.dir[0] * eps, t[1] + a.dir[1] * eps, t[2] + a.dir[2] * eps,
          ], W, H);
          if (!s) return null;
          const dx = s.x - c0.x;
          const dy = s.y - c0.y;
          const len = Math.hypot(dx, dy);
          return {
            ...a,
            ux: len > 1e-6 ? dx / len : 0,
            uy: len > 1e-6 ? dy / len : 0,
            depth: s.depth - c0.depth,
            fore: len,               // projected length: foreshortening cue
          };
        }).filter(Boolean);
        const maxFore = Math.max(...axes.map((a) => a.fore), 1e-9);
        axes.sort((a, b) => b.depth - a.depth);   // far first, near on top
        ctx.save();
        ctx.beginPath();
        ctx.fillStyle = p.prefs.bg === 'light'
          ? 'rgba(241, 245, 249, 0.78)' : 'rgba(15, 23, 42, 0.68)';
        ctx.arc(cx, cy, R + 11 * dpr, 0, Math.PI * 2);
        ctx.fill();
        const tips = [];
        for (const a of axes) {
          const L = R * Math.max(0.18, a.fore / maxFore);
          const tx = cx + a.ux * L;
          const ty = cy + a.uy * L;
          ctx.strokeStyle = a.color;
          ctx.fillStyle = a.color;
          ctx.lineWidth = 1.6 * dpr;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(tx, ty, 3 * dpr, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText(a.label,
            cx + a.ux * (L + 9 * dpr), cy + a.uy * (L + 9 * dpr));
          tips.push({ x: tx, y: ty, key: a.key });
        }
        ctx.restore();
        ctx.fillStyle = ink;
        ctx.strokeStyle = ink;
        gizmoRef.current = { cx, cy, r: R + 11 * dpr, tips };
      }
    }

    if (!p.prefs.labels) return;
    const { X, D, Z } = p.ext;
    const centre = cam.project(mvp, [X / 2, -D / 2, Z / 2], W, H);
    if (!centre) return;

    // a labelled point pushed outward from the cube's screen centre so
    // labels never sit on top of the data
    const label = (model, text, push = 16) => {
      const s = cam.project(mvp, model, W, H);
      if (!s) return;
      const dx = s.x - centre.x;
      const dy = s.y - centre.y;
      const len = Math.hypot(dx, dy) || 1;
      ctx.fillText(text, s.x + (dx / len) * push * dpr, s.y + (dy / len) * push * dpr);
    };

    const geo = p.manifest.geometry;
    const nearerEnd = (a, b) => {
      const pa = cam.project(mvp, a, W, H);
      const pb = cam.project(mvp, b, W, H);
      if (!pa) return b;
      if (!pb) return a;
      return pa.depth <= pb.depth ? a : b;
    };

    // XL axis: along X on the bottom face, on the nearer of z=0 / z=Z
    {
      const zE = nearerEnd([X / 2, -D, 0], [X / 2, -D, Z])[2];
      const xlMax = geo.xl.min + (p.geom.nXl - 1) * geo.xl.step;
      for (const v of niceTicks(geo.xl.min, xlMax, 5)) {
        const f = (v - geo.xl.min) / Math.max(xlMax - geo.xl.min, 1e-9);
        label([f * X, -D, zE], String(Math.round(v)));
      }
      label([X / 2, -D, zE], 'XL', 34);
    }
    // IL axis: along Z on the bottom face, on the nearer of x=0 / x=X
    {
      const xE = nearerEnd([0, -D, Z / 2], [X, -D, Z / 2])[0];
      const ilMax = geo.il.min + (p.geom.nIl - 1) * geo.il.step;
      for (const v of niceTicks(geo.il.min, ilMax, 5)) {
        const f = (v - geo.il.min) / Math.max(ilMax - geo.il.min, 1e-9);
        label([xE, -D, f * Z], String(Math.round(v)));
      }
      label([xE, -D, Z / 2], 'IL', 34);
    }
    // TWT axis: the vertical edge that projects left-most on screen
    {
      const verticals = [[0, 0], [X, 0], [X, Z], [0, Z]];
      let best = verticals[0];
      let bestX = Infinity;
      for (const [vx, vz] of verticals) {
        const s = cam.project(mvp, [vx, -D / 2, vz], W, H);
        if (s && s.x < bestX) { bestX = s.x; best = [vx, vz]; }
      }
      const msMax = ((p.geom.ns - 1) * geo.dt_us) / 1000;
      for (const v of niceTicks(0, msMax, 5)) {
        label([best[0], -(v / Math.max(msMax, 1e-9)) * D, best[1]], String(Math.round(v)));
      }
      label([best[0], -D / 2, best[1]], 'TWT ms', 40);
    }

    // north arrow: world +Y in the survey's local frame (cube X = xl
    // axis, cube Z = il axis, both proportional to ground metres) —
    // rotated surveys get the true bearing
    if (p.northLocal) {
      const n = [p.northLocal.xl, 0, p.northLocal.il];
      const a = cam.project(mvp, [X / 2, 0, Z / 2], W, H);
      const b = cam.project(mvp, [X / 2 + n[0] * 0.2, 0, Z / 2 + n[2] * 0.2], W, H);
      if (a && b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len > 1e-3) {
          const ux = dx / len;
          const uy = dy / len;
          const cx = W - 34 * dpr;
          const cy = 34 * dpr;
          const L = 14 * dpr;
          ctx.beginPath();
          ctx.moveTo(cx - ux * L, cy - uy * L);
          ctx.lineTo(cx + ux * L, cy + uy * L);
          ctx.lineWidth = dpr;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx + ux * L, cy + uy * L);
          ctx.lineTo(cx + ux * L - (ux * 5 + uy * 3) * dpr, cy + uy * L - (uy * 5 - ux * 3) * dpr);
          ctx.lineTo(cx + ux * L - (ux * 5 - uy * 3) * dpr, cy + uy * L - (uy * 5 + ux * 3) * dpr);
          ctx.closePath();
          ctx.fill();
          ctx.fillText('N', cx + ux * (L + 8 * dpr), cy + uy * (L + 8 * dpr));
        }
      }
    }
  }, []);

  const renderFrame = useCallback(() => {
    const r = rendererRef.current;
    const glCanvas = glCanvasRef.current;
    if (!r || !glCanvas || glCanvas.width === 0) return;
    const mvp = cameraRef.current.viewProj(glCanvas.width, glCanvas.height);
    r.render(mvp, [...planesMetaRef.current.keys()]);
    drawOverlay();
    if (onRendered) onRendered();
  }, [drawOverlay, onRendered]);

  const resizeCanvases = useCallback(() => {
    const viewport = viewportRef.current;
    const glCanvas = glCanvasRef.current;
    const overlay = overlayRef.current;
    if (!viewport || !glCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    if (scaleRef.current == null) scaleRef.current = dpr;
    const scale = Math.min(scaleRef.current, dpr);
    glCanvas.width = Math.max(1, Math.round(viewport.clientWidth * scale));
    glCanvas.height = Math.max(1, Math.round(viewport.clientHeight * scale));
    overlay.width = glCanvas.width;
    overlay.height = glCanvas.height;
  }, []);

  /** Same adaptive-resolution contract as the 2D viewer: downgrade the
   *  backing store during slow continuous interaction, restore full
   *  devicePixelRatio shortly after it stops. */
  const adaptQuality = useCallback((t) => {
    const q = perfRef.current;
    const dt = q.lastT ? t - q.lastT : 0;
    q.lastT = t;
    if (dt <= 0 || dt > 200) return;
    q.ema = 0.8 * q.ema + 0.2 * dt;
    if (q.ema > 32 && (scaleRef.current || 1) > 1) {
      scaleRef.current = Math.max(1, scaleRef.current * 0.75);
      q.ema = 16.7;
      resizeCanvases();
      renderFrame();
    }
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = 0;
      const dpr = window.devicePixelRatio || 1;
      if ((scaleRef.current || dpr) >= dpr) return;
      scaleRef.current = dpr;
      resizeCanvases();
      renderFrame();
    }, 250);
  }, [resizeCanvases, renderFrame]);

  const scheduleRender = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame((t) => {
      rafRef.current = 0;
      renderFrame();
      adaptQuality(t);
    });
  }, [renderFrame, adaptQuality]);

  // ---- lifecycle ---------------------------------------------------------

  useLayoutEffect(() => {
    resizeCanvases();
    if (!rendererRef.current && glCanvasRef.current && geom) {
      try {
        rendererRef.current = new CubeRenderer(glCanvasRef.current);
        rendererRef.current.onRestore = () => scheduleRender();
        setGlError(null);
      } catch (e) {
        setGlError(e.message);
        return undefined;
      }
    }
    scheduleRender();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      resizeCanvases();
      renderFrame();
    });
    ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [geom, resizeCanvases, renderFrame, scheduleRender]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (rendererRef.current) {
      rendererRef.current.destroy();
      rendererRef.current = null;
    }
  }, []);

  // new volume: drop everything, refit
  useEffect(() => {
    planesMetaRef.current.clear();
    facesCacheRef.current.clear();
    hzCacheRef.current.clear();
    fltCacheRef.current.clear();
    wellCacheRef.current.clear();
    fittedRef.current = false;
    desiredRef.current = { inline: null, xline: null, time: null };
    for (const o of ORIENTATIONS) seqRef.current[o] += 1;
    seqRef.current.faces += 1;
  }, [geom]);

  // extents changed (volume load or vexag): reposition every plane, the
  // wireframe and (first time) the camera — no texture re-uploads
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !geom || !ext) return;
    for (const [id, meta] of planesMetaRef.current) {
      r.setPlaneQuad(id, planeQuad(meta.orientation, meta.index, geom, ext));
    }
    r.setEdges(cubeEdges(ext));
    r.setScale(ext.X, ext.D, ext.Z);
    if (!fittedRef.current) {
      cameraRef.current.fitTo(ext);
      fittedRef.current = true;
    }
    scheduleRender();
  }, [ext, geom, scheduleRender]);

  // display params + colormap + smoothing
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !display) return;
    r.setColormap(display.colormap);
    r.setDisplay({
      gain: display.gain,
      polarity: display.polarity,
      clip: display.clip,
      traceBalance: display.traceBalance,
      interpolate: prefs.smooth,
    });
    r.setBackground(prefs.bg);
    scheduleRender();
  }, [display, prefs.smooth, prefs.bg, geom, scheduleRender]);

  // ---- plane loading -----------------------------------------------------

  const putPlane = useCallback((id, orientation, index, slice) => {
    const r = rendererRef.current;
    const e = propsRef.current.ext;
    if (!r || !e) return;
    planesMetaRef.current.set(id, { orientation, index, slice });
    r.setPlane(id, slice, planeQuad(orientation, index, propsRef.current.geom, e));
    scheduleRender();
  }, [scheduleRender]);

  const dropPlane = useCallback((id) => {
    if (!planesMetaRef.current.has(id)) return;
    planesMetaRef.current.delete(id);
    if (rendererRef.current) rendererRef.current.setPlane(id, null);
    scheduleRender();
  }, [scheduleRender]);

  const loadMainPlane = useCallback(async (orientation, index) => {
    const seq = ++seqRef.current[orientation];
    setBusy((b) => b + 1);
    try {
      const slice = await assembleSlice(getBrick, geom, orientation, index);
      if (seq !== seqRef.current[orientation]) return;
      putPlane(orientation, orientation, index, slice);
    } catch (e) {
      if (e.message !== ABORTED) setGlError(e.message);
    } finally {
      setBusy((b) => b - 1);
    }
  }, [getBrick, geom, putPlane]);

  const maxFor = useCallback((o) => (o === 'inline' ? geom.nIl - 1
    : o === 'xline' ? geom.nXl - 1 : geom.ns - 1), [geom]);

  // reconcile the three main planes against visibility + shared indices;
  // desiredRef dedupes so an unchanged plane never re-assembles
  const desiredRef = useRef({ inline: null, xline: null, time: null });
  useEffect(() => {
    if (!geom || !getBrick) return;
    for (const o of ORIENTATIONS) {
      if (!prefs[o]) {
        desiredRef.current[o] = null;
        dropPlane(o);
        continue;
      }
      const idx = Math.min(Math.max(indices[o] || 0, 0), maxFor(o));
      if (desiredRef.current[o] === idx) continue;    // loaded or in flight
      desiredRef.current[o] = idx;
      loadMainPlane(o, idx);
    }
  }, [geom, getBrick, prefs.inline, prefs.xline, prefs.time,
    indices.inline, indices.xline, indices.time,
    loadMainPlane, dropPlane, maxFor, prefs, indices]);

  // boundary faces ("entire cube")
  useEffect(() => {
    if (!geom || !getBrick) return;
    if (!prefs.faces) {
      for (const [id] of FACES) dropPlane(id);
      return;
    }
    const seq = ++seqRef.current.faces;
    (async () => {
      setBusy((b) => b + 1);
      try {
        for (const [id, o, end] of FACES) {
          const idx = end === 0 ? 0 : maxFor(o);
          const key = `${o}-${idx}`;
          let slice = facesCacheRef.current.get(key);
          if (!slice) {
            // eslint-disable-next-line no-await-in-loop
            slice = await assembleSlice(getBrick, geom, o, idx);
            facesCacheRef.current.set(key, slice);
          }
          if (seq !== seqRef.current.faces) return;
          putPlane(id, o, idx, slice);
        }
      } catch (e) {
        if (e.message !== ABORTED) setGlError(e.message);
      } finally {
        setBusy((b) => b - 1);
      }
    })();
  }, [geom, getBrick, prefs.faces, putPlane, dropPlane, maxFor]);

  // ---- interpretation objects (horizons / faults) ------------------------
  // Mesh geometry is cached per object (rebuilt only when the underlying
  // grid / sticks reference changes); visibility diffs against the last
  // pushed set so a toggle never re-triangulates anything.

  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !geom) return;
    const wanted = new Set();
    if (prefs.horizons) {
      for (const h of horizons || []) {
        const id = `hz-${h.id}`;
        wanted.add(id);
        let c = hzCacheRef.current.get(h.id);
        if (!c || c.grid !== h.grid) {
          c = { grid: h.grid, mesh: horizonMesh(h.grid, geom) };
          hzCacheRef.current.set(h.id, c);
        }
        r.setMesh(id, {
          positions: c.mesh.positions,
          indices: c.mesh.indices,
          color: hexToRgb(h.color),
        });
      }
    }
    for (const id of activeHzRef.current) {
      if (!wanted.has(id)) r.setMesh(id, null);
    }
    activeHzRef.current = wanted;
    scheduleRender();
  }, [horizons, geom, prefs.horizons, scheduleRender]);

  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !geom) return;
    const wanted = new Set();
    if (prefs.faults) {
      for (const f of faults || []) {
        let c = fltCacheRef.current.get(f.id);
        if (!c || c.sticks !== f.sticks) {
          c = {
            sticks: f.sticks,
            lines: faultPolylines(f.sticks, geom),
            ribbon: faultRibbonMesh(f.sticks, geom),
          };
          fltCacheRef.current.set(f.id, c);
        }
        const rgb = hexToRgb(f.color);
        if (c.lines.length) {
          wanted.add(`flt-${f.id}`);
          r.setLineSet(`flt-${f.id}`, { positions: c.lines, color: rgb });
        }
        if (c.ribbon.indices.length) {
          wanted.add(`fltrib-${f.id}`);
          r.setMesh(`fltrib-${f.id}`, {
            positions: c.ribbon.positions,
            indices: c.ribbon.indices,
            color: rgb,
            opacity: 0.45,
          });
        }
      }
    }
    for (const id of activeFltRef.current) {
      if (!wanted.has(id)) {
        if (id.startsWith('fltrib-')) r.setMesh(id, null);
        else r.setLineSet(id, null);
      }
    }
    activeFltRef.current = wanted;
    scheduleRender();
  }, [faults, geom, prefs.faults, scheduleRender]);

  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !geom) return;
    const wanted = new Set();
    if (prefs.wells) {
      for (const w of wells || []) {
        let c = wellCacheRef.current.get(w.id);
        if (!c || c.points !== w.points) {
          c = {
            points: w.points,
            lines: wellPolylines(w.points, geom),
            tops: wellTopMarkers(w.tops, geom),
          };
          wellCacheRef.current.set(w.id, c);
        }
        const rgb = hexToRgb(w.color);
        if (c.lines.length) {
          wanted.add(`well-${w.id}`);
          r.setLineSet(`well-${w.id}`, { positions: c.lines, color: rgb });
        }
        if (c.tops.length) {
          wanted.add(`welltop-${w.id}`);
          r.setLineSet(`welltop-${w.id}`, { positions: c.tops, color: rgb });
        }
      }
    }
    for (const id of activeWellRef.current) {
      if (!wanted.has(id)) r.setLineSet(id, null);
    }
    activeWellRef.current = wanted;
    scheduleRender();
  }, [wells, geom, prefs.wells, scheduleRender]);

  // ---- picking / readout -------------------------------------------------

  const toDevice = useCallback((e) => {
    const rect = overlayRef.current.getBoundingClientRect();
    const scale = scaleRef.current || window.devicePixelRatio || 1;
    return { sx: (e.clientX - rect.left) * scale, sy: (e.clientY - rect.top) * scale };
  }, []);

  /** Nearest visible plane under a screen point, with data coordinates. */
  const pickAt = useCallback((sx, sy) => {
    const glCanvas = glCanvasRef.current;
    const p = propsRef.current;
    if (!glCanvas || !p.geom || !p.ext) return null;
    const ray = cameraRef.current.ray(sx, sy, glCanvas.width, glCanvas.height);
    let best = null;
    for (const [id, meta] of planesMetaRef.current) {
      const quad = planeQuad(meta.orientation, meta.index, p.geom, p.ext);
      const hit = intersectQuad(ray, quad);
      if (hit && (!best || hit.t < best.t)) best = { ...hit, id, meta };
    }
    if (!best) return null;
    const { meta, u, v } = best;
    const gm = p.geom;
    let ilIdx;
    let xlIdx;
    let sample;
    if (meta.orientation === 'inline') {
      ilIdx = meta.index;
      xlIdx = Math.min(gm.nXl - 1, Math.floor(v * gm.nXl));
      sample = Math.min(gm.ns - 1, Math.floor(u * gm.ns));
    } else if (meta.orientation === 'xline') {
      xlIdx = meta.index;
      ilIdx = Math.min(gm.nIl - 1, Math.floor(v * gm.nIl));
      sample = Math.min(gm.ns - 1, Math.floor(u * gm.ns));
    } else {
      sample = meta.index;
      xlIdx = Math.min(gm.nXl - 1, Math.floor(u * gm.nXl));
      ilIdx = Math.min(gm.nIl - 1, Math.floor(v * gm.nIl));
    }
    return { ...best, ilIdx, xlIdx, sample };
  }, []);

  const setReadout = useCallback((hit) => {
    const el = readoutRef.current;
    if (!el) return;
    const p = propsRef.current;
    if (!hit || !p.manifest) {
      el.textContent = 'drag: rotate · Shift/middle-drag: pan · wheel: zoom '
        + '· Ctrl/Alt+drag a plane: move it · Shift+wheel over a plane: step it '
        + '· click a plane: open in 2D · gizmo axis: snap view · dbl-click: fit';
      return;
    }
    const geo = p.manifest.geometry;
    const { meta } = hit;
    let amp = null;
    if (meta.slice) {
      const gm = p.geom;
      if (meta.orientation === 'inline') amp = meta.slice.data[hit.xlIdx * gm.ns + hit.sample];
      else if (meta.orientation === 'xline') amp = meta.slice.data[hit.ilIdx * gm.ns + hit.sample];
      else amp = meta.slice.data[hit.ilIdx * gm.nXl + hit.xlIdx];
    }
    const ms = (hit.sample * geo.dt_us) / 1000;
    // depth via the volume's velocity model — same converter as the 2D
    // readout; layer cakes convert per column (the hovered lattice cell)
    let z = null;
    if (p.depthConv) {
      const d = p.depthConv.toDepthM(ms, hit.ilIdx * p.geom.nXl + hit.xlIdx);
      if (d != null && Number.isFinite(d)) z = d;
    }
    el.textContent = `${meta.orientation === 'time' ? 'Z' : meta.orientation} plane   `
      + `IL ${geo.il.min + hit.ilIdx * geo.il.step}   `
      + `XL ${geo.xl.min + hit.xlIdx * geo.xl.step}   ${ms.toFixed(1)} ms   `
      + (z != null ? `TVD ${z.toFixed(1)} m   ` : '')
      + `amp ${amp === null || amp === NULL_F32 ? 'null' : amp.toExponential(3)}`;
  }, []);

  // ---- interactions ------------------------------------------------------

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const { sx, sy } = toDevice(e);
    // Ctrl/Alt + left-drag over a main plane: move THAT plane along its
    // axis instead of orbiting (boundary faces are fixed by definition)
    if ((e.ctrlKey || e.altKey) && e.button === 0 && onChangeIndex) {
      const id = hoverPlaneRef.current;
      const meta = id && ORIENTATIONS.includes(id) ? planesMetaRef.current.get(id) : null;
      if (meta) {
        dragRef.current = {
          mode: 'plane', id, orientation: meta.orientation,
          frac: meta.index, x: sx, y: sy, moved: false,
        };
        return;
      }
    }
    const pan = e.shiftKey || e.button === 1 || e.button === 2;
    dragRef.current = { mode: pan ? 'pan' : 'orbit', x: sx, y: sy, moved: false };
  }, [toDevice, onChangeIndex]);

  /** Screen drag -> plane index delta, via the axis' projected direction. */
  const dragPlane = useCallback((d, dx, dy) => {
    const p = propsRef.current;
    const glCanvas = glCanvasRef.current;
    if (!p.ext || !p.geom || !glCanvas) return;
    const { X, D, Z } = p.ext;
    const gm = p.geom;
    const o = d.orientation;
    const centre = o === 'inline' ? [X / 2, -D / 2, ((d.frac + 0.5) / gm.nIl) * Z]
      : o === 'xline' ? [((d.frac + 0.5) / gm.nXl) * X, -D / 2, Z / 2]
        : [X / 2, -((d.frac + 0.5) / gm.ns) * D, Z / 2];
    const axis = o === 'inline' ? [0, 0, Z / gm.nIl]
      : o === 'xline' ? [X / gm.nXl, 0, 0] : [0, -D / gm.ns, 0];
    const cam = cameraRef.current;
    const mvp = cam.viewProj(glCanvas.width, glCanvas.height);
    const s0 = cam.project(mvp, centre, glCanvas.width, glCanvas.height);
    const s1 = cam.project(mvp, [
      centre[0] + axis[0], centre[1] + axis[1], centre[2] + axis[2],
    ], glCanvas.width, glCanvas.height);
    if (!s0 || !s1) return;
    const vx = s1.x - s0.x;
    const vy = s1.y - s0.y;
    const len2 = vx * vx + vy * vy;
    if (len2 < 1e-6) return;
    d.frac = Math.min(maxFor(o), Math.max(0, d.frac + (dx * vx + dy * vy) / len2));
    const next = Math.round(d.frac);
    const meta = planesMetaRef.current.get(d.id);
    if (meta && next !== meta.index) {
      // move the quad NOW (old texture stretches for a frame) so the drag
      // tracks the pointer; the reconcile effect streams the real slice in
      meta.index = next;
      const r = rendererRef.current;
      if (r) r.setPlaneQuad(d.id, planeQuad(o, next, p.geom, p.ext));
      scheduleRender();
      onChangeIndex(o, next);
    }
  }, [maxFor, onChangeIndex, scheduleRender]);

  const onPointerMove = useCallback((e) => {
    const { sx, sy } = toDevice(e);
    const d = dragRef.current;
    if (d) {
      const dx = sx - d.x;
      const dy = sy - d.y;
      if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true;
      if (d.moved) {
        const glCanvas = glCanvasRef.current;
        if (d.mode === 'plane') {
          dragPlane(d, dx, dy);
        } else if (d.mode === 'orbit') {
          cameraRef.current.orbit(-dx * 0.005, dy * 0.005);
          scheduleRender();
        } else {
          cameraRef.current.pan(dx, dy, glCanvas ? glCanvas.height : 1);
          scheduleRender();
        }
        d.x = sx;
        d.y = sy;
      }
      return;
    }
    const hit = pickAt(sx, sy);
    hoverPlaneRef.current = hit ? hit.id : null;
    setReadout(hit);
  }, [toDevice, pickAt, setReadout, scheduleRender, dragPlane]);

  /** Snap the camera to a standard view for a gizmo axis (dist/target kept). */
  const snapView = useCallback((key) => {
    const cam = cameraRef.current;
    if (key === 'xl') { cam.yaw = Math.PI / 2; cam.pitch = 0; }
    else if (key === 'il') { cam.yaw = 0; cam.pitch = 0; }
    else cam.pitch = 1.5;                     // top-down (map) view
    scheduleRender();
  }, [scheduleRender]);

  const onPointerUp = useCallback((e) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.moved || e.button !== 0) return;
    const { sx, sy } = toDevice(e);
    const gz = gizmoRef.current;
    if (gz) {
      const dpr = scaleRef.current || 1;
      for (const tip of gz.tips) {
        if (Math.hypot(sx - tip.x, sy - tip.y) <= 10 * dpr) {
          snapView(tip.key);
          return;
        }
      }
      // clicks inside the gizmo disc never fall through to plane picking
      if (Math.hypot(sx - gz.cx, sy - gz.cy) <= gz.r) return;
    }
    const hit = pickAt(sx, sy);
    if (hit && onSelectPlane) onSelectPlane(hit.meta.orientation);
  }, [toDevice, pickAt, onSelectPlane, snapView]);

  const onDoubleClick = useCallback(() => {
    if (propsRef.current.ext) {
      cameraRef.current.fitTo(propsRef.current.ext);
      scheduleRender();
    }
  }, [scheduleRender]);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      if (e.shiftKey && hoverPlaneRef.current && onChangeIndex) {
        const meta = planesMetaRef.current.get(hoverPlaneRef.current);
        if (meta && ORIENTATIONS.includes(hoverPlaneRef.current)) {
          const next = Math.min(maxFor(meta.orientation),
            Math.max(0, meta.index + (e.deltaY > 0 ? 1 : -1)));
          onChangeIndex(meta.orientation, next);
        }
        return;
      }
      cameraRef.current.dolly(e.deltaY > 0 ? 1.12 : 1 / 1.12);
      scheduleRender();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scheduleRender, onChangeIndex, maxFor]);

  // ---- toolbar -----------------------------------------------------------

  const zoomBtn = (f) => { cameraRef.current.dolly(f); scheduleRender(); };
  const fitView = () => {
    if (ext) { cameraRef.current.fitTo(ext); scheduleRender(); }
  };
  const togglePref = (key) => setPrefs((p0) => ({ ...p0, [key]: !p0[key] }));
  const toggleBg = () => setPrefs((p0) => ({ ...p0, bg: p0.bg === 'dark' ? 'light' : 'dark' }));

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
    const glCanvas = glCanvasRef.current;
    const overlay = overlayRef.current;
    if (!glCanvas || !rendererRef.current) return;
    renderFrame();                        // fresh frame in this tick
    const out = document.createElement('canvas');
    out.width = glCanvas.width;
    out.height = glCanvas.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(glCanvas, 0, 0);
    ctx.drawImage(overlay, 0, 0);
    out.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'seismolord-3d.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  };

  const lightBg = prefs.bg === 'light';

  return (
    <div
      ref={wrapRef}
      data-testid="cube-view"
      className={`flex flex-col ${isFullscreen ? 'h-screen bg-slate-950 p-2' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-1 mb-1">
        <Button variant="outline" size="sm" title="Zoom in (wheel)"
          onClick={() => zoomBtn(1 / 1.25)} disabled={!geom}
        >
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" title="Zoom out"
          onClick={() => zoomBtn(1.25)} disabled={!geom}
        >
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" title="Fit cube (dbl-click)"
          onClick={fitView} disabled={!geom}
        >
          <Expand className="w-4 h-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" title="3D layers">
              <Layers className="w-4 h-4 mr-1" />
              <span className="text-xs">Planes</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Slice planes</DropdownMenuLabel>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.inline} onCheckedChange={() => togglePref('inline')}
            >
              Inline plane
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.xline} onCheckedChange={() => togglePref('xline')}
            >
              Crossline plane
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.time} onCheckedChange={() => togglePref('time')}
            >
              Time slice plane
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.faces} onCheckedChange={() => togglePref('faces')}
            >
              Entire cube (boundary faces)
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Interpretation</DropdownMenuLabel>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.horizons} onCheckedChange={() => togglePref('horizons')}
            >
              Horizon surfaces
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.faults} onCheckedChange={() => togglePref('faults')}
            >
              Fault sticks &amp; surfaces
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.wells} onCheckedChange={() => togglePref('wells')}
            >
              Well paths &amp; tops
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Rendering</DropdownMenuLabel>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.gizmo} onCheckedChange={() => togglePref('gizmo')}
            >
              Axis gizmo
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.labels} onCheckedChange={() => togglePref('labels')}
            >
              Axis annotations
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.smooth} onCheckedChange={() => togglePref('smooth')}
            >
              Smooth interpolation
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" size="sm" onClick={toggleBg}
          title={lightBg ? 'Dark background' : 'White background'}
          data-testid="cube-bg-toggle"
        >
          {lightBg ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </Button>
        <Button variant="outline" size="sm" onClick={screenshot}
          title="Save PNG snapshot" disabled={!geom}
        >
          <Camera className="w-4 h-4" />
        </Button>

        {busy > 0 && <Loader2 className="w-4 h-4 ml-1 animate-spin text-cyan-300" />}

        <Button variant="outline" size="sm" onClick={toggleFullscreen}
          title="Fullscreen" className="ml-auto"
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </Button>
      </div>

      <div
        ref={viewportRef}
        className={`relative rounded-lg border overflow-hidden ${lightBg
          ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-950'}
          ${isFullscreen ? 'flex-1' : ''}`}
        style={isFullscreen ? undefined : { height }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={glCanvasRef} className="w-full h-full block" />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 w-full h-full touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={onDoubleClick}
        />
        {!geom && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
            Select an ingested volume to open the 3D window.
          </div>
        )}
        {glError && (
          <div className="absolute inset-x-0 bottom-0 bg-red-950/80 text-red-300 text-xs p-2">
            {glError}
          </div>
        )}
      </div>

      <div
        ref={readoutRef}
        className="text-xs text-slate-500 font-mono mt-1 h-5 whitespace-pre overflow-hidden"
      >
        drag: rotate · Shift/middle-drag: pan · wheel: zoom · Ctrl/Alt+drag a
        plane: move it · Shift+wheel over a plane: step it · click a plane:
        open in 2D · gizmo axis: snap view · dbl-click: fit
      </div>
    </div>
  );
}

export default React.memo(CubeView);
