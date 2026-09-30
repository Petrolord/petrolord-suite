// Tracker editing (upgrade U2-010): the Kingdom Seeker style confidence
// filter and Petrel style guided two-point tracking. Pure.
//
// Confidence filter: the correlation tracker (W3.2) stores a confidence
// per pick (the NCC coefficient, 1e30 where there is none). Rejecting
// below a threshold nulls those picks; repicking grows the horizon again
// from what was kept with the threshold as the correlation limit, so a
// rejected cell only comes back if the event now correlates at least that
// well. Picks without a confidence (manual, seeds, older tracking) are
// kept and counted, never judged.
//
// Guided tracking: between two points the user places on one line, the
// pick is the path of greatest waveform continuity (the summed normalized
// correlation of neighbouring traces' windows about the path, plus a small
// amplitude term that holds the chosen phase) that moves at most maxStep
// samples per trace and passes through both points (dynamic programming,
// Viterbi); each trace then snaps to its extremum with a parabolic
// sub-sample refinement, and traces without one (dead or weak) are
// interpolated between their neighbours. A greedy
// tracker stops or leaves the event at a gap, a weak zone or a stronger
// neighbouring event; the guided path is held by its two ends.

const NULL_F32 = Math.fround(1.0e30);
const live = (v) => v !== NULL_F32 && Number.isFinite(v);

/**
 * @param {Float32Array} picks nIl x nXl sample indices, 1e30 nulls
 * @param {?Float32Array} conf same shape, 1e30 where no confidence
 * @param {number} threshold 0..1
 * @returns {{picks: Float32Array, confidence: ?Float32Array, rejected: number[],
 *   kept: number, unscored: number}} rejected: the cell indices nulled
 */
export function confidenceFilter(picks, conf, threshold) {
  if (!(threshold >= 0 && threshold <= 1)) throw new Error('The confidence threshold must be between 0 and 1.');
  const out = Float32Array.from(picks);
  const outConf = conf ? Float32Array.from(conf) : null;
  const rejected = [];
  let kept = 0;
  let unscored = 0;
  for (let i = 0; i < picks.length; i++) {
    if (!live(picks[i])) continue;
    const c = conf ? conf[i] : NULL_F32;
    if (!live(c)) { unscored += 1; kept += 1; continue; }
    if (c < threshold) {
      rejected.push(i);
      out[i] = NULL_F32;
      if (outConf) outConf[i] = NULL_F32;
    } else kept += 1;
  }
  return {
    picks: out, confidence: outConf, rejected, kept, unscored,
  };
}

/** A histogram of confidence (10 bins over 0..1) of the live picks. */
export function confidenceHistogram(picks, conf) {
  const bins = new Array(10).fill(0);
  let scored = 0;
  for (let i = 0; i < picks.length; i++) {
    if (!live(picks[i]) || !conf || !live(conf[i])) continue;
    const b = Math.min(9, Math.max(0, Math.floor(conf[i] * 10)));
    bins[b] += 1;
    scored += 1;
  }
  return { bins, scored };
}

/**
 * Guided two-point tracking along one section.
 * @param {{data: Float32Array, width: number, height: number}} slice width = ns, height = traces
 * @param {{trace: number, sample: number}} a
 * @param {{trace: number, sample: number}} b
 * @param {{mode?: 'peak'|'trough', maxStep?: number, band?: number}} [opts]
 *   band: how far (samples) the path may leave the straight line from a to b
 * @returns {{picks: Float32Array, tracked: number, from: number, to: number}}
 */
