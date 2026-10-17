// Properties on the fine 3D grid (Earth Modeling 3D grid upgrade,
// 2026-10-17): porosity by sequential Gaussian simulation over the whole
// zone at once (the layers are correlated with each other through the
// vertical range), facies by indicator, and the fluid zone of a cell.
// The other properties keep the existing per-layer methods (kriging,
// inverse distance, typed, constant, trend) in modelBuild.
//
// Facies (our call, documented in the STATUS and the help): indicator
// inverse distance. The upscaled facies code of each well cell (the code
// that fills the most of the cell's interval in the RP_FACIES log) gives one
// indicator per code; each indicator is interpolated over the layer by
// inverse distance (power 2) and a cell takes the code with the highest
// value (the most likely facies). Wells with no facies log say nothing, and
// a layer with no facies control takes the zone's codes. Deterministic, so a
// facies map follows the wells and never invents a body the data cannot
// show. Pure, no I/O.

import { isNull } from '@/lib/gridding/gridmath';
import { sgs3d, SGS_DEFAULTS } from './sgs';

/** Facies codes the Ekene RP_FACIES log uses (Rock Physics Studio), with display names and colours. */
export const FACIES_CODES = Object.freeze({
  0: { name: 'shale', color: '#64748b' },
  1: { name: 'oil sand', color: '#16a34a' },
  2: { name: 'brine sand', color: '#2563eb' },
  3: { name: 'shaly sand', color: '#d97706' },
});
export const faciesName = (code) => FACIES_CODES[code]?.name || `facies ${code}`;
export const faciesColor = (code) => FACIES_CODES[code]?.color || ['#7c3aed', '#db2777', '#0891b2', '#65a30d'][Math.abs(code) % 4];

/** The frame node nearest a point (metres), or -1 outside. */
export function nodeAt(spec, x, y) {
  const c = Math.round((x - spec.x0) / spec.dx); const r = Math.round((y - spec.y0) / spec.dy);
  if (c < 0 || r < 0 || c >= spec.nx || r >= spec.ny) return -1;
  return r * spec.nx + c;
}

/** The SGS parameters a definition asks for, in metres (the vertical range is typed in feet). */
export function sgsParams(def = {}, krige = {}) {
  const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : d);
  return {
    model: def.model || krige.model || SGS_DEFAULTS.model,
    rangeM: num(def.rangeM, num(krige.range, SGS_DEFAULTS.rangeM)),
    rangeVM: num(def.rangeVFt, SGS_DEFAULTS.rangeVM / 0.3048) * 0.3048,
    nugget: num(def.nugget, SGS_DEFAULTS.nugget),
    seed: Math.floor(num(def.seed, SGS_DEFAULTS.seed)),
    neighbours: Math.floor(num(def.neighbours, SGS_DEFAULTS.neighbours)),
  };
}

/**
 * Porosity of a whole zone by SGS: the layers' control points become data
 * cells (layer k, the node nearest the point), every live column is
 * simulated, the result is one Float32 grid per layer (views into one buffer).
 * @param {object} p
 * @param {object} p.spec the metre model frame
 * @param {Array<{thickness}>} p.frames the zone's layers
 * @param {(k: number) => Array<{x, y, v}>} p.pointsAt control points of layer k
 * @param {number} p.layerM the nominal layer thickness (the vertical lag)
 * @param {object} p.params sgsParams()
 * @returns {{grids: Float32Array[], provenance: object, stats: object}}
 */
