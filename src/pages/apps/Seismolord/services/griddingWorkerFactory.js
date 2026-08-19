// Vite worker construction isolated in its own module: import.meta is
// unparseable under babel-jest's CJS transform, so jest maps this file
// to src/__mocks__/griddingWorkerFactoryMock.js (the
// envelopeWorkerFactory pattern), which keeps the rest of
// surfaceWorkflow unit-testable.
export const newGriddingWorker = () =>
  new Worker(new URL('../workers/gridding.worker.js', import.meta.url), { type: 'module' });
