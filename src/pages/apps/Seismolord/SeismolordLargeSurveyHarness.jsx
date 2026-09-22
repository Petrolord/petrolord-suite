import React, { useCallback, useMemo, useRef, useState } from 'react';
import SliceView from './components/SliceView';
import { SliceWorkerClient } from './sources/sliceWorkerClient';
import { createSliceWorker } from './services/sliceWorkerFactory';
import { cacheBudgetBytes } from './sources/memoryBudget';
import { BrickCache, storageBrickFetcher } from './engine/brickCache';
import { bricksForSlice, geomFromManifest, brickKey, copyBrickIntoSlice, sliceTraceRms } from './engine/sliceAssembly';
import { NULL_VALUE } from './engine/manifest';
import { DEFAULT_MAPPING } from './engine/segyScan';
import { scanFile } from './services/ingestService';

// Dev-only harness route (/dev/seismolord-largesurvey, DEV builds only):
// the large-survey benchmark drives the REAL viewer path from Playwright
// (e2e/seismolord-large-survey.spec.js, gated behind SEIS_BENCH=1).
//
//   ?mode=after   the slice worker and its sources (the shipped path)
//   ?mode=before  the pre-Stream-L path: one main-thread BrickCache of
//                 256 MiB and an assembly that pins every brick of the
//                 slice at once, so the two are measured side by side
//   ?storage=http://127.0.0.1:8899  tools/seismolord-bench/mock-storage.mjs
//   ?deviceMemory=8  the budget to run with (an 8 GB laptop by default)
//
// Everything is driven through window.__seisBench; nothing here talks to
// Supabase.

const q = new URLSearchParams(window.location.search);
const MODE = q.get('mode') === 'before' ? 'before' : 'after';
const STORAGE = q.get('storage') || '';
const VOLUME = q.get('volume') || 'bench';
const DEVICE_MEMORY = Number(q.get('deviceMemory')) || 8;
const BUDGET = cacheBudgetBytes(DEVICE_MEMORY);
const NULL_F32 = Math.fround(NULL_VALUE);

const DISPLAY = {
  colormap: 'seismic_rwb', gain: 1, polarity: 1, clip: 1000, traceBalance: false,
};

/** Two frames after a commit the canvas has drawn. */
const afterPaint = () => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now())));
});

/** The pre-Stream-L assembly: every brick of the slice pinned at once. */
async function legacyAssembleSlice(getBrick, geom, orientation, index) {
  const needed = bricksForSlice(geom, orientation, index);
  const bricks = new Map();
  await Promise.all(needed.map(async ({ i, j, k }) => {
    bricks.set(`${i}-${j}-${k}`, await getBrick(i, j, k));
  }));
  const width = orientation === 'time' ? geom.nXl : geom.ns;
  const height = orientation === 'time' ? geom.nIl : (orientation === 'inline' ? geom.nXl : geom.nIl);
  const data = new Float32Array(width * height);
  for (const { i, j, k } of needed) {
    copyBrickIntoSlice(data, bricks.get(`${i}-${j}-${k}`), geom, orientation, index, i, j, k);
  }
  return {
    data,
    width,
    height,
    traceRms: orientation === 'time' ? null : sliceTraceRms(data, width, height),
    nullValue: NULL_F32,
  };
}

