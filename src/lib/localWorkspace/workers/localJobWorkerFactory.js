// The one file of the browser job runner using import.meta (Vite worker URL),
// which babel-jest cannot parse; jest maps it to a mock (jest.config.js).
export const newLocalJobWorker = () =>
  new Worker(new URL('./localJob.worker.js', import.meta.url), { type: 'module' });
export const newHashWorker = () =>
  new Worker(new URL('./hash.worker.js', import.meta.url), { type: 'module' });
