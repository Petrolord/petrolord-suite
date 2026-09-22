// The slice worker (large-survey plan section 6): every source, the one
// brick cache and all decoding and slicing live here, off the UI thread.
// The protocol is in sources/sliceWorkerHandler.js.

import { createSliceWorkerHandler } from '../sources/sliceWorkerHandler';
import { persistentBrickFetcher } from '../services/brickStore';
import { reportedDeviceMemory } from '../sources/memoryBudget';
import { createDeflatePool, deflatePoolSize } from '../services/deflatePool';
import { nativeInflateRaw } from '../engine/brickCodecV4';

// v4 bricks inflate on a small pool of helper workers, made on first use
// (v1 volumes never need it); without nested workers, on this thread
let pool = null;
const inflate = (bytes) => {
  if (!pool && typeof Worker !== 'undefined') {
    try {
      pool = createDeflatePool(deflatePoolSize(self.navigator?.hardwareConcurrency),
        () => new Worker(new URL('./inflate.worker.js', import.meta.url), { type: 'module' }));
    } catch { pool = false; }
  }
  return pool ? pool.run(bytes) : nativeInflateRaw(bytes);
};

const handler = createSliceWorkerHandler(
  (msg, transfer) => self.postMessage(msg, transfer || []),
  {
    deviceMemory: reportedDeviceMemory(self),
    // IndexedDB works in workers: a reload scrubs from disk
    wrapPersistent: (fetcher) => persistentBrickFetcher(fetcher),
    inflate,
  },
);

self.onmessage = (e) => handler.onMessage(e.data);
