// Framework 3D window (Earth Modeling EM6, 2026-09-06): the clamped
// surfaces, wells, tops and fault polygons on the shared raw-WebGL2
// scene renderer with the shared orbit camera. Scene geometry comes
// from services/framework3d.js; this component owns interaction (orbit,
// pan, zoom), vertical exaggeration, surface toggles, the colour mode,
// the DOM label overlay (projected through the camera, so e2e can read
// it; WebGL pixels are not readable) and PNG snapshots.

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Camera, Maximize2 } from 'lucide-react';
import { OrbitCamera } from '@/components/viewer3d/math3d';
import { SceneRenderer } from '@/components/viewer3d/SceneRenderer';
import { hexToRgb } from '@/components/viewer3d/gridMesh';
import { buildFrameworkScene } from '../services/framework3d';
import { gridScene, contactScene, faultScene, wellLogScene, propertyStats, cellLayers, PROPERTY_LABELS, ZONE_COLORS, FLUID_RGB } from '../services/grid3d/scene';
import { FACIES_CODES } from '../services/grid3d/properties';

const VE = [1, 2, 5, 10];
const AXIS = [0.58, 0.64, 0.72];
const SKELETON_DENSITY = [0, 1, 2, 5, 10];
/** The grid view's default state (the player drives it when the 3D window is linked). */
export const DEFAULT_GRID_VIEW = Object.freeze({ mode: 'shell', prop: 'zone', density: 5, slices: { i: null, j: null, k: null }, filter: null, contacts: true, faults: true, logs: true, hiddenZones: [] });
/**
 * Fit the camera to the model's cells (the grid's live columns), not the frame:
 * the six-well model covers part of its frame, and a fit to the frame left it
 * small in the window. Without cells, the frame.
 */
