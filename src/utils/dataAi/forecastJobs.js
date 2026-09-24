// Production Forecasting ML Workbench (Data & AI D4): the worker protocol.
//
// The engine takes about 2.5 s to backtest 200 wells of 120 months
// (FINDINGS-forecast.md, timings), so every job runs in a Web Worker and the
// page stays responsive (the ML Workbench and Electrofacies Studio pattern).
// handleForecastMessage is the whole worker: it dispatches a job to
// forecastWorkflows.js and posts the result. runForecastAsync is the page
// side: it uses a worker when one can be made and otherwise runs the same
// handler inline (under jest, and in a browser without module workers).
//
//   page -> worker  { type: 'run', id, job, payload }
//   worker -> page  { type: 'progress', id, phase, done, total }
//                   { type: 'done', id, job, result }
//                   { type: 'error', id, job, message }
import {
  runFit, runIntervals, runCompare, runField,
} from '@/utils/dataAi/forecastWorkflows';

export const JOBS = {
  fit: ({ series, parsed }) => runFit({ series, parsed }),
  intervals: ({ series, parsed }) => runIntervals({ series, parsed }),
  compare: ({ series, parsed }) => runCompare({ series, parsed }),
  field: ({ table, parsed }, onProgress) => runField({ table, parsed, onProgress }),
};

export function handleForecastMessage(msg, post) {
  if (!msg || msg.type !== 'run') return;
  const { id, job, payload } = msg;
  const fn = JOBS[job];
  if (!fn) {
    post({ type: 'error', id, job, message: `Unknown Forecasting ML Workbench job ${job}.` });
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
 * (which may itself carry an engine refusal, { error }).
 */
export function runForecastAsync(job, payload, { createWorker = null, onProgress = null } = {}) {
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
      worker.onerror = (e) => { worker.terminate(); reject(new Error(e?.message || 'The Forecasting ML Workbench worker failed.')); };
      worker.postMessage(msg);
    } else {
      setTimeout(() => { if (!cancelled) handleForecastMessage(msg, onMsg); }, 0);
    }
  });
  const cancel = () => { cancelled = true; worker?.terminate(); rejectFn?.(new Error('cancelled')); };
  return { promise, cancel };
}
