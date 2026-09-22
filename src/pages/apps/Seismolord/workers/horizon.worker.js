// Horizon tracking worker: runs the 3D region-grow off the main thread,
// fetching bricks itself through the LRU cache (owner-path storage RLS
// with the caller's token). Progress and cancellation via postMessage —
// no server jobs (plan of record).
//
// (main -> worker):
//   {type:'track3d', id, config:{supabaseUrl, token, bucket, storagePath,
//                                geom, seed, opts}}
//   {type:'cancel', id}
// (worker -> main):
//   {type:'progress', id, tracked, total}
//   {type:'done', id, picks (transferred buffer), tracked}
//   {type:'error', id, message}

import { BrickCache, storageBrickFetcher } from '../engine/brickCache';
import { v4BrickFetcher } from '../engine/brickCodecV4';
import { assembleTrace, brickKey } from '../engine/sliceAssembly';
import { cacheBudgetBytes, reportedDeviceMemory } from '../sources/memoryBudget';
import { regionGrow3D } from '../engine/horizonTrack';
import { withBrickTimeout } from '../lib/fetchWithTimeout';

// a token reply that never comes must not wedge the grow (2026-09-22)
const TOKEN_WAIT_MS = 30000;

const cancelled = new Set();
// Pending token-refresh requests keyed by nonce, resolved when the main
// thread replies with a fresh JWT (long grows can outlive the token).
const tokenWaiters = new Map();
let tokenNonce = 0;

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'cancel') {
    cancelled.add(msg.id);
    return;
  }
  if (msg.type === 'token') {
    const waiter = tokenWaiters.get(msg.nonce);
    if (waiter) { tokenWaiters.delete(msg.nonce); waiter(msg.token); }
    return;
  }
  if (msg.type !== 'track3d') return;
  const { id, config } = msg;
  let currentToken = config.token;
  const getToken = (force) => {
    if (!force) return Promise.resolve(currentToken);
    const nonce = ++tokenNonce;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        tokenWaiters.delete(nonce);
        reject(new Error('The sign-in could not be refreshed in time.'));
      }, TOKEN_WAIT_MS);
      tokenWaiters.set(nonce, (t) => { clearTimeout(timer); currentToken = t; resolve(t); });
      self.postMessage({ type: 'need-token', id, nonce });
    });
  };
  try {
    // v4 stores read through the v1 brick names (config.v4 is null for
    // every other manifest, and the fetcher then comes back untouched)
    const cache = new BrickCache(withBrickTimeout(v4BrickFetcher(storageBrickFetcher({
      supabaseUrl: config.supabaseUrl,
      getToken,
      bucket: config.bucket,
    }), config.v4)), {
      // Stream L: the same machine-sized budget as the viewer (about
      // 256 MB on an 8 GB laptop) where this used a fixed 512 MiB
      maxBytes: config.maxBytes || cacheBudgetBytes(reportedDeviceMemory(self)),
      dtype: config.dtype,
    });

    const getBrick = (i, j, k) =>
      cache.get(brickKey(config.storagePath, i, j, k));
    const getTrace = (il, xl) => assembleTrace(getBrick, config.geom, il, xl);

    const { picks, tracked, confidence } = await regionGrow3D(getTrace, config.geom, config.seed, {
      ...config.opts,
      onProgress: (done, total) => self.postMessage({ type: 'progress', id, tracked: done, total }),
      shouldCancel: () => cancelled.has(id),
    });
    // W3.2: the confidence companion rides along (1e30 nulls; all-null
    // for snap modes — the main thread decides whether to persist it)
    self.postMessage(
      { type: 'done', id, picks: picks.buffer, confidence: confidence.buffer, tracked },
      [picks.buffer, confidence.buffer],
    );
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err.message });
  } finally {
    cancelled.delete(id);
  }
};
