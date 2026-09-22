// Bounded brick requests (tester feedback 2026-09-22: "intermittent
// hanging that needs a page refresh"). A brick GET that never answers
// used to hold one of the BrickCache's concurrency slots forever (the
// cache releases a slot only when the fetcher's promise settles), so a
// few stalled requests starved every later slice and the viewer spun
// until a reload. These wrappers guarantee the promise SETTLES: each
// attempt is aborted after `timeoutMs`, a timed-out attempt is retried
// once, and the caller's own abort (a scrub) still wins at any moment.
//
// Worker-safe and dependency-free (the large-survey slice worker reuses
// fetchWithTimeout directly). ABORTED matches the engine's brickCache
// marker so callers keep treating a user abort as "scrubbed away".

export const ABORTED = 'BRICK_FETCH_ABORTED';
export const DEFAULT_TIMEOUT_MS = 30000;

/** A request that did not answer in time (after its retries). */
export class FetchTimeoutError extends Error {
  constructor(timeoutMs, attempts) {
    super(`The data request timed out after ${Math.round(timeoutMs / 1000)} s`
      + `${attempts > 1 ? ` (${attempts} attempts)` : ''}. Check the connection and retry.`);
    this.name = 'FetchTimeoutError';
    this.timeout = true;
  }
}

const abortedError = () => new Error(ABORTED);

/**
 * Run `attempt(signal)` with a per-attempt deadline and retries.
 * The returned promise always settles: with the attempt's value, with
 * its error, with ABORTED when `signal` aborts, or with FetchTimeoutError
 * once every attempt timed out. A timed-out attempt's own signal is
 * aborted so the underlying request stops too.
 *
 * @template T
 * @param {(signal: AbortSignal) => Promise<T>} attempt
 * @param {{signal?: AbortSignal, timeoutMs?: number, retries?: number,
 *   retryOn?: (err: Error) => boolean,
 *   setTimer?: Function, clearTimer?: Function}} [opts]
 *   retryOn: extra errors worth one more try (default: timeouts only)
 * @returns {Promise<T>}
 */
export function fetchWithTimeout(attempt, {
  signal = null, timeoutMs = DEFAULT_TIMEOUT_MS, retries = 1, retryOn = null,
  setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    let inner = null;
    let onOuterAbort = null;
    const finish = (fn, v) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimer(timer);
      if (signal && onOuterAbort) signal.removeEventListener('abort', onOuterAbort);
      fn(v);
    };
    if (signal?.aborted) { finish(reject, abortedError()); return; }
    if (signal) {
      onOuterAbort = () => {
        if (inner) inner.abort();
        finish(reject, abortedError());
      };
      signal.addEventListener('abort', onOuterAbort, { once: true });
    }
    const run = (n) => {
      if (settled) return;
      inner = new AbortController();
      const ctl = inner;
      let timedOut = false;
      timer = setTimer(() => {
        timedOut = true;
        ctl.abort();
        if (n < retries) run(n + 1);
        else finish(reject, new FetchTimeoutError(timeoutMs, n + 1));
      }, timeoutMs);
      let p;
      try {
        p = Promise.resolve(attempt(ctl.signal));
      } catch (err) {
        p = Promise.reject(err);
      }
      p.then(
        (v) => { if (!timedOut) finish(resolve, v); },
        (err) => {
          if (timedOut || settled) return;       // the timer already moved on
          if (timer) clearTimer(timer);
          if (n < retries && retryOn && retryOn(err)) { run(n + 1); return; }
          finish(reject, err);
        },
      );
    };
    run(0);
  });
}

/**
 * Wrap a BrickFetcher `(path, signal) => Promise<ArrayBuffer>` with
 * fetchWithTimeout. Network failures (TypeError from fetch) retry once
 * too; HTTP errors do not.
 */
export function withBrickTimeout(fetcher, { timeoutMs = DEFAULT_TIMEOUT_MS, retries = 1 } = {}) {
  return (path, signal) => fetchWithTimeout(
    (s) => fetcher(path, s),
    {
      signal,
      timeoutMs,
      retries,
      retryOn: (err) => err instanceof TypeError,
    },
  );
}