export function fitCamera(c, scene, grid3d) {
  const pos = grid3d?.mesh?.positions;
  if (!pos || pos.length < 9) { c.fitTo(scene.ext); return; }
  const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
  const sc = [scene.ext.X, scene.ext.D, scene.ext.Z];
  for (let q = 0; q < pos.length; q += 3) for (let a = 0; a < 3; a++) { const v = pos[q + a] * sc[a]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
  c.target = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const radius = 0.5 * Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  c.dist = Math.max(c.minDist ?? 0.01, Math.min(c.maxDist ?? 100, (radius / Math.sin(c.fov / 2)) * 0.95));
}
const hasGrid = (built) => (built?.zones || []).some((z) => z.layers?.length > 1) || !!built?.grid;
const rgbCss = (c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;

export default function FrameworkView3D({
  built, wells = [], surfaceNames = [], faultPolygons = [], depthUnit = 'm', height = '100%', onStatus, fenceLine = null,
  gridView = null, onGridView = null, compact = false,
}) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const dragRef = useRef(null);
  const fittedRef = useRef(false);
  const [ve, setVe] = useState(2);
  const [colorBy, setColorBy] = useState('depth');
  // U2-018: properties on the surfaces and a fence along the section line
  const [property, setProperty] = useState('phi');
  const [showFence, setShowFence] = useState(false);
  const [hidden, setHidden] = useState(() => new Set());
  const [frame, setFrame] = useState(0);
  const [glError, setGlError] = useState(null);
  const [cam, setCam] = useState({ yaw: 0, pitch: 0, dist: 0 });
  // 3D grid upgrade: the cells (shell, slices or a property filter) with the grid skeleton,
  // contacts, fault planes and the wells' upscaled logs; controlled by the player when linked
  const gridOn = hasGrid(built);
  const [ownGv, setOwnGv] = useState(() => ({ ...DEFAULT_GRID_VIEW }));
  const gv = gridView || ownGv;
  const setGv = (patch) => { const next = { ...gv, ...patch }; if (onGridView) onGridView(next); else setOwnGv(next); };
  const [display, setDisplay] = useState(gridOn ? 'grid' : 'surfaces');
  useEffect(() => { setDisplay(gridOn ? 'grid' : 'surfaces'); }, [gridOn]);
  const layersAll = useMemo(() => (built ? cellLayers(built) : []), [built]);

  const scene = useMemo(() => {
    if (!built) return null;
    try {
      return buildFrameworkScene(built, wells, {
        ve, surfaceNames, faultPolygons: display === 'grid' ? [] : faultPolygons, depthUnit, colorBy, property,
        fence: showFence && display !== 'grid' ? fenceLine : null,
        visible: built.clamped.map((_, i) => display !== 'grid' && !hidden.has(i)),
      });
    } catch (e) { onStatus?.(e.message); return null; }
  }, [built, wells, ve, surfaceNames, faultPolygons, depthUnit, colorBy, hidden, property, showFence, fenceLine, display]); // eslint-disable-line react-hooks/exhaustive-deps

  // the cells in model space (the same frame the framework scene uses)
  const grid3d = useMemo(() => {
    if (!scene || !built || display !== 'grid') return null;
    const { spec } = built;
    const L = Math.max((spec.nx - 1) * spec.dx, (spec.ny - 1) * spec.dy) || 1;
    const zr = scene.zMax - scene.zMin;
    const toModel = (x, y, d) => [(x - spec.x0) / L, -(d - scene.zMin) / zr, (y - spec.y0) / L];
    try {
      const g = gridScene(built, { toModel, prop: gv.prop, mode: gv.mode, slices: gv.slices, density: gv.density, filter: gv.filter, hiddenZones: gv.hiddenZones || [] });
      const logProp = ['zone', 'fluid'].includes(gv.prop) ? 'phi' : gv.prop;
      const logRange = logProp === 'facies' ? { lo: 0, hi: 3 } : propertyStats(built, logProp, layersAll);
      return {
        ...g,
        contacts: gv.contacts ? contactScene(built, { toModel, hiddenZones: gv.hiddenZones || [] }) : [],
        faults: gv.faults ? faultScene(faultPolygons, { toModel, zMin: scene.zMin, zMax: scene.zMax }) : null,
        logs: gv.logs ? wellLogScene(built, logProp, { toModel, width: 0.05 * L, range: logRange }) : null,
        logProp,
      };
    } catch (e) { onStatus?.(e.message); return null; }
  }, [scene, built, display, gv.prop, gv.mode, gv.slices, gv.density, gv.filter, gv.contacts, gv.faults, gv.logs, gv.hiddenZones, faultPolygons, layersAll]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let renderer;
    try { renderer = new SceneRenderer(canvas); } catch (e) { setGlError(e.message); return undefined; }
    rendererRef.current = renderer;
    const c = new OrbitCamera();
    c.yaw = -0.7; c.pitch = 0.5;
    cameraRef.current = c;
    return () => { renderer.dispose(); rendererRef.current = null; };
  }, []);

  const redraw = useCallback(() => {
    const renderer = rendererRef.current; const c = cameraRef.current; const canvas = canvasRef.current;
    if (!renderer || !c || !canvas) return;
    renderer.draw(c.viewProj(canvas.clientWidth, canvas.clientHeight), 'dark');
    setCam({ yaw: c.yaw, pitch: c.pitch, dist: c.dist });
    setFrame((f) => f + 1);
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current; const c = cameraRef.current;
    if (!renderer || !c || !scene) return;
    const keep = new Set();
    renderer.setScale(scene.ext.X, scene.ext.D, scene.ext.Z);
    // opaque cells first, translucent contacts and faults after (the renderer draws in insertion order)
    renderer.prune(new Set());
    if (grid3d) {
      keep.add('cells'); renderer.setMesh('cells', { ...grid3d.mesh, alpha: 1 });
      if (grid3d.logs?.indices?.length) { keep.add('logs'); renderer.setMesh('logs', { ...grid3d.logs, alpha: 1 }); }
      if (grid3d.skeleton.length) { keep.add('skeleton'); renderer.setLineSet('skeleton', { positions: grid3d.skeleton, color: [0.04, 0.05, 0.08], alpha: 0.55 }); }
      grid3d.contacts.forEach((c, q) => {
        keep.add(`contact-${q}`); renderer.setMesh(`contact-${q}`, { ...c.mesh, alpha: 0.42 });
        if (c.lines.length) { keep.add(`contact-line-${q}`); renderer.setLineSet(`contact-line-${q}`, { positions: c.lines, color: c.kind === 'owc' ? [0.75, 0.88, 1] : [1, 0.75, 0.75], alpha: 1 }); }
      });
      if (grid3d.faults?.mesh.indices.length) { keep.add('fault-planes'); renderer.setMesh('fault-planes', { ...grid3d.faults.mesh, alpha: 0.45 }); }
    }
    // U2-018: with the fence on the surfaces turn translucent so the fence shows through
    const surfAlpha = scene.fence && scene.fence.quads ? 0.45 : 0.96;
    for (const s of scene.surfaces) { keep.add(s.id); renderer.setMesh(s.id, { positions: s.positions, colors: s.colors, indices: s.indices, alpha: surfAlpha }); }
    for (const w of scene.wells) { keep.add(w.id); renderer.setLineSet(w.id, { positions: w.positions, color: w.color, alpha: 1 }); }
    if (scene.tops.length) { keep.add('tops'); renderer.setLineSet('tops', { positions: scene.tops, color: [0.98, 0.98, 0.99], alpha: 1 }); }
    if (scene.fence && scene.fence.quads) { keep.add('fence'); renderer.setMesh('fence', { positions: scene.fence.positions, colors: scene.fence.colors, indices: scene.fence.indices, alpha: 1 }); }
    if (scene.faults.length) { keep.add('faults'); renderer.setLineSet('faults', { positions: scene.faults, color: hexToRgb('#eab308'), alpha: 1 }); }
    keep.add('edges'); renderer.setLineSet('edges', { positions: scene.axes.edges, color: AXIS, alpha: 0.9, scaled: false });
    renderer.prune(keep);
    if (!fittedRef.current) { fitCamera(c, scene, grid3d); fittedRef.current = true; }
    redraw();
  }, [scene, grid3d, redraw]);

  useEffect(() => {
    const c = cameraRef.current;
    if (c && scene && fittedRef.current) { fitCamera(c, scene, grid3d); redraw(); }
  }, [ve]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const onDown = (e) => { dragRef.current = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; canvas.setPointerCapture?.(e.pointerId); };
    const onMove = (e) => {
      const d = dragRef.current; const c = cameraRef.current;
      if (!d || !c) return;
      const dx = e.clientX - d.x; const dy = e.clientY - d.y;
      dragRef.current = { ...d, x: e.clientX, y: e.clientY };
      if (d.pan) c.pan(dx, dy, canvas.clientHeight); else c.orbit(dx * 0.008, dy * 0.008);
      redraw();
    };
    const onUp = () => { dragRef.current = null; };
    const onWheel = (e) => { e.preventDefault(); cameraRef.current?.dolly(e.deltaY > 0 ? 1.12 : 1 / 1.12); redraw(); };
    const onCtx = (e) => e.preventDefault();
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onCtx);
    const ro = new ResizeObserver(redraw);
    ro.observe(canvas);
    return () => {
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onCtx); ro.disconnect();
    };
  }, [redraw]);

  const projected = useMemo(() => {
    const c = cameraRef.current; const canvas = canvasRef.current;
    if (!c || !canvas || !scene) return { labels: [], ticks: [] };
    const w = canvas.clientWidth || 1; const h = canvas.clientHeight || 1;
    const mvp = c.viewProj(w, h);
    const sc = [scene.ext.X, scene.ext.D, scene.ext.Z];
    const proj = (p, scaled = true) => c.project(mvp, scaled ? [p[0] * sc[0], p[1] * sc[1], p[2] * sc[2]] : p, w, h);
    return {
      labels: scene.labels.map((l) => ({ ...l, screen: proj(l.pos) })).filter((l) => l.screen),
      // T1 (EM-T1-008): drop a tick that would land on one already kept
      ticks: scene.axes.ticks.map((t) => ({ ...t, screen: proj(t.pos, false) })).filter((t) => t.screen)
        .reduce((kept, t) => (kept.some((k) => Math.abs(k.screen.x - t.screen.x) < 30 && Math.abs(k.screen.y - t.screen.y) < 12) ? kept : [...kept, t]), []),
    };
  }, [scene, frame]); // eslint-disable-line react-hooks/exhaustive-deps

  const snapshot = () => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    redraw();
    const a = document.createElement('a');
    a.href = renderer.snapshot();
    a.download = 'earth-model-3d.png';
    a.click();
    onStatus?.('3D view exported as PNG.');
  };
  const fit = () => { const c = cameraRef.current; if (c && scene) { fitCamera(c, scene, grid3d); redraw(); } };
  const toggleSurface = (i) => setHidden((h) => { const n = new Set(h); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  if (glError) {
    return <div className="flex h-full items-center justify-center text-xs text-pl-warning-text" data-testid="em-3d-error">3D view unavailable: {glError}</div>;
  }
  return (
    <div className="relative w-full overflow-hidden rounded border border-slate-800 bg-slate-950" style={{ height }} data-testid="em-3d-view"
      // design system (W4B): the 3D viewer stays dark in both themes; its
      // overlays and everything drawn inside are unchanged
      data-canvas="dark"
      data-yaw={cam.yaw.toFixed(3)} data-pitch={cam.pitch.toFixed(3)} data-dist={cam.dist.toFixed(3)} data-ve={ve} data-surfaces={scene?.surfaces.length ?? 0}
      data-fence-quads={scene?.fence?.quads ?? 0} data-colorby={colorBy}
      data-display={display} data-grid-quads={grid3d?.mesh.quads ?? 0} data-skeleton={grid3d ? grid3d.skeleton.length / 6 : 0}
      data-contacts={grid3d?.contacts.length ?? 0} data-filter-cells={grid3d?.counts.cells ?? 0}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" data-testid="em-3d-canvas" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {projected.labels.map((l, i) => (
          <span key={`${l.text}-${i}`} data-testid={`em-3d-label-${l.kind}`} className="absolute whitespace-nowrap text-[9px] font-medium"
            style={{ left: l.screen.x + 5, top: l.screen.y - 6, color: l.color || '#94a3b8' }}>{l.text}</span>
        ))}
        {projected.ticks.map((t, i) => (
          <span key={`tick-${i}`} className="absolute text-[8px] text-slate-400" style={{ left: t.screen.x + 2, top: t.screen.y }}>{t.text}</span>
        ))}
      </div>
      <div className="absolute left-2 top-2 flex max-w-[calc(100%-300px)] flex-wrap items-center gap-1 rounded border border-pl-border bg-pl-raised/90 px-2 py-1 text-[10px] text-pl-text shadow-pl-sm">
        <span>VE</span>
        {VE.map((v) => (
          <button key={v} type="button" data-testid={`em-3d-ve-${v}`} onClick={() => setVe(v)}
            className={`rounded px-1.5 py-0.5 ${ve === v ? 'bg-pl-primary text-pl-primary-fg' : 'bg-pl-sunken text-pl-muted hover:text-pl-text'}`}>{v}x</button>
        ))}
        <span className="mx-1 text-pl-border-strong">|</span>
        {gridOn && (
          <select data-testid="em-3d-display" value={display} onChange={(e) => setDisplay(e.target.value)} className="rounded bg-pl-sunken px-1 py-0.5 text-[10px] text-pl-text" title="The grid's cells or the framework surfaces">
            <option value="grid">grid cells</option><option value="surfaces">surfaces</option>
          </select>
        )}
        {display === 'grid' && (
          <>
            <select data-testid="em-3d-mode" value={gv.mode} onChange={(e) => setGv({ mode: e.target.value, ...(e.target.value === 'slices' && gv.slices.i === null && gv.slices.j === null && gv.slices.k === null ? { slices: { i: Math.floor(built.spec.nx / 2), j: Math.floor(built.spec.ny / 2), k: 0 } } : {}) })}
              className="rounded bg-pl-sunken px-1 py-0.5 text-[10px] text-pl-text" title="The outside of the grid, I, J and K slices through it, or only the cells whose value is in a range">
              <option value="shell">shell</option><option value="slices">slices</option><option value="filter">cell filter</option>
            </select>
            <select data-testid="em-3d-gridprop" value={gv.prop} onChange={(e) => setGv({ prop: e.target.value, filter: null })} className="rounded bg-pl-sunken px-1 py-0.5 text-[10px] text-pl-text">
              {['zone', 'phi', 'sw', 'ntg', 'perm', 'vsh', 'facies', 'fluid'].map((k) => <option key={k} value={k}>{PROPERTY_LABELS[k]}</option>)}
            </select>
            <label className="flex items-center gap-1" title="Grid skeleton: cell edges every n cells on the shell and the slices">grid
              <select data-testid="em-3d-density" value={gv.density} onChange={(e) => setGv({ density: Number(e.target.value) })} className="rounded bg-pl-sunken px-1 py-0.5 text-[10px] text-pl-text">
                {SKELETON_DENSITY.map((n) => <option key={n} value={n}>{n === 0 ? 'off' : n === 1 ? 'every cell' : `every ${n}`}</option>)}
              </select>
            </label>
            {[['contacts', 'contacts'], ['faults', 'faults'], ['logs', 'logs']].map(([k, label]) => (
              <button key={k} type="button" data-testid={`em-3d-${k}`} onClick={() => setGv({ [k]: !gv[k] })}
                className={`rounded px-1.5 py-0.5 ${gv[k] ? 'bg-pl-primary text-pl-primary-fg' : 'bg-pl-sunken'}`}>{label}</button>
            ))}
          </>
        )}
        {display !== 'grid' && <button type="button" data-testid="em-3d-colorby" onClick={() => setColorBy((c) => (c === 'depth' ? 'surface' : c === 'surface' ? 'property' : 'depth'))}
          className="rounded bg-pl-sunken px-1.5 py-0.5" title="Colour the surfaces by depth, one colour per surface, or a property of the zone below">colour: {colorBy}</button>}
        {display !== 'grid' && colorBy === 'property' && (
          <select data-testid="em-3d-property" value={property} onChange={(e) => setProperty(e.target.value)} className="rounded bg-pl-sunken px-1 py-0.5 text-[10px] text-pl-text">
            <option value="phi">porosity</option><option value="sw">Sw</option><option value="ntg">NTG</option>
          </select>
        )}
        {display !== 'grid' && <button type="button" data-testid="em-3d-fence" disabled={!fenceLine} onClick={() => setShowFence((f) => !f)}
          className={`rounded px-1.5 py-0.5 disabled:opacity-40 ${showFence ? 'bg-pl-primary text-pl-primary-fg' : 'bg-pl-sunken'}`}
          title={fenceLine ? 'A fence section along the section line (Section view: draw a line or pick two wells)' : 'Set a section line first (Section view)'}>fence</button>}
        <button type="button" data-testid="em-3d-fit" onClick={fit} className="rounded bg-pl-sunken px-1.5 py-0.5" title="Fit the model"><Maximize2 className="inline h-3 w-3" /></button>
        <button type="button" data-testid="em-3d-png" onClick={snapshot} className="rounded bg-pl-sunken px-1.5 py-0.5" title="Download a PNG"><Camera className="inline h-3 w-3" /> PNG</button>
      </div>
      {display === 'grid' && grid3d && !compact && (
        <GridLegend built={built} gv={gv} grid3d={grid3d} setGv={setGv} layersAll={layersAll} depthUnit={depthUnit} />
      )}
      <div className={`absolute right-2 top-2 flex flex-col gap-0.5 rounded border border-pl-border bg-pl-raised/90 px-2 py-1 text-[10px] ${display === 'grid' ? 'hidden' : ''}`} data-testid="em-3d-legend">
        {(built?.clamped || []).map((_, i) => (
          <label key={i} className="flex items-center gap-1 text-pl-text">
            <input type="checkbox" data-testid={`em-3d-surface-${i}`} checked={!hidden.has(i)} onChange={() => toggleSurface(i)} />
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: ['#4ade80', '#60a5fa', '#facc15', '#f472b6', '#c084fc', '#f87171'][i % 6] }} />
            {surfaceNames[i] || `Surface ${i + 1}`}
          </label>
        ))}
      </div>
      {display !== 'grid' && scene?.propertyRange && (
        <div className="absolute bottom-6 left-2 rounded border border-pl-border bg-pl-raised/90 px-2 py-1 text-[10px] text-pl-text" data-testid="em-3d-prop-legend">
          {property === 'phi' ? 'porosity' : property === 'sw' ? 'Sw' : 'NTG'}: <span style={{ color: '#3b82f6' }}>{scene.propertyRange.lo.toFixed(3)}</span> to <span style={{ color: '#ef4444' }}>{scene.propertyRange.hi.toFixed(3)}</span> (zone below each surface)
        </div>
      )}
      <div className="absolute bottom-1 right-2 text-[9px] text-pl-muted">drag orbit, shift-drag pan, wheel zoom, depth in {depthUnit}</div>
    </div>
  );
}

