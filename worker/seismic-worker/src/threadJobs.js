// Main-thread side of the job threads (2026-10-15, QI round 3). Two jobs used
// to share one Node event loop: while one computed (an inversion, a Radon
// pass), the other's uploads stalled until their connections dropped
// (deferred from the crop build's live test; #1134 added retries). Now each
// claimed job's handler runs in its own worker thread and this module hands
// runJob a handler map whose entries proxy to the thread, so runJob, the
// heartbeat, cancel and the queue writes are unchanged and stay on the main
// thread, which only waits on messages.
//
//   progress  -> ctx.progress (runJob throttles the heartbeat as before)
//   log       -> ctx.log
//   cancel    -> a SharedArrayBuffer flag, set when ctx.cancelled turns true
//                (a cancel request or a lost claim); a thread that has not
//                finished cancelGraceMs later is terminated
//   result    -> resolved; a JobFailure comes back as a JobFailure with its
//                stage and message; any other error as an Error
//   a thread that dies without a word (out of memory, a native crash) fails
//   the job with its exit code; the process and the other job carry on.
import { Worker } from 'node:worker_threads';
import { JobFailure } from './runJob.js';

/**
 * @param {Object} o
 * @param {string[]} o.kinds
 * @param {URL|string} o.entry the thread entry (dist/jobThread.mjs in the image)
 * @param {Object} o.cfg the worker configuration (cloned into each thread)
 * @param {number} [o.cancelPollMs]
 * @param {number} [o.cancelGraceMs]
 * @param {Object} [o.resourceLimits] worker_threads resourceLimits
 * @param {Function} [o.WorkerImpl]
 */
export function threadHandlers({ kinds, entry, cfg, cancelPollMs = 500, cancelGraceMs = 120000, resourceLimits, WorkerImpl = Worker }) {
  const plainCfg = JSON.parse(JSON.stringify(cfg));
  const run = (ctx) => new Promise((resolve, reject) => {
    const cancelFlag = new SharedArrayBuffer(4);
    const flag = new Int32Array(cancelFlag);
    const job = JSON.parse(JSON.stringify(ctx.job)); // the claimed row: plain JSON
    const w = new WorkerImpl(entry, { workerData: { job, cfg: plainCfg, cancelFlag }, ...(resourceLimits ? { resourceLimits } : {}) });
    let settled = false;
    let killTimer = null;
    const finish = (fn, v) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      if (killTimer) clearTimeout(killTimer);
      fn(v);
      // let the thread end on its own; terminate if it lingers (open handles)
      setTimeout(() => { w.terminate().catch(() => {}); }, 2000).unref?.();
    };
    const poll = setInterval(() => {
      if (!ctx.cancelled || Atomics.load(flag, 0)) return;
      Atomics.store(flag, 0, 1);
      killTimer = setTimeout(() => {
        ctx.log?.warn?.(`job ${ctx.job.id}: the thread did not stop ${Math.round(cancelGraceMs / 1000)} s after the cancel; terminating it`);
        w.terminate().catch(() => {});
        finish(resolve, null);
      }, cancelGraceMs);
      killTimer.unref?.();
    }, cancelPollMs);
    poll.unref?.();
    w.on('message', (m) => {
      if (!m || typeof m !== 'object') return;
      if (m.type === 'progress') ctx.progress(m.fraction, m.message ?? undefined);
      else if (m.type === 'log') (ctx.log?.[m.level] || ctx.log?.info)?.call(ctx.log, `job ${ctx.job.id}: ${m.m}`);
      else if (m.type === 'result') finish(resolve, m.result);
      else if (m.type === 'error') {
        if (m.jobFailure) finish(reject, new JobFailure(m.stage, m.message));
        else finish(reject, Object.assign(new Error(m.message), { stack: m.stack || `Error: ${m.message}` }));
      }
    });
    w.on('error', (e) => finish(reject, new Error(`The job's thread failed: ${e?.message || e}`)));
    w.on('exit', (code) => finish(reject, new Error(`The job's thread ended (exit code ${code}) without a result.`)));
  });
  return Object.freeze(Object.fromEntries(kinds.map((k) => [k, run])));
}
