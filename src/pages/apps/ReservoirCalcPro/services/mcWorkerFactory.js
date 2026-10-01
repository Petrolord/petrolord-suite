/**
 * The only ReservoirCalc Pro file that references `import.meta` (the Vite
 * worker URL idiom). The client imports it lazily, and only where Worker
 * exists, so jest (no Worker in jsdom) never parses it.
 */
export const createMcWorker = () => {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('../workers/monteCarlo.worker.js', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
};
