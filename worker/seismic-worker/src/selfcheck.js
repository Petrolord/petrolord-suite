// In-image deploy gate. Proves the image that is about to serve can load
// every module and run a job through the real runJob path against an
// in-memory queue (no network, no credentials). The protocol itself is
// covered by the jest suite and db-tests/, which deploy.sh runs first.
import { runJob } from './runJob.js';
import { createHandlers, KINDS } from './handlers/index.js';
import { loadConfig } from './config.js';
import { threadHandlers } from './threadJobs.js';
import { hasNativeDeflateRaw } from '../../../packages/engines/engines/seismolord/brickCodecV4.js';
import { nodeZfpDecode } from './zgySource.js';

const cfg = { ...loadConfig(), heartbeatIntervalMs: 60000, progressMinIntervalMs: 0, workerId: 'selfcheck' };
const calls = [];
const queue = {
  heartbeat: async () => ({ cancelRequested: false, stillMine: true }),
  succeed: async (job, result) => calls.push(['succeed', result]),
  fail: async (job, stage, message) => calls.push(['fail', stage, message]),
  cancelled: async () => calls.push(['cancelled']),
};
const log = { info() {}, warn: console.warn, error: console.error };

const ok = await runJob({ id: 'sc1', kind: 'noop', attempt: 1, params: { seconds: 0.2 } }, { queue, handlers: createHandlers({}), cfg, log });
const bad = await runJob({ id: 'sc2', kind: 'noop', attempt: 1, params: { fail: true } }, { queue, handlers: createHandlers({}), cfg, log });
// the same two jobs through a worker thread started from the bundled entry
// (dist/jobThread.mjs), as main.js runs every job unless JOB_THREADS=0
const threaded = threadHandlers({ kinds: KINDS, entry: new URL(import.meta.url.endsWith('.mjs') ? './jobThread.mjs' : './jobThread.js', import.meta.url), cfg });
const tOk = await runJob({ id: 'sc3', kind: 'noop', attempt: 1, params: { seconds: 0.2 } }, { queue, handlers: threaded, cfg, log });
const tBad = await runJob({ id: 'sc4', kind: 'noop', attempt: 1, params: { fail: true } }, { queue, handlers: threaded, cfg, log });
// stack_to_v4 compresses with CompressionStream('deflate-raw'), as the
// browser import does; without it the server would need another codec.
const nativeDeflate = hasNativeDeflateRaw();
// compressed ZGY imports decode bricks with the ZFP wasm shipped beside the bundle
let zfp = false;
try { zfp = typeof (await nodeZfpDecode()) === 'function'; } catch (e) { console.error('ZFP decoder:', e.message); }
if (!zfp || ok !== 'succeeded' || bad !== 'failed' || calls[0][1]?.slept_seconds !== 0.2
  || tOk !== 'succeeded' || tBad !== 'failed' || calls[2]?.[1]?.slept_seconds !== 0.2 || calls[3]?.[1] !== 'requested_failure' || !nativeDeflate || !KINDS.includes('stack_to_v4')) {
  console.error('SELFCHECK FAILED', JSON.stringify({ ok, bad, tOk, tBad, calls, nativeDeflate, zfp, KINDS }));
  process.exit(1);
}
console.log(`SELFCHECK OK: node ${process.version}; kinds ${KINDS.join(', ')}; native deflate-raw ${nativeDeflate}; ZFP decoder ${zfp}; job threads OK`);
