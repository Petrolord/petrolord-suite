// jest stand-in for envelopeWorkerFactory.js (which uses import.meta —
// unparseable under babel-jest's CJS transform). Returning null routes
// the envelope client onto its synchronous fallback in tests.
export const createEnvelopeWorker = () => null;
