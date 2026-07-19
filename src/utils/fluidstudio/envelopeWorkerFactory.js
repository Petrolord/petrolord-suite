/**
 * The only file that references `import.meta` (Vite worker URL idiom).
 * Isolated so jest can map it to a null factory (babel-jest's CJS
 * transform cannot parse import.meta); the envelope client then uses its
 * synchronous fallback under test.
 */
export const createEnvelopeWorker = () => {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./eos/envelope.worker.js', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
};
