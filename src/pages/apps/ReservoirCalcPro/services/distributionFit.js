// Distribution fitting from data (ReservoirCalc Pro upgrade U2-017): paste
// the values of an input (porosity from wells, net-to-gross from zones,
// analogue recovery factors) and get each candidate distribution the
// Monte Carlo can sample, fitted by maximum likelihood (the triangular by
// its moments), ranked by the Kolmogorov-Smirnov distance between the
// data and the fitted CDF. Parameters come back in the panel's form.
// Pure.

import { normalCDF } from '@/lib/monteCarlo';

const num = (v) => (typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.')));

/** Values from pasted text (any separators); non-numbers counted, not kept. */
export function parseValues(text) {
  const parts = String(text || '').split(/[\s,;]+/).filter(Boolean);
  const values = [];
  let skipped = 0;
  for (const p of parts) {
    const v = Number(p);
    if (Number.isFinite(v)) values.push(v); else skipped += 1;
  }
  return { values, skipped };
}

const triCdf = (x, a, c, b) => {
  if (x <= a) return 0;
  if (x >= b) return 1;
  if (x <= c) return ((x - a) ** 2) / ((b - a) * (c - a || 1e-300));
  return 1 - ((b - x) ** 2) / ((b - a) * (b - c || 1e-300));
};

/** Kolmogorov-Smirnov distance of sorted data to a CDF. */
export function ksDistance(sorted, cdf) {
  const n = sorted.length;
  let d = 0;
  for (let i = 0; i < n; i++) {
    const f = cdf(sorted[i]);
    d = Math.max(d, Math.abs(f - i / n), Math.abs((i + 1) / n - f));
  }
  return d;
}

/**
 * Fit the candidates and rank them.
 * @param {number[]} values
 * @param {{fraction?: boolean}} [o] fraction: the input is a 0 to 1 fraction (say when a fit spills outside)
 * @returns {{ok: boolean, reason?: string, n?: number, candidates?: Array<{type, dist: Object, ks: number, cdf: Function, note?: string}>, best?: Object, ksCritical?: number}}
 */
export function fitDistributions(values, { fraction = false } = {}) {
  const x = (values || []).map(num).filter(Number.isFinite).sort((a, b) => a - b);
  const n = x.length;
  if (n < 8) return { ok: false, reason: `Give at least 8 values (got ${n}); fewer cannot tell the shapes apart.` };
  const mean = x.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(x.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  if (!(sd > 0)) return { ok: false, reason: 'All the values are the same; use a constant.' };
  const lo = x[0]; const hi = x[n - 1];
  const range = hi - lo;
  const cands = [];

  // normal: maximum likelihood (sample mean and standard deviation)
  cands.push({ type: 'normal', dist: { type: 'normal', mean, stdDev: sd }, cdf: (v) => normalCDF((v - mean) / sd) });

  // lognormal: maximum likelihood on the logs, given back as the
  // arithmetic mean and standard deviation the engine takes
  if (lo > 0) {
    const L = x.map(Math.log);
    const mu = L.reduce((s, v) => s + v, 0) / n;
    const sig = Math.sqrt(L.reduce((s, v) => s + (v - mu) ** 2, 0) / (n - 1));
    const am = Math.exp(mu + (sig * sig) / 2);
    const asd = am * Math.sqrt(Math.exp(sig * sig) - 1);
    cands.push({ type: 'lognormal', dist: { type: 'lognormal', mean: am, stdDev: asd }, cdf: (v) => (v <= 0 ? 0 : normalCDF((Math.log(v) - mu) / sig)) });
  }

  // uniform: the unbiased end points (sample extremes widened by one gap)
  const gap = range / (n - 1);
  const ua = lo - gap; const ub = hi + gap;
  cands.push({ type: 'uniform', dist: { type: 'uniform', min: ua, max: ub }, cdf: (v) => Math.min(1, Math.max(0, (v - ua) / (ub - ua))) });

  // triangular: end points widened by one gap, the mode from the mean
  // (mean = (a + c + b) / 3), held inside the end points
  const ta = lo - gap; const tb = hi + gap;
  const tc = Math.min(tb, Math.max(ta, 3 * mean - ta - tb));
  cands.push({ type: 'triangular', dist: { type: 'triangular', min: ta, mode: tc, max: tb }, cdf: (v) => triCdf(v, ta, tc, tb) });

  for (const c of cands) {
    c.ks = ksDistance(x, c.cdf);
    if (fraction) {
      const outside = c.type === 'uniform' || c.type === 'triangular' ? (c.dist.min < 0 || c.dist.max > 1)
        : c.type === 'normal' ? (mean - 3 * sd < 0 || mean + 3 * sd > 1) : (c.dist.mean + 3 * c.dist.stdDev > 1);
      if (outside) c.note = 'reaches outside 0 to 1; the run truncates it there';
    }
  }
  cands.sort((a, b) => a.ks - b.ks);
  // 5 percent critical value of the one-sample KS test (large-n form).
  // The parameters are fitted from the same data, so this is lenient
  // (Lilliefors); it flags a clearly poor fit, it does not prove a good one.
  const ksCritical = 1.358 / Math.sqrt(n);
  return { ok: true, n, mean, sd, candidates: cands, best: cands[0], ksCritical };
}

/** A fitted distribution in the Probabilistic panel's form. */
export function toPanelDist(d) {
  if (d.type === 'triangular') return { type: 'triangular', p90: d.min, p50: d.mode, p10: d.max, min: d.min, max: d.max, mean: (d.min + d.mode + d.max) / 3, stdDev: 0 };
  if (d.type === 'uniform') return { type: 'uniform', min: d.min, max: d.max, p90: d.min, p50: (d.min + d.max) / 2, p10: d.max, mean: (d.min + d.max) / 2, stdDev: 0 };
  // normal and lognormal: mean and standard deviation; the triangle fields
  // hold a +/-1.28 sd spread in case the user switches the shape
  const lo = d.type === 'lognormal' ? Math.max(0, d.mean - 1.2816 * d.stdDev) : d.mean - 1.2816 * d.stdDev;
  return { type: d.type, mean: d.mean, stdDev: d.stdDev, p90: lo, p50: d.mean, p10: d.mean + 1.2816 * d.stdDev, min: lo, max: d.mean + 1.2816 * d.stdDev };
}
