// Full SHA-256 of a picked file, in order, off the page's thread (Local
// Workspace L1: the source identity of a local volume).
// main -> worker {type:'hash', id, file} | {type:'cancel', id}
// worker -> main {type:'progress', id, done, total} | {type:'done', id, sha256} | {type:'error', id, message}
import { sha256File } from '../sha256';

const cancelled = new Set();
self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'cancel') { cancelled.add(m.id); return; }
  if (m.type !== 'hash') return;
  let last = 0;
  try {
    const sha256 = await sha256File(m.file, {
      chunkBytes: 16 * 1024 * 1024,
      isCancelled: () => cancelled.has(m.id),
      onProgress: (done, total) => {
        const now = Date.now();
        if (done < total && now - last < 500) return;
        last = now;
        self.postMessage({ type: 'progress', id: m.id, done, total });
      },
    });
    self.postMessage({ type: 'done', id: m.id, sha256 });
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: err.message });
  }
};