/** The grid legend: the colour key, the slices and the filter range (the player has its own sliders). */
function GridLegend({ built, gv, grid3d, setGv, layersAll, depthUnit }) {
  const nK = layersAll.length;
  const { nx, ny } = built.spec;
  const range = grid3d.range;
  const fmt = (v) => (gv.prop === 'perm' ? v.toPrecision(3) : v.toFixed(3));
  const key = gv.prop === 'zone' ? built.zones.map((z, i) => ({ c: ZONE_COLORS[i % ZONE_COLORS.length], t: z.name }))
    : gv.prop === 'facies' ? Object.entries(FACIES_CODES).map(([, f]) => ({ c: f.color, t: f.name }))
      : gv.prop === 'fluid' ? [{ c: rgbCss(FLUID_RGB[2]), t: 'gas' }, { c: rgbCss(FLUID_RGB[1]), t: 'oil' }, { c: rgbCss(FLUID_RGB[0]), t: 'water' }] : null;
  const k = gv.slices?.k ?? 0;
  const L = layersAll[k];
  const slider = (label, testid, val, max, onChange, text) => (
    <label className="flex items-center gap-1">
      <span className="w-3">{label}</span>
      <input type="range" min={0} max={max} value={val ?? 0} data-testid={testid} onChange={(e) => onChange(Number(e.target.value))} className="w-28" />
      <span className="w-24 truncate">{text}</span>
    </label>
  );
  return (
    <div className="absolute right-2 top-2 flex max-w-[280px] flex-col gap-1 rounded border border-pl-border bg-pl-raised/90 px-2 py-1 text-[10px] text-pl-text" data-testid="em-3d-grid-legend">
      <div className="font-medium">{PROPERTY_LABELS[gv.prop]}</div>
      {gv.prop !== 'zone' && key && key.map((e) => <span key={e.t} className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: e.c }} />{e.t}</span>)}
      <div className="flex flex-col gap-0.5" data-testid="em-3d-zones">
        {built.zones.map((z, i) => (
          <label key={z.name} className="flex items-center gap-1" title="Show or hide the zone's cells">
            <input type="checkbox" data-testid={`em-3d-zone-${i}`} checked={!(gv.hiddenZones || []).includes(i)}
              onChange={() => { const h = gv.hiddenZones || []; setGv({ hiddenZones: h.includes(i) ? h.filter((x) => x !== i) : [...h, i] }); }} />
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: ZONE_COLORS[i % ZONE_COLORS.length] }} />{z.name}
          </label>
        ))}
      </div>
      {key ? null
        : range && <span data-testid="em-3d-grid-range"><span className="inline-block h-2 w-20 align-middle" style={{ background: 'linear-gradient(90deg,#3b4cc0,#7fb2f0,#f6e8a4,#f4865f,#b40426)' }} /> {fmt(range.lo)} to {fmt(range.hi)}</span>}
      <span className="text-pl-muted" data-testid="em-3d-grid-size">{(built.grid?.cells ?? 0).toLocaleString('en-US')} cells, {nx} x {ny} x {nK}</span>
      {gv.mode === 'slices' && (
        <>
          {slider('I', 'em-3d-slice-i', gv.slices.i, nx - 1, (v) => setGv({ slices: { ...gv.slices, i: v } }), `column ${(gv.slices.i ?? 0) + 1}`)}
          {slider('J', 'em-3d-slice-j', gv.slices.j, ny - 1, (v) => setGv({ slices: { ...gv.slices, j: v } }), `row ${(gv.slices.j ?? 0) + 1}`)}
          {slider('K', 'em-3d-slice-k', gv.slices.k, nK - 1, (v) => setGv({ slices: { ...gv.slices, k: v } }), L ? `${built.zones[L.zone]?.name} ${L.k + 1}` : '')}
        </>
      )}
      {gv.mode === 'filter' && range && (
        <FilterRange range={{ ...range, lo: range.min ?? range.lo, hi: range.max ?? range.hi }} filter={gv.filter} prop={gv.prop} onChange={(f) => setGv({ filter: f })} shown={grid3d.counts.cells} skipped={grid3d.counts.skipped} />
      )}
      {gv.mode === 'filter' && !range && <span className="text-pl-muted">pick porosity, Sw, NTG, permeability or Vsh to filter by a range</span>}
      {grid3d.contacts.map((c) => (
        <span key={`${c.kind}-${c.zone}`} className="flex items-center gap-1" data-testid={`em-3d-contact-${c.kind}`}>
          <span className="inline-block h-2 w-3 rounded-sm" style={{ background: c.kind === 'owc' ? '#2563eb' : '#dc2626', opacity: 0.7 }} />
          {c.kind.toUpperCase()} {Number.isFinite(c.depth) ? `${Math.round(depthUnit === 'ft' ? c.depth / 0.3048 : c.depth).toLocaleString('en-US')} ${depthUnit}` : ''}
          {' '}({(c.zones || [c.zone]).filter((zi) => built.zones[zi]?.kind !== 'cap').map((zi) => built.zones[zi]?.name).join(', ') || built.zones[c.zone]?.name})
        </span>
      ))}
    </div>
  );
}

