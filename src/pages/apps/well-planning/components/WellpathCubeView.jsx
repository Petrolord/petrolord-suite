// Well Design Studio 3D window (WD5): multi-well trajectory view on
// the raw-WebGL2 line renderer with the shared Seismolord orbit
// camera. Scene geometry comes precomputed from services/wpMesh.js
// (buildScene); this component owns interaction (orbit / pan / zoom),
// the vertical-exaggeration control, layer toggles, DOM label overlay
// (projected through the camera — e2e can't read WebGL pixels, labels
// are assertable DOM), and PNG snapshot capture.

import React, {
  useRef, useEffect, useState, useMemo, useCallback,
} from 'react';
import { Button } from '@/components/ui/button';
import { Camera } from 'lucide-react';
import { OrbitCamera } from '../../Seismolord/viewer/cube3d';
import { WpCubeRenderer, cssColorToRgb } from '../viewer3d/WpCubeRenderer';
import { buildScene } from '../services/wpMesh';

const AXIS_COLOR = { light: [0.28, 0.33, 0.41], dark: [0.58, 0.64, 0.72] };

const KIND_ALPHA = { plan: 1, actual: 1, offset: 0.75 };

const WellpathCubeView = ({
  wells = [], targets = [], tops = [], background = 'light', height = null,
  onSnapshot = null,
}) => {
  const holderRef = useRef(null);
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const dragRef = useRef(null);
  const [vexag, setVexag] = useState(1);
  const [layers, setLayers] = useState({ eou: true, targets: true, tops: true, offsets: true });
  const [frame, setFrame] = useState(0); // bumped to reproject labels
  const [glError, setGlError] = useState(null);

  const scene = useMemo(() => buildScene({
    wells: layers.offsets ? wells : wells.filter((w) => w.kind !== 'offset'),
    targets: layers.targets ? targets : [],
    tops: layers.tops ? tops : [],
  }, { vexag }), [wells, targets, tops, layers, vexag]);

  // ---- renderer lifecycle -------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let renderer;
    try {
      renderer = new WpCubeRenderer(canvas);
    } catch (e) {
      setGlError(e.message);
      return undefined;
    }
    rendererRef.current = renderer;
    const cam = new OrbitCamera();
    cameraRef.current = cam;
    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  const redraw = useCallback(() => {
    const renderer = rendererRef.current;
    const cam = cameraRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !cam || !canvas || !scene) return;
    const mvp = cam.viewProj(canvas.clientWidth, canvas.clientHeight);
    renderer.draw(mvp, background);
    setFrame((f) => f + 1);
  }, [scene, background]);

  // ---- scene upload -------------------------------------------------------
  const fittedRef = useRef(false);
  useEffect(() => {
    const renderer = rendererRef.current;
    const cam = cameraRef.current;
    if (!renderer || !cam || !scene) return;
    const keep = new Set();
    const add = (id, positions, cssColor, alpha = 1) => {
      keep.add(id);
      renderer.setLineSet(id, { positions, color: cssColorToRgb(cssColor), alpha });
    };
    for (const w of scene.wells) {
      add(`well-${w.id}`, w.positions, w.color, KIND_ALPHA[w.kind] ?? 1);
    }
    if (layers.eou) {
      for (const r of scene.eouRings) add(`eou-${r.wellId}`, r.positions, r.color, 0.45);
    }
    for (const t of scene.targets) add(`target-${t.id}`, t.positions, t.color);
    for (const t of scene.tops) add(`top-${t.wellId}-${t.name}`, t.positions, t.color, 0.9);
    keep.add('axes');
    renderer.setLineSet('axes', {
      positions: scene.axes.edges, color: AXIS_COLOR[background], alpha: 0.85,
    });
    keep.add('north');
    renderer.setLineSet('north', {
      positions: scene.northArrow.positions, color: AXIS_COLOR[background], alpha: 1,
    });
    renderer.prune(keep);
    if (!fittedRef.current) {
      cam.fitTo(scene.ext);
      fittedRef.current = true;
    }
    redraw();
  }, [scene, layers.eou, background, redraw]);

  // Refit when the vertical exaggeration changes the box height.
  useEffect(() => {
    const cam = cameraRef.current;
    if (cam && scene && fittedRef.current) {
      cam.fitTo(scene.ext);
      redraw();
    }
  }, [vexag]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- interaction --------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const onDown = (e) => {
      dragRef.current = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      const d = dragRef.current;
      const cam = cameraRef.current;
      if (!d || !cam) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      dragRef.current = { ...d, x: e.clientX, y: e.clientY };
      if (d.pan) cam.pan(dx, dy, canvas.clientHeight);
      else cam.orbit(dx * 0.008, dy * 0.008);
      redraw();
    };
    const onUp = () => { dragRef.current = null; };
    const onWheel = (e) => {
      e.preventDefault();
      cameraRef.current?.dolly(e.deltaY > 0 ? 1.12 : 1 / 1.12);
      redraw();
    };
    const onCtx = (e) => e.preventDefault();
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onCtx);
    const ro = new ResizeObserver(redraw);
    ro.observe(canvas);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onCtx);
      ro.disconnect();
    };
  }, [redraw]);

  // ---- label overlay (DOM, camera-projected) ------------------------------
  const projected = useMemo(() => {
    const cam = cameraRef.current;
    const canvas = canvasRef.current;
    if (!cam || !canvas || !scene) return { labels: [], ticks: [], north: null };
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const mvp = cam.viewProj(w, h);
    const proj = (p) => cam.project(mvp, p, w, h);
    return {
      labels: scene.labels
        .map((l) => ({ ...l, screen: proj(l.pos) }))
        .filter((l) => l.screen),
      ticks: scene.axes.ticks
        .map((t) => ({ ...t, screen: proj(t.pos) }))
        .filter((t) => t.screen),
      north: proj(scene.northArrow.anchor),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, frame]);

  const handleSnapshot = () => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    redraw();
    const url = renderer.snapshot();
    if (onSnapshot) { onSnapshot(url); return; }
    const a = document.createElement('a');
    a.href = url;
    a.download = 'well-design-3d.png';
    a.click();
  };

  const textColor = background === 'dark' ? 'text-slate-300' : 'text-slate-600';
  const toggle = (key) => setLayers((l) => ({ ...l, [key]: !l[key] }));

  if (glError) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-amber-400" data-testid="wp-cube-error">
        3D view unavailable: {glError}
      </div>
    );
  }

  return (
    <div
      ref={holderRef}
      className={`relative h-full w-full overflow-hidden ${background === 'dark' ? 'bg-slate-950' : 'bg-white'}`}
      style={height ? { height } : undefined}
      data-testid="wp-cube-view"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* projected labels (DOM so tests and screen readers can see them) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {projected.labels.map((l, i) => (
          <span
            key={`${l.kind}-${l.text}-${i}`}
            data-testid={`wp-cube-label-${l.kind}`}
            className="absolute whitespace-nowrap text-[9px] font-medium"
            style={{ left: l.screen.x + 5, top: l.screen.y - 6, color: l.color || '#94a3b8' }}
          >
            {l.text}
          </span>
        ))}
        {projected.ticks.map((t, i) => (
          <span key={`tick-${i}`} className={`absolute text-[8px] ${textColor}`}
            style={{ left: t.screen.x + 2, top: t.screen.y }}>
            {t.text}
          </span>
        ))}
        {projected.north && (
          <span className={`absolute text-[9px] font-bold ${textColor}`}
            style={{ left: projected.north.x - 3, top: projected.north.y - 14 }}>
            N
          </span>
        )}
      </div>

      {/* controls */}
      <div className="absolute left-2 top-2 flex flex-wrap items-center gap-1 rounded bg-slate-900/80 px-2 py-1 text-[10px] text-slate-300">
        <span>Vexag</span>
        {[1, 2, 5].map((v) => (
          <button key={v} type="button" onClick={() => setVexag(v)}
            className={`rounded px-1.5 py-0.5 ${vexag === v ? 'bg-lime-600 text-white' : 'bg-slate-800'}`}>
            {v}x
          </button>
        ))}
        <span className="mx-1 text-slate-600">|</span>
        {[['eou', 'EOU'], ['targets', 'Targets'], ['tops', 'Tops'], ['offsets', 'Offsets']].map(([key, lab]) => (
          <button key={key} type="button" onClick={() => toggle(key)}
            className={`rounded px-1.5 py-0.5 ${layers[key] ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-500'}`}>
            {lab}
          </button>
        ))}
        <Button size="sm" variant="ghost" onClick={handleSnapshot} data-testid="wp-cube-snapshot"
          className="ml-1 h-5 px-1.5 text-[10px] text-slate-300 hover:bg-slate-700">
          <Camera className="mr-0.5 h-3 w-3" /> PNG
        </Button>
      </div>
      <div className="absolute bottom-1 right-2 text-[9px] text-slate-500">
        drag orbit · shift-drag pan · wheel zoom
      </div>
    </div>
  );
};

export default WellpathCubeView;
