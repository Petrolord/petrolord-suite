// Elastic quantities a rock physicist reads first (RP-U1-007, 2026-10-01).
// Standard definitions (Mavko, Mukerji and Dvorkin, The Rock Physics
// Handbook, ch. 2 and 4):
//   acoustic impedance  AI = Vp * rho
//   shear impedance     SI = Vs * rho
//   velocity ratio      Vp/Vs
//   Poisson's ratio     nu = (Vp^2 - 2 Vs^2) / (2 (Vp^2 - Vs^2))
// Pure; SI in, SI out (AI and SI in kg/(m2 s) = (m/s)(kg/m3)).

import { EMPTY_VALUE } from '@/lib/emptyValue';
import { M_PER_FT } from '@/lib/units/registry';

const ok = (...xs) => xs.every((x) => Number.isFinite(x) && x > 0);

export const acousticImpedance = (vp, rho) => (ok(vp, rho) ? vp * rho : NaN);
export const shearImpedance = (vs, rho) => (ok(vs, rho) ? vs * rho : NaN);
export const vpVs = (vp, vs) => (ok(vp, vs) ? vp / vs : NaN);
export function poissonRatio(vp, vs) {
  if (!ok(vp, vs) || vs >= vp) return NaN;
  const a = vp * vp;
  const b = vs * vs;
  return (a - 2 * b) / (2 * (a - b));
}

/** Interval means of the elastic quantities (per-sample, then averaged). */
export function elasticMeans(vp, vs, rho, indices) {
  const acc = { ai: [0, 0], si: [0, 0], vpvs: [0, 0], pr: [0, 0] };
  const add = (k, v) => { if (Number.isFinite(v)) { acc[k][0] += v; acc[k][1] += 1; } };
  for (const i of indices) {
    add('ai', acousticImpedance(vp[i], rho[i]));
    add('si', shearImpedance(vs[i], rho[i]));
    add('vpvs', vpVs(vp[i], vs[i]));
    add('pr', poissonRatio(vp[i], vs[i]));
  }
  const m = ([s, n]) => (n ? s / n : NaN);
  return { ai: m(acc.ai), si: m(acc.si), vpvs: m(acc.vpvs), pr: m(acc.pr) };
}

/** Impedance in the display units: speed unit (m/s or ft/s; slowness views use m/s) times density unit. */
export function impedanceDisplay(siValue, velocityUnit, densityUnit) {
  if (!Number.isFinite(siValue)) return { text: EMPTY_VALUE, unit: '' };
  const speed = velocityUnit === 'ft/s' ? 'ft/s' : 'm/s';
  const dens = densityUnit === 'g/cc' ? 'g/cc' : 'kg/m3';
  let v = siValue;
  if (speed === 'ft/s') v /= M_PER_FT;
  if (dens === 'g/cc') v /= 1000;
  return { text: dens === 'g/cc' ? v.toFixed(0) : v.toExponential(4), unit: `${speed}·${dens}` };
}
