// Gridding off the main thread (Mapping T1 MAP-T1-018, 2026-09-26). A
// module worker that runs one gridding call and posts the result back,
// the grid transferred, not copied. The engine code is the same modules
// the main thread would call (gridSync.js; importing gridRunner here made a
// worker import cycle that broke the production build).

import { runGriddingSync } from './gridSync';

self.onmessage = (e) => {
  const { id, method, points, spec, opts } = e.data;
  try {
    const r = runGriddingSync(method, points, spec, opts);
    const transfer = [r.z.buffer];
    if (r.variance && r.variance.buffer !== r.z.buffer) transfer.push(r.variance.buffer);
    self.postMessage({ id, ok: true, result: r }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || String(err) });
  }
};
