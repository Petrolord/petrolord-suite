/**
 * Client for the phase-envelope worker — FS5.
 *
 * Feature-detects module workers (Vite `new Worker(new URL(...))`
 * pattern used across the suite). Where workers are unavailable (jsdom
 * tests, exotic embeds) the trace runs synchronously on the main thread
 * via the same exported function the worker calls, so behavior is
 * identical either way.
 *
 * One in-flight trace per client; a newer request supersedes an older
 * one and the stale response is dropped by id.
 */

import { runEnvelopeTrace } from './eos/envelope.worker.js';
import { createEnvelopeWorker } from './envelopeWorkerFactory.js';

export const createEnvelopeClient = () => {
  let worker = null;
  let nextId = 1;
  let activeId = null;
  let pending = null; // { resolve, reject } for the active request

  const ensureWorker = () => {
    if (worker) return worker;
    worker = createEnvelopeWorker();
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
        worker.terminate();
        worker = null;
      };
    }
    return worker;
  };

  const trace = (request) => {
    const id = nextId;
    nextId += 1;
    // supersede any in-flight request: its response will be dropped
    if (pending) pending.reject(new Error('superseded'));
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

  const dispose = () => {
    if (pending) {
      pending.reject(new Error('disposed'));
      pending = null;
    }
    activeId = null;
    if (worker) {
      worker.terminate();
      worker = null;
    }
  };

  return { trace, dispose };
};
