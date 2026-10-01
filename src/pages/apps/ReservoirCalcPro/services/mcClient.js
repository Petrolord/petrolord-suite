// Runs the volumetric Monte Carlo off the page's thread (ReservoirCalc Pro
// upgrade U2-006, 2026-10-01), with progress and cancel.
//
// The worker runs the canonical MonteCarloEngine.simulate; where a Worker
// cannot start (jsdom, an old browser, a blocked module worker) the same
// function runs on the page, as before U2-006, and says so in `ranIn`.

import { MonteCarloEngine } from './MonteCarloEngine';
import { cloneableConfig } from './mcWorkerProtocol';

let nextId = 1;

/** Error a cancelled run rejects with. */
export class McCancelled extends Error {
  constructor() { super('The Monte Carlo run was cancelled.'); this.name = 'McCancelled'; this.cancelled = true; }
}

/** A fresh seed for a run the user did not seed (recorded with the run). */
export const newSeed = () => Math.floor(Math.random() * 2 ** 31);

async function startWorker(factory) {
  if (factory) return factory();
  if (typeof Worker === 'undefined') return null;
  try {
    const mod = await import('./mcWorkerFactory.js');
    return mod.createMcWorker();
  } catch {
    return null;
  }
}

/**
 * @param {Object} config  the engine config (hypsometry may be the full object)
 * @param {Object} inputs  distributions
 * @param {{onProgress?: (fraction:number) => void, signal?: AbortSignal, workerFactory?: () => Worker|null, progressEvery?: number}} [opts]
 * @returns {Promise<Object>} the engine's result, with `meta.ranIn` 'worker' or 'page'
 */
export async function runMonteCarlo(config, inputs, opts = {}) {
  const { onProgress, signal, workerFactory, progressEvery } = opts;
  if (signal?.aborted) throw new McCancelled();
  const worker = await startWorker(workerFactory);
  if (!worker) {
    // the page path: same engine, same seed, same numbers
    await new Promise((r) => setTimeout(r, 0));
    if (signal?.aborted) throw new McCancelled();
    const res = MonteCarloEngine.simulate(config, inputs, {
      progressEvery,
      onProgress: onProgress ? (d, t) => onProgress(d / t) : undefined,
    });
    return { ...res, meta: { ...res.meta, ranIn: 'page' } };
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, v) => {
      if (settled) return;
      settled = true;
      try { worker.terminate(); } catch { /* already gone */ }
      if (signal) signal.removeEventListener?.('abort', onAbort);
      fn(v);
    };
    const onAbort = () => finish(reject, new McCancelled());
    if (signal) signal.addEventListener?.('abort', onAbort);
    worker.onmessage = (e) => {
      const m = e.data || {};
      if (m.id !== id) return;
      if (m.type === 'progress') { if (onProgress) onProgress(m.done / m.total); return; }
      if (m.type === 'done') finish(resolve, { ...m.result, meta: { ...m.result.meta, ranIn: 'worker' } });
      else if (m.type === 'error') finish(reject, new Error(m.message));
    };
    worker.onerror = (e) => finish(reject, new Error(e?.message || 'The Monte Carlo worker failed to start.'));
    worker.postMessage({ type: 'run', id, config: cloneableConfig(config), inputs, progressEvery });
  });
}
