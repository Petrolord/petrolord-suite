// Jest stand-in for localJobWorkerFactory (import.meta worker URL). Tests
// inject a worker factory into the browser job runner.
export const newLocalJobWorker = () => {
  throw new Error('No local job worker in jest: pass makeWorker to createBrowserJobRunner.');
};
export const newHashWorker = () => {
  throw new Error('No hash worker in jest: pass hashFile to the local import.');
};
