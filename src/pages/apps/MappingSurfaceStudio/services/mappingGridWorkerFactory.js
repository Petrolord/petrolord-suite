/**
 * The only Mapping file that references `import.meta` (the Vite worker URL
 * idiom), isolated so jest maps it to a null factory and gridding runs
 * inline under test (Mapping T1 MAP-T1-018).
 */
export const createMappingGridWorker = () => {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./gridWorker.js', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
};
