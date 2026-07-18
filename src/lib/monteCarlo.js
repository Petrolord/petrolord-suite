// Canonical Monte Carlo sampling module for the Suite.
//
// Extracted from ReservoirCalc Pro's MonteCarloEngine (the sanctioned MC
// implementation per CLAUDE.md / ReservoirEngineering-Module.md §5); that
// engine now delegates its math primitives here. Any app that needs Monte
// Carlo sampling imports THIS module; do not re-implement samplers.
//
// Contents:
//   * Distribution marginals: triangular, uniform, normal, lognormal
//     (lognormal parameterized by arithmetic mean/stdDev, converted to
//     mu/sigma of the underlying normal).
//   * Gaussian-copula correlated sampling: Cholesky factor of the
//     correlation matrix applied to iid standard normals, each pushed
//     through its marginal inverse-CDF.
//   * Statistics: percentile summary with CDF points (petroleum
//     convention: P90 = low case = 10th percentile of the sorted values).
//   * Sensitivity: Pearson variance decomposition (ReservoirCalc Pro's
//     original measure) and Spearman rank correlation with average ranks
//     for ties (invariant under monotone transforms, the honest measure
//     for nonlinear-but-monotone engine responses).
//
// Every random draw goes through an injectable `rng` (defaults to
// Math.random) so tests can run seeded and reproducible.

import * as ss from 'simple-statistics';

// Distribution types that carry genuine uncertainty (a "constant" does not).
export const SPREAD_TYPES = new Set(['triangular', 'normal', 'lognormal', 'uniform']);

// Lightweight Cholesky decomposition (lower triangular). Clamps the diagonal
// at 0 so a slightly non-positive-definite correlation matrix degrades
// gracefully instead of producing NaNs.
export function cholesky(matrix) {
  const n = matrix.length;
  const L = Array(n).fill(0).map(() => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }
      if (i === j) {
        L[i][j] = Math.sqrt(Math.max(matrix[i][i] - sum, 0));
      } else {
        L[i][j] = L[j][j] === 0 ? 0 : (1.0 / L[j][j]) * (matrix[i][j] - sum);
      }
    }
  }
  return L;
}

// Box-Muller standard normal.
export function randomNormal(rng = Math.random) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Error function — Abramowitz & Stegun 7.1.26 (max abs error 1.5e-7).
export function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592)
    * t * Math.exp(-ax * ax);
  return sign * y;
}

