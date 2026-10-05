// The page side of the gauge import (WTA-U2-010): one importer per Data
// panel. In a browser the file is read in a Web Worker (the page stays
// responsive, progress is reported, Cancel terminates the worker); where no
// Worker exists (jest, an old browser) the same protocol runs on the page's
// thread after a yield, so the results are identical by construction.
import { createGaugeHandler, unpackRows } from './gaugeImportProtocol.js';

let seq = 0;

/**
 * @param {{workerFactory?: () => Promise<?Worker>}} [o] how to make the worker (tests pass null)
 * @returns {{read: Function, convert: Function, cancel: Function, usesWorker: () => boolean}}
 */
export function createGaugeImporter({ workerFactory } = {}) {
  const factory = workerFactory === undefined
    ? async () => {
      if (typeof Worker === 'undefined') return null;
      const mod = await import('./gaugeImportWorkerFactory.js');
      return mod.createGaugeWorker();
    }
    : workerFactory;
  let worker = null;
  let workerTried = false;
  let inline = null; // the protocol on this thread when there is no worker
  let pending = null; // { id, resolve, reject, onProgress }
  let viaWorker = false;

  const settle = (m) => {
    if (!pending || m.id !== pending.id) return;
    if (m.type === 'progress') { pending.onProgress?.(m); return; }
    const p = pending;
    pending = null;
    if (m.type === 'done') p.resolve(m.result?.packed ? { ...m, result: { ...m.result, rows: unpackRows(m.result.packed), packed: undefined } } : m);
    else p.reject(new Error(m.message || 'The gauge file could not be read.'));
  };

  const ensure = async () => {
    if (!workerTried) {
      workerTried = true;
      try { worker = factory ? await factory() : null; } catch { worker = null; }
      if (worker) {
        worker.onmessage = (e) => settle(e.data);
        worker.onerror = (e) => settle({ type: 'error', id: pending?.id, message: e?.message || 'The gauge worker stopped.' });
        viaWorker = true;
      }
    }
    if (!worker && !inline) inline = createGaugeHandler();
  };

  const send = async (msg, onProgress) => {
    await ensure();
    if (pending) pending.reject(Object.assign(new Error('Superseded by a newer import.'), { superseded: true }));
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending = { id, resolve, reject, onProgress };
      if (worker) worker.postMessage({ ...msg, id });
      // a yield first, so a progress line can paint before the work starts
      else setTimeout(() => inline({ ...msg, id }, settle), 0);
    });
  };

  return {
    /** Read a file: { table (headers only), mapping, result }. */
    read: (text, defaults, onProgress) => send({ type: 'read', text, defaults }, onProgress),
    /** Convert the kept table with another mapping. */
    convert: (mapping, onProgress) => send({ type: 'convert', mapping }, onProgress),
    /** Stop the import under way: the worker is terminated (a new one starts on the next read). */
    cancel: () => {
      if (pending) { const p = pending; pending = null; p.reject(Object.assign(new Error('Import cancelled.'), { cancelled: true })); }
      if (worker) { worker.terminate(); worker = null; workerTried = false; viaWorker = false; }
      inline = null;
    },
    usesWorker: () => viaWorker,
  };
}
