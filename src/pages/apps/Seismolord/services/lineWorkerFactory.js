// The one 2D-line file using import.meta (Vite worker URL), which
// babel-jest's CJS transform cannot parse — kept alone so linesService
// stays testable (the attributeWorkerFactory precedent).
export const newLineWorker = () =>
  new Worker(new URL('../workers/line2d.worker.js', import.meta.url), { type: 'module' });
