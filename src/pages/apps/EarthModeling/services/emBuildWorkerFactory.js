/**
 * The only Earth Modeling file that references `import.meta` (the Vite
 * worker URL idiom), isolated so jest maps it to a null factory and the
 * build runs inline under test (U2-004).
 */
export const createBuildWorker = () => {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('../workers/buildModel.worker.js', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
};