export function guidedTrack2D(slice, a, b, { mode = 'peak', maxStep = 2, band = 40 } = {}) {
  const ns = slice.width;
  const n = slice.height;
  const picks = new Float32Array(n).fill(NULL_F32);
  if (!a || !b) throw new Error('Guided tracking needs two points on the line.');
  const [p, q] = a.trace <= b.trace ? [a, b] : [b, a];
  const t0 = Math.round(p.trace);
  const t1 = Math.round(q.trace);
  if (t1 - t0 < 1) throw new Error('Place the two guide points on different traces.');
  for (const pt of [p, q]) {
    if (!(pt.sample >= 0 && pt.sample <= ns - 1) || pt.trace < 0 || pt.trace > n - 1) {
      throw new Error('A guide point is outside the section.');
    }
  }
  const sign = mode === 'trough' ? -1 : 1;
  const step = Math.max(1, Math.round(maxStep));
  const span = t1 - t0;
  const dipTotal = Math.abs(Math.round(q.sample) - Math.round(p.sample));
  if (dipTotal > span * step) {
    throw new Error(`The two points are ${dipTotal} samples apart over ${span} traces; with at most ${step} per trace the path cannot join them. Raise the step or move a point.`);
  }
  // waveform continuity: the transition score is the normalized
  // correlation of the two traces' windows about the picks, plus a small
  // amplitude term that keeps the path on the chosen phase
  const H = 4;
  const winCorr = (ta, sa, tb, sb) => {
    let xy = 0; let xx = 0; let yy = 0;
    for (let k = -H; k <= H; k++) {
      const ia = sa + k; const ib = sb + k;
      if (ia < 0 || ib < 0 || ia >= ns || ib >= ns) continue;
      const x = slice.data[ta * ns + ia]; const y = slice.data[tb * ns + ib];
      if (!live(x) || !live(y)) continue;
      xy += x * y; xx += x * x; yy += y * y;
    }
    return xx > 0 && yy > 0 ? xy / Math.sqrt(xx * yy) : 0;
  };
  const rms = new Float64Array(n);
  for (let t = t0; t <= t1; t++) {
    let a2 = 0;
    let k = 0;
    for (let s2 = 0; s2 < ns; s2++) { const v = slice.data[t * ns + s2]; if (live(v)) { a2 += v * v; k += 1; } }
    rms[t] = k ? Math.sqrt(a2 / k) || 1 : 1;
  }
  const amp = (t, s2) => {
    const v = slice.data[t * ns + s2];
    return live(v) ? Math.max(-1, Math.min(1, (sign * v) / (3 * rms[t]))) : 0;
  };
  const lo = new Int32Array(span + 1);
  const hi = new Int32Array(span + 1);
  for (let k = 0; k <= span; k++) {
    const mid = p.sample + ((q.sample - p.sample) * k) / span;
    lo[k] = Math.max(0, Math.floor(mid - band));
    hi[k] = Math.min(ns - 1, Math.ceil(mid + band));
  }
  const s0 = Math.round(p.sample);
  const s1 = Math.round(q.sample);
  const W = ns;
  const acc = new Float64Array((span + 1) * W).fill(-Infinity);
  const from = new Int32Array((span + 1) * W).fill(-1);
  acc[s0] = 0;
  for (let k = 1; k <= span; k++) {
    const t = t0 + k;
    for (let s2 = lo[k]; s2 <= hi[k]; s2++) {
      let best = -Infinity;
      let arg = -1;
      for (let d = -step; d <= step; d++) {
        const sp = s2 + d;
        if (sp < 0 || sp >= ns) continue;
        const prev = acc[(k - 1) * W + sp];
        if (prev === -Infinity) continue;
        const v = prev + winCorr(t - 1, sp, t, s2);
        if (v > best) { best = v; arg = sp; }
      }
      if (arg < 0) continue;
      acc[k * W + s2] = best + 0.5 * amp(t, s2);
      from[k * W + s2] = arg;
    }
  }
  const score = (t, s2) => {
    const v = slice.data[t * ns + s2];
    return live(v) ? sign * v : 0;
  };
  if (acc[span * W + s1] === -Infinity) throw new Error('No path joins the two points within the search band.');
  let s = s1;
  for (let k = span; k >= 0; k--) {
    picks[t0 + k] = s;
    s = k > 0 ? from[k * W + s] : s;
  }
  // snap to the nearest extremum of the chosen phase within a step, then
  // parabolic sub-sample refinement; traces with no event there (dead or
  // weak) are interpolated between their snapped neighbours
  const snapped = new Uint8Array(n);
  snapped[t0] = 1;
  snapped[t1] = 1;
  for (let t = t0 + 1; t < t1; t++) {
    let si = picks[t];
    let bestS = -1;
    for (let d = 0; d <= step && bestS < 0; d++) {
      for (const c of d ? [si - d, si + d] : [si]) {
        if (c <= 0 || c >= ns - 1) continue;
        const y0 = score(t, c);
        if (y0 > 0 && y0 >= score(t, c - 1) && y0 >= score(t, c + 1)) {
          if (bestS < 0 || y0 > score(t, bestS)) bestS = c;
        }
      }
    }
    if (bestS < 0) continue;
    si = bestS;
    const ym = score(t, si - 1);
    const y0 = score(t, si);
    const yp = score(t, si + 1);
    const den = ym - 2 * y0 + yp;
    picks[t] = den < 0 ? si + Math.max(-0.5, Math.min(0.5, (0.5 * (ym - yp)) / den)) : si;
    snapped[t] = 1;
  }
  picks[t0] = p.sample;
  picks[t1] = q.sample;
  for (let t = t0 + 1; t < t1; t++) {
    if (snapped[t]) continue;
    let e = t;
    while (!snapped[e]) e += 1;
    const a0 = picks[t - 1];
    const a1 = picks[e];
    for (let k = t; k < e; k++) picks[k] = a0 + ((a1 - a0) * (k - t + 1)) / (e - t + 1);
    t = e;
  }
  picks[t0] = p.sample;
  picks[t1] = q.sample;
  return {
    picks, tracked: span + 1, from: t0, to: t1,
  };
}
