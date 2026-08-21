// Jest stand-in for lineWorkerFactory (import.meta worker URL). Tests
// that need a live worker inject their own via the service's
// `workerFactory` option; this default just refuses loudly.
export const newLineWorker = () => {
  throw new Error('No 2D line worker in jest — pass workerFactory to the service.');
};
