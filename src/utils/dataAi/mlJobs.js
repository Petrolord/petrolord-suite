// ML Workbench (Data & AI D2): the worker protocol.
//
// Fits run in a Web Worker so a five-fold fit on a hundred thousand rows
// never freezes the page (the Petrophysics probabilistic worker pattern,
// PT10d). handleMlMessage is the whole worker: it dispatches a job to
// mlWorkflows.js and posts the result. runMlAsync is the page side: it uses
// a worker when one can be made and otherwise runs the same handler inline
// (under jest, and in a browser without module workers).
//
//   page -> worker  { type: 'run', id, job, payload }
//   worker -> page  { type: 'progress', id, phase, done, total }
//                   { type: 'done', id, job, result }
//                   { type: 'error', id, job, message }
import {
  evaluate, fitFinal, importance, learning, leakage, predictWith,
} from '@/utils/dataAi/mlWorkflows';

export const JOBS = {
  /** Validation by whole wells plus the model on every row. */
  evaluate: ({ design, parsed, task }, onProgress) => ({
    evaluation: evaluate({ design, parsed, task, onProgress }),
    final: fitFinal({ design, parsed }),
  }),
  importance: ({ design, parsed }) => importance({ design, parsed }),
  learning: ({ design, parsed }) => learning({ design, parsed }),
  leakage: ({ design, parsed }) => leakage({ design, parsed }),
  predict: ({ final, X }) => predictWith(final, X),
};

export function handleMlMessage(msg, post) {
  if (!msg || msg.type !== 'run') return;
  const { id, job, payload } = msg;
  const fn = JOBS[job];
  if (!fn) {
    post({ type: 'error', id, job, message: `Unknown ML Workbench job ${job}.` });
    return;
  }
  try {
    const result = fn(payload || {}, (p) => post({ type: 'progress', id, ...p }));
    post({ type: 'done', id, job, result });
  } catch (e) {
    post({ type: 'error', id, job, message: e?.message || String(e) });
  }
}

let nextId = 1;

/**
 * Run a job through a worker when createWorker makes one, else inline.
 * Returns { promise, cancel }; the promise resolves with the job's result
 * (which may itself be an engine refusal, { error }).
 */
export function runMlAsync(job, payload, { createWorker = null, onProgress = null } = {}) {
  const id = nextId;
  nextId += 1;
  const msg = { type: 'run', id, job, payload };
  const worker = typeof createWorker === 'function' ? createWorker() : null;
  let cancelled = false;
  let rejectFn = null;
  const promise = new Promise((resolve, reject) => {
    rejectFn = reject;
    const onMsg = (m) => {
      if (!m || m.id !== id || cancelled) return;
      if (m.type === 'progress') onProgress?.(m);
      else if (m.type === 'done') { worker?.terminate(); resolve(m.result); }
      else if (m.type === 'error') { worker?.terminate(); reject(new Error(m.message)); }
    };
    if (worker) {
      worker.onmessage = (e) => onMsg(e.data);
      worker.onerror = (e) => { worker.terminate(); reject(new Error(e?.message || 'The ML Workbench worker failed.')); };
      worker.postMessage(msg);
    } else {
      setTimeout(() => { if (!cancelled) handleMlMessage(msg, onMsg); }, 0);
    }
  });
  const cancel = () => { cancelled = true; worker?.terminate(); rejectFn?.(new Error('cancelled')); };
  return { promise, cancel };
}
