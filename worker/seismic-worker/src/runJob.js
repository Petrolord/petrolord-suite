// Runs one claimed job: a heartbeat timer keeps the claim alive, carries the
// latest throttled progress, and picks up cancel requests. Handlers get a
// small context and either return result refs, throw JobFailure (a stage and
// a message written for the user), or notice ctx.cancelled and return.
export class JobFailure extends Error {
  constructor(stage, message) {
    super(message);
    this.stage = stage;
  }
}

export async function runJob(job, { queue, handlers, cfg, log, makeContext = () => ({}), now = Date.now }) {
  const handler = handlers[job.kind];
  if (!handler) {
    await queue.fail(job, 'unknown_kind', `This worker does not know how to run "${job.kind}".`);
    return 'failed';
  }

  const state = { progress: Number(job.progress) || 0, message: null, cancel: false, lost: false, lastSent: 0 };
  const started = now();

  async function beat() {
    // Stamped before the await: a synchronous loop calling progress() must
    // see the throttle window as used, or every iteration would fire a beat.
    state.lastSent = now();
    try {
      const r = await queue.heartbeat(job, state.progress, state.message);
      if (r.cancelRequested) state.cancel = true;
      if (!r.stillMine) state.lost = true;
    } catch (e) {
      log.warn(`heartbeat failed for ${job.id}: ${e.message}`);
    }
  }
  const timer = setInterval(beat, cfg.heartbeatIntervalMs);
  timer.unref?.();

  const ctx = {
    job,
    params: job.params || {},
    inputs: job.input_refs || {},
    log,
    get cancelled() { return state.cancel || state.lost; },
    // Records progress; the next heartbeat carries it. Sends early only when
    // the throttle allows, so a tight loop costs nothing extra.
    progress(fraction, message) {
      state.progress = Math.max(0, Math.min(1, Number(fraction) || 0));
      if (message !== undefined) state.message = String(message).slice(0, 200);
      if (now() - state.lastSent >= cfg.progressMinIntervalMs) beat();
    },
    ...makeContext(job),
  };

  const cost = () => ({ cost_seconds: Math.round((now() - started) / 100) / 10 });
  try {
    const result = await handler(ctx);
    if (state.lost) {
      log.warn(`job ${job.id} lost its claim; dropping its result`);
      return 'lost';
    }
    if (state.cancel) {
      await queue.cancelled(job, cost());
      return 'cancelled';
    }
    await queue.succeed(job, result, cost());
    return 'succeeded';
  } catch (e) {
    if (state.lost) return 'lost';
    if (state.cancel) {
      await queue.cancelled(job, cost());
      return 'cancelled';
    }
    const stage = e instanceof JobFailure ? e.stage : 'worker_error';
    const message = e instanceof JobFailure ? e.message : `Unexpected worker error: ${e.message}`;
    if (!(e instanceof JobFailure)) log.error(`job ${job.id} crashed: ${e.stack || e.message}`);
    try {
      await queue.fail(job, stage, message, cost());
    } catch (e2) {
      log.error(`could not record failure for ${job.id} (the stale sweep will catch it): ${e2.message}`);
    }
    return 'failed';
  } finally {
    clearInterval(timer);
  }
}
