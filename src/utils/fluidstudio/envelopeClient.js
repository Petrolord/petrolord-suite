/**
 * Client for the phase-envelope worker — FS5, cancellation hardened in
 * FS8.
 *
 * Feature-detects module workers (Vite `new Worker(new URL(...))`
 * pattern used across the suite). Where workers are unavailable (jsdom
 * tests, exotic embeds) the trace runs synchronously on the main thread
 * via the same exported function the worker calls, so behavior is
 * identical either way.
 *
 * One in-flight trace per client. FS5 dropped a superseded response by
 * id but let the stale trace keep burning a core to completion; FS8
 * terminates the worker on supersede/cancel/dispose and lazily respawns
 * it, so an abandoned trace stops immediately (a worker cannot be
 * interrupted mid-computation any other way).
 *
 * `createEnvelopeClient({ workerFactory })` accepts a factory override
 * so tests can drive the worker path with a fake; the default is the
 * Vite factory in envelopeWorkerFactory.js (jest-mapped to null).
 */

import { runEnvelopeTrace } from './eos/envelope.worker.js';
import { createEnvelopeWorker } from './envelopeWorkerFactory.js';

export const createEnvelopeClient = ({ workerFactory = createEnvelopeWorker } = {}) => {
  let worker = null;
  let nextId = 1;
  let activeId = null;
  let pending = null; // { resolve, reject } for the active request

  const killWorker = () => {
    if (worker) {
      worker.terminate();
      worker = null;
    }
  };

  // reject the in-flight request and stop its computation
  const abortPending = (reason) => {
    if (!pending) return;
    pending.reject(new Error(reason));
    pending = null;
    activeId = null;
    killWorker();
  };

  const ensureWorker = () => {
    if (worker) return worker;
    worker = workerFactory();
    if (worker) {
      worker.onmessage = (e) => {
        const { id, ok, payload, error } = e.data || {};
        if (id !== activeId || !pending) return; // superseded request
        const p = pending;
        pending = null;
        activeId = null;
        if (ok) p.resolve(payload);
        else p.reject(new Error(error || 'Envelope trace failed'));
      };
      worker.onerror = () => {
        if (pending) {
          pending.reject(new Error('Envelope worker crashed'));
          pending = null;
          activeId = null;
        }
        killWorker();
      };
    }
    return worker;
  };

  const trace = (request) => {
    const id = nextId;
    nextId += 1;
    abortPending('superseded');
    activeId = id;
    const w = ensureWorker();
    if (!w) {
      // synchronous fallback (tests / no-worker environments)
      return new Promise((resolve, reject) => {
        pending = null;
        activeId = null;
        try {
          resolve(runEnvelopeTrace(request));
        } catch (err) {
          reject(err);
        }
      });
    }
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      w.postMessage({ id, payload: request });
    });
  };

  /** Stop the in-flight trace (if any) without tearing the client down. */
  const cancel = () => abortPending('cancelled');

  const dispose = () => {
    abortPending('disposed');
    killWorker();
  };

  return { trace, cancel, dispose };
};
