// Property population by ordinary kriging (Earth Modeling EM4,
// 2026-09-06): the Mapping kriging module (ordinary kriging, fitted
// variogram, trend removal) applied per fault block to the zone
// control points, with a variance grid so the map can show where a
// property is guessed. Keeps the G8 fallback ladder: a block with too
// few points falls to a plane, then to the weighted mean, and every
// fallback is recorded. Pure, no I/O.

import { krigePoints, fitPlane, mergeDuplicates } from '@/lib/gridding/kriging';
import { fitVariogramFromPoints, VARIOGRAM_MODELS } from '@/pages/apps/MappingSurfaceStudio/services/krigingPlan';
import { populate } from '../engine/properties';
import { NULL_VALUE } from '@/lib/gridding/numeric';

export { VARIOGRAM_MODELS };
export const MIN_OK_POINTS = 4;

/** Variogram for a property's control points: fitted, or the typed one. */
export function propertyVariogram(points, krige = {}) {
  const model = VARIOGRAM_MODELS.includes(krige.model) ? krige.model : 'spherical';
  const nugget = Number(krige.nugget) >= 0 ? Number(krige.nugget) : 0;
  if (krige.fit !== false) {
    const fit = fitVariogramFromPoints(points.map((p) => ({ x: p.x, y: p.y, z: p.v })), { model, nugget });
    return { model, range: fit.range, sill: fit.sill, nugget: Math.min(nugget, fit.sill * 0.9), fitted: true, bins: fit.bins, lag: fit.lag };
  }
  const range = Number(krige.range); const sill = Number(krige.sill);
  if (!(range > 0) || !(sill > 0)) throw new Error('Ordinary kriging needs a range and a sill, or tick fit from wells.');
  return { model, range, sill, nugget: Math.min(nugget, sill * 0.9), fitted: false };
}

/**
 * Ordinary kriging of many targets with the engine's moving neighbourhood,
 * grouped (U1, EM-U1-015, PL10). `krigePoints` builds and factorises a
 * (k+1)x(k+1) system for EVERY target; on a 401 x 401 model that took 35 s
 * per property and froze the page for minutes. Neighbouring nodes almost
 * always share their k nearest wells, so the targets are grouped by that
 * set and each group is solved once through `krigePoints` itself (a set of
 * k points is its global system). The trend plane is fitted ONCE on every
 * point, as the engine does, and the residuals are kriged. The values and
 * variances equal the engine's per-target path (gate: 1e-9).
 * @returns {{values:number[], variances:number[], groups:number}}
 */
export function krigeTargetsGrouped(points, targets, params = {}) {
  const k = Math.max(1, Math.floor(params.neighbours ?? 24));
  const clean = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && Math.abs(p.z) < 1.0e29);
  const { points: raw } = mergeDuplicates(clean);
  if (raw.length <= k) {
    const r = krigePoints(points, targets, params);
    return { values: r.values, variances: r.variances, groups: 1 };
  }
  const plane = params.detrend ? fitPlane(raw) : null;
  const at = (x, y) => (plane ? plane.a + plane.b * x + plane.c * y : 0);
  const pts = plane ? raw.map((p) => ({ ...p, z: p.z - at(p.x, p.y) })) : raw;
  const n = pts.length;
  const px = Float64Array.from(pts, (p) => p.x);
  const py = Float64Array.from(pts, (p) => p.y);
  // k nearest by (distance, index), the engine's order, by insertion
  const selD = new Float64Array(k); const selI = new Int32Array(k);
  const groups = new Map();
  for (let t = 0; t < targets.length; t++) {
    const [x, y] = targets[t];
    let m = 0;
    for (let i = 0; i < n; i++) {
      const d2 = (px[i] - x) ** 2 + (py[i] - y) ** 2;
      if (m === k && d2 >= selD[k - 1]) continue;
      let j = m < k ? m : k - 1;
      while (j > 0 && selD[j - 1] > d2) { selD[j] = selD[j - 1]; selI[j] = selI[j - 1]; j -= 1; }
      selD[j] = d2; selI[j] = i;
      if (m < k) m += 1;
    }
    const key = Array.from(selI.subarray(0, m)).sort((a, b) => a - b).join(',');
    let g = groups.get(key);
    if (!g) { g = { order: Array.from(selI.subarray(0, m)), targets: [], index: [] }; groups.set(key, g); }
    g.targets.push(targets[t]); g.index.push(t);
  }
  const values = new Array(targets.length); const variances = new Array(targets.length);
  for (const g of groups.values()) {
    const r = krigePoints(g.order.map((i) => pts[i]), g.targets, { ...params, detrend: false, neighbours: k });
    g.index.forEach((t, q) => {
      values[t] = r.values[q] + at(g.targets[q][0], g.targets[q][1]);
      variances[t] = r.variances[q];
    });
  }
  return { values, variances, groups: groups.size };
}

