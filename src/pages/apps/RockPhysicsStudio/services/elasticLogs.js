// The elastic set for a zone (QI programme Q1 / A2, 2026-10-06): AI, SI,
// Vp/Vs, Poisson's ratio, the moduli, lambda rho and mu rho (Goodway et al.
// 1997) and EEI at a chosen chi (Whitcombe et al. 2002), with K and the
// reference values from the zone itself. Pure; the maths is the engines'
// (elasticSet.js). SI in, SI out.

import { elasticCurves, meanK, referenceValues, eeiCurve } from '../engine/elasticSet';

export const ELASTIC_CURVES = Object.freeze([
  { key: 'ai', label: 'AI', kind: 'impedance' },
  { key: 'si', label: 'SI', kind: 'impedance' },
  { key: 'vpvs', label: 'Vp/Vs', kind: 'ratio' },
  { key: 'pr', label: "Poisson's ratio", kind: 'ratio' },
  { key: 'k', label: 'K', kind: 'modulus' },
  { key: 'mu', label: 'μ', kind: 'modulus' },
  { key: 'lambdaRho', label: 'λρ', kind: 'lmr' },
  { key: 'muRho', label: 'μρ', kind: 'lmr' },
  { key: 'eei', label: 'EEI(χ)', kind: 'impedance' },
]);

/** Display value and unit: moduli in GPa, lambda rho and mu rho in GPa·g/cc, impedances SI x factor. */
export function elasticDisplay(kind, si, impedanceFactor = 1) {
  if (!Number.isFinite(si)) return NaN;
  if (kind === 'modulus') return si / 1e9;
  if (kind === 'lmr') return si / 1e12;
  if (kind === 'impedance') return si * impedanceFactor;
  return si;
}

/**
 * Curves and zone means.
 * @returns {{curves: Object, K: number, ref: Object, chi: number, means: Object, n: number} | {error: string}}
 */
export function zoneElastic(model, indices, chiDeg = 20) {
  try {
    const curves = elasticCurves({ vp: model.vp, vs: model.vs, rho: model.rho });
    const logs = { vp: model.vp, vs: model.vs, rho: model.rho };
    const K = meanK(logs, indices);
    const ref = referenceValues(logs, indices);
    curves.eei = eeiCurve(logs, chiDeg, { K, ref });
    const means = {};
    let n = 0;
    for (const c of ELASTIC_CURVES) {
      let s = 0; let m = 0;
      for (const i of indices) { const v = curves[c.key][i]; if (Number.isFinite(v)) { s += v; m += 1; } }
      means[c.key] = m ? s / m : NaN;
      if (c.key === 'ai') n = m;
    }
    return { curves, K, ref, chi: chiDeg, means, n };
  } catch (e) {
    return { error: e.message };
  }
}
