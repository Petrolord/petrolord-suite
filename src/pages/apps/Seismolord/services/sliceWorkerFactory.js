// Vite worker URL (import.meta), isolated so jest maps this module to a
// null factory (src/__mocks__/sliceWorkerFactoryMock.js).
export const createSliceWorker = () =>
  new Worker(new URL('../workers/slice.worker.js', import.meta.url), { type: 'module' });