// Standard-normal CDF Φ(x).
export function normalCDF(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// Triangular inverse CDF.
export function triInvCDF(u, a, c, b) {
  if (a === b) return a;
  if (u <= (c - a) / (b - a)) return a + Math.sqrt(u * (b - a) * (c - a));
  return b - Math.sqrt((1 - u) * (b - a) * (b - c));
}

// Does this input carry real uncertainty (vs. a constant / degenerate range)?
export function isVariable(dist) {
  if (!dist || !SPREAD_TYPES.has(dist.type)) return false;
  if (dist.type === 'triangular' || dist.type === 'uniform') {
    return Number(dist.max) > Number(dist.min);
  }
  return Number(dist.stdDev) > 0; // normal / lognormal
}

// Deterministic representative value (used for non-varying params and fallbacks).
export function representativeValue(dist) {
  if (!dist) return undefined;
  switch (dist.type) {
    case 'triangular': return Number(dist.mode);
    case 'uniform': return (Number(dist.min) + Number(dist.max)) / 2;
    case 'normal':
    case 'lognormal': return Number(dist.mean);
    case 'constant': return parseFloat(dist.value);
    default: {
      const v = dist.value ?? dist.mode ?? dist.mean;
      return v == null ? undefined : Number(v);
    }
  }
}

// Map a correlated standard-normal variate x to a value from the marginal
// distribution (the Gaussian-copula transform). For normal/lognormal
// marginals x IS the standard-normal quantile, so no Φ⁻¹ is needed; for
// triangular/uniform we push x through Φ then the marginal inverse-CDF.
export function marginalValue(dist, x) {
  switch (dist.type) {
    case 'normal':
      return Number(dist.mean) + Number(dist.stdDev) * x;
    case 'lognormal': {
      const m = Number(dist.mean);
      const sd = Number(dist.stdDev);
      const m2 = m * m;
      const sd2 = sd * sd;
      const mu = Math.log(m2 / Math.sqrt(m2 + sd2));
      const sigma = Math.sqrt(Math.log(1 + sd2 / m2));
      return Math.exp(mu + sigma * x);
    }
    case 'triangular':
      return triInvCDF(normalCDF(x), Number(dist.min), Number(dist.mode), Number(dist.max));
    case 'uniform':
      return Number(dist.min) + normalCDF(x) * (Number(dist.max) - Number(dist.min));
    default:
      return representativeValue(dist);
  }
}

/**
 * Build a correlated sampler over named distributions.
 *
 *   createCorrelatedSampler({
 *     inputs,        // { key: dist } — dist per the marginal shapes above
 *     paramOrder,    // string[] — which keys may vary, in a stable order
 *     correlations,  // optional [{ a, b, rho }] between varying keys
 *     rng,           // optional uniform RNG (defaults to Math.random)
 *   })
 *
 * Returns { varKeys, sample } where varKeys is the subset of paramOrder with
 * genuine spread and sample() draws one realization:
 *   { values: { key: number }, truncated: string[] }
 * `truncated` lists normal/lognormal keys whose draw fell outside the
 * optional finite dist.min / dist.max truncation bounds (the caller decides
 * whether to reject the realization).
 */
export function createCorrelatedSampler({ inputs, paramOrder, correlations = [], rng = Math.random }) {
  const varKeys = paramOrder.filter((p) => isVariable(inputs[p]));
  const n = varKeys.length;

  const C = Array(n).fill(0).map(() => Array(n).fill(0));
  for (let i = 0; i < n; i++) C[i][i] = 1.0;
  const setCorr = (a, b, rho) => {
    const ia = varKeys.indexOf(a);
    const ib = varKeys.indexOf(b);
    if (ia >= 0 && ib >= 0 && ia !== ib) {
      C[ia][ib] = rho;
      C[ib][ia] = rho;
    }
  };
  correlations.forEach(({ a, b, rho }) => {
    if (Number.isFinite(rho) && rho > -1 && rho < 1) setCorr(a, b, rho);
  });
  const L = cholesky(C);

  const sample = () => {
    const Z = Array.from({ length: n }, () => randomNormal(rng));
    const values = {};
    const truncated = [];
    for (let r = 0; r < n; r++) {
      let x = 0;
      for (let c = 0; c <= r; c++) x += L[r][c] * Z[c];
      const key = varKeys[r];
      const dist = inputs[key];
      const val = marginalValue(dist, x);
      if (dist.type === 'normal' || dist.type === 'lognormal') {
        const lo = Number(dist.min);
        const hi = Number(dist.max);
        if ((Number.isFinite(lo) && val < lo) || (Number.isFinite(hi) && val > hi)) {
          truncated.push(key);
        }
      }
      values[key] = val;
    }
    return { values, truncated };
  };

  return { varKeys, sample };
}

// Percentile summary with CDF points. Petroleum convention: P90 is the low
// case (10th percentile of the sorted values), P10 the high case.
export function basicStats(data) {
  if (!data || data.length === 0) return {};
  const validData = [...data].sort((a, b) => a - b);

  const getP = (p) => validData[Math.min(Math.floor(p * validData.length), validData.length - 1)];

  const cdfPoints = [];
  const step = Math.max(1, Math.floor(validData.length / 100));
  for (let i = 0; i < validData.length; i += step) {
    cdfPoints.push({ x: validData[i], y: (i / validData.length) * 100 });
  }
  cdfPoints.push({ x: validData[validData.length - 1], y: 100 });

  return {
    p90: getP(0.1),
    p50: getP(0.5),
    p10: getP(0.9),
    mean: ss.mean(validData),
    min: validData[0],
    max: validData[validData.length - 1],
    stdDev: ss.standardDeviation(validData),
    cdf: cdfPoints,
  };
}

// Ranks with average ranks for ties: [1, 2, 2, 3] -> [1, 2.5, 2.5, 4].
// (simple-statistics' sampleRankCorrelation does NOT average ties, which
// biases Spearman on tied data; this is the standard tie treatment.)
export function rankArray(values) {
  const n = values.length;
  const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = Array(n).fill(0);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && order[j + 1][0] === order[i][0]) j++;
    const avg = (i + j) / 2 + 1; // ranks are 1-based
    for (let k = i; k <= j; k++) ranks[order[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}

// Spearman rank correlation (Pearson on average ranks). Returns NaN when
// either series is constant.
export function spearman(x, y) {
  if (!x || !y || x.length !== y.length || x.length < 2) return NaN;
  const rx = rankArray(x);
  const ry = rankArray(y);
  if (ss.standardDeviation(rx) === 0 || ss.standardDeviation(ry) === 0) return NaN;
  return ss.sampleCorrelation(rx, ry);
}

/**
 * Rank-correlation sensitivity of an output against sampled inputs.
 *
 *   rankCorrelationSensitivity(inputsByKey, outputs)
 *     inputsByKey: { key: number[] } — one series per sampled parameter
 *     outputs:     number[]          — the target output, same length
 *
 * Returns [{ parameter, rho, contribution }] sorted by |rho| descending,
 * where contribution normalizes rho² across parameters to sum to 100.
 */
export function rankCorrelationSensitivity(inputsByKey, outputs) {
  if (!outputs || outputs.length < 2) return [];
  const entries = [];
  let totalRho2 = 0;
  Object.entries(inputsByKey).forEach(([parameter, series]) => {
    const rho = spearman(series, outputs);
    if (Number.isFinite(rho)) {
      entries.push({ parameter, rho });
      totalRho2 += rho * rho;
    }
  });
  if (totalRho2 === 0) return entries.map((e) => ({ ...e, contribution: 0 }));
  return entries
    .map((e) => ({ ...e, contribution: ((e.rho * e.rho) / totalRho2) * 100 }))
    .sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho));
}

// Pearson variance decomposition over MC samples (ReservoirCalc Pro's
// original sensitivity measure; kept for its tornado display).
// samples: [{ targetVol, inputs: { key: value } }]
export function varianceDecomposition(samples) {
  if (!samples || samples.length === 0) return [];
  // Derive the parameter set from what was actually sampled, so structural runs
  // (owc/goc/grvFactor) and analytic runs (area/thickness) both decompose correctly.
  const parameters = Object.keys(samples[0].inputs || {});
  const results = [];

  const outputs = samples.map((s) => s.targetVol);
  const varOut = ss.variance(outputs);
  if (varOut === 0) return [];

  let totalR2 = 0;
  parameters.forEach((param) => {
    const inputs = samples.map((s) => s.inputs[param]);
    if (ss.standardDeviation(inputs) > 0) {
      const r = ss.sampleCorrelation(inputs, outputs);
      const r2 = r * r;
      totalR2 += r2;
      results.push({ parameter: param, r2, r });
    }
  });
  if (totalR2 === 0) return [];

  return results.map((r) => ({
    parameter: r.parameter,
    contribution: (r.r2 / totalR2) * 100,
    impactDirection: r.r > 0 ? 1 : -1,
  })).sort((a, b) => b.contribution - a.contribution);
}