export default function SeismolordLargeSurveyHarness() {
  const [slice, setSlice] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [status, setStatus] = useState('idle');
  const [orientation, setOrientation] = useState('inline');
  const [index, setIndex] = useState(0);
  const fileRef = useRef(null);
  const apiRef = useRef({});
  const stateRef = useRef({ client: null, source: null, cache: null, geom: null, storagePath: null });

  const geom = useMemo(() => (manifest ? geomFromManifest(manifest) : null), [manifest]);

  const client = useCallback(() => {
    if (!stateRef.current.client) {
      stateRef.current.client = new SliceWorkerClient({
        createWorker: createSliceWorker, budgetBytes: BUDGET,
      });
    }
    return stateRef.current.client;
  }, []);

  /** Open the file in the input (Playwright sets it) from disk. */
  const openLocal = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) throw new Error('no file');
    setStatus('indexing');
    const t0 = performance.now();
    const src = await client().openLocal(file, {
      onProgress: (done, total, phase) => setStatus(`${phase} ${done}/${total}`),
    });
    stateRef.current.source = src;
    setManifest(src.manifest);
    setStatus('ready');
    return { indexMs: performance.now() - t0, info: src.index, kind: src.kind };
  }, [client]);

  /**
   * The import dialog's preview scan (ingest worker, sampled headers),
   * started the way ImportPanel starts it: at the same moment the viewer
   * opens the file, so the benchmark's first inline competes with it.
   */
  const startPreviewScan = useCallback(() => {
    const file = fileRef.current?.files?.[0];
    if (!file) throw new Error('no file');
    const t0 = performance.now();
    const p = scanFile(file, DEFAULT_MAPPING).then(
      () => ({ ms: performance.now() - t0 }),
      (e) => ({ ms: performance.now() - t0, error: e.message }),
    );
    stateRef.current.preview = p;
    return true;
  }, []);

  /** Open the benchmark's brick store through the mock storage server. */
  const openBricks = useCallback(async () => {
    const base = `${STORAGE}/storage/v1/object/authenticated/seismic/${VOLUME}`;
    const t0 = performance.now();
    const m = await (await fetch(`${base}/manifest.json`)).json();
    setManifest(m);
    stateRef.current.storagePath = VOLUME;
    stateRef.current.geom = geomFromManifest(m);
    if (MODE === 'before') {
      stateRef.current.cache = new BrickCache(
        storageBrickFetcher({ supabaseUrl: STORAGE, getToken: async () => 'bench' }),
        { maxBytes: 256 * 1024 * 1024, dtype: m.brick?.dtype, maxConcurrent: 12 },
      );
    } else {
      stateRef.current.source = await client().openBricks({
        manifest: m,
        storagePath: VOLUME,
        supabaseUrl: STORAGE,
        getToken: async () => 'bench',
        persistent: false,
      });
    }
    setStatus('ready');
    return { openMs: performance.now() - t0, mode: MODE };
  }, [client]);

  /**
   * Show one slice and resolve when it is on screen. `together` marks a
   * request made alongside others (the 3D view's three planes), which the
   * old path never cancelled.
   */
  const show = useCallback(async (o, idx, { together = false } = {}) => {
    const t0 = performance.now();
    let partialMs = null;
    let s;
    if (MODE === 'before' && stateRef.current.cache) {
      const g = stateRef.current.geom;
      const cache = stateRef.current.cache;
      const getBrick = (i, j, k) => cache.get(brickKey(stateRef.current.storagePath, i, j, k));
      const needed = new Set(bricksForSlice(g, o, idx)
        .map(({ i, j, k }) => brickKey(stateRef.current.storagePath, i, j, k)));
      if (!together) cache.cancelPendingExcept(needed);
      s = await legacyAssembleSlice(getBrick, g, o, idx);
      // the old neighbour prefetch: ±1 brick by brick, fire and forget
      for (const n of [idx - 1, idx + 1]) {
        if (n < 0) continue;
        for (const { i, j, k } of bricksForSlice(g, o, n)) {
          cache.get(brickKey(stateRef.current.storagePath, i, j, k)).catch(() => {});
        }
      }
    } else {
      s = await stateRef.current.source.getSlice({
        orientation: o, index: idx, step: 1, prefetch: true,
      }, {
        onPartial: (p) => {
          if (partialMs === null) partialMs = performance.now() - t0;
          setSlice({ ...p, orientation: o === 'crossline' ? 'xline' : o, index: idx });
        },
      });
    }
    const dataMs = performance.now() - t0;
    setOrientation(o === 'crossline' ? 'xline' : o);
    setIndex(idx);
    setSlice({ ...s, orientation: o === 'crossline' ? 'xline' : o, index: idx });
    const painted = await afterPaint();
    return {
      dataMs, onScreenMs: painted - t0, partialMs, level: s.level ?? 0, height: s.height,
    };
  }, []);

  apiRef.current = {
    mode: MODE,
    budgetBytes: BUDGET,
    openLocal,
    startPreviewScan,
    previewDone: () => stateRef.current.preview || null,
    openBricks,
    show,
    stats: async () => (MODE === 'before'
      ? { budgetBytes: 256 * 1024 * 1024, brickBytes: stateRef.current.cache?.bytes ?? 0, mode: 'before' }
      : client().stats()),
    serverStats: () => fetch(`${STORAGE}/bench/stats`).then((r) => r.json()),
  };
  if (typeof window !== 'undefined') window.__seisBench = apiRef.current;

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-200 flex flex-col">
      <div className="p-2 text-xs flex items-center gap-3" data-testid="bench-status">
        <span>{`mode ${MODE}`}</span>
        <span>{`budget ${Math.round(BUDGET / (1024 * 1024))} MB`}</span>
        <span>{status}</span>
        <input ref={fileRef} type="file" data-testid="segy-file" className="text-xs" />
      </div>
      <div className="flex-1 min-h-0">
        {slice && geom && (
          <SliceView
            slice={slice}
            geom={geom}
            manifest={manifest}
            orientation={orientation}
            sliceIndex={index}
            display={DISPLAY}
            height="fill"
            vexag={1}
          />
        )}
      </div>
    </div>
  );
}
