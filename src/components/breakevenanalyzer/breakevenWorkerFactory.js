/**
 * The only Breakeven Analyzer file that references `import.meta` (the Vite
 * worker URL idiom), isolated so jest maps it to a null factory and the run
 * falls back to inline execution under test.
 */
export const createBreakevenWorker = () => {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./breakeven.worker.js', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
};
