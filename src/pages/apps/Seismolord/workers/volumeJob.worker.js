// Attribute-volume compute worker (W2.1): reads the parent volume's
// bricks itself (owner-path storage RLS with the caller's token, the
// horizon worker's pattern), runs the per-trace attribute engine one
// brick column at a time, and streams output bricks to the main thread
// for upload under the ingest ack backpressure. All numerics live in
// the engine modules (jest-tested); this file is only the postMessage
// shell.
//
// Protocol (main -> worker):
//   {type:'compute', id, config:{supabaseUrl, token, bucket, storagePath,
//                                manifest, attribute:{name, params}}}
//   {type:'brick:ack', id}            upload finished for one brick
//   {type:'cancel', id}
//   {type:'token', nonce, token}      reply to need-token
// (worker -> main):
//   {type:'need-token', id, nonce}    JWT expired mid-job, refresh it
//   {type:'progress', id, phase:'compute', done, total}
//   {type:'brick', id, i, j, k, buffer}      (buffer transferred)
//   {type:'compute:done', id, result}        ({brickGrid, stats, traceCount})
//   {type:'error', id, message}

import { storageBrickFetcher } from '../engine/brickCache';
import { geomFromManifest, brickKey } from '../engine/sliceAssembly';
import { makeTraceCompute } from '../engine/attributes';
import { runVolumeJob } from '../engine/volumeJob';
import { createBrickChannel } from './brickAckChannel';

const channel = createBrickChannel((msg, transfer) => self.postMessage(msg, transfer));

// Pending token-refresh requests keyed by nonce, resolved when the main
// thread replies with a fresh JWT (large volumes can outlive the token).
const tokenWaiters = new Map();
let tokenNonce = 0;

async function handleCompute({ id, config }) {
  let currentToken = config.token;
  const getToken = (force) => {
    if (!force) return Promise.resolve(currentToken);
    const nonce = ++tokenNonce;
    return new Promise((resolve) => {
      tokenWaiters.set(nonce, (t) => { currentToken = t; resolve(t); });
      self.postMessage({ type: 'need-token', id, nonce });
    });
  };

  const fetcher = storageBrickFetcher({
    supabaseUrl: config.supabaseUrl,
    getToken,
    bucket: config.bucket,
  });
  // No LRU cache: the job reads every parent brick exactly once.
  const fetchBrick = async (i, j, k) => new Float32Array(
    await fetcher(brickKey(config.storagePath, i, j, k)),
  );

  const manifest = config.manifest;
  const geom = geomFromManifest(manifest);           // version gate at the choke point
  const compute = makeTraceCompute(
    config.attribute.name,
    config.attribute.params || {},
    { dtUs: manifest.geometry.dt_us },
  );

  const result = await runVolumeJob({
    geom,
    compute,
    fetchBrick,
    shouldCancel: () => channel.isCancelled(id),
    onProgress: (done, total, phase) => self.postMessage({ type: 'progress', id, phase, done, total }),
    onBrick: ({ i, j, k, data }) => channel.sendBrick(
      id,
      { type: 'brick', id, i, j, k, buffer: data.buffer },
      [data.buffer],
      { cancelMessage: 'Attribute computation cancelled.' },
    ),
  });

  self.postMessage({ type: 'compute:done', id, result });
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'token') {
    const waiter = tokenWaiters.get(msg.nonce);
    if (waiter) { tokenWaiters.delete(msg.nonce); waiter(msg.token); }
    return;
  }
  try {
    if (msg.type === 'compute') await handleCompute(msg);
    else if (msg.type === 'brick:ack') channel.ack(msg.id);
    else if (msg.type === 'cancel') channel.cancel(msg.id);
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err.message });
  }
};
