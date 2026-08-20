// The one attribute-pipeline file using import.meta (Vite worker URL),
// which babel-jest's CJS transform cannot parse — kept alone so
// attributeJobService stays testable (jest maps this module to a mock,
// the envelope/gridding worker-factory precedent).
export const newAttributeWorker = () =>
  new Worker(new URL('../workers/volumeJob.worker.js', import.meta.url), { type: 'module' });
