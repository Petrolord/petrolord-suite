import React, { useCallback, useMemo, useRef, useState } from 'react';
import { buildTestBricks } from './viewer/selfTest';
import CubeView from './components/CubeView';
import { faultHorizonIntersection } from './engine/faultObjects';
import { polygonLoopLines } from './lib/faultPolygons';
import { assembleSlice } from './engine/sliceAssembly';

// Dev-only harness route (/dev/seismolord-cubeview): mounts the real 3D
// CubeView on the deterministic synthetic volume so the Playwright suite
// can drive it — orbit/pan/zoom, plane toggles, background toggle, plane
// picking and Shift+wheel slice stepping — without auth or storage data.

const q = new URLSearchParams(window.location.search);
const DIM = Math.min(320, Math.max(32, Number(q.get('dim')) || 128));
// U2-007 e2e: ?fpoly=1 adds a faulted horizon, its fault and the fault
// polygon (the W3.1 cutoffs) drawn on it; ?fpoly=0 the same without the polygon
const FPOLY = q.get('fpoly');
// U2-017 e2e: ?corender=1 co-renders |amplitude| of the same volume in viridis at full opacity
const CORENDER = q.get('corender') === '1';

function faultedScene() {
  const k = DIM / 64;
  const NULL = Math.fround(1e30);
  const grid = new Float32Array(DIM * DIM).fill(NULL);
  for (let i = 0; i < DIM; i++) {
    for (let j = 0; j < DIM; j++) {
      if (j < 32 * k + 0.5 * (40 * k - 50 * k)) grid[i * DIM + j] = 40 * k;
      else if (j >= 32 * k + 0.5 * (48 * k - 50 * k)) grid[i * DIM + j] = 48 * k;
    }
  }
  const fault = {
    id: 'f1', name: 'F1', color: '#f97316',
    sticks: [8, 24, 40, 56].map((il) => ({
      points: Array.from({ length: 13 }, (_, n) => { const s = (20 + n * 5) * k; return { il: il * k, xl: 32 * k + 0.5 * (s - 50 * k), s }; }),
    })),
  };
  const x = faultHorizonIntersection(fault, grid, { nIl: DIM, nXl: DIM });
  return {
    horizons: [{ id: 'h1', name: 'Top Reservoir', grid, color: '#4ade80' }],
    faults: [fault],
    polygons: x ? [{ id: 'f1-h1', color: '#f97316', lines: polygonLoopLines(x, { nIl: DIM, nXl: DIM, ns: DIM }) }] : [],
  };
}

const DISPLAY_CYCLE = [
  { colormap: 'seismic_rwb', gain: 1, polarity: 1, clip: 1.5, traceBalance: false },
  { colormap: 'cool_warm', gain: 2, polarity: 1, clip: 1.5, traceBalance: false },
  { colormap: 'grayscale', gain: 0.5, polarity: -1, clip: 1.5, traceBalance: true },
];

export default function SeismolordCubeViewHarness() {
  const { geom, getBrick } = useMemo(() => buildTestBricks(DIM), []);
  const scene = useMemo(() => (FPOLY != null ? faultedScene() : null), []);
  const getOverlaySlice = useCallback((o, idx) => assembleSlice(getBrick, geom, o, idx)
    .then((sl) => ({ ...sl, data: sl.data.map((v) => (Math.abs(v) > 1e29 ? v : Math.abs(v))) })), [getBrick, geom]);
  const overlayDisplay = useMemo(() => (CORENDER ? {
    colormap: 'viridis', reverse: false, gain: 1, polarity: 1, clip: 1.5, traceBalance: false, opacity: 1, mode: 'mix',
  } : null), []);
  const [indices, setIndices] = useState({
    inline: Math.floor(DIM / 2),
    xline: Math.floor(DIM / 2),
    time: Math.floor(DIM / 2),
  });
  const [vexag, setVexag] = useState(1);
  const [lastPlane, setLastPlane] = useState('-');
  const [displayIdx, setDisplayIdx] = useState(0);
  const [ready, setReady] = useState(false);
  const framesRef = useRef(0);

  const manifest = useMemo(() => ({
    geometry: {
      il: { min: 1000, step: 2, count: DIM },
      xl: { min: 2000, step: 1, count: DIM },
      ns: DIM,
      dt_us: 4000,
      corners: {
        first: { x: 500000, y: 6000000 },
        last: { x: 500000 + (DIM - 1) * 25, y: 6000000 + (DIM - 1) * 25 },
      },
    },
    stats: { rms: 0.5 },
  }), []);

  const onRendered = useCallback(() => {
    framesRef.current += 1;
    // ready once the first frames (planes uploaded) have drawn
    if (framesRef.current >= 2) setReady(true);
  }, []);

  const cycle = DISPLAY_CYCLE[displayIdx % DISPLAY_CYCLE.length];
  const display = useMemo(() => ({
    ...cycle, clip: cycle.clip,
  }), [cycle]);

  const changeIndex = useCallback((o, idx) => {
    setIndices((prev) => (prev[o] === idx ? prev : { ...prev, [o]: idx }));
  }, []);

  return (
    <div style={{ padding: 12, minHeight: '100vh' }}>
      <div
        data-testid="harness-status"
        data-harness-status={ready ? 'ready' : 'loading'}
        style={{ color: '#7dd3fc', fontSize: 12, marginBottom: 8 }}
      >
        {ready ? 'ready' : 'loading'} · dim {DIM}
        {scene ? <span data-testid="harness-fpoly"> · polygons {FPOLY === '1' ? scene.polygons.length : 0}</span> : null}
      </div>
      <div style={{
        display: 'flex', gap: 12, marginBottom: 8, fontSize: 12, color: '#cbd5e1',
      }}
      >
        <span data-testid="harness-last-plane">{lastPlane}</span>
        <span data-testid="harness-indices">
          {`${indices.inline},${indices.xline},${indices.time}`}
        </span>
        <button
          type="button"
          data-testid="harness-cycle-display"
          onClick={() => setDisplayIdx((i) => i + 1)}
        >
          display: {display.colormap} g{display.gain}
        </button>
        <button
          type="button"
          data-testid="harness-vexag"
          onClick={() => setVexag((v) => (v >= 3 ? 1 : v * 2))}
        >
          vexag: x{vexag}
        </button>
      </div>
      <div style={{ width: 900 }}>
        <CubeView
          geom={geom}
          manifest={manifest}
          getBrick={getBrick}
          indices={indices}
          onChangeIndex={changeIndex}
          display={display}
          vexag={vexag}
          onSelectPlane={setLastPlane}
          onRendered={onRendered}
          height={480}
          getOverlaySlice={CORENDER ? getOverlaySlice : null}
          overlayDisplay={overlayDisplay}
          {...(scene ? {
            horizons: scene.horizons,
            faults: [],
            faultPolygons: FPOLY === '1' ? scene.polygons : [],
          } : {})}
        />
      </div>
    </div>
  );
}
