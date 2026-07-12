// Shared grid-a-horizon workflow used by the AI tools and the Export
// panel: load picks, convert to world points, TPS-grid in the worker
// (fault-blocked when the caller passes faults that cut the horizon),
// return the grid + XYZ text.

import { loadHorizonGrid, listHorizons } from './horizonsService';
import { picksToPoints, exportGridSpec } from '../engine/gridding';
import { buildFaultBlocks } from '../engine/faultBarriers';
import { surveyAffine, cellSpacing, surveyBounds, worldToIlxl } from '../engine/surveyGeometry';
import { geomFromManifest } from '../engine/sliceAssembly';
import { writeXYZ } from '../engine/surfaceExport';
import { normalizeVelocity, sampleToExportZ } from '../engine/velocityModel';
import { NULL_VALUE } from '../engine/manifest';

const NULL_F32 = Math.fround(NULL_VALUE);

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
 * @param {Array<{sticks: Array}>} [p.faults] fault stick sets; when any
 *   cuts the horizon, gridding is fault-blocked (interpolation never
 *   crosses a fault, nodes on the fault trace stay null)
 * @param {AbortSignal} [p.signal] cancels the job: the gridding worker is
 *   terminated and the promise rejects with 'Export cancelled'
 * @param {number} [p.maxExtrapolationM] distance gate: nodes farther than
 *   this from any control point stay null (in blocked mode this is the
 *   extrapolation-toward-the-fault bound). 0 / unset = 2 x cell, the
 *   long-standing default
 * @returns {Promise<{g: Object, spec: Object, gridded: Object,
 *   xyzText: string, maxExtrapolationM: number,
 *   faultInfo: {faults: number, traces: number,
 *   blocks: number}|null}>} faultInfo is null when gridding ran unblocked
 */
export async function gridHorizonSurface({
  manifest, horizon, domain, velocityFtS = 10000, cellM = 0, faults = null,
  signal = null, maxExtrapolationM = 0,
}) {
  if (signal?.aborted) throw new Error('Export cancelled');
  const geom = geomFromManifest(manifest);
  const picks = await loadHorizonGrid(horizon);
  const dtMs = manifest.geometry.dt_us / 1000;
  const model = normalizeVelocity(manifest.velocity);

  // layer-cake conversion is column-dependent: load the boundary
  // horizons' pick grids (a deleted/missing boundary loads as null —
  // the layer above then extends, per the engine convention)
  let velocityBoundaries = null;
  if (domain === 'depth' && model?.kind === 'layercake') {
    const rows = await listHorizons(horizon.volume_id);
    velocityBoundaries = await Promise.all(model.layers.slice(0, -1).map(async (l) => {
      const row = rows.find((r) => r.id === l.baseHorizonId);
      if (!row) return null;
      return loadHorizonGrid(row).catch(() => null);
    }));
  }

  const sampleToZ = domain === 'depth'
    ? (model
      ? sampleToExportZ(model, manifest.geometry.dt_us, { boundaries: velocityBoundaries })
      : (s) => -((s * dtMs) / 1000) * (velocityFtS / 2))
    : (s) => -(s * dtMs);
  const affine = surveyAffine(manifest.geometry);
  if (!affine) throw new Error('Volume has no usable survey coordinates for gridding.');
  const points = picksToPoints(picks, geom, affine, sampleToZ);
  if (points.length < 3) throw new Error('Horizon has too few live picks to grid.');

  // export grid: axis-aligned world bbox of the (possibly rotated) survey.
  // exportGridSpec clamps a bad cell to the bin and throws a clear domain
  // error (with the minimum usable cell) instead of allocating a runaway
  // node count (ML5).
  const bin = cellSpacing(affine).xl || 25;
  const b = surveyBounds(affine, manifest.geometry.il.count, manifest.geometry.xl.count);
  const spec = exportGridSpec(b, cellM, bin);
  const dxy = spec.dx;

  // fault blocks: label the horizon lattice, tag each control point
  // (same iteration order as picksToPoints), and assign every output
  // node its lattice cell's block through the inverse affine
  let nodeBlocks = null;
  let faultInfo = null;
  const invertible = Boolean(worldToIlxl(affine, spec.x0, spec.y0));
  const blocks = faults?.length && invertible ? buildFaultBlocks(faults, picks, geom) : null;
  if (blocks) {
    let k = 0;
    for (let i = 0; i < geom.nIl; i++) {
      for (let j = 0; j < geom.nXl; j++) {
        if (picks[i * geom.nXl + j] === NULL_F32) continue;
        points[k++].block = blocks.labels[i * geom.nXl + j];
      }
    }
    nodeBlocks = new Int32Array(spec.nx * spec.ny);
    for (let r = 0; r < spec.ny; r++) {
      for (let c = 0; c < spec.nx; c++) {
        const g = worldToIlxl(affine, spec.x0 + c * spec.dx, spec.y0 + r * spec.dy);
        const ci = Math.max(0, Math.min(geom.nIl - 1, Math.round(g.i)));
        const cj = Math.max(0, Math.min(geom.nXl - 1, Math.round(g.j)));
        nodeBlocks[r * spec.nx + c] = blocks.labels[ci * geom.nXl + cj];
      }
    }
    faultInfo = { faults: faults.length, traces: blocks.traces.length, blocks: blocks.count };
  }

  if (signal?.aborted) throw new Error('Export cancelled');
  const maxExtra = Number.isFinite(maxExtrapolationM) && maxExtrapolationM > 0
    ? maxExtrapolationM : 2 * dxy;
  const id = ++jobSeq;
  const worker = newGriddingWorker();
  const onAbort = () => worker.terminate();   // reject below; terminate now
  const gridded = await new Promise((resolve, reject) => {
    if (signal) {
      signal.addEventListener('abort', () => {
        onAbort();
        reject(new Error('Export cancelled'));
      }, { once: true });
    }
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'done') resolve(msg);
      else if (msg.type === 'error') reject(new Error(msg.message));
    };
    worker.onerror = (ev) => reject(new Error(ev.message));
    worker.postMessage(
      {
        type: 'grid', id, points, spec, opts: { maxExtrapolation: maxExtra },
        nodeBlocks: nodeBlocks ? nodeBlocks.buffer : undefined,
      },
      nodeBlocks ? [nodeBlocks.buffer] : [],
    );
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
  return { g, spec, gridded, xyzText: writeXYZ(g), faultInfo, maxExtrapolationM: maxExtra };
}
