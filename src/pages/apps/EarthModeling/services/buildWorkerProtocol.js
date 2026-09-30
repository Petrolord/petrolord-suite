// The model build off the main thread (Earth Modeling upgrade U2-004,
// 2026-10-01; findings EM-U1-015 and EM-U1-022). A 401 x 401 model with
// ordinary kriging froze the page for minutes. The build now runs in a Web
// Worker that reports progress and can be cancelled (the worker is
// terminated). Data still comes from the page's backend: the worker asks
// for each surface grid or boundary list by message and the page answers,
// so the registry, the harness and every backend keep one interface.
//
// Messages, page to worker:
//   {type: 'build', definition, wells, surfaces}
//   {type: 'reply', id, result} | {type: 'reply', id, error}
// worker to page:
//   {type: 'call', id, method, args}       a backend call the build needs
//   {type: 'progress', label, step, total, fraction}
//   {type: 'done', built} | {type: 'error', message}
//
// serveBuild is the worker side and runBuildOnWorker the page side; both
// are plain functions over a postMessage pair, so jest drives them through
// an in-process loopback and the browser through a real Worker.

import { buildModel, BuildCancelled } from './modelBuild';

/** The backend methods a build may call through the page. */
export const WORKER_BACKEND_METHODS = Object.freeze(['downloadSurfaceGrid', 'listBoundaries']);

/**
 * Worker side: returns the onmessage handler.
 * @param {(msg: object) => void} post
 */
export function serveBuild(post, { build = buildModel } = {}) {
  let seq = 0;
  const pending = new Map();
  const call = (method, args) => new Promise((resolve, reject) => {
    seq += 1;
    pending.set(seq, { resolve, reject });
    post({ type: 'call', id: seq, method, args });
  });
  const backend = Object.fromEntries(WORKER_BACKEND_METHODS.map((m) => [m, (...args) => call(m, args)]));
  return async (msg) => {
    const data = msg?.data ?? msg;
    if (data?.type === 'reply') {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.error !== undefined) p.reject(new Error(data.error)); else p.resolve(data.result);
      return;
    }
    if (data?.type !== 'build') return;
    try {
      const built = await build(data.definition, data.wells, data.surfaces, backend, {
        onProgress: (p) => post({ type: 'progress', ...p }),
      });
      post({ type: 'done', built });
    } catch (e) {
      post({ type: 'error', message: e?.message || String(e) });
    }
  };
}

/**
 * Page side: run one build on a worker.
 * @param {{postMessage: Function, terminate: Function, onmessage?: Function}} worker
 * @param {{definition, wells, surfaces, backend, onProgress?: Function, signal?: AbortSignal}} p
 * @returns {Promise<object>} the built model; rejects with BuildCancelled on cancel
 */
export function runBuildOnWorker(worker, { definition, wells, surfaces, backend, onProgress = null, signal = null }) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (fn, v) => {
      if (finished) return;
      finished = true;
      if (signal) signal.removeEventListener?.('abort', onAbort);
      try { worker.terminate(); } catch { /* already gone */ }
      fn(v);
    };
    const onAbort = () => finish(reject, new BuildCancelled());
    if (signal?.aborted) { onAbort(); return; }
    if (signal) signal.addEventListener?.('abort', onAbort);
    worker.onerror = (e) => finish(reject, new Error(`The build worker failed: ${e?.message || 'unknown error'}.`));
    worker.onmessage = async (ev) => {
      const m = ev?.data ?? ev;
      if (finished || !m) return;
      if (m.type === 'progress') { if (onProgress) onProgress(m); return; }
      if (m.type === 'done') { finish(resolve, m.built); return; }
      if (m.type === 'error') { finish(reject, new Error(m.message)); return; }
      if (m.type === 'call') {
        if (!WORKER_BACKEND_METHODS.includes(m.method) || typeof backend[m.method] !== 'function') {
          worker.postMessage({ type: 'reply', id: m.id, error: `The backend has no ${m.method}.` });
          return;
        }
        try {
          const result = await backend[m.method](...(m.args || []));
          if (!finished) worker.postMessage({ type: 'reply', id: m.id, result });
        } catch (e) {
          if (!finished) worker.postMessage({ type: 'reply', id: m.id, error: e?.message || String(e) });
        }
      }
    };
    worker.postMessage({ type: 'build', definition, wells, surfaces });
  });
}
