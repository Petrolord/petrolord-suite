// The one file of the v4 import pipeline using import.meta (Vite worker
// URL), which babel-jest's CJS transform cannot parse. Kept alone so
// importJobs stays testable (jest maps this module to a mock, the
// attribute/gridding worker-factory precedent).
export const newConvertWorker = () =>
  new Worker(new URL('../workers/convertV4.worker.js', import.meta.url), { type: 'module' });
