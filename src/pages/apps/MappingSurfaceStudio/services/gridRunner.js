// One door for every gridding method (Mapping T1 MAP-T1-018): runs in a
// module worker when the browser has one, so a large grid never freezes
// the page, and synchronously otherwise (jest, very old browsers).

import { gridSurface, gridSurfaceBlocked } from '@/lib/gridding/gridding';
import { krigeSurface } from '@/lib/gridding/kriging';
import { gridTensionSpline } from '@/lib/gridding/tensionSpline';
import { createMappingGridWorker } from './mappingGridWorkerFactory';

/** @param {'tps'|'blocked'|'kriging'|'tension'} method */
export function runGriddingSync(method, points, spec, opts = {}) {
  if (method === 'kriging') return krigeSurface(points, spec, opts);
  if (method === 'tension') return gridTensionSpline(points, spec, opts);
  if (method === 'blocked') return gridSurfaceBlocked(points, spec, opts);
  if (method === 'tps') return gridSurface(points, spec, opts);
  throw new Error(`Unknown gridding method "${method}".`);
}

let worker = null;
let seq = 0;
const waiting = new Map();

function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = createMappingGridWorker() || false;
    if (!worker) return worker;
    worker.onmessage = (e) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.ok) w.resolve(e.data.result); else w.reject(new Error(e.data.error));
    };
    worker.onerror = () => {
      // a worker that cannot start: fail every waiting call over to the main thread
      const pending = [...waiting.values()];
      waiting.clear();
      worker = false;
      pending.forEach((w) => { try { w.resolve(runGriddingSync(w.method, w.points, w.spec, w.opts)); } catch (err) { w.reject(err); } });
    };
  } catch {
    worker = false;
  }
  return worker;
}

/** Grid in the worker when possible; the same result shape either way. */
export function runGridding(method, points, spec, opts = {}) {
  const w = getWorker();
  if (!w) return Promise.resolve().then(() => runGriddingSync(method, points, spec, opts));
  seq += 1;
  const id = seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject, method, points, spec, opts });
    w.postMessage({ id, method, points, spec, opts });
  });
}
