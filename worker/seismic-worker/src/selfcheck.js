// In-image deploy gate. Proves the image that is about to serve can load
// every module and run a job through the real runJob path against an
// in-memory queue (no network, no credentials). The protocol itself is
// covered by the jest suite and db-tests/, which deploy.sh runs first.
import { runJob } from './runJob.js';
import { createHandlers, KINDS } from './handlers/index.js';
import { loadConfig } from './config.js';
import { hasNativeDeflateRaw } from '../../../packages/engines/engines/seismolord/brickCodecV4.js';

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
// stack_to_v4 compresses with CompressionStream('deflate-raw'), as the
// browser import does; without it the server would need another codec.
const nativeDeflate = hasNativeDeflateRaw();
if (ok !== 'succeeded' || bad !== 'failed' || calls[0][1]?.slept_seconds !== 0.2 || !nativeDeflate || !KINDS.includes('stack_to_v4')) {
  console.error('SELFCHECK FAILED', JSON.stringify({ ok, bad, calls, nativeDeflate, KINDS }));
  process.exit(1);
}
console.log(`SELFCHECK OK: node ${process.version}; kinds ${KINDS.join(', ')}; native deflate-raw ${nativeDeflate}`);
