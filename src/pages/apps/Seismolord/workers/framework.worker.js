// Tops to Horizons worker: the field match, the framework tracking and the
// automatic fault picking run here, off the main thread, reading bricks
// itself through the LRU cache with the caller's token (the horizon
// worker's pattern: owner-path storage RLS, v4 stores through the v1
// brick names, a token refresh the main thread answers).
//
// (main -> worker):
//   {type: 'match'|'track'|'faults', id, config: {supabaseUrl, token, bucket,
//     storagePath, dtype, v4, geom, ...job inputs}}
//   {type: 'cancel', id}   {type: 'token', nonce, token}
// (worker -> main):
//   {type: 'progress', id, stage, done, total}
//   {type: 'need-token', id, nonce}
//   {type: 'done', id, result}   (horizon grids transferred)
//   {type: 'error', id, message}

import { BrickCache, storageBrickFetcher } from '../engine/brickCache';
import { v4BrickFetcher } from '../engine/brickCodecV4';
import { assembleTrace, brickKey } from '../engine/sliceAssembly';
import { cacheBudgetBytes, reportedDeviceMemory } from '../sources/memoryBudget';
import { withBrickTimeout } from '../lib/fetchWithTimeout';
import { runFieldMatch, runFrameworkTrack, runFaultDetect } from '../services/topsToHorizonsPipeline';

const TOKEN_WAIT_MS = 30000;
const cancelled = new Set();
const tokenWaiters = new Map();
let tokenNonce = 0;

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'cancel') { cancelled.add(msg.id); return; }
  if (msg.type === 'token') {
    const waiter = tokenWaiters.get(msg.nonce);
    if (waiter) { tokenWaiters.delete(msg.nonce); waiter(msg.token); }
    return;
  }
  if (!['match', 'track', 'faults'].includes(msg.type)) return;
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
  const onProgress = (stage, done, total) => self.postMessage({
    type: 'progress', id, stage, done, total,
  });
  const shouldCancel = () => cancelled.has(id);
  try {
    const cache = new BrickCache(withBrickTimeout(v4BrickFetcher(storageBrickFetcher({
      supabaseUrl: config.supabaseUrl, getToken, bucket: config.bucket,
    }), config.v4)), {
      maxBytes: config.maxBytes || cacheBudgetBytes(reportedDeviceMemory(self)),
      dtype: config.dtype,
    });
    const getBrick = (i, j, k) => cache.get(brickKey(config.storagePath, i, j, k));
    const getTrace = (il, xl) => assembleTrace(getBrick, config.geom, il, xl);

    if (msg.type === 'match') {
      const result = await runFieldMatch({ ...config, getTrace, onProgress });
      self.postMessage({ type: 'done', id, result });
    } else if (msg.type === 'track') {
      const result = await runFrameworkTrack({
        ...config, getTrace, onProgress, shouldCancel,
      });
      const transfer = [];
      for (const h of result.horizons) transfer.push(h.picks.buffer, h.confidence.buffer);
      self.postMessage({ type: 'done', id, result }, transfer);
    } else {
      const result = await runFaultDetect({
        ...config, getTrace, onProgress, shouldCancel,
      });
      self.postMessage({ type: 'done', id, result });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err.message });
  } finally {
    cancelled.delete(id);
  }
};
