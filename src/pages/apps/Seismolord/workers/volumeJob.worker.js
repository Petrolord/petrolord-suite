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

import { BrickCache, storageBrickFetcher } from '../engine/brickCache';
import { v4BrickFetcher } from '../engine/brickCodecV4';
import { geomFromManifest, brickKey } from '../engine/sliceAssembly';
import { makeTraceCompute } from '../engine/attributes';
import { DISCONTINUITY_DEFS } from '../engine/discontinuity';
import { makeDiscontinuityJob } from '../engine/discontinuityJobs';
import { surveyAffine } from '../engine/surveyGeometry';
import { runVolumeJob, runNeighborhoodJob } from '../engine/volumeJob';
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

  const manifest = config.manifest;
  // a v4 parent's float32 copy lives under v4/f/ (the job refuses to
  // start before the parent is 'ready', so f32 is complete here)
  const fetcher = v4BrickFetcher(storageBrickFetcher({
    supabaseUrl: config.supabaseUrl,
    getToken,
    bucket: config.bucket,
  }), manifest);

  const geom = geomFromManifest(manifest);           // version gate at the choke point
  const { name, params = {} } = config.attribute;
  const dtUs = manifest.geometry.dt_us;
  const neighborhood = Boolean(DISCONTINUITY_DEFS[name]);

  // Per-trace jobs read every parent brick exactly once — no cache.
  // Neighborhood jobs re-read each brick from up to 9 column rings, so
  // an LRU keeps the shared ring bricks hot between adjacent columns.
  let fetchBrick;
  if (neighborhood) {
    const cache = new BrickCache(fetcher, { maxBytes: 256 * 1024 * 1024 });
    fetchBrick = (i, j, k) => cache.get(brickKey(config.storagePath, i, j, k));
  } else {
    fetchBrick = async (i, j, k) => new Float32Array(
      await fetcher(brickKey(config.storagePath, i, j, k)),
    );
  }

  const shared = {
    geom,
    fetchBrick,
    shouldCancel: () => channel.isCancelled(id),
    onProgress: (done, total, phase) => self.postMessage({ type: 'progress', id, phase, done, total }),
    onBrick: ({ i, j, k, data }) => channel.sendBrick(
      id,
      { type: 'brick', id, i, j, k, buffer: data.buffer },
      [data.buffer],
      { cancelMessage: 'Attribute computation cancelled.' },
    ),
  };

  let result;
  if (neighborhood) {
    // variance runs per trace; the fault likelihood a brick column at a time
    // map-frame attributes (Dip azimuth, grid north) need the survey affine
    const job = makeDiscontinuityJob(name, params, {
      dtUs, nIl: geom.nIl, nXl: geom.nXl, ns: geom.ns, affine: surveyAffine(manifest.geometry),
    });
    result = await runNeighborhoodJob({ ...shared, ...job });
  } else {
    result = await runVolumeJob({
      ...shared,
      compute: makeTraceCompute(name, params, { dtUs }),
    });
  }

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
