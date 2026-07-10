// Shared grid-a-horizon workflow used by the AI tools (and reusable by
// the Export panel): load picks, convert to world points, TPS-grid in
// the worker, return the grid + XYZ text.

import { loadHorizonGrid } from './horizonsService';
import { picksToPoints } from '../engine/gridding';
import { geomFromManifest } from '../engine/sliceAssembly';
import { writeXYZ } from '../engine/surfaceExport';

const newGriddingWorker = () =>
  new Worker(new URL('../workers/gridding.worker.js', import.meta.url), { type: 'module' });

let jobSeq = 0;

/**
 * @param {Object} p
 * @param {Object} p.manifest volume manifest (v1)
 * @param {Object} p.horizon seismic_horizons row
 * @param {'depth'|'twt'} p.domain
 * @param {number} [p.velocityFtS] constant velocity for depth conversion
 * @param {number} [p.cellM] grid cell (default: survey bin)
 * @returns {Promise<{g: Object, spec: Object, gridded: Object, xyzText: string}>}
 */
export async function gridHorizonSurface({ manifest, horizon, domain, velocityFtS = 10000, cellM = 0 }) {
  const geom = geomFromManifest(manifest);
  const picks = await loadHorizonGrid(horizon);
  const dtMs = manifest.geometry.dt_us / 1000;
  const sampleToZ = domain === 'depth'
    ? (s) => -((s * dtMs) / 1000) * (velocityFtS / 2)
    : (s) => -(s * dtMs);
  const points = picksToPoints(picks, geom, manifest.geometry.corners, sampleToZ);
  if (points.length < 3) throw new Error('Horizon has too few live picks to grid.');

  const c = manifest.geometry.corners;
  const nXl = manifest.geometry.xl.count;
  const bin = nXl > 1 ? Math.abs((c.last.x - c.first.x) / (nXl - 1)) || 25 : 25;
  const dxy = cellM > 0 ? cellM : bin;
  const x0 = Math.min(c.first.x, c.last.x);
  const x1 = Math.max(c.first.x, c.last.x);
  const y0 = Math.min(c.first.y, c.last.y);
  const y1 = Math.max(c.first.y, c.last.y);
  const spec = {
    x0, y0, dx: dxy, dy: dxy,
    nx: Math.floor((x1 - x0) / dxy) + 1,
    ny: Math.floor((y1 - y0) / dxy) + 1,
  };

  const id = ++jobSeq;
  const worker = newGriddingWorker();
  const gridded = await new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'done') resolve(msg);
      else if (msg.type === 'error') reject(new Error(msg.message));
    };
    worker.onerror = (ev) => reject(new Error(ev.message));
    worker.postMessage({ type: 'grid', id, points, spec, opts: { maxExtrapolation: 2 * dxy } });
  }).finally(() => worker.terminate());

  const g = {
    z: new Float32Array(gridded.z),
    nx: spec.nx,
    ny: spec.ny,
    dx: spec.dx,
    dy: spec.dy,
    x: Array.from({ length: spec.nx }, (_, i) => spec.x0 + i * spec.dx),
    y: Array.from({ length: spec.ny }, (_, i) => spec.y0 + i * spec.dy),
  };
  return { g, spec, gridded, xyzText: writeXYZ(g) };
}
