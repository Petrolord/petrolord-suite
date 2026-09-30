// The synchronous gridding dispatch, shared by the worker and the
// main-thread fallback. Kept apart from gridRunner.js because gridRunner
// imports the worker factory: a worker importing gridRunner made the cycle
// gridWorker -> gridRunner -> factory -> gridWorker, which the Vite 4
// production build cannot resolve (it exits early; the dev server does not
// notice).

import { gridSurface, gridSurfaceBlocked } from '@/lib/gridding/gridding';
import { krigeSurface } from '@/lib/gridding/kriging';
import { gridTensionSpline } from '@/lib/gridding/tensionSpline';
import { gridBlocked } from '@/lib/gridding/blockedGridding';

/** @param {'tps'|'blocked'|'kriging'|'tension'|'blocked-tension'|'blocked-kriging'} method
 *  blocked-* (MAP-U2-001): the spline in tension or kriging per fault block. */
export function runGriddingSync(method, points, spec, opts = {}) {
  if (method === 'blocked-tension') return gridBlocked('tension', points, spec, opts);
  if (method === 'blocked-kriging') return gridBlocked('kriging', points, spec, opts);
  if (method === 'kriging') return krigeSurface(points, spec, opts);
  if (method === 'tension') return gridTensionSpline(points, spec, opts);
  if (method === 'blocked') return gridSurfaceBlocked(points, spec, opts);
  if (method === 'tps') return gridSurface(points, spec, opts);
  throw new Error(`Unknown gridding method "${method}".`);
}