/** Two sliders for the low and high of the cell filter. */
export function FilterRange({ range, filter, prop, onChange, shown = null, skipped = 0 }) {
  const lo = filter?.lo ?? range.lo; const hi = filter?.hi ?? range.hi;
  const toT = (v) => (range.log ? (Math.log10(v) - Math.log10(range.lo)) / (Math.log10(range.hi) - Math.log10(range.lo) || 1) : (v - range.lo) / (range.hi - range.lo));
  const fromT = (t) => (range.log ? 10 ** (Math.log10(range.lo) + t * (Math.log10(range.hi) - Math.log10(range.lo))) : range.lo + t * (range.hi - range.lo));
  const fmt = (v) => (prop === 'perm' ? v.toPrecision(3) : v.toFixed(3));
  return (
    <div className="flex flex-col gap-0.5" data-testid="em-filter-range">
      <label className="flex items-center gap-1">from <input type="range" min={0} max={1000} value={Math.round(toT(lo) * 1000)} data-testid="em-filter-lo" className="w-28"
        onChange={(e) => onChange({ lo: Math.min(fromT(Number(e.target.value) / 1000), hi), hi })} /> {fmt(lo)}</label>
      <label className="flex items-center gap-1">to <input type="range" min={0} max={1000} value={Math.round(toT(hi) * 1000)} data-testid="em-filter-hi" className="w-28"
        onChange={(e) => onChange({ lo, hi: Math.max(fromT(Number(e.target.value) / 1000), lo) })} /> {fmt(hi)}</label>
      {shown !== null && <span className="text-pl-muted" data-testid="em-filter-count">{shown.toLocaleString('en-US')} cells shown{skipped ? ` (every few columns of ${(shown + skipped).toLocaleString('en-US')})` : ''}</span>}
    </div>
  );
}
