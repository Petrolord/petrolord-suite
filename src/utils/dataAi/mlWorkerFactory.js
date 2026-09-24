/**
 * The only ML Workbench file that references `import.meta` (the Vite worker
 * URL idiom), isolated so jest maps it to a null factory and jobs run
 * inline under test (src/__mocks__/mlWorkerFactoryMock.js).
 */
export const createMlWorker = () => {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./workers/ml.worker.js', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
};