export function sgsZonePorosity({ spec, frames, pointsAt, layerM, params, onProgress = null, bounds = { lo: 0, hi: 0.4 } }) {
  const N = spec.nx * spec.ny; const nk = frames.length;
  const active = new Uint8Array(N * nk);
  for (let k = 0; k < nk; k++) {
    const th = frames[k].thickness;
    for (let j = 0; j < N; j++) if (!isNull(th[j])) active[k * N + j] = 1;
  }
  const data = []; const wells = new Set();
  for (let k = 0; k < nk; k++) {
    for (const p of pointsAt(k) || []) {
      const j = nodeAt(spec, p.x, p.y);
      if (j < 0 || !active[k * N + j]) continue;
      data.push({ i: j % spec.nx, j: Math.floor(j / spec.nx), k, v: p.v });
      if (p.well) wells.add(p.well);
    }
  }
  if (!data.length) return null;
  const lo = Math.min(bounds.lo, ...data.map((d) => d.v)); const hi = Math.max(bounds.hi, ...data.map((d) => d.v));
  const r = sgs3d({
    nx: spec.nx, ny: spec.ny, nk, dx: spec.dx, dy: spec.dy, dz: Math.max(1e-3, layerM), active, data,
    variogram: { model: params.model, rangeM: params.rangeM, rangeVM: params.rangeVM, nugget: params.nugget },
    seed: params.seed, neighbours: params.neighbours, bounds: { lo, hi }, onProgress,
  });
  const grids = [];
  for (let k = 0; k < nk; k++) {
    const g = r.values.subarray(k * N, (k + 1) * N);
    // a null column stays the grid's null (the volumes and the views read it so)
    for (let j = 0; j < N; j++) if (!Number.isFinite(g[j])) g[j] = 1e30;
    grids.push(g);
  }
  const provenance = {
    block: 0, methodUsed: 'sgs', wells: wells.size, fellBack: false,
    note: `sequential Gaussian simulation, seed ${params.seed}, ${params.model} variogram ${Math.round(params.rangeM)} m across and ${(params.rangeVM / 0.3048).toFixed(1)} ft down the layers, nugget ${params.nugget}, ${data.length} well cells`,
    variogram: { model: params.model, range: params.rangeM, rangeV: params.rangeVM, nugget: params.nugget, sill: 1, fitted: false },
  };
  return { grids, provenance, stats: r.stats, table: r.table };
}

/**
 * Facies of one layer by indicator inverse distance (see the header).
 * @param {object} spec @param {ArrayLike<number>} thickness the layer's thickness (null columns stay null)
 * @param {Array<{x, y, v}>} points upscaled codes
 * @returns {Uint8Array|null} code per node (255 where null)
 */
export function faciesLayer(spec, thickness, points, power = 2) {
  if (!points?.length) return null;
  const codes = [...new Set(points.map((p) => Math.round(p.v)))].sort((a, b) => a - b);
  const out = new Uint8Array(spec.nx * spec.ny).fill(255);
  const score = new Float64Array(codes.length);
  for (let r = 0; r < spec.ny; r++) {
    for (let c = 0; c < spec.nx; c++) {
      const j = r * spec.nx + c;
      if (isNull(thickness[j])) continue;
      const x = spec.x0 + c * spec.dx; const y = spec.y0 + r * spec.dy;
      score.fill(0);
      let exact = -1;
      for (const p of points) {
        const d2 = (p.x - x) ** 2 + (p.y - y) ** 2;
        const q = codes.indexOf(Math.round(p.v));
        if (d2 < 1e-6) { exact = q; break; }
        score[q] += 1 / d2 ** (power / 2);
      }
      let best = exact;
      if (best < 0) { best = 0; for (let q = 1; q < codes.length; q++) if (score[q] > score[best]) best = q; }
      out[j] = codes[best];
    }
  }
  return out;
}

/** Fluid zone codes: 0 water, 1 oil, 2 gas. */
export const FLUID_CODES = Object.freeze({ 0: { name: 'water', color: '#2563eb' }, 1: { name: 'oil', color: '#16a34a' }, 2: { name: 'gas', color: '#dc2626' } });

/** The engine contact at a node (a number, per block, or per node), or null. */
export function contactAtNode(c, j, label = 0) {
  if (c === null || c === undefined) return null;
  if (typeof c === 'number') return Number.isFinite(c) && Math.abs(c) < 1e11 ? c : null;
  if (ArrayBuffer.isView(c) || Array.isArray(c)) { const v = c[j]; return Number.isFinite(v) && Math.abs(v) < 1e11 ? v : null; }
  const v = c[String(label)];
  return Number.isFinite(v) ? v : null;
}

/** The fluid zone of a point at a depth (metres, positive down) under the engine contacts. */
export function fluidCode(depth, goc, owc) {
  if (owc !== null && depth > owc) return 0;
  if (goc !== null && depth < goc) return 2;
  // no contact at all: the engine counts the whole zone as hydrocarbon
  return 1;
}
