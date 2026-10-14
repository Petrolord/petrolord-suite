// Upload retries for the worker's storage client (2026-10-14). The worker runs
// two jobs in one Node process; while one computes, the other's in-flight
// uploads can stall until the connection drops ("fetch failed", no status).
// The two-stage SEG-Y upload retried on its own; the derived-volume handlers
// (attribute, inversion, AVO, property, matched stacks) uploaded each brick
// once and failed the whole job on one dropped connection. Found by the crop
// programme's live pilot test: a pilot inversion running beside a full one
// failed twice, and passed alone.
//
// Retries a dropped connection, 408, 429 and 5xx; any other answer (a 4xx
// such as over quota or not allowed) is returned at once. An upload that
// reaches the store and is then retried comes back as 'exists' (the object is
// there), which every caller already accepts.

const retryable = (e) => e?.status == null || e.status === 408 || e.status === 429 || e.status >= 500;

/**
 * @param {Object} storage upload(path, bytes, opts), list(dir)
 * @param {{attempts?: number, baseMs?: number, sleep?: Function, log?: Object}} [o]
 */
export function retryingStorage(storage, { attempts = 5, baseMs = 1000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = null } = {}) {
  const withRetry = async (what, fn) => {
    for (let a = 1; ; a += 1) {
      try {
        return await fn();
      } catch (e) {
        if (a >= attempts || !retryable(e)) throw e;
        log?.warn?.(`${what}: ${e.message}; retry ${a} of ${attempts - 1}`);
        await sleep(baseMs * 2 ** (a - 1));
      }
    }
  };
  return {
    ...storage,
    upload: (path, bytes, opts) => withRetry(`upload ${path}`, () => storage.upload(path, bytes, opts)),
    list: (dir) => withRetry(`list ${dir}`, () => storage.list(dir)),
  };
}
