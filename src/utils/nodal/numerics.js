/**
 * Shared numerical utilities for the Nodal Analysis Studio engine (NA1).
 *
 * Pure functions, no React, oilfield units throughout the engine. Kept
 * app-local (src/utils/nodal) so the nodal engine has no runtime coupling
 * beyond the audited PVT layer in src/utils/fluidStudioCalculations.js.
 */

/** Evenly spaced grid of n points from a to b inclusive. */
export const linspace = (a, b, n) => {
  const count = Math.max(2, Math.floor(n));
  const out = new Array(count);
  const step = (b - a) / (count - 1);
  for (let i = 0; i < count; i += 1) out[i] = a + step * i;
  out[count - 1] = b;
  return out;
};

/** Log-spaced grid of n points from a to b inclusive (a, b > 0). */
export const logspace = (a, b, n) => {
  if (!(a > 0) || !(b > 0)) return linspace(a, b, n);
  return linspace(Math.log(a), Math.log(b), n).map((x) => Math.exp(x));
};

/**
 * Piecewise-linear interpolation of y at x over tabulated (xs, ys).
 * xs must be strictly monotonic (either direction). Clamps at the ends.
 */
export const linearInterp = (xs, ys, x) => {
  const n = xs.length;
  if (n === 0) return NaN;
  if (n === 1) return ys[0];
  const ascending = xs[n - 1] >= xs[0];
  const lo = ascending ? xs[0] : xs[n - 1];
  const hi = ascending ? xs[n - 1] : xs[0];
  const xc = Math.min(Math.max(x, lo), hi);
  let i = 0;
  for (; i < n - 2; i += 1) {
    const a = xs[i];
    const b = xs[i + 1];
    if (ascending ? xc <= b : xc >= b) break;
  }
  const x0 = xs[i];
  const x1 = xs[i + 1];
  const t = x1 === x0 ? 0 : (xc - x0) / (x1 - x0);
  return ys[i] + t * (ys[i + 1] - ys[i]);
};

/**
 * Indices i where ys[i] and ys[i+1] straddle zero (sign change or exact
 * zero at i+1). Non-finite samples break the chain rather than pair
 * across a gap.
 */
export const findSignChanges = (ys) => {
  const out = [];
  for (let i = 0; i < ys.length - 1; i += 1) {
    const a = ys[i];
    const b = ys[i + 1];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (a === 0) {
      out.push(i);
    } else if (a * b < 0) {
      out.push(i);
    }
  }
  return out;
};

/**
 * Brent's method root finder on [a, b] with f(a) and f(b) of opposite sign.
 * Returns { root, converged, iterations }. Standard Brent (bisection +
 * secant + inverse quadratic) per Press et al. formulation.
 */
export const brentSolve = (f, a, b, { tol = 1e-8, maxIter = 100 } = {}) => {
  let xa = a;
  let xb = b;
  let fa = f(xa);
  let fb = f(xb);
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || fa * fb > 0) {
    return { root: NaN, converged: false, iterations: 0 };
  }
  if (fa === 0) return { root: xa, converged: true, iterations: 0 };
  if (fb === 0) return { root: xb, converged: true, iterations: 0 };
  let xc = xa;
  let fc = fa;
  let d = xb - xa;
  let e = d;
  for (let iter = 1; iter <= maxIter; iter += 1) {
    if (fb * fc > 0) {
      xc = xa;
      fc = fa;
      d = xb - xa;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      xa = xb; xb = xc; xc = xa;
      fa = fb; fb = fc; fc = fa;
    }
    const tol1 = 2 * Number.EPSILON * Math.abs(xb) + 0.5 * tol;
    const xm = 0.5 * (xc - xb);
    if (Math.abs(xm) <= tol1 || fb === 0) {
      return { root: xb, converged: true, iterations: iter };
    }
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p;
      let q;
      if (xa === xc) {
        p = 2 * xm * s;
        q = 1 - s;
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (xb - xa) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = xm;
        e = d;
      }
    } else {
      d = xm;
      e = d;
    }
    xa = xb;
    fa = fb;
    xb += Math.abs(d) > tol1 ? d : (xm > 0 ? tol1 : -tol1);
    fb = f(xb);
  }
  return { root: xb, converged: false, iterations: maxIter };
};

/**
 * Ordinary least squares y = slope x + intercept.
 * Returns { slope, intercept, r2 } or null when degenerate.
 */
export const linearFit = (xs, ys) => {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  let sx = 0; let sy = 0; let sxx = 0; let sxy = 0; let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += xs[i]; sy += ys[i];
    sxx += xs[i] * xs[i];
    sxy += xs[i] * ys[i];
    syy += ys[i] * ys[i];
  }
  const den = n * sxx - sx * sx;
  if (den === 0) return null;
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  const ssTot = syy - (sy * sy) / n;
  let ssRes = 0;
  for (let i = 0; i < n; i += 1) {
    const r = ys[i] - (slope * xs[i] + intercept);
    ssRes += r * r;
  }
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;
  return { slope, intercept, r2 };
};

/** Clamp v into [lo, hi]. */
export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** Coerce to finite number with fallback. */
export const num = (v, fallback = 0) => {
  const x = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(x) ? x : fallback;
};
