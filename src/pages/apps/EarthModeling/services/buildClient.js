// Run a model build (Earth Modeling upgrade U2-004): on a Web Worker when
// the browser has one, inline otherwise (jest, old browsers). Either way
// the caller gets progress and can cancel with an AbortSignal.

import { buildModel } from './modelBuild';
import { runBuildOnWorker } from './buildWorkerProtocol';
import { createBuildWorker } from './emBuildWorkerFactory';

/**
 * @param {object} p {definition, wells, surfaces, backend, onProgress?, signal?, createWorker?}
 * @returns {Promise<{built: object, where: 'worker'|'inline'}>}
 */
export async function runBuild({ definition, wells, surfaces, backend, onProgress = null, signal = null, createWorker = createBuildWorker }) {
  const worker = createWorker ? createWorker() : null;
  if (worker) {
    const built = await runBuildOnWorker(worker, { definition, wells, surfaces, backend, onProgress, signal });
    return { built, where: 'worker' };
  }
  const built = await buildModel(definition, wells, surfaces, backend, { onProgress, signal });
  return { built, where: 'inline' };
}
