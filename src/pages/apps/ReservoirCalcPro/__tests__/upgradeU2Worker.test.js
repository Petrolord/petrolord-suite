// ReservoirCalc Pro upgrade U2-006: the Monte Carlo runs in a Web Worker
// with progress and cancel. Every test calls the shipped engine through
// the worker's own message handler; no formula is restated here.

import v8 from 'v8';
import { MonteCarloEngine } from '../services/MonteCarloEngine';
import { ContactVolumetricsEngine } from '../services/ContactVolumetricsEngine';
import { handleMcMessage, cloneableConfig } from '../services/mcWorkerProtocol';
import { runMonteCarlo, McCancelled } from '../services/mcClient';
import { mulberry32 } from '@/lib/monteCarlo';

jest.setTimeout(120000);

const tri = (min, mode, max) => ({ type: 'triangular', min, mode, max });
const analyticInputs = {
  area: tri(800, 1000, 1300), thickness: tri(40, 50, 70), porosity: tri(0.15, 0.2, 0.25),
  sw: tri(0.2, 0.3, 0.4), ntg: tri(0.7, 0.8, 0.9), fvf: tri(1.1, 1.2, 1.3), recovery: tri(20, 25, 35),
};
const analyticConfig = { fluidType: 'oil', unitSystem: 'field', iterations: 5000, grvMode: 'analytic', recovery: 25 };

const dome = () => {
  const points = [];
  for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) {
    const x = 501000 + i * 50; const y = 6699000 + j * 50;
    points.push({ x, y, z: -1500 - 0.0001 * ((x - 502000) ** 2 + (y - 6700000) ** 2) });
  }
  return { points, xyUnit: 'm', depthUnit: 'm', zConvention: 'elevation' };
};

/** Run the worker's handler and collect its replies. */
const viaWorkerHandler = (config, inputs, progressEvery) => {
  const replies = [];
  handleMcMessage({ type: 'run', id: 1, config: cloneableConfig(config), inputs, progressEvery }, (m) => replies.push(m));
  return replies;
};
/** A clone as postMessage makes it (functions refuse to cross). */
const structuredCloneLike = (x) => v8.deserialize(v8.serialize(x));

