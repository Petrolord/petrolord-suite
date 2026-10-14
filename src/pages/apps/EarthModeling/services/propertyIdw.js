// Inverse distance weighting (Earth Modeling, Ekene walk 2026-10-14): a
// deterministic interpolator beside kriging, for a field with few wells
// where a variogram cannot be fitted. Each node is the mean of the control
// values weighted by 1 / distance^power (power 2 by default); a node on a
// control point takes its value exactly. Per fault block, as the other
// methods: a block's own wells, or the weighted mean of all wells when the
// block has none (recorded as a fallback). Pure.

import { NULL_VALUE } from '@/lib/gridding/numeric';

export const DEFAULT_IDW_POWER = 2;

/** IDW at one point. @param {Array<{x,y,v}>} pts */
export function idwAt(pts, x, y, power = DEFAULT_IDW_POWER) {
  let sw = 0; let sv = 0;
  for (const p of pts) {
    const d2 = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d2 < 1e-12) return p.v;
    const w = 1 / d2 ** (power / 2);
    sw += w; sv += w * p.v;
  }
  return sw > 0 ? sv / sw : NaN;
}

/** Thickness-weighted mean (the constant fallback). */
const wmean = (pts) => {
  let sw = 0; let sv = 0;
  for (const p of pts) { const w = Number.isFinite(p.w) && p.w > 0 ? p.w : 1; sw += w; sv += w * p.v; }
  return sw > 0 ? sv / sw : NaN;
};

/**
 * @param {{x0,y0,dx,dy,nx,ny}} spec metre frame
 * @param {Int32Array|null} labels block labels
 * @param {Object<number, Array>} byBlock control points per block
 * @param {Array} all every control point
 * @param {{power?: number}} [opts]
 * @returns {{z: Float64Array, provenance: Array}}
 */
export function populateZonePropertyIdw(spec, labels, byBlock, all, { power = DEFAULT_IDW_POWER } = {}) {
  const pw = Number(power) > 0 ? Number(power) : DEFAULT_IDW_POWER;
  const blocks = labels ? [...new Set(labels)].sort((a, b) => a - b) : [0];
  const z = new Float64Array(spec.nx * spec.ny).fill(NULL_VALUE);
  const provenance = [];
  for (const block of blocks) {
    let pts = byBlock[block] || [];
    let fell = false;
    if (!pts.length) { pts = all; fell = true; }
    if (!pts.length) { provenance.push({ block, methodUsed: 'none', wells: 0, fellBack: true }); continue; }
    const c = fell ? wmean(pts) : null;
    for (let r = 0; r < spec.ny; r++) {
      for (let col = 0; col < spec.nx; col++) {
        const j = r * spec.nx + col;
        if ((labels ? labels[j] : 0) !== block) continue;
        z[j] = fell ? c : idwAt(pts, spec.x0 + col * spec.dx, spec.y0 + r * spec.dy, pw);
      }
    }
    provenance.push({ block, methodUsed: fell ? 'constant' : 'idw', wells: pts.length, fellBack: fell, ...(fell ? {} : { note: `power ${pw}` }) });
  }
  return { z, provenance };
}
