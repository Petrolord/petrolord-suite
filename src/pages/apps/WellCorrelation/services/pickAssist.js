// Assisted picking (AppUpgrade WC-U2-009), SUGGESTIONS ONLY (programme
// decision 2026-09-29: correlation stays interpreter-driven). The engine
// proposes a pick with the reason it has, and the interpreter accepts or
// rejects each one; nothing here writes.
//
//  lag:  the log pattern around a picked top in a reference well is slid
//        along the target well; the lag with the highest Pearson correlation
//        proposes the pick, if r is at least MIN_R (else no suggestion, with
//        the best r said).
//  snap: the strongest change of the log within a window of a pick (the
//        inflection a geologist would pick on) proposes a small move.
// Uniform resampling at the finer of the two sample steps; NaN samples are
// left out of each correlation. Closed form; validated against known shifts
// in __tests__/pickAssist.test.js (engine gate, negative controls included).

export const MIN_R = 0.6;

/**
 * Where to start looking in the target: between the nearest tops both wells
 * carry above and below the reference pick (proportionally), or by the
 * offset of the one shared top, else null (the caller uses the displayed
 * depth). Returns the seed and the words for the reason.
 */
export function bracketSeed(refTops, tgtTops, refMd) {
  const tgtBy = new Map(tgtTops.map((t) => [t.name, t.md_m]));
  const shared = refTops.filter((t) => tgtBy.has(t.name) && Number.isFinite(t.md_m) && Math.abs(t.md_m - refMd) > 1e-6);
  const above = shared.filter((t) => t.md_m < refMd).sort((a, b) => b.md_m - a.md_m)[0];
  const below = shared.filter((t) => t.md_m > refMd).sort((a, b) => a.md_m - b.md_m)[0];
  if (above && below) {
    const f = (refMd - above.md_m) / (below.md_m - above.md_m);
    const ta = tgtBy.get(above.name); const tb = tgtBy.get(below.name);
    if (tb > ta) return { md: ta + f * (tb - ta), how: `between ${above.name} and ${below.name}` };
  }
  const one = above || below;
  if (one) return { md: refMd + (tgtBy.get(one.name) - one.md_m), how: `by the offset of ${one.name}` };
  return null;
}

/** Linear sample of a (depth ascending) curve at md; NaN outside or across a NaN. */
export function sampleAt(depth, values, md) {
  const n = depth?.length || 0;
  if (n < 2 || !(md >= depth[0]) || !(md <= depth[n - 1])) return NaN;
  let lo = 0; let hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (depth[m] <= md) lo = m; else hi = m; }
  const d = depth[hi] - depth[lo];
  const a = values[lo]; const b = values[hi];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return d > 0 ? a + ((md - depth[lo]) / d) * (b - a) : a;
}

function stepOf(depth) {
  for (let i = 1; i < (depth?.length || 0); i++) { const s = depth[i] - depth[i - 1]; if (s > 0) return s; }
  return NaN;
}

function pearson(x, y) {
  let n = 0; let sx = 0; let sy = 0; let sxx = 0; let syy = 0; let sxy = 0;
  for (let i = 0; i < x.length; i++) {
    const a = x[i]; const b = y[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    n += 1; sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b;
  }
  if (n < 5) return { r: NaN, n };
  const cov = sxy - (sx * sy) / n; const vx = sxx - (sx * sx) / n; const vy = syy - (sy * sy) / n;
  return { r: vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : NaN, n };
}

/**
 * Suggest where a top picked in a reference well sits in a target well.
 * @param {{depth, values, topMd}} ref @param {{depth, values, seedMd}} tgt MD in metres
 * @param {{halfWindowM?: number, maxLagM?: number}} [opts]
 * @returns {{md: number, lagM: number, r: number} | {none: true, bestR: number}}
 */
export function lagSuggestion(ref, tgt, { halfWindowM = 20, maxLagM = 30 } = {}) {
  const step = Math.min(stepOf(ref.depth), stepOf(tgt.depth));
  if (!(step > 0)) return { none: true, bestR: NaN };
  const n = Math.round((2 * halfWindowM) / step) + 1;
  const refWin = Array.from({ length: n }, (_, k) => sampleAt(ref.depth, ref.values, ref.topMd - halfWindowM + k * step));
  let best = { r: -Infinity, lag: 0 };
  const lags = Math.round(maxLagM / step);
  // the target resampled once over every lag's window, then slid by index
  const t0 = tgt.seedMd - lags * step - halfWindowM;
  const tAll = Array.from({ length: n + 2 * lags }, (_, k) => sampleAt(tgt.depth, tgt.values, t0 + k * step));
  for (let j = -lags; j <= lags; j++) {
    const lag = j * step;
    const tw = tAll.slice(j + lags, j + lags + n);
    const { r } = pearson(refWin, tw);
    // equal matches (a repetitive log) prefer the smaller move from the seed
    if (Number.isFinite(r) && (r > best.r + 1e-9 || (Math.abs(r - best.r) <= 1e-9 && Math.abs(lag) < Math.abs(best.lag)))) best = { r, lag };
  }
  if (!(best.r >= MIN_R)) return { none: true, bestR: Number.isFinite(best.r) ? best.r : NaN };
  return { md: tgt.seedMd + best.lag, lagM: best.lag, r: best.r };
}

/**
 * The strongest change of a log within ±windowM of md (a smoothed first
 * difference over `smoothM`), as the inflection a pick could snap to.
 * @returns {{md: number, from: number, to: number} | null}
 */
export function snapSuggestion(depth, values, md, { windowM = 5, smoothM = 1 } = {}) {
  const step = stepOf(depth);
  if (!(step > 0)) return null;
  const h = Math.max(step, smoothM);
  let best = null;
  for (let z = md - windowM; z <= md + windowM + 1e-9; z += step) {
    const a = sampleAt(depth, values, z - h); const b = sampleAt(depth, values, z + h);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const g = Math.abs(b - a);
    if (!best || g > best.g + 1e-12) best = { md: z, g, from: a, to: b };
  }
  return best ? { md: best.md, from: best.from, to: best.to } : null;
}
