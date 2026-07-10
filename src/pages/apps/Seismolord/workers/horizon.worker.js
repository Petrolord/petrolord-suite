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
import { assembleTrace, brickKey } from '../engine/sliceAssembly';
import { regionGrow3D } from '../engine/horizonTrack';

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
    return new Promise((resolve) => {
      tokenWaiters.set(nonce, (t) => { currentToken = t; resolve(t); });
      self.postMessage({ type: 'need-token', id, nonce });
    });
  };
  try {
    const cache = new BrickCache(storageBrickFetcher({
      supabaseUrl: config.supabaseUrl,
      getToken,
      bucket: config.bucket,
    }), { maxBytes: 512 * 1024 * 1024 });

    const getBrick = (i, j, k) =>
      cache.get(brickKey(config.storagePath, i, j, k));
    const getTrace = (il, xl) => assembleTrace(getBrick, config.geom, il, xl);

    const { picks, tracked } = await regionGrow3D(getTrace, config.geom, config.seed, {
      ...config.opts,
      onProgress: (done, total) => self.postMessage({ type: 'progress', id, tracked: done, total }),
      shouldCancel: () => cancelled.has(id),
    });
    self.postMessage({ type: 'done', id, picks: picks.buffer, tracked }, [picks.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err.message });
  } finally {
    cancelled.delete(id);
  }
};
