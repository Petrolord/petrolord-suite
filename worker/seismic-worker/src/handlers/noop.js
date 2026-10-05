// The "hello job": sleeps for params.seconds (max 600) in steps, reporting
// progress and honouring cancel. It exists to prove the queue end to end
// (enqueue, claim, progress, cancel, kill and requeue) without touching data.
import { JobFailure } from '../runJob.js';

export async function noop(ctx, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const seconds = Number(ctx.params.seconds ?? 5);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 600) {
    throw new JobFailure('validate_failed', 'seconds must be between 0 and 600.');
  }
  if (ctx.params.fail) throw new JobFailure('requested_failure', 'This test job was asked to fail.');
  const steps = Math.max(1, Math.round(seconds * 2));
  for (let i = 1; i <= steps; i += 1) {
    if (ctx.cancelled) return null;
    await sleep((seconds * 1000) / steps);
    ctx.progress(i / steps, `Step ${i} of ${steps}`);
  }
  return { slept_seconds: seconds };
}
