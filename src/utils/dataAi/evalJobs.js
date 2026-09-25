// AI Evaluation Studio (Data & AI D5): the worker protocol.
//
// Retrieval over a corpus of up to 2,000 passages and 200 queries, and a
// bootstrap of up to 10,000 replicates, can take from a few hundred
// milliseconds to a few seconds (FINDINGS-evaluate.md, timings), so every job
// runs in a Web Worker and the page stays responsive (the ML Workbench,
// Electrofacies Studio and Forecasting ML Workbench pattern).
// handleEvalMessage is the whole worker: it dispatches a job to
// evalWorkflows.js and posts the result. runEvalAsync is the page side: it
// uses a worker when one can be made and otherwise runs the same handler
// inline (under jest, and in a browser without module workers).
//
//   page -> worker  { type: 'run', id, job, payload }
//   worker -> page  { type: 'done', id, job, result }
//                   { type: 'error', id, job, message }
import {
  runRetrieval, runMetrics, runCompare, runAnswers, runExtraction, runAgreement, runCalibration, assistContext, assistCheck,
} from '@/utils/dataAi/evalWorkflows';

export const JOBS = {
  retrieval: (p) => runRetrieval(p),
  metrics: (p) => runMetrics(p),
  compare: (p) => runCompare(p),
  answers: (p) => runAnswers(p),
  extraction: (p) => runExtraction(p),
  agreement: (p) => runAgreement(p),
  calibration: (p) => runCalibration(p),
  assistContext: (p) => assistContext(p),
  assistCheck: (p) => assistCheck(p),
};

export function handleEvalMessage(msg, post) {
  if (!msg || msg.type !== 'run') return;
  const { id, job, payload } = msg;
  const fn = JOBS[job];
  if (!fn) {
    post({ type: 'error', id, job, message: `Unknown AI Evaluation Studio job ${job}.` });
    return;
  }
  try {
    post({ type: 'done', id, job, result: fn(payload || {}) });
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
export function runEvalAsync(job, payload, { createWorker = null } = {}) {
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
      if (m.type === 'done') { worker?.terminate(); resolve(m.result); }
      else if (m.type === 'error') { worker?.terminate(); reject(new Error(m.message)); }
    };
    if (worker) {
      worker.onmessage = (e) => onMsg(e.data);
      worker.onerror = (e) => { worker.terminate(); reject(new Error(e?.message || 'The AI Evaluation Studio worker failed.')); };
      worker.postMessage(msg);
    } else {
      setTimeout(() => { if (!cancelled) handleEvalMessage(msg, onMsg); }, 0);
    }
  });
  const cancel = () => { cancelled = true; worker?.terminate(); rejectFn?.(new Error('cancelled')); };
  return { promise, cancel };
}
