/**
 * The only Electrofacies Studio file that references `import.meta` (the
 * Vite worker URL idiom), isolated so jest maps it to a null factory and
 * jobs run inline under test (src/__mocks__/faciesWorkerFactoryMock.js).
 */
export const createFaciesWorker = () => {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./workers/facies.worker.js', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
};
