// The job side of a worker thread (2026-10-15, QI round 3). main.js runs each
// claimed job's handler in its own thread (threadJobs.js) so a CPU-heavy job
// cannot stall another job's uploads, downloads or heartbeats: every thread
// has its own event loop. The main thread keeps the claim (heartbeat, cancel,
// the queue writes); the thread runs the handler with a context that looks
// the same as runJob's:
//   ctx.progress(f, m)  posted to the main thread (throttled)
//   ctx.cancelled       a shared flag the main thread sets
//   ctx.log             posted, logged by the main thread
// The result, or the failure (a JobFailure keeps its stage and message), is
// posted back once. Plain ESM with node builtins only, so the jest suite can
// start it from a fixture with test handlers.
import { parentPort, workerData } from 'node:worker_threads';
import { JobFailure } from './runJob.js';

/**
 * @param {{createHandlers: (deps: Object) => Object, buildDeps?: (cfg: Object, log: Object) => Object, progressEveryMs?: number}} o
 */
export async function runInThread({ createHandlers, buildDeps = () => ({}), progressEveryMs = 250 }) {
  const { job, cfg, cancelFlag } = workerData;
  const flag = new Int32Array(cancelFlag);
  const post = (m) => parentPort.postMessage(m);
  const log = {
    info: (m) => post({ type: 'log', level: 'info', m: String(m) }),
    warn: (m) => post({ type: 'log', level: 'warn', m: String(m) }),
    error: (m) => post({ type: 'log', level: 'error', m: String(m) }),
  };
  let last = 0;
  const ctx = {
    job,
    params: job.params || {},
    inputs: job.input_refs || {},
    log,
    get cancelled() { return Atomics.load(flag, 0) !== 0; },
    progress(fraction, message) {
      const t = Date.now();
      if (t - last < progressEveryMs && fraction < 1) return;
      last = t;
      post({ type: 'progress', fraction, message });
    },
  };
  try {
    const handler = createHandlers(buildDeps(cfg, log))[job.kind];
    if (!handler) throw new JobFailure('unknown_kind', `This worker does not know how to run "${job.kind}".`);
    const result = await handler(ctx);
    post({ type: 'result', result: result ?? null });
  } catch (e) {
    post({
      type: 'error',
      jobFailure: e instanceof JobFailure,
      stage: e instanceof JobFailure ? e.stage : null,
      message: String(e?.message || e),
      stack: e?.stack || null,
    });
  }
}
