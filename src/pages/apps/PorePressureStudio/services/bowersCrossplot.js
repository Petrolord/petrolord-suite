// Bowers unloading picked from data (AppUpgrade PP-U2-007). Bowers (1995):
// under loading, velocity and density rise together along one trend; where
// pressure comes from fluid expansion (unloading) the velocity drops while
// the density barely changes, so the unloading samples fall below the
// loading trend on a velocity-density crossplot. The velocity where the
// reversal starts is V_max, and sigma_max is the effective stress the
// virgin (loading) curve gives at V_max. Pure; the engine does the Bowers
// arithmetic (bowersSigmaLoading).

import { bowersSigmaLoading } from '../engine/bowers';

/**
 * @param {{zBmlM: number[], dtUsPerM: (number|null)[], rhoKgM3: (number|null)[]}} input
 * @param {{topM: number, A: number, B: number, vMlFts?: number, tolerance?: number}} opts
 *   topM: the unloading top (depth below mudline); tolerance: the fraction below
 *   the loading trend that counts as unloaded (0.03)
 */
export function bowersCrossplot(input, { topM, A, B, vMlFts = 5000, tolerance = 0.03 }) {
  const pts = [];
  for (let i = 0; i < (input?.zBmlM?.length || 0); i++) {
    const dt = input.dtUsPerM[i]; const rho = input.rhoKgM3?.[i];
    if (!(dt > 0) || !(rho > 0)) continue;
    pts.push({ i, z: input.zBmlM[i], v: 1e6 / dt, rho });
  }
  if (pts.length < 10) return { error: 'The crossplot needs a density log and a sonic on at least 10 samples.' };
  const above = pts.filter((p) => p.z < topM);
  if (above.length < 5) return { error: 'Set the unloading top deeper: the loading trend needs at least 5 samples above it.' };
  // loading trend: V = a rho^b by least squares in log space (Gardner's form)
  let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
  for (const p of above) { const x = Math.log(p.rho); const y = Math.log(p.v); sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const n = above.length;
  const den = n * sxx - sx * sx;
  const b = den ? (n * sxy - sx * sy) / den : 0;
  const a = Math.exp((sy - b * sx) / n);
  const trendV = (rho) => a * rho ** b;
  const below = pts.filter((p) => p.z >= topM);
  const unloaded = below.filter((p) => p.v < (1 - tolerance) * trendV(p.rho));
  // V_max: the highest velocity on the loading branch (median of the five fastest near the top)
  const near = above.filter((p) => p.z >= topM - 300);
  const pool = (near.length >= 5 ? near : above).map((p) => p.v).sort((x, y) => y - x).slice(0, 5);
  const vMax = pool[Math.floor(pool.length / 2)];
  let sigmaMaxPa = null; let sigmaError = null;
  try { sigmaMaxPa = bowersSigmaLoading(vMax, A, B, vMlFts); } catch (e) { sigmaError = e.message; }
  return {
    points: pts.map((p) => ({ ...p, branch: p.z < topM ? 'loading' : (unloaded.includes(p) ? 'unloading' : 'below') })),
    trend: { a, b, at: trendV },
    vMaxMs: vMax,
    sigmaMaxPa,
    sigmaError,
    unloadedCount: unloaded.length,
    belowCount: below.length,
  };
}

/** A depth to start from: where the velocity, smoothed over 11 samples, peaks below the top 500 m. */
export function suggestUnloadingTop(input) {
  const v = (input?.dtUsPerM || []).map((dt) => (dt > 0 ? 1e6 / dt : NaN));
  const z = input?.zBmlM || [];
  let best = -1; let bestV = -Infinity;
  for (let i = 5; i < v.length - 5; i++) {
    if (z[i] < 500) continue;
    const w = v.slice(i - 5, i + 6).filter(Number.isFinite);
    if (w.length < 6) continue;
    const m = w.reduce((s, x) => s + x, 0) / w.length;
    if (m > bestV) { bestV = m; best = i; }
  }
  return best >= 0 ? z[best] : null;
}
