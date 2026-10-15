// Hash a file in the hash worker (page side). Resolves hex SHA-256.
import { newHashWorker } from './workers/localJobWorkerFactory';
import { sha256File } from './sha256';

let next = 1;
export function hashFileInWorker(file, { onProgress = () => {}, isCancelled = () => false } = {}) {
  if (typeof Worker === 'undefined') return sha256File(file, { onProgress, isCancelled });
  const id = next++;
  const w = newHashWorker();
  return new Promise((resolve, reject) => {
    const poll = setInterval(() => { if (isCancelled()) w.postMessage({ type: 'cancel', id }); }, 500);
    const end = (fn, v) => { clearInterval(poll); w.terminate(); fn(v); };
    w.onmessage = (e) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === 'progress') onProgress(m.done, m.total);
      else if (m.type === 'done') end(resolve, m.sha256);
      else if (m.type === 'error') end(reject, new Error(m.message));
    };
    w.onerror = (e) => end(reject, new Error(e.message || 'The hashing worker stopped.'));
    w.postMessage({ type: 'hash', id, file });
  });
}
