// Jest stand-in for attributeWorkerFactory (import.meta worker URL).
// Tests that need a live worker inject their own via the service's
// `workerFactory` option; this default just refuses loudly.
export const newAttributeWorker = () => {
  throw new Error('No attribute worker in jest — pass workerFactory to the service.');
};
