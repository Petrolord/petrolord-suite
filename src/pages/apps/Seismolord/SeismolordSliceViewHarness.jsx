import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { buildTestBricks } from './viewer/selfTest';
import { assembleSlice } from './engine/sliceAssembly';
import { resampleTraverse, assembleTraverse } from './engine/traverse';
import SliceView from './components/SliceView';

// Dev-only harness route (/dev/seismolord-sliceview, DEV builds only):
// mounts the real SliceView on the deterministic synthetic volume so the
// Playwright suite can drive INTERACTIONS — wheel zoom, pan, rubber-band,
// picking through the view transform, annotation toggles — without an
// authenticated session or storage data. The renderer's pixel parity is
// covered separately by /dev/seismolord-selftest.

// Default stays small (UX-focused specs); perf investigations can scale
// the synthetic volume with ?dim=256 (clamped) and drop the horizon
// overlay with ?horizon=0 to isolate layers.
const q = new URLSearchParams(window.location.search);
const DIM = Math.min(320, Math.max(32, Number(q.get('dim')) || 128));
const WITH_HORIZON = q.get('horizon') !== '0';
const VIEW_W = Math.min(3000, Math.max(300, Number(q.get('w')) || 760));
const VIEW_H = Math.min(2000, Math.max(200, Number(q.get('h')) || 420));

const DISPLAY_CYCLE = [
  { colormap: 'seismic_rwb', gain: 1, polarity: 1, clip: 1.5, traceBalance: false },
  { colormap: 'jet', gain: 2, polarity: 1, clip: 1.5, traceBalance: false },
  { colormap: 'grayscale', gain: 0.5, polarity: -1, clip: 1.5, traceBalance: true },
  { colormap: 'seismic', gain: 4, polarity: 1, clip: 3, traceBalance: false },
];

export default function SeismolordSliceViewHarness() {
  const { geom, getBrick } = useMemo(() => buildTestBricks(DIM), []);
  const [orientation, setOrientation] = useState('inline');
  const [sliceIndex, setSliceIndex] = useState(Math.floor(DIM / 2));
  const [slice, setSlice] = useState(null);
  const [lastPick, setLastPick] = useState(null);
  const [pickMode, setPickMode] = useState(null);
  const [displayIdx, setDisplayIdx] = useState(0);

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

  useEffect(() => {
    let stale = false;
    (async () => {
      if (orientation === 'traverse') {
        // fixed dog-leg path across the synthetic survey — exercises the
        // view-only traverse rendering/readout path end-to-end
        const vertices = [
          { il: DIM * 0.15, xl: DIM * 0.1 },
          { il: DIM * 0.5, xl: DIM * 0.7 },
          { il: DIM * 0.85, xl: DIM * 0.35 },
        ];
        const path = resampleTraverse(vertices, geom, manifest.geometry);
        const s = await assembleTraverse(getBrick, geom, path.positions);
        if (!stale) {
          setSlice({
            ...s, orientation, positions: path.positions,
            stepM: path.stepM, lengthM: path.lengthM,
          });
        }
        return;
      }
      const s = await assembleSlice(getBrick, geom, orientation, sliceIndex);
      if (!stale) setSlice({ ...s, orientation });
    })();
    return () => { stale = true; };
  }, [getBrick, geom, orientation, sliceIndex, manifest]);

  // one synthetic horizon so the overlay path is exercised too
  const overlays = useMemo(() => {
    const grid = new Float32Array(DIM * DIM);
    for (let i = 0; i < DIM; i++) {
      for (let x = 0; x < DIM; x++) {
        grid[i * DIM + x] = DIM / 2 + 12 * Math.sin(0.15 * x) + 6 * Math.cos(0.09 * i);
      }
    }
    return {
      horizons: WITH_HORIZON ? [{ grid, color: '#4ade80' }] : [],
      faults: [],
      draftSticks: [],
      seedPick: null,
    };
  }, []);

  const display = DISPLAY_CYCLE[displayIdx % DISPLAY_CYCLE.length];

  const stepSlice = useCallback((d) => {
    setSliceIndex((i) => Math.min(DIM - 1, Math.max(0, i + d)));
  }, []);

  return (
    <div style={{ background: '#0b1220', minHeight: '100vh', color: '#cbd5e1', padding: 16 }}>
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>Seismolord SliceView harness</h1>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 12 }}>
        <select
          data-testid="harness-orientation"
          value={orientation}
          onChange={(e) => { setOrientation(e.target.value); setSliceIndex(Math.floor(DIM / 2)); }}
          style={{ background: '#020617', color: '#cbd5e1', border: '1px solid #334155' }}
        >
          <option value="inline">inline</option>
          <option value="xline">xline</option>
          <option value="time">time</option>
          <option value="traverse">traverse</option>
        </select>
        <button
          type="button"
          data-testid="harness-pickmode"
          onClick={() => setPickMode((p) => (p ? null : 'seed'))}
          style={{ border: '1px solid #334155', padding: '0 8px' }}
        >
          pick: {pickMode || 'off'}
        </button>
        <button
          type="button"
          data-testid="harness-cycle-display"
          onClick={() => setDisplayIdx((i) => i + 1)}
          style={{ border: '1px solid #334155', padding: '0 8px' }}
        >
          display: {display.colormap} g{display.gain}
        </button>
        <span data-testid="harness-slice-index">{sliceIndex}</span>
        <span
          data-testid="harness-status"
          data-harness-status={slice && slice.orientation === orientation ? 'ready' : 'loading'}
        >
          {slice && slice.orientation === orientation ? 'ready' : 'loading'}
        </span>
        <span data-testid="harness-traverse-cols">
          {slice?.positions ? slice.positions.length : '-'}
        </span>
        <span data-testid="harness-last-pick">
          {lastPick ? `${lastPick.ilIdx},${lastPick.xlIdx},${lastPick.sample.toFixed(1)}` : '-'}
        </span>
      </div>
      <div style={{ width: VIEW_W }}>
        <SliceView
          slice={slice && slice.orientation === orientation ? slice : null}
          geom={geom}
          manifest={manifest}
          orientation={orientation}
          sliceIndex={sliceIndex}
          display={display}
          overlays={overlays}
          pickMode={orientation === 'traverse' ? null : pickMode}
          loading={false}
          onPick={setLastPick}
          onStepSlice={orientation === 'traverse' ? undefined : stepSlice}
          height={VIEW_H}
        />
      </div>
    </div>
  );
}
