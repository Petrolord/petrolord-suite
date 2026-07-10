import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { buildTestBricks } from './viewer/selfTest';
import { assembleSlice } from './engine/sliceAssembly';
import SliceView from './components/SliceView';

// Dev-only harness route (/dev/seismolord-sliceview, DEV builds only):
// mounts the real SliceView on the deterministic synthetic volume so the
// Playwright suite can drive INTERACTIONS — wheel zoom, pan, rubber-band,
// picking through the view transform, annotation toggles — without an
// authenticated session or storage data. The renderer's pixel parity is
// covered separately by /dev/seismolord-selftest.

const DIM = 128;                       // small: harness cares about UX, not perf

export default function SeismolordSliceViewHarness() {
  const { geom, getBrick } = useMemo(() => buildTestBricks(DIM), []);
  const [orientation, setOrientation] = useState('inline');
  const [sliceIndex, setSliceIndex] = useState(Math.floor(DIM / 2));
  const [slice, setSlice] = useState(null);
  const [lastPick, setLastPick] = useState(null);
  const [pickMode, setPickMode] = useState(null);

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
      const s = await assembleSlice(getBrick, geom, orientation, sliceIndex);
      if (!stale) setSlice({ ...s, orientation });
    })();
    return () => { stale = true; };
  }, [getBrick, geom, orientation, sliceIndex]);

  // one synthetic horizon so the overlay path is exercised too
  const overlays = useMemo(() => {
    const grid = new Float32Array(DIM * DIM);
    for (let i = 0; i < DIM; i++) {
      for (let x = 0; x < DIM; x++) {
        grid[i * DIM + x] = DIM / 2 + 12 * Math.sin(0.15 * x) + 6 * Math.cos(0.09 * i);
      }
    }
    return {
      horizons: [{ grid, color: '#4ade80' }],
      faults: [],
      draftSticks: [],
      seedPick: null,
    };
  }, []);

  const display = useMemo(() => ({
    colormap: 'seismic_rwb', gain: 1, polarity: 1, clip: 1.5, traceBalance: false,
  }), []);

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
        </select>
        <button
          type="button"
          data-testid="harness-pickmode"
          onClick={() => setPickMode((p) => (p ? null : 'seed'))}
          style={{ border: '1px solid #334155', padding: '0 8px' }}
        >
          pick: {pickMode || 'off'}
        </button>
        <span data-testid="harness-slice-index">{sliceIndex}</span>
        <span
          data-testid="harness-status"
          data-harness-status={slice ? 'ready' : 'loading'}
        >
          {slice ? 'ready' : 'loading'}
        </span>
        <span data-testid="harness-last-pick">
          {lastPick ? `${lastPick.ilIdx},${lastPick.xlIdx},${lastPick.sample.toFixed(1)}` : '-'}
        </span>
      </div>
      <div style={{ width: 760 }}>
        <SliceView
          slice={slice && slice.orientation === orientation ? slice : null}
          geom={geom}
          manifest={manifest}
          orientation={orientation}
          sliceIndex={sliceIndex}
          display={display}
          overlays={overlays}
          pickMode={pickMode}
          loading={false}
          onPick={setLastPick}
          onStepSlice={stepSlice}
          height={420}
        />
      </div>
    </div>
  );
}
