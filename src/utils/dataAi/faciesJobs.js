// Electrofacies Studio (Data & AI D3): the worker protocol.
//
// Clustering runs in a Web Worker so k-means with ten starts, an elbow over
// ten k or kNN over every row never freezes the page (the ML Workbench
// pattern, mlJobs.js). handleFaciesMessage is the whole worker: it
// dispatches a job to faciesWorkflows.js and posts the result.
// runFaciesAsync is the page side: it uses a worker when one can be made
// and otherwise runs the same handler inline (under jest, and in a browser
// without module workers).
//
//   page -> worker  { type: 'run', id, job, payload }
//   worker -> page  { type: 'progress', id, phase, done, total }
//                   { type: 'done', id, job, result }
//                   { type: 'error', id, job, message }
import {
  runPca, runKmeans, runElbow, runAgglomerative, runSupervised,
} from '@/utils/dataAi/faciesWorkflows';

export const JOBS = {
  pca: ({ design, parsed }) => runPca({ design, parsed }),
  kmeans: ({ design, parsed }) => runKmeans({ design, parsed }),
  elbow: ({ design, parsed }, onProgress) => runElbow({ design, parsed, onProgress }),
  agglomerative: ({ design, parsed }) => runAgglomerative({ design, parsed }),
  knn: ({ design, parsed }, onProgress) => runSupervised({
    design, parsed, method: 'knn', onProgress,
  }),
  cart: ({ design, parsed }, onProgress) => runSupervised({
    design, parsed, method: 'cart', onProgress,
  }),
};

export function handleFaciesMessage(msg, post) {
  if (!msg || msg.type !== 'run') return;
  const { id, job, payload } = msg;
  const fn = JOBS[job];
  if (!fn) {
    post({ type: 'error', id, job, message: `Unknown Electrofacies Studio job ${job}.` });
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
export function runFaciesAsync(job, payload, { createWorker = null, onProgress = null } = {}) {
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
      worker.onerror = (e) => { worker.terminate(); reject(new Error(e?.message || 'The Electrofacies Studio worker failed.')); };
      worker.postMessage(msg);
    } else {
      setTimeout(() => { if (!cancelled) handleFaciesMessage(msg, onMsg); }, 0);
    }
  });
  const cancel = () => { cancelled = true; worker?.terminate(); rejectFn?.(new Error('cancelled')); };
  return { promise, cancel };
}