/** Node targets of one block (or all nodes). */
function blockTargets(spec, labels, block) {
  const targets = []; const index = [];
  for (let r = 0; r < spec.ny; r++) {
    for (let c = 0; c < spec.nx; c++) {
      const j = r * spec.nx + c;
      if (labels && labels[j] !== block) continue;
      targets.push([spec.x0 + c * spec.dx, spec.y0 + r * spec.dy]);
      index.push(j);
    }
  }
  return { targets, index };
}

/**
 * Populate one property across all blocks by ordinary kriging with the
 * ladder okrige -> trend -> constant.
 * @returns {{z: Float64Array, variance: Float64Array, provenance: Array}}
 */
export function populateZonePropertyOk(spec, labels, pointsByBlock, allPoints, krige = {}) {
  const blocks = labels ? [...new Set(labels)].sort((a, b) => a - b) : [0];
  const z = new Float64Array(spec.nx * spec.ny).fill(NULL_VALUE);
  const variance = new Float64Array(spec.nx * spec.ny).fill(NULL_VALUE);
  const provenance = [];
  for (const block of blocks) {
    let pts = pointsByBlock[block] || [];
    let usedAllWells = false;
    if (!pts.length) { pts = allPoints; usedAllWells = true; }
    if (!pts.length) { provenance.push({ block, methodUsed: 'none', wells: 0, fellBack: true }); continue; }
    let used = null; let grid = null; let vg = null; let note = null;
    if (!usedAllWells && pts.length >= MIN_OK_POINTS) {
      try {
        vg = propertyVariogram(pts, krige);
        const { targets, index } = blockTargets(spec, labels, block);
        const r = krigeTargetsGrouped(pts.map((p) => ({ x: p.x, y: p.y, z: p.v })), targets, { ...vg, detrend: krige.detrend !== false, neighbours: 24 });
        grid = new Float64Array(spec.nx * spec.ny).fill(NULL_VALUE);
        index.forEach((j, k) => { grid[j] = r.values[k]; variance[j] = r.variances[k]; });
        used = 'okrige';
      } catch (e) { note = e.message; grid = null; vg = null; }
    } else if (!usedAllWells) {
      note = `${pts.length} control points, ordinary kriging needs ${MIN_OK_POINTS}`;
    }
    if (!grid) {
      for (const m of usedAllWells ? ['constant'] : ['trend', 'constant']) {
        try { grid = populate(spec, m, pts, {}, { labels, block }); used = m; break; } catch { /* next rung */ }
      }
    }
    if (!grid) { provenance.push({ block, methodUsed: 'none', wells: pts.length, fellBack: true, note }); continue; }
    for (let j = 0; j < z.length; j++) if ((labels ? labels[j] : 0) === block) z[j] = grid[j];
    provenance.push({
      block, methodUsed: used, wells: pts.length, fellBack: usedAllWells || used !== 'okrige',
      variogram: vg ? { model: vg.model, range: vg.range, sill: vg.sill, nugget: vg.nugget, fitted: vg.fitted } : null,
      note,
    });
  }
  return { z, variance, provenance };
}

/** One line per block for the QC panel. */
export const METHOD_WORDS = Object.freeze({
  constant: 'constant (weighted mean)', trend: 'trend (plane)', krige: 'simple kriging', okrige: 'ordinary kriging', none: 'no value', shm: 'saturation-height (SCAL Studio)',
});

/** Plain words for a property's population provenance (T1 EM-T1-007). */
export function describeProvenance(rows) {
  return rows.map((r) => {
    const vg = r.variogram
      ? `, ${r.variogram.model} variogram (range ${Math.round(r.variogram.range)} m, sill ${r.variogram.sill.toFixed(4)}${r.variogram.fitted ? ', fitted' : ''})`
      : '';
    if (r.methodUsed === 'shm') return `all blocks: ${METHOD_WORDS.shm}${r.note ? ` (${r.note})` : ''}`;
    const well = `${r.wells} well${r.wells === 1 ? '' : 's'}`;
    return `block ${r.block}: ${METHOD_WORDS[r.methodUsed] || r.methodUsed} from ${well}${vg}${r.fellBack ? ', fell back' : ''}${r.note ? ` (${r.note})` : ''}`;
  }).join('; ');
}
