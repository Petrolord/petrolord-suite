// The slice worker (large-survey plan section 6): every source, the one
// brick cache and all decoding and slicing live here, off the UI thread.
// The protocol is in sources/sliceWorkerHandler.js.

import { createSliceWorkerHandler } from '../sources/sliceWorkerHandler';
import { persistentBrickFetcher } from '../services/brickStore';
import { reportedDeviceMemory } from '../sources/memoryBudget';

const handler = createSliceWorkerHandler(
  (msg, transfer) => self.postMessage(msg, transfer || []),
  {
    deviceMemory: reportedDeviceMemory(self),
    // IndexedDB works in workers: a reload scrubs from disk
    wrapPersistent: (fetcher) => persistentBrickFetcher(fetcher),
  },
);

self.onmessage = (e) => handler.onMessage(e.data);
