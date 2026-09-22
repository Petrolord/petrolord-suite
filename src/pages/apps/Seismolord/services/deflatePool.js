// A small pool of deflate workers for the conversion (large-survey plan,
// section 3). CompressionStream('deflate-raw') runs on the thread that
// calls it, and deflate is about half the conversion's CPU (the float32
// copy is 4x the bytes of the display copy), so the conversion worker
// hands brick payloads to N helper workers and keeps decoding and
// bricking on its own thread. The engine bounds the encodes in flight
// (encodeConcurrency = pool size), so the pool never queues deeply.
//
// makeWorker is injected (the conversion worker passes a `new Worker(...)`
// factory; jest passes fakes). Protocol: post {id, buf} (buf transferred),
// receive {id, buf} or {id, error}.

/**
 * @param {number} size workers
 * @param {() => {postMessage: Function, onmessage: ?Function, terminate: Function}} makeWorker
 */
export function createDeflatePool(size, makeWorker) {
  const workers = Array.from({ length: size }, () => makeWorker());
  const idle = [...workers];
  const queue = [];
  const pending = new Map();
  let seq = 0;

  const dispatch = () => {
    while (idle.length && queue.length) {
      const w = idle.pop();
      const job = queue.shift();
      pending.set(job.id, { ...job, worker: w });
      w.postMessage({ id: job.id, buf: job.buf }, [job.buf]);
    }
  };

  for (const w of workers) {
    // eslint-disable-next-line no-param-reassign
    w.onmessage = (e) => {
      const { id, buf, error } = e.data || {};
      const job = pending.get(id);
      if (!job) return;
      pending.delete(id);
      idle.push(job.worker);
      if (error) job.reject(new Error(error));
      else job.resolve(new Uint8Array(buf));
      dispatch();
    };
    // eslint-disable-next-line no-param-reassign
    w.onerror = (e) => {
      for (const [id, job] of pending) {
        if (job.worker === w) { pending.delete(id); job.reject(new Error(e?.message || 'A compression worker failed.')); }
      }
    };
  }

  return {
    size,
    /** Compress (deflate-raw) a copy of bytes; the caller keeps its buffer. */
    deflate(bytes) {
      const copy = bytes.slice();
      return new Promise((resolve, reject) => {
        seq += 1;
        queue.push({ id: seq, buf: copy.buffer, resolve, reject });
        dispatch();
      });
    },
    close() { workers.forEach((w) => w.terminate()); },
  };
}

/** Pool size for this machine: leave a core for the conversion thread
 *  and one for the page; at least 1, at most 3. */
export function deflatePoolSize(hardwareConcurrency) {
  const n = Number.isFinite(hardwareConcurrency) ? hardwareConcurrency : 2;
  return Math.max(1, Math.min(3, n - 2));
}
