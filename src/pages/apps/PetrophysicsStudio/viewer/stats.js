// Histogram statistics (Petrophysics Studio PS7). Pure presentation
// math — binning, cumulative fractions, depth-window masks — kept
// client-side by design: no petrophysical constants, nothing a report
// quotes (the quotable normalization fits live in the engines'
// normalize module).

/**
 * Bin the masked finite values.
 * @param {ArrayLike<number>} values
 * @param {{bins?: number, domain?: ?[number, number],
 *          mask?: ?Uint8Array, log?: boolean}} [opts]
 *   log bins in log10 space (non-positive values are excluded)
 * @returns {{edges: Float64Array, counts: Uint32Array, n: number,
 *            lo: number, hi: number, values: number[]}}
 *   edges has bins+1 entries in DATA space; values are the samples
 *   that were binned (for percentile readouts)
 */
export function histogram(values, { bins = 40, domain = null, mask = null, log = false } = {}) {
  const kept = [];
  for (let i = 0; i < values.length; i++) {
    if (mask && !mask[i]) continue;
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (log && v <= 0) continue;
    kept.push(v);
  }
  const counts = new Uint32Array(bins);
  if (!kept.length) {
    return { edges: new Float64Array(bins + 1), counts, n: 0, lo: NaN, hi: NaN, values: kept };
  }
  let lo = domain ? domain[0] : Infinity;
  let hi = domain ? domain[1] : -Infinity;
  if (!domain) {
    for (const v of kept) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (lo === hi) { lo -= 0.5; hi += 0.5; }
  }
  const tLo = log ? Math.log10(lo) : lo;
  const tHi = log ? Math.log10(hi) : hi;
  const edges = new Float64Array(bins + 1);
  for (let b = 0; b <= bins; b++) {
    const t = tLo + ((tHi - tLo) * b) / bins;
    edges[b] = log ? 10 ** t : t;
  }
  for (const v of kept) {
    const t = log ? Math.log10(v) : v;
    let b = Math.floor(((t - tLo) / (tHi - tLo)) * bins);
    if (b < 0 || b >= bins + 1) continue; // outside a fixed domain
    if (b === bins) b = bins - 1;         // hi edge inclusive
    counts[b] += 1;
  }
  return { edges, counts, n: kept.length, lo, hi, values: kept };
}

/** Cumulative fraction at each bin's RIGHT edge (0..1). */
export function cumulative(counts) {
  const out = new Float64Array(counts.length);
  let total = 0;
  for (let i = 0; i < counts.length; i++) total += counts[i];
  if (!total) return out;
  let acc = 0;
  for (let i = 0; i < counts.length; i++) {
    acc += counts[i];
    out[i] = acc / total;
  }
  return out;
}

/** Depth-window sample mask (inclusive), 1 = inside. */
export function maskForWindow(depth, top, base) {
  const mask = new Uint8Array(depth.length);
  for (let i = 0; i < depth.length; i++) {
    if (depth[i] >= top && depth[i] <= base) mask[i] = 1;
  }
  return mask;
}

/** Fraction of masked finite samples with value <= threshold (the live
 *  what-passes readout under a cutoff drag; 'above' counts >=). */
export function passingFraction(values, threshold, side = 'below', mask = null) {
  let pass = 0;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    if (mask && !mask[i]) continue;
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    n += 1;
    if (side === 'below' ? v <= threshold : v >= threshold) pass += 1;
  }
  return n ? pass / n : NaN;
}
