// Shared brick-emit backpressure for workers that stream bricks to the
// main thread for upload (ingest transcode, W2.1 attribute compute).
// The contract, proven by the ingest pipeline: the worker posts a brick
// (buffer transferred), then PARKS once MAX_UNACKED_BRICKS are awaiting
// acknowledgement; the main thread sends exactly ONE ack per completed
// upload. That pairing — not a counter on the service side — is what
// bounds upload concurrency (a Promise.race there once released every
// pending ack on a single completion, letting uploads outrun the cap).
//
// Pure logic with an injected `post` so jest drives it without a Worker.
// Waiters are a queue, not a single slot, so a future concurrent
// producer cannot drop wakeups.

export const MAX_UNACKED_BRICKS = 4;   // backpressure: don't outrun the uploads

/**
 * @param {(msg: Object, transfer?: Transferable[]) => void} post
 *   usually (msg, t) => self.postMessage(msg, t)
 */
export function createBrickChannel(post) {
  const jobs = new Map();               // id -> {cancelled, unacked, waiters}
  const state = (id) => {
    if (!jobs.has(id)) jobs.set(id, { cancelled: false, unacked: 0, waiters: [] });
    return jobs.get(id);
  };
  const wakeAll = (job) => {
    const waiting = job.waiters;
    job.waiters = [];
    for (const resolve of waiting) resolve();
  };
  return {
    /** True once cancel(id) has been received. */
    isCancelled: (id) => state(id).cancelled,

    /**
     * Post one brick message and park while the unacked window is full.
     * Throws `cancelMessage` if the job is (or becomes) cancelled.
     */
    async sendBrick(id, msg, transfer, { max = MAX_UNACKED_BRICKS, cancelMessage = 'Job cancelled.' } = {}) {
      const job = state(id);
      if (job.cancelled) throw new Error(cancelMessage);
      post(msg, transfer);
      job.unacked += 1;
      while (job.unacked >= max && !job.cancelled) {
        await new Promise((resolve) => { job.waiters.push(resolve); });
      }
      if (job.cancelled) throw new Error(cancelMessage);
    },

    /** One upload finished — open the window by one brick. */
    ack(id) {
      const job = state(id);
      job.unacked -= 1;
      wakeAll(job);
    },

    /** Abort the job; parked producers wake and throw. */
    cancel(id) {
      const job = state(id);
      job.cancelled = true;
      wakeAll(job);
    },
  };
}
