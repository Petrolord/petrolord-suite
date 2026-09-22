// Horizon tracker job runner (tester feedback 2026-09-22, stability).
// Replaces the inline promise in ViewerPanel.runTracker, which could
// hang for good: its async onmessage awaited a token for 'need-token',
// and a throw there (signed out, refresh failure) was swallowed, so the
// worker waited forever and the UI showed "tracking" until a reload;
// Cancel only posted a message the worker might never read.
//
// Guarantees: the returned promise always settles; the worker is always
// terminated when it does; cancel() terminates at once and rejects with
// 'Tracking cancelled'; a watchdog rejects when the worker has been
// silent for `watchdogMs` (it reports progress every 256 traces, so a
// silence that long is a stall).

export const TRACK_CANCELLED = 'Tracking cancelled';

/**
 * @param {Object} p
 * @param {() => Worker} p.createWorker
 * @param {number} p.id job id echoed by the worker
 * @param {Object} p.config the track3d config (token already filled in)
 * @param {(force?: boolean) => Promise<string>} p.getToken
 * @param {(tracked: number, total: number) => void} [p.onProgress]
 * @param {number} [p.watchdogMs]
 * @returns {{promise: Promise<{picks: Float32Array, confidence: ?Float32Array}>,
 *   cancel: () => void}}
 */
export function startTrackerJob({
  createWorker, id, config, getToken, onProgress = null, watchdogMs = 120000,
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
        `Tracking stopped responding for ${Math.round(watchdogMs / 1000)} s and was stopped. Retry, or check the connection.`,
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
        if (onProgress) onProgress(msg.tracked, msg.total);
      } else if (msg.type === 'need-token') {
        getToken(true).then(
          (token) => { if (!settled) worker.postMessage({ type: 'token', nonce: msg.nonce, token }); },
          (err) => finish(reject, new Error(`Tracking stopped: the sign-in could not be refreshed (${err.message}).`)),
        );
      } else if (msg.type === 'done') {
        finish(resolve, {
          picks: new Float32Array(msg.picks),
          confidence: msg.confidence ? new Float32Array(msg.confidence) : null,
        });
      } else if (msg.type === 'error') {
        finish(reject, new Error(msg.message));
      }
    };
    worker.onerror = (ev) => {
      if (ev && ev.preventDefault) ev.preventDefault();
      finish(reject, new Error(ev?.message || 'The tracking worker failed.'));
    };
    pet();
    worker.postMessage({ type: 'track3d', id, config });
  });
  return {
    promise,
    cancel: () => rejectFn && rejectFn(new Error(TRACK_CANCELLED)),
  };
}