describe('U2-006 the canonical engine runs in the worker', () => {
  it('a seeded run in the worker gives the realizations the page engine gave before (Math.random on the same stream)', async () => {
    const orig = Math.random;
    Math.random = mulberry32(42);
    let before;
    try {
      // the pre-U2 call: no seed, Math.random
      before = await MonteCarloEngine.runSimulation({ ...analyticConfig }, analyticInputs);
    } finally { Math.random = orig; }
    const replies = viaWorkerHandler({ ...analyticConfig, seed: 42 }, analyticInputs, 1000);
    const done = replies.find((m) => m.type === 'done');
    expect(done).toBeTruthy();
    expect(done.result.raw.stooip).toEqual(before.raw.stooip);
    expect(done.result.raw.recOil).toEqual(before.raw.recOil);
    expect(done.result.stats.stooip.p50).toBe(before.stats.stooip.p50);
    expect(done.result.stats.stooip.p90).toBe(before.stats.stooip.p90);
    expect(done.result.meta.seed).toBe(42);
    // negative control: another seed is another run
    const other = viaWorkerHandler({ ...analyticConfig, seed: 43 }, analyticInputs).find((m) => m.type === 'done');
    expect(other.result.stats.stooip.p50).not.toBe(before.stats.stooip.p50);
  });

  it('the worker handler calls MonteCarloEngine.simulate, not a copy', () => {
    const spy = jest.spyOn(MonteCarloEngine, 'simulate');
    viaWorkerHandler({ ...analyticConfig, iterations: 200, seed: 1 }, analyticInputs);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('a structural run crosses the worker boundary as a table and gives the same numbers', async () => {
    const hyps = ContactVolumetricsEngine.buildHypsometry({ topSurface: dome(), constantThickness: 400, unitSystem: 'metric', options: { resolution: 60 } });
    const config = { fluidType: 'oil', unitSystem: 'metric', iterations: 3000, grvMode: 'structural', hypsometry: hyps, seed: 7 };
    const inputs = { owc: tri(-1600, -1560, -1530), porosity: tri(0.18, 0.2, 0.22), sw: tri(0.25, 0.3, 0.35), fvf: tri(1.2, 1.2, 1.2) };
    // negative control: the hypsometry with its functions cannot be posted
    expect(() => structuredCloneLike(config)).toThrow();
    const posted = structuredCloneLike(cloneableConfig(config));
    const replies = [];
    handleMcMessage({ type: 'run', id: 9, config: posted, inputs }, (m) => replies.push(m));
    const done = replies.find((m) => m.type === 'done');
    const page = MonteCarloEngine.simulate(config, inputs);
    expect(done.result.raw.grv).toEqual(page.raw.grv);
    expect(done.result.stats.stooip.mean).toBe(page.stats.stooip.mean);
    expect(done.result.meta.grvMode).toBe('structural');
  });

  it('reports progress in order and finishes at the total', () => {
    const replies = viaWorkerHandler({ ...analyticConfig, iterations: 10000, seed: 3 }, analyticInputs, 2000);
    const prog = replies.filter((m) => m.type === 'progress');
    expect(prog.map((m) => m.done)).toEqual([2000, 4000, 6000, 8000, 10000]);
    expect(prog.every((m) => m.total === 10000)).toBe(true);
    expect(replies[replies.length - 1].type).toBe('done');
  });

  it('an engine error comes back as an error message', () => {
    const replies = [];
    handleMcMessage({ type: 'run', id: 2, config: { ...analyticConfig, iterations: 100 }, inputs: null }, (m) => replies.push(m));
    expect(replies.find((m) => m.type === 'error')?.message).toMatch(/null/);
  });
});

describe('U2-006 the client: worker, cancel, page fallback', () => {
  // A worker double that runs the real handler asynchronously
  const fakeWorker = ({ hang = false } = {}) => {
    const w = {
      terminated: false,
      onmessage: null,
      onerror: null,
      terminate() { w.terminated = true; },
      postMessage(msg) {
        if (hang) {
          setTimeout(() => w.onmessage?.({ data: { type: 'progress', id: msg.id, done: 1, total: 10 } }), 0);
          return;
        }
        setTimeout(() => handleMcMessage(structuredCloneLike(msg), (m) => { if (!w.terminated) w.onmessage?.({ data: m }); }), 0);
      },
    };
    return w;
  };

  it('resolves from the worker with ranIn worker, progress as a fraction, and the worker ended', async () => {
    const w = fakeWorker();
    const seen = [];
    const res = await runMonteCarlo({ ...analyticConfig, seed: 5 }, analyticInputs, { workerFactory: () => w, onProgress: (f) => seen.push(f), progressEvery: 1000 });
    expect(res.meta.ranIn).toBe('worker');
    expect(seen[seen.length - 1]).toBe(1);
    expect(seen[0]).toBeCloseTo(0.2, 6);
    expect(w.terminated).toBe(true);
    const page = MonteCarloEngine.simulate({ ...analyticConfig, seed: 5 }, analyticInputs);
    expect(res.stats.stooip.p10).toBe(page.stats.stooip.p10);
  });

  it('Cancel ends the worker and rejects with McCancelled', async () => {
    const w = fakeWorker({ hang: true });
    const ctrl = new AbortController();
    const p = runMonteCarlo({ ...analyticConfig, seed: 5 }, analyticInputs, { workerFactory: () => w, signal: ctrl.signal });
    await new Promise((r) => setTimeout(r, 5));
    ctrl.abort();
    await expect(p).rejects.toBeInstanceOf(McCancelled);
    expect(w.terminated).toBe(true);
  });

  it('with no Worker (jsdom) the same engine runs on the page and says so', async () => {
    expect(typeof Worker).toBe('undefined');
    const res = await runMonteCarlo({ ...analyticConfig, seed: 11 }, analyticInputs);
    expect(res.meta.ranIn).toBe('page');
    const again = viaWorkerHandler({ ...analyticConfig, seed: 11 }, analyticInputs).find((m) => m.type === 'done');
    expect(res.raw.stooip).toEqual(again.result.raw.stooip);
  });
});
