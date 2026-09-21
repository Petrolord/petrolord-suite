// Run the probabilistic breakeven in a Web Worker when the browser has one,
// and inline when it does not (tests, very old browsers, a worker that fails
// to start). Either way the result is the same engine output: the worker
// calls the same generateBreakevenData with the same seed.
import { generateBreakevenData } from '@/utils/breakevenCalculations';
import { createBreakevenWorker } from './breakevenWorkerFactory';

const inline = (inputs, resolve, reject) => {
  try {
    resolve(generateBreakevenData(inputs));
  } catch (error) {
    reject(error);
  }
};

/**
 * @param {object} inputs the analyzer inputs generateBreakevenData takes
 * @param {{createWorker?: () => (Worker|null)}} [options]
 * @returns {Promise<object>} the breakeven result
 */
export const runBreakevenAnalysis = (inputs, { createWorker = createBreakevenWorker } = {}) => (
  new Promise((resolve, reject) => {
    const worker = createWorker();
    if (!worker) {
      inline(inputs, resolve, reject);
      return;
    }
    worker.onmessage = (event) => {
      worker.terminate();
      if (event.data?.ok) resolve(event.data.result);
      else reject(new Error(event.data?.error || 'The breakeven run failed.'));
    };
    // A worker that cannot load its module never answers; run inline instead.
    worker.onerror = () => {
      worker.terminate();
      inline(inputs, resolve, reject);
    };
    worker.postMessage(inputs);
  })
);
