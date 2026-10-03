/**
 * The two small least-squares fits behind the laboratory match of Fluid
 * Systems Studio (FLUID-U2-004, -008), with the standard error of each
 * estimate. Kept apart so the match and its gate call the same code; the
 * gate holds them against the certified values of the NIST Statistical
 * Reference Datasets (NoInt1 and Norris).
 *
 * Pure.
 */

/**
 * y = b x, no intercept.
 * @returns {?{b: number, se: ?number, dof: number, ssr: number, residualSd: ?number}}
 *   null when x holds no information; `se` is null with one point
 */
export function fitThroughOrigin(x, y) {
  const n = Math.min(x.length, y.length);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) { sxx += x[i] * x[i]; sxy += x[i] * y[i]; }
  if (!(sxx > 0)) return null;
  const b = sxy / sxx;
  let ssr = 0;
  for (let i = 0; i < n; i += 1) ssr += (y[i] - b * x[i]) ** 2;
  const dof = n - 1;
  const s2 = dof >= 1 ? ssr / dof : null;
  return { b, se: s2 === null ? null : Math.sqrt(s2 / sxx), dof, ssr, residualSd: s2 === null ? null : Math.sqrt(s2) };
}

/**
 * y = a x1 + b x2: two regressors, no separate intercept (pass x2 = 1 for
 * the ordinary straight line y = a x + b).
 * @returns {?{a: number, b: number, seA: ?number, seB: ?number, dof: number, ssr: number, residualSd: ?number}}
 *   null when the two regressors cannot be told apart
 */
export function fitTwoRegressors(x1, x2, y) {
  const n = Math.min(x1.length, x2.length, y.length);
  let s11 = 0; let s12 = 0; let s22 = 0; let s1y = 0; let s2y = 0;
  for (let i = 0; i < n; i += 1) {
    s11 += x1[i] * x1[i]; s12 += x1[i] * x2[i]; s22 += x2[i] * x2[i];
    s1y += x1[i] * y[i]; s2y += x2[i] * y[i];
  }
  const det = s11 * s22 - s12 * s12;
  if (!(det > 1e-12 * s11 * s22)) return null;
  const a = (s22 * s1y - s12 * s2y) / det;
  const b = (s11 * s2y - s12 * s1y) / det;
  let ssr = 0;
  for (let i = 0; i < n; i += 1) ssr += (y[i] - a * x1[i] - b * x2[i]) ** 2;
  const dof = n - 2;
  const s2 = dof >= 1 ? ssr / dof : null;
  return {
    a, b, dof, ssr,
    seA: s2 === null ? null : Math.sqrt((s2 * s22) / det),
    seB: s2 === null ? null : Math.sqrt((s2 * s11) / det),
    residualSd: s2 === null ? null : Math.sqrt(s2),
  };
}

/**
 * The mean of a sample with its standard error (the viscosity multiplier
 * is the exponential of the mean log ratio).
 */
export function meanWithError(values) {
  const n = values.length;
  if (!n) return null;
  const mean = values.reduce((a, v) => a + v, 0) / n;
  if (n < 2) return { mean, se: null, dof: 0 };
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
  return { mean, se: sd / Math.sqrt(n), dof: n - 1 };
}
