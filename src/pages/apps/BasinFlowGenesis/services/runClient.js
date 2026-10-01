// Runs the basin model off the page's thread (AppUpgrade BF-U2-009), with
// progress and cancel. Where a Worker cannot start (jsdom, an old browser,
// a blocked module worker) the same engine runs on the page, as before, and
// the result says so in `meta.ranIn`.

import { SimulationEngine } from './SimulationEngine';
import { engineInputs } from './runWorkerProtocol';

let nextId = 1;

/** Error a cancelled run rejects with. */
export class RunCancelled extends Error {
  constructor() { super('The run was cancelled.'); this.name = 'RunCancelled'; this.cancelled = true; }
}

async function startWorker(factory) {
  if (factory) return factory();
  if (typeof Worker === 'undefined') return null;
  try {
    const mod = await import('./runWorkerFactory.js');
    return mod.createRunWorker();
  } catch {
    return null;
  }
}

/**
 * @param {object} state the app state (only the engine inputs are sent)
 * @param {{onProgress?: (percent:number) => void, signal?: AbortSignal, workerFactory?: () => Worker|null}} [opts]
 * @returns {Promise<object>} the engine result with meta.ranIn 'worker' or 'page'
 */
export async function runBasin(state, opts = {}) {
  const { onProgress, signal, workerFactory } = opts;
  if (signal?.aborted) throw new RunCancelled();
  const inputs = engineInputs(state);
  const worker = await startWorker(workerFactory);
  if (!worker) {
    await new Promise((r) => setTimeout(r, 0));
    if (signal?.aborted) throw new RunCancelled();
    const res = await SimulationEngine.run(inputs, onProgress, { shouldStop: () => !!signal?.aborted });
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
    const onAbort = () => finish(reject, new RunCancelled());
    if (signal) signal.addEventListener?.('abort', onAbort);
    worker.onmessage = (e) => {
      const m = e.data || {};
      if (m.id !== id) return;
      if (m.type === 'progress') { if (onProgress) onProgress(m.percent); return; }
      if (m.type === 'done') finish(resolve, { ...m.result, meta: { ...m.result.meta, ranIn: 'worker' } });
      else if (m.type === 'error') finish(reject, new Error(m.message));
    };
    worker.onerror = (e) => finish(reject, new Error(e?.message || 'The run worker failed to start.'));
    worker.postMessage({ type: 'run', id, inputs });
  });
}
