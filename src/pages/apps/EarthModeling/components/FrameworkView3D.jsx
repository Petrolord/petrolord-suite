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

const VE = [1, 2, 5, 10];
const AXIS = [0.58, 0.64, 0.72];

export default function FrameworkView3D({
  built, wells = [], surfaceNames = [], faultPolygons = [], depthUnit = 'm', height = 520, onStatus,
}) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const dragRef = useRef(null);
  const fittedRef = useRef(false);
  const [ve, setVe] = useState(2);
  const [colorBy, setColorBy] = useState('depth');
  const [hidden, setHidden] = useState(() => new Set());
  const [frame, setFrame] = useState(0);
  const [glError, setGlError] = useState(null);
  const [cam, setCam] = useState({ yaw: 0, pitch: 0, dist: 0 });

  const scene = useMemo(() => {
    if (!built) return null;
    try {
      return buildFrameworkScene(built, wells, {
        ve, surfaceNames, faultPolygons, depthUnit, colorBy,
        visible: built.clamped.map((_, i) => !hidden.has(i)),
      });
    } catch (e) { onStatus?.(e.message); return null; }
  }, [built, wells, ve, surfaceNames, faultPolygons, depthUnit, colorBy, hidden]); // eslint-disable-line react-hooks/exhaustive-deps

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
    for (const s of scene.surfaces) { keep.add(s.id); renderer.setMesh(s.id, { positions: s.positions, colors: s.colors, indices: s.indices, alpha: 0.96 }); }
    for (const w of scene.wells) { keep.add(w.id); renderer.setLineSet(w.id, { positions: w.positions, color: w.color, alpha: 1 }); }
    if (scene.tops.length) { keep.add('tops'); renderer.setLineSet('tops', { positions: scene.tops, color: [0.98, 0.98, 0.99], alpha: 1 }); }
    if (scene.faults.length) { keep.add('faults'); renderer.setLineSet('faults', { positions: scene.faults, color: hexToRgb('#eab308'), alpha: 1 }); }
    keep.add('edges'); renderer.setLineSet('edges', { positions: scene.axes.edges, color: AXIS, alpha: 0.9, scaled: false });
    renderer.prune(keep);
    if (!fittedRef.current) { c.fitTo(scene.ext); fittedRef.current = true; }
    redraw();
  }, [scene, redraw]);

  useEffect(() => {
    const c = cameraRef.current;
    if (c && scene && fittedRef.current) { c.fitTo(scene.ext); redraw(); }
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
      ticks: scene.axes.ticks.map((t) => ({ ...t, screen: proj(t.pos, false) })).filter((t) => t.screen),
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
  const fit = () => { const c = cameraRef.current; if (c && scene) { c.fitTo(scene.ext); redraw(); } };
  const toggleSurface = (i) => setHidden((h) => { const n = new Set(h); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  if (glError) {
    return <div className="flex h-full items-center justify-center text-xs text-amber-400" data-testid="em-3d-error">3D view unavailable: {glError}</div>;
  }
  return (
    <div className="relative w-full overflow-hidden rounded border border-slate-800 bg-slate-950" style={{ height }} data-testid="em-3d-view"
      data-yaw={cam.yaw.toFixed(3)} data-pitch={cam.pitch.toFixed(3)} data-dist={cam.dist.toFixed(3)} data-ve={ve} data-surfaces={scene?.surfaces.length ?? 0}>
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
      <div className="absolute left-2 top-2 flex flex-wrap items-center gap-1 rounded bg-slate-900/80 px-2 py-1 text-[10px] text-slate-300">
        <span>VE</span>
        {VE.map((v) => (
          <button key={v} type="button" data-testid={`em-3d-ve-${v}`} onClick={() => setVe(v)}
            className={`rounded px-1.5 py-0.5 ${ve === v ? 'bg-cyan-700 text-white' : 'bg-slate-800'}`}>{v}x</button>
        ))}
        <span className="mx-1 text-slate-600">|</span>
        <button type="button" data-testid="em-3d-colorby" onClick={() => setColorBy((c) => (c === 'depth' ? 'surface' : 'depth'))}
          className="rounded bg-slate-800 px-1.5 py-0.5" title="Colour the surfaces by depth or one colour per surface">colour: {colorBy}</button>
        <button type="button" data-testid="em-3d-fit" onClick={fit} className="rounded bg-slate-800 px-1.5 py-0.5" title="Fit the model"><Maximize2 className="inline h-3 w-3" /></button>
        <button type="button" data-testid="em-3d-png" onClick={snapshot} className="rounded bg-slate-800 px-1.5 py-0.5" title="Download a PNG"><Camera className="inline h-3 w-3" /> PNG</button>
      </div>
      <div className="absolute right-2 top-2 flex flex-col gap-0.5 rounded bg-slate-900/80 px-2 py-1 text-[10px]" data-testid="em-3d-legend">
        {(built?.clamped || []).map((_, i) => (
          <label key={i} className="flex items-center gap-1 text-slate-300">
            <input type="checkbox" data-testid={`em-3d-surface-${i}`} checked={!hidden.has(i)} onChange={() => toggleSurface(i)} />
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: ['#4ade80', '#60a5fa', '#facc15', '#f472b6', '#c084fc', '#f87171'][i % 6] }} />
            {surfaceNames[i] || `Surface ${i + 1}`}
          </label>
        ))}
      </div>
      <div className="absolute bottom-1 right-2 text-[9px] text-slate-500">drag orbit, shift-drag pan, wheel zoom, depth in {depthUnit}</div>
    </div>
  );
}
