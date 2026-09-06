// Property population by ordinary kriging (Earth Modeling EM4,
// 2026-09-06): the Mapping kriging module (ordinary kriging, fitted
// variogram, trend removal) applied per fault block to the zone
// control points, with a variance grid so the map can show where a
// property is guessed. Keeps the G8 fallback ladder: a block with too
// few points falls to a plane, then to the weighted mean, and every
// fallback is recorded. Pure, no I/O.

import { krigePoints } from '@/lib/gridding/kriging';
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
        const r = krigePoints(pts.map((p) => ({ x: p.x, y: p.y, z: p.v })), targets, { ...vg, detrend: krige.detrend !== false, neighbours: 24 });
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
export function describeProvenance(rows) {
  return rows.map((r) => {
    const vg = r.variogram ? ` ${r.variogram.model} r${Math.round(r.variogram.range)} s${r.variogram.sill.toFixed(4)}${r.variogram.fitted ? ' fitted' : ''}` : '';
    return `block ${r.block} ${r.methodUsed}(${r.wells}w)${vg}${r.fellBack ? ' FELL BACK' : ''}${r.note ? `: ${r.note}` : ''}`;
  }).join(', ');
}
