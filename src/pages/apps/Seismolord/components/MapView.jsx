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
  ZoomIn, ZoomOut, Expand, Maximize, Minimize, Layers, Camera, Eraser,
  Map as MapIcon, Route, X,
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
  contourLevels, contourPolylines, buildMapPixels, gridRange, cellsInPolygon,
} from '@/lib/gridding/mapContours';
import { makeDepthConverter, velocityKey, M_PER_FT } from '../engine/velocityModel';
import { AMP_MODES } from '../engine/horizonAmplitude';
import { faultTraces } from '../engine/faultBarriers';
import { ilxlToWorld, worldToIlxl } from '../engine/surveyGeometry';
import { NULL_VALUE } from '../engine/manifest';

const NULL_F32 = Math.fround(NULL_VALUE);
const PREFS_KEY = 'seismolord.mapPrefs.v1';
const DEFAULT_PREFS = {
  fill: true,
  contours: true,
  contourLabels: true,
  faults: true,
  faultTraces: true,
  traverses: true,
  wells: true,
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

/** Level/legend value on the layer's contour step: whole-number steps
 *  (TWT, depth) keep the integer look; sub-unit steps (amplitude,
 *  thin isochrons) show 3 significant digits instead of rounding to 0. */
const fmtZ = (v, step) => (step >= 1
  ? String(Math.round(v))
  : Number(v.toPrecision(3)).toString());

/**
 * @param {Object} p
 * @param {?Object} p.manifest volume manifest
 * @param {?Object} p.geom geomFromManifest() result
 * @param {Array<{id, name, grid: Float32Array, color: string}>} p.horizons
 *   VISIBLE horizons (pick grids in sample indices — converted to ms here)
 * @param {Array<{id, sticks, color: string}>} p.faults visible faults
 * @param {?Object} [p.velocity] volume velocity model (single-function
 *   or layer-cake) — enables the depth (m / ft) display domains;
 *   conversion happens PER SURFACE before differencing, so isochron
 *   thickness stays correct under a depth-varying velocity
 * @param {?(Float32Array|null)[]} [p.velocityBoundaries] layer-cake
 *   boundary pick grids aligned with the model's layer bases (layer
 *   cakes convert per column)
 * @param {({ilIdx, xlIdx}) => void} [p.onNavigate] map click -> move the
 *   shared inline/crossline positions
 * @param {({horizonId, cells: Int32Array}) => void} [p.onEraseRegion]
 *   region-erase tool (drag = rectangle, clicks = polygon vertices closed
 *   by double-click): delete the mapped horizon's picks in those cells
 * @param {?Array<{il:number, xl:number}>} [p.traverse] the committed
 *   traverse polyline (continuous lattice coords) to draw on the map
 * @param {(vertices: ?Array<{il, xl}>) => void} [p.onTraverse] traverse
 *   tool (click = vertex, double-click = finish, Esc = cancel): the drawn
 *   polyline becomes the Traverse window's section; null removes it
 * @param {Array<{id, name, vertices: Array<{il, xl}>}>} [p.savedTraverses]
 *   the volume's saved traverse lines — drawn dimmed with name labels
 *   (the active line draws on top in full ink); Layers-toggleable
 * @param {(grid: Float32Array, opts: {mode, window}) => Promise<Float32Array>}
 *   [p.onAmplitude] amplitude-attribute extraction along the active
 *   horizon (modes per engine AMP_MODES) — enables the map's attribute
 *   select; the returned lattice grid becomes the mapped layer
 * @param {Array<{id, name, color, surfaceX, surfaceY,
 *   path: ?Array<{x, y}>}>} [p.wells] visible wells (world metres,
 *   volume-independent) — drawn through the survey affine: surface
 *   spot + name label, deviated path polyline + TD marker; hidden when
 *   the volume has no usable coordinates
 * @param {number|'fill'} [p.height] viewport CSS height, or 'fill' to
 *   stretch to the parent container's height
 */
function MapView({
  manifest, geom, horizons, faults, velocity, velocityBoundaries,
  onNavigate, onEraseRegion, traverse, onTraverse, savedTraverses,
  onAmplitude, wells, height = 560, onCursor = null,
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

  const rectRef = useRef(null);         // erase rectangle, inner device px
  const polyRef = useRef([]);           // erase polygon draft, WORLD coords
  const travRef = useRef([]);           // traverse draft, WORLD coords

  const [prefs, setPrefs] = useState(loadPrefs);
  const [colormap, setColormap] = useState('spectrum');
  const [activeId, setActiveId] = useState(null);
  const [vsId, setVsId] = useState('');       // isochron second horizon ('' = structure)
  const [domain, setDomain] = useState('twt'); // 'twt' | 'depth_m' | 'depth_ft'
  // attribute layer: 'structure' maps the horizon surface (TWT/depth);
  // an AMP_MODES key maps the extracted seismic amplitude along it
  const [attr, setAttr] = useState('structure');
  const [attrWindow, setAttrWindow] = useState(5);   // ± samples (windowed modes)
  const [ampLayer, setAmpLayer] = useState(null);    // {grid, mode, window, values}
  const [eraseTool, setEraseTool] = useState(false);
  const [travTool, setTravTool] = useState(false);
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

  // isochron second surface (Δ = vs − horizon); never the primary itself
  const vs = useMemo(
    () => (horizons || []).find((h) => h.id === vsId && h.id !== active?.id) || null,
    [horizons, vsId, active],
  );

  // display domain: depth needs a model; unit rides with the domain
  const effDomain = velocity ? domain : 'twt';
  const unit = effDomain === 'twt' ? 'ms' : effDomain === 'depth_ft' ? 'ft' : 'm';

  // cell-aware TWT->depth converter (layer cakes read the boundary
  // grids per column; the single-function model ignores the cell)
  const depthConv = useMemo(
    () => (manifest && velocity
      ? makeDepthConverter(velocity, {
        dtUs: manifest.geometry.dt_us, boundaries: velocityBoundaries,
      })
      : null),
    [manifest, velocity, velocityBoundaries],
  );

  // amplitude attribute needs the extraction callback and a single
  // mapped horizon — isochron (vs) and amplitude are mutually exclusive
  const effAttr = onAmplitude && active && !vs ? attr : 'structure';
  const ampMode = effAttr !== 'structure'
    ? AMP_MODES.find((m) => m.key === effAttr) || null : null;
  const [ampBusy, setAmpBusy] = useState(false);

  // extract (or re-extract) when the attribute, its window, or the
  // active horizon's GRID changes — an edit-session stroke commit swaps
  // the grid ref, so the attribute map follows edits; while extraction
  // runs (or fails) the map falls back to the structure layer
  const activeGrid = active ? active.grid : null;
  useEffect(() => {
    if (!ampMode || !activeGrid) { setAmpLayer(null); return undefined; }
    const w = ampMode.windowed ? attrWindow : 0;
    let stale = false;
    setAmpBusy(true);
    onAmplitude(activeGrid, { mode: ampMode.key, window: w })
      .then((values) => {
        if (!stale) setAmpLayer({ grid: activeGrid, mode: ampMode.key, window: w, values });
      })
      .catch(() => { if (!stale) setAmpLayer(null); })
      .finally(() => { if (!stale) setAmpBusy(false); });
    return () => { stale = true; };
  }, [ampMode, activeGrid, attrWindow, onAmplitude]);

  /** Layer cache (per horizon/pair × domain × model, or per amplitude
   *  extraction): value grid — structure TWT or depth, the isochron
   *  Δ(vs − h) with conversion PER SURFACE before differencing, or the
   *  extracted amplitude attribute — range, contours, fill bitmap. */
  const layerFor = useCallback((h, second) => {
    if (!h || !geom || !manifest) return null;
    const dtMs = manifest.geometry.dt_us / 1000;
    const amp = ampMode && !second && ampLayer
      && ampLayer.grid === h.grid && ampLayer.mode === ampMode.key ? ampLayer : null;
    const key = amp
      ? `${h.id}~amp~${amp.mode}~${amp.window}`
      : `${h.id}~${second ? second.id : ''}~${effDomain}~${velocityKey(velocity)}`;
    let c = cacheRef.current.get(key);
    const srcA = amp ? amp.values : h.grid;
    if (!c || c.gridA !== srcA || c.gridB !== (second ? second.grid : null)
      || c.boundaries !== velocityBoundaries) {
      let values;
      if (amp) {
        values = amp.values;
      } else {
        const scale = effDomain === 'depth_ft' ? 1 / M_PER_FT : 1;
        const conv = effDomain === 'twt' ? null
          : (ms, cell) => depthConv.toDepthM(ms, cell) * scale;
        const n = h.grid.length;
        values = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const a = h.grid[i];
          if (a === NULL_F32) { values[i] = NULL_F32; continue; }
          if (!second) {
            values[i] = conv ? conv(a * dtMs, i) : a * dtMs;
            continue;
          }
          const b = second.grid[i];
          values[i] = b === NULL_F32 ? NULL_F32
            : conv ? conv(b * dtMs, i) - conv(a * dtMs, i) : (b - a) * dtMs;
        }
      }
      const { zMin, zMax } = gridRange(values);
      const { levels, step } = contourLevels(zMin ?? 0, zMax ?? 0, 12);
      c = {
        gridA: srcA,
        gridB: second ? second.grid : null,
        boundaries: velocityBoundaries,
        values,
        unit: amp ? 'amp' : unit,
        zMin,
        zMax,
        levels,
        step,
        paths: levels.map((l) => contourPolylines(values, geom.nIl, geom.nXl, l)),
        lutKey: null,
        bitmap: null,
      };
      cacheRef.current.set(key, c);
    }
    if (c.lutKey !== colormap && c.zMin != null) {
      const px = buildMapPixels(c.values, geom.nIl, geom.nXl, lut, c.zMin, c.zMax);
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
  }, [geom, manifest, colormap, lut, effDomain, unit, velocity, velocityBoundaries,
    depthConv, ampMode, ampLayer]);

  // horizon-level fault traces: where each fault's sticks actually cross
  // the MAPPED horizon (the same crossings gridding rasterizes into
  // barriers) — not just the sticks' map footprints. Cached per
  // (faults, active grid) reference; an edit-stroke commit swaps the
  // grid ref and recomputes once.
  const faultTraceLayer = useMemo(() => {
    if (!geom || !active?.grid || !(faults || []).length) return null;
    const out = faults
      .map((f) => ({ color: f.color, traces: faultTraces([f], active.grid, geom) }))
      .filter((e) => e.traces.length);
    return out.length ? out : null;
  }, [geom, faults, active]);

  propsRef.current = {
    manifest, geom, horizons, faults, prefs, gutter: g, active, vs, spacing,
    northDir, velocity, depthConv, effDomain, traverse, savedTraverses,
    effAttr, ampLayer, wells, faultTraceLayer, onCursor,
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
      ? layerFor(p.active, p.vs) : null;

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
          const text = fmtZ(layer.levels[k], layer.step);
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

    // horizon-level fault traces: heavy solid polylines where the faults
    // cut the mapped horizon (exactly what gridding treats as barriers)
    if (p.prefs.faultTraces && p.faultTraceLayer) {
      for (const f of p.faultTraceLayer) {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3 * dpr;
        ctx.lineCap = 'round';
        for (const trace of f.traces) {
          ctx.beginPath();
          trace.forEach((q, i) => {
            const s = t.worldToScreen(q.j + 0.5, q.i + 0.5);
            if (i === 0) ctx.moveTo(s.x, s.y);
            else ctx.lineTo(s.x, s.y);
          });
          ctx.stroke();
        }
      }
      ctx.lineCap = 'butt';
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

    const rect = rectRef.current;
    if (rect && rect.x1 !== undefined) {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
      ctx.fillStyle = 'rgba(250, 204, 21, 0.12)';
      ctx.lineWidth = dpr;
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      const x = Math.min(rect.x0, rect.x1);
      const y = Math.min(rect.y0, rect.y1);
      ctx.fillRect(x, y, Math.abs(rect.x1 - rect.x0), Math.abs(rect.y1 - rect.y0));
      ctx.strokeRect(x, y, Math.abs(rect.x1 - rect.x0), Math.abs(rect.y1 - rect.y0));
      ctx.setLineDash([]);
    }

    // erase polygon draft — world-anchored, so pan/zoom while drawing
    // keeps the outline glued to the map
    const poly = polyRef.current;
    if (poly.length) {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
      ctx.fillStyle = 'rgba(250, 204, 21, 0.9)';
      ctx.lineWidth = dpr;
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      ctx.beginPath();
      poly.forEach((v, i) => {
        const s = t.worldToScreen(v.x, v.y);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      for (const v of poly) {
        const s = t.worldToScreen(v.x, v.y);
        ctx.fillRect(s.x - 2.5 * dpr, s.y - 2.5 * dpr, 5 * dpr, 5 * dpr);
      }
    }

    // saved traverse lines — dimmed, name-labeled at the midpoint vertex;
    // the ACTIVE line (below) draws over its saved copy in full ink
    if (p.prefs.traverses && p.savedTraverses && p.savedTraverses.length) {
      ctx.font = `${Math.round(10 * dpr)}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineJoin = 'round';
      for (const line of p.savedTraverses) {
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.45)';
        ctx.lineWidth = 1.2 * dpr;
        ctx.setLineDash([7 * dpr, 5 * dpr]);
        ctx.beginPath();
        line.vertices.forEach((v, i) => {
          const s = t.worldToScreen(v.xl, v.il);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        const mid = line.vertices[Math.floor((line.vertices.length - 1) / 2)];
        const sm = t.worldToScreen(mid.xl, mid.il);
        ctx.lineWidth = 3 * dpr;
        ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
        ctx.fillStyle = 'rgba(34, 211, 238, 0.8)';
        ctx.strokeText(line.name, sm.x, sm.y - 4 * dpr);
        ctx.fillText(line.name, sm.x, sm.y - 4 * dpr);
      }
    }

    // committed traverse line — the path the Traverse window sections
    if (p.traverse && p.traverse.length > 1) {
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.95)';
      ctx.fillStyle = 'rgba(34, 211, 238, 0.95)';
      ctx.lineWidth = 1.8 * dpr;
      ctx.beginPath();
      p.traverse.forEach((v, i) => {
        const s = t.worldToScreen(v.xl, v.il);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();
      for (const v of p.traverse) {
        const s = t.worldToScreen(v.xl, v.il);
        ctx.fillRect(s.x - 2 * dpr, s.y - 2 * dpr, 4 * dpr, 4 * dpr);
      }
      // A / A′ end labels: the section reads left→right as A→A′
      ctx.font = `${Math.round(11 * dpr)}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
      const ends = [
        [p.traverse[0], 'A'],
        [p.traverse[p.traverse.length - 1], 'A′'],
      ];
      for (const [v, label] of ends) {
        const s = t.worldToScreen(v.xl, v.il);
        ctx.strokeText(label, s.x, s.y - 4 * dpr);
        ctx.fillText(label, s.x, s.y - 4 * dpr);
      }
    }

    // wells — world coordinates through the survey affine (fractional
    // lattice indices; +0.5 puts a well ON its trace like every other
    // grid-anchored overlay). Surface spot + name label; deviated wells
    // additionally show the projected path with a TD marker.
    const aff = p.spacing?.affine;
    if (p.prefs.wells && aff && p.wells && p.wells.length) {
      ctx.font = `${Math.round(10 * dpr)}px ui-monospace, monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const w of p.wells) {
        const surf = worldToIlxl(aff, w.surfaceX, w.surfaceY);
        if (!surf) continue;
        ctx.strokeStyle = w.color;
        ctx.fillStyle = w.color;
        if (w.path && w.path.length > 1) {
          ctx.lineWidth = 1.6 * dpr;
          ctx.beginPath();
          let pen = false;
          let last = null;
          for (const q of w.path) {
            const ij = worldToIlxl(aff, q.x, q.y);
            if (!ij) { pen = false; continue; }
            const s = t.worldToScreen(ij.j + 0.5, ij.i + 0.5);
            if (pen) ctx.lineTo(s.x, s.y);
            else { ctx.moveTo(s.x, s.y); pen = true; }
            last = s;
          }
          ctx.stroke();
          if (last) ctx.fillRect(last.x - 2.5 * dpr, last.y - 2.5 * dpr, 5 * dpr, 5 * dpr);
        }
        const s0 = t.worldToScreen(surf.j + 0.5, surf.i + 0.5);
        ctx.lineWidth = 1.8 * dpr;
        ctx.beginPath();
        ctx.arc(s0.x, s0.y, 4.5 * dpr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s0.x, s0.y, 1.5 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 3 * dpr;
        ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
        ctx.strokeText(w.name, s0.x + 7 * dpr, s0.y);
        ctx.fillText(w.name, s0.x + 7 * dpr, s0.y);
      }
    }

    // traverse draft — world-anchored like the erase polygon
    const trav = travRef.current;
    if (trav.length) {
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.9)';
      ctx.fillStyle = 'rgba(34, 211, 238, 0.9)';
      ctx.lineWidth = dpr;
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      ctx.beginPath();
      trav.forEach((v, i) => {
        const s = t.worldToScreen(v.x, v.y);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      for (const v of trav) {
        const s = t.worldToScreen(v.x, v.y);
        ctx.fillRect(s.x - 2.5 * dpr, s.y - 2.5 * dpr, 5 * dpr, 5 * dpr);
      }
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
      ctx.fillText(`${fmtZ(layer.zMin, layer.step)} ${layer.unit}`, x - 4 * dpr, y);
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${fmtZ(layer.zMax, layer.step)} ${layer.unit}`, x - 4 * dpr, y + h);
      if (layer.step) {
        ctx.textAlign = 'right';
        ctx.fillStyle = INK_DIM;
        ctx.fillText(`CI ${layer.step} ${layer.unit}`, x + w, y + h + 14 * dpr);
      }
    }

    if (p.active) {
      ctx.fillStyle = INK;
      ctx.font = `${Math.round(11 * dpr)}px ui-monospace, monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      const ampL = p.effAttr !== 'structure' && p.ampLayer
        && p.ampLayer.grid === p.active.grid ? p.ampLayer : null;
      const ampM = ampL ? AMP_MODES.find((m) => m.key === ampL.mode) : null;
      const label = ampM
        ? `${p.active.name} — ${ampM.label}${ampM.windowed ? ` ±${ampL.window}` : ''}`
        : p.vs
          ? `${p.vs.name} − ${p.active.name} (isochron)`
          : p.active.name || 'Horizon';
      ctx.fillText(label, gl + 8 * dpr, canvas.height - 26 * dpr);
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

  useEffect(() => { scheduleDraw(); }, [horizons, faults, prefs, colormap, active, vs,
    effDomain, velocity, traverse, savedTraverses, effAttr, ampLayer, wells,
    scheduleDraw]);

  // model removed -> fall back to TWT so the select never lies
  useEffect(() => {
    if (!velocity && domain !== 'twt') setDomain('twt');
  }, [velocity, domain]);

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
      if (p.onCursor) p.onCursor(null);
      vals.style.display = 'none';
      hint.style.display = '';
      return;
    }
    const geo = p.manifest.geometry;
    // mirror to the workspace status bar (ref-driven there too)
    if (p.onCursor) {
      p.onCursor({
        il: geo.il.min + hit.ilIdx * geo.il.step,
        xl: geo.xl.min + hit.xlIdx * geo.xl.step,
      });
    }
    let world = '';
    if (p.spacing?.affine) {
      const w = ilxlToWorld(p.spacing.affine, hit.ilIdx, hit.xlIdx);
      world = `X ${w.x.toFixed(0)}   Y ${w.y.toFixed(0)}   `;
    }
    let z = '';
    const ampL = p.active && p.effAttr !== 'structure' && p.ampLayer
      && p.ampLayer.grid === p.active.grid ? p.ampLayer : null;
    if (ampL) {
      const v = ampL.values[hit.ilIdx * p.geom.nXl + hit.xlIdx];
      z = `   A ${v === NULL_F32 ? 'null' : v.toExponential(3)}`;
    } else if (p.active) {
      const c = hit.ilIdx * p.geom.nXl + hit.xlIdx;
      const dtMs = geo.dt_us / 1000;
      const zUnit = p.effDomain === 'twt' ? 'ms' : p.effDomain === 'depth_ft' ? 'ft' : 'm';
      const conv = p.effDomain === 'twt'
        ? (ms) => ms
        : (ms) => p.depthConv.toDepthM(ms, c)
          * (p.effDomain === 'depth_ft' ? 1 / M_PER_FT : 1);
      if (p.vs) {
        const a = p.active.grid[c];
        const b = p.vs.grid[c];
        z = `   Δ ${a === NULL_F32 || b === NULL_F32
          ? 'null' : `${(conv(b * dtMs) - conv(a * dtMs)).toFixed(1)} ${zUnit}`}`;
      } else {
        const s = p.active.grid[c];
        z = `   Z ${s === NULL_F32 ? 'null' : `${conv(s * dtMs).toFixed(1)} ${zUnit}`}`;
      }
    }
    vals.textContent = `${world}IL ${geo.il.min + hit.ilIdx * geo.il.step}   `
      + `XL ${geo.xl.min + hit.xlIdx * geo.xl.step}${z}`;
    vals.style.display = '';
    hint.style.display = 'none';
  }, []);

  // erasing edits ONE horizon — ambiguous on a two-surface isochron map
  const eraseArmed = eraseTool && Boolean(onEraseRegion && active && !vs);
  const travArmed = travTool && Boolean(onTraverse);

  /** Finish an erase gesture: send the outline's cells and disarm. */
  const finishErase = useCallback((flatPoly) => {
    polyRef.current = [];
    rectRef.current = null;
    setEraseTool(false);
    scheduleDraw();
    const p = propsRef.current;
    if (!flatPoly || !p.geom || !p.active || !onEraseRegion) return;
    const cells = cellsInPolygon(flatPoly, p.geom.nIl, p.geom.nXl);
    if (cells.length) onEraseRegion({ horizonId: p.active.id, cells });
  }, [onEraseRegion, scheduleDraw]);

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const { sx, sy } = toDevice(e);
    if (eraseArmed && e.button === 0) {
      // click = polygon vertex, drag = rectangle — decided on first move
      dragRef.current = { mode: 'erasePick', x0: sx, y0: sy, moved: false };
      return;
    }
    if (travArmed && e.button === 0) {
      // click = traverse vertex; a drag pans, so long lines can be drawn
      // across several pans without leaving the tool
      dragRef.current = { mode: 'travPick', x0: sx, y0: sy, moved: false };
      return;
    }
    dragRef.current = { mode: 'pan', lastX: sx, lastY: sy, moved: false };
  }, [toDevice, eraseArmed, travArmed]);

  const onPointerMove = useCallback((e) => {
    const { sx, sy } = toDevice(e);
    const d = dragRef.current;
    if (d && d.mode === 'erasePick') {
      if (!d.moved && Math.hypot(sx - d.x0, sy - d.y0) > 4) {
        d.moved = true;
        // a drag only means "rectangle" before any vertex is placed
        if (polyRef.current.length === 0) {
          d.mode = 'rect';
          rectRef.current = { x0: d.x0, y0: d.y0 };
        }
      }
      if (d.mode !== 'rect') return;
    }
    if (d && d.mode === 'travPick') {
      if (!d.moved && Math.hypot(sx - d.x0, sy - d.y0) > 4) {
        // hand the gesture to the pan branch for the rest of the drag
        d.mode = 'pan';
        d.lastX = sx;
        d.lastY = sy;
        d.moved = true;
      }
      if (d.mode === 'travPick') return;
    }
    if (d && d.mode === 'rect') {
      rectRef.current.x1 = sx;
      rectRef.current.y1 = sy;
      scheduleDraw();
      return;
    }
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
    if (!d) return;
    if (d.mode === 'erasePick') {
      // stationary click: add a polygon vertex (world coords, pan-proof)
      const t = transformRef.current;
      const w = t.screenToWorld(d.x0, d.y0);
      polyRef.current.push({ x: w.x, y: w.y });
      scheduleDraw();
      return;
    }
    if (d.mode === 'travPick') {
      const t = transformRef.current;
      const w = t.screenToWorld(d.x0, d.y0);
      travRef.current.push({ x: w.x, y: w.y });
      scheduleDraw();
      return;
    }
    if (d.mode === 'rect') {
      const rect = rectRef.current;
      if (!rect || rect.x1 === undefined) { finishErase(null); return; }
      const t = transformRef.current;
      const a = t.screenToWorld(Math.min(rect.x0, rect.x1), Math.min(rect.y0, rect.y1));
      const b = t.screenToWorld(Math.max(rect.x0, rect.x1), Math.max(rect.y0, rect.y1));
      finishErase([a.x, a.y, b.x, a.y, b.x, b.y, a.x, b.y]);
      return;
    }
    if (d.moved || e.button !== 0 || !onNavigate) return;
    const { sx, sy } = toDevice(e);
    const hit = pickAt(sx, sy);
    if (hit && hit.inData) onNavigate({ ilIdx: hit.ilIdx, xlIdx: hit.xlIdx });
  }, [toDevice, pickAt, onNavigate, finishErase, scheduleDraw]);

  /** Double-click closes the polygon (a dbl-click first lands 2 stacked
   *  vertices via pointerup — dedupe before validating). */
  const closePolygon = useCallback(() => {
    const pts = [];
    for (const v of polyRef.current) {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(v.x - last.x, v.y - last.y) > 0.25) pts.push(v);
    }
    if (pts.length < 3) return false;
    finishErase(pts.flatMap((v) => [v.x, v.y]));
    return true;
  }, [finishErase]);

  /** Double-click finishes the traverse (dedupe the dbl-click's stacked
   *  vertices first); at least 2 distinct vertices make a line. */
  const closeTraverse = useCallback(() => {
    const pts = [];
    for (const v of travRef.current) {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(v.x - last.x, v.y - last.y) > 0.25) pts.push(v);
    }
    if (pts.length < 2) return false;
    travRef.current = [];
    setTravTool(false);
    scheduleDraw();
    onTraverse(pts.map((v) => ({ il: v.y, xl: v.x })));
    return true;
  }, [onTraverse, scheduleDraw]);

  // Esc cancels an in-progress erase / traverse gesture without applying it
  useEffect(() => {
    if (!eraseTool && !travTool) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      polyRef.current = [];
      rectRef.current = null;
      travRef.current = [];
      setEraseTool(false);
      setTravTool(false);
      scheduleDraw();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [eraseTool, travTool, scheduleDraw]);

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
    if (eraseArmed && closePolygon()) return;
    if (travArmed && closeTraverse()) return;
    const { sx, sy } = toDevice(e);
    transformRef.current.zoomAt(2, sx, sy);
    scheduleDraw();
  }, [toDevice, scheduleDraw, eraseArmed, closePolygon, travArmed, closeTraverse]);

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

  // height === 'fill' stretches the viewport to the parent's height (the
  // workspace center pane) exactly like the fullscreen branch does.
  const fillHeight = isFullscreen || height === 'fill';
  return (
    <div
      ref={wrapRef}
      data-testid="map-view"
      className={`flex flex-col ${isFullscreen ? 'h-screen bg-slate-950 p-2'
        : fillHeight ? 'h-full min-h-0' : ''}`}
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

        <span className="text-xs text-slate-400">vs</span>
        <select
          className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs max-w-[150px]"
          value={vs?.id || ''}
          onChange={(e) => {
            setVsId(e.target.value);
            if (e.target.value) setAttr('structure');   // isochron ⊕ amplitude
          }}
          disabled={(horizons || []).length < 2}
          title="Isochron mode: map the TWT interval Δ = vs − horizon (needs two visible horizons)"
        >
          <option value="">— (structure)</option>
          {(horizons || []).filter((h) => h.id !== active?.id).map((h) => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>

        {onAmplitude && (
          <select
            className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs"
            value={effAttr}
            onChange={(e) => {
              setAttr(e.target.value);
              if (e.target.value !== 'structure') setVsId('');  // amplitude ⊕ isochron
            }}
            disabled={!active}
            title="Mapped attribute: the horizon surface, or seismic amplitude extracted along it"
          >
            <option value="structure">Structure</option>
            {AMP_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        )}
        {ampMode?.windowed && (
          <select
            className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs"
            value={String(attrWindow)}
            onChange={(e) => setAttrWindow(Number(e.target.value))}
            title="Extraction half-window (samples around the pick)"
          >
            {[2, 5, 10, 20].map((w) => (
              <option key={w} value={String(w)}>{`±${w}`}</option>
            ))}
          </select>
        )}

        <select
          className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs"
          value={colormap}
          onChange={(e) => setColormap(e.target.value)}
          disabled={!hasData}
          title="Map colormap"
        >
          {MAP_COLORMAPS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>

        <select
          className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs"
          value={effDomain}
          onChange={(e) => setDomain(e.target.value)}
          disabled={!hasData || !velocity || effAttr !== 'structure'}
          title={effAttr !== 'structure'
            ? 'Amplitude maps have no display domain — switch the attribute back to Structure'
            : velocity
              ? 'Display domain (depth via the volume velocity model)'
              : 'Depth display needs a velocity model — set one in the viewer controls'}
        >
          <option value="twt">TWT ms</option>
          <option value="depth_m">Depth m</option>
          <option value="depth_ft">Depth ft</option>
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
              Fault sticks (footprints)
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.faultTraces} onCheckedChange={() => togglePref('faultTraces')}
            >
              Fault traces on horizon
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.traverses} onCheckedChange={() => togglePref('traverses')}
            >
              Saved traverse lines
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem onSelect={(e) => e.preventDefault()}
              checked={prefs.wells} onCheckedChange={() => togglePref('wells')}
              disabled={!spacing?.affine}
            >
              Wells{!spacing?.affine ? ' (no coordinates)' : ''}
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

        {onTraverse && (
          <Button
            variant="outline" size="sm"
            className={travTool ? 'border-cyan-500/60 text-cyan-300' : ''}
            onClick={() => {
              travRef.current = [];
              polyRef.current = [];
              rectRef.current = null;
              setEraseTool(false);
              setTravTool((v) => !v);
              scheduleDraw();
            }}
            disabled={!hasData}
            title="Draw a traverse line: click vertices along the path, double-click to finish — the section along it opens in the Traverse window (drawing again replaces it)"
          >
            <Route className="w-4 h-4" />
          </Button>
        )}
        {onTraverse && traverse && (
          <Button
            variant="outline" size="sm"
            className="text-slate-400 hover:text-red-400"
            onClick={() => onTraverse(null)}
            title="Remove the traverse line (clears the Traverse window)"
          >
            <X className="w-4 h-4" />
          </Button>
        )}

        {onEraseRegion && (
          <Button
            variant="outline" size="sm"
            className={eraseTool ? 'border-red-500/60 text-red-300' : ''}
            onClick={() => {
              polyRef.current = [];
              rectRef.current = null;
              travRef.current = [];
              setTravTool(false);
              setEraseTool((v) => !v);
              scheduleDraw();
            }}
            disabled={!active || Boolean(vs)}
            title={vs
              ? 'Erase is unavailable on an isochron map — switch vs back to structure first'
              : 'Erase the mapped horizon’s picks in a region: drag a rectangle, or click polygon vertices and double-click to close'}
          >
            <Eraser className="w-4 h-4" />
          </Button>
        )}

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
          ${fillHeight ? 'flex-1 min-h-0' : ''}`}
        style={fillHeight ? undefined : { height }}
      >
        <canvas
          ref={canvasRef}
          className={`w-full h-full block touch-none ${eraseArmed || travArmed
            ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
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
        {ampBusy && <span className="text-cyan-400">extracting amplitude…</span>}
        <span ref={readoutValsRef} className="whitespace-pre" style={{ display: 'none' }} />
        <span ref={readoutHintRef} className="text-slate-600">
          {eraseArmed
            ? 'erase: drag a rectangle · or click polygon vertices, dbl-click to close · Esc: cancel'
            : travArmed
              ? 'traverse: click vertices along the path · dbl-click to finish · drag: pan · Esc: cancel'
              : 'drag: pan · wheel: zoom · dbl-click: zoom in · click: move IL/XL there'}
        </span>
      </div>
    </div>
  );
}

// Memoized like SliceView/CubeView: ViewerPanel re-renders per slider tick.
export default React.memo(MapView);
