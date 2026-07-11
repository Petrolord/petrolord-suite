// Shared grid-a-horizon workflow used by the AI tools (and reusable by
// the Export panel): load picks, convert to world points, TPS-grid in
// the worker, return the grid + XYZ text.

import { loadHorizonGrid } from './horizonsService';
import { picksToPoints } from '../engine/gridding';
import { surveyAffine, cellSpacing, surveyBounds } from '../engine/surveyGeometry';
import { geomFromManifest } from '../engine/sliceAssembly';
import { writeXYZ } from '../engine/surfaceExport';
import { normalizeVelocity, sampleToExportZ } from '../engine/velocityModel';

const newGriddingWorker = () =>
  new Worker(new URL('../workers/gridding.worker.js', import.meta.url), { type: 'module' });

let jobSeq = 0;

/**
 * @param {Object} p
 * @param {Object} p.manifest volume manifest (v1)
 * @param {Object} p.horizon seismic_horizons row
 * @param {'depth'|'twt'} p.domain
 * @param {number} [p.velocityFtS] constant-velocity FALLBACK for depth
 *   conversion — the manifest's persisted velocity model wins when set
 * @param {number} [p.cellM] grid cell (default: survey bin)
 * @returns {Promise<{g: Object, spec: Object, gridded: Object, xyzText: string}>}
 */
export async function gridHorizonSurface({ manifest, horizon, domain, velocityFtS = 10000, cellM = 0 }) {
  const geom = geomFromManifest(manifest);
  const picks = await loadHorizonGrid(horizon);
  const dtMs = manifest.geometry.dt_us / 1000;
  const model = normalizeVelocity(manifest.velocity);
  const sampleToZ = domain === 'depth'
    ? (model
      ? sampleToExportZ(model, manifest.geometry.dt_us)
      : (s) => -((s * dtMs) / 1000) * (velocityFtS / 2))
    : (s) => -(s * dtMs);
  const affine = surveyAffine(manifest.geometry);
  if (!affine) throw new Error('Volume has no usable survey coordinates for gridding.');
  const points = picksToPoints(picks, geom, affine, sampleToZ);
  if (points.length < 3) throw new Error('Horizon has too few live picks to grid.');

  // export grid: axis-aligned world bbox of the (possibly rotated) survey
  const bin = cellSpacing(affine).xl || 25;
  const dxy = cellM > 0 ? cellM : bin;
  const b = surveyBounds(affine, manifest.geometry.il.count, manifest.geometry.xl.count);
  const spec = {
    x0: b.x0, y0: b.y0, dx: dxy, dy: dxy,
    nx: Math.floor((b.x1 - b.x0) / dxy) + 1,
    ny: Math.floor((b.y1 - b.y0) / dxy) + 1,
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
