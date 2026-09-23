// Job runner for the Tops to Horizons worker (the tracker runner's
// guarantees, for any job type): the promise always settles, the worker is
// always terminated when it does, cancel() terminates at once, a watchdog
// rejects a worker silent for `watchdogMs`, and token refresh requests are
// answered (or fail the job with the reason).

export const JOB_CANCELLED = 'Cancelled';

/**
 * @param {Object} p
 * @param {() => Worker} p.createWorker
 * @param {number} p.id
 * @param {'match'|'track'|'faults'} p.type
 * @param {Object} p.config
 * @param {(force?: boolean) => Promise<string>} p.getToken
 * @param {(stage: string, done: number, total: number) => void} [p.onProgress]
 * @param {number} [p.watchdogMs]
 * @returns {{promise: Promise<Object>, cancel: () => void}}
 */
export function startFrameworkJob({
  createWorker, id, type, config, getToken, onProgress = null, watchdogMs = 180000,
  setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  let worker = null;
  let settled = false;
  let dog = null;
  let rejectFn = null;
  const promise = new Promise((resolve, reject) => {
    const finish = (fn, v) => {
      if (settled) return;
      settled = true;
      if (dog) clearTimer(dog);
      try { worker?.terminate(); } catch { /* already gone */ }
      fn(v);
    };
    rejectFn = (err) => finish(reject, err);
    const pet = () => {
      if (dog) clearTimer(dog);
      dog = setTimer(() => finish(reject, new Error(
        `The job stopped responding for ${(watchdogMs / 1000).toFixed(1)} s and was stopped. Retry, or check the connection.`,
      )), watchdogMs);
    };
    try {
      worker = createWorker();
    } catch (e) {
      finish(reject, e);
      return;
    }
    worker.onmessage = (e) => {
      const msg = e.data;
      if (!msg || msg.id !== id) return;
      pet();
      if (msg.type === 'progress') {
        if (onProgress) onProgress(msg.stage, msg.done, msg.total);
      } else if (msg.type === 'need-token') {
        getToken(true).then(
          (token) => { if (!settled) worker.postMessage({ type: 'token', nonce: msg.nonce, token }); },
          (err) => finish(reject, new Error(`Stopped: the sign-in could not be refreshed (${err.message}).`)),
        );
      } else if (msg.type === 'done') {
        finish(resolve, msg.result);
      } else if (msg.type === 'error') {
        finish(reject, new Error(msg.message));
      }
    };
    worker.onerror = (ev) => {
      if (ev && ev.preventDefault) ev.preventDefault();
      finish(reject, new Error(ev?.message || 'The Tops to Horizons worker failed.'));
    };
    pet();
    worker.postMessage({ type, id, config });
  });
  return {
    promise,
    cancel: () => rejectFn && rejectFn(new Error(JOB_CANCELLED)),
  };
}
