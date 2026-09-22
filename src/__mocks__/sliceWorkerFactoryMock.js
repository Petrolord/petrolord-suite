// jest stand-in for Seismolord's sliceWorkerFactory.js (import.meta).
// Tests inject a worker (an in-process one around sliceWorkerHandler)
// into SliceWorkerClient; nothing constructs the real worker under jest.
export const createSliceWorker = () => {
  throw new Error('slice worker unavailable under jest');
};
