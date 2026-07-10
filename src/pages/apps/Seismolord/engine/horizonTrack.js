// Horizon tracking engine (Phase 3): snap picking with parabolic
// sub-sample refinement, guided 2D autotrack along a section, and 3D
// seeded region-grow over an async trace accessor (bricks arrive through
// the cache; the tracker never sees the file).
//
// All z values are SAMPLE indices (float, sub-sample) — time increases
// downward with sample index (domain rule). Untracked/lost positions are
// NULL_VALUE and nulls never enter statistics.

import { NULL_VALUE } from './manifest';

const NULL_F32 = Math.fround(NULL_VALUE);
const isNull = (v) => !Number.isFinite(v) || Math.abs(v) > 1.0e29;

export const SNAP_MODES = ['peak', 'trough'];

/**
 * Snap to the nearest extremum of the requested polarity within a sample
 * window, then refine with a 3-point parabolic fit.
 *
 * @param {Float32Array} trace
 * @param {number} sample centre of the search window (float ok)
 * @param {{mode?: 'peak'|'trough', window?: number}} [opts]
 * @returns {{sample: number, amp: number}|null} null if no extremum found
 */
export function snapPick(trace, sample, { mode = 'peak', window = 3 } = {}) {
  const ns = trace.length;
  const c = Math.round(sample);
  const lo = Math.max(1, c - window);
  const hi = Math.min(ns - 2, c + window);
  if (lo > hi) return null;

  const sign = mode === 'trough' ? -1 : 1;
  let best = -1;
  let bestVal = -Infinity;
  for (let i = lo; i <= hi; i++) {
    const vm = trace[i - 1];
    const v0 = trace[i];
    const vp = trace[i + 1];
    if (isNull(v0) || isNull(vm) || isNull(vp)) continue;
    const a0 = sign * v0;
    // strict local extremum of the requested polarity, positive lobe
    if (a0 > 0 && a0 >= sign * vm && a0 >= sign * vp && a0 > bestVal) {
      best = i;
      bestVal = a0;
    }
  }
  if (best < 0) return null;

  // parabolic refinement: x* = x0 + 0.5 (a-1 - a+1) / (a-1 - 2 a0 + a+1)
  const am = trace[best - 1];
  const a0 = trace[best];
  const ap = trace[best + 1];
  const denom = am - 2 * a0 + ap;
  let refined = best;
  if (denom !== 0) {
    const d = (0.5 * (am - ap)) / denom;
    if (Math.abs(d) <= 1) refined = best + d;
  }
  return { sample: refined, amp: a0 };
}

/**
 * Guided 2D autotrack across a section slice (assembleSlice layout:
 * data[trace * ns + sample]).
 *
 * @param {{data: Float32Array, width: number, height: number}} slice
 *   width = ns, height = trace count
 * @param {number} startTrace
 * @param {number} startSample
 * @param {{mode?: string, window?: number, maxJump?: number, minAbsAmp?: number}} [opts]
 * @returns {{picks: Float32Array, tracked: number}} picks[trace] = sample
 *   (float) or NULL_VALUE where the event was lost
 */
export function autotrack2D(slice, startTrace, startSample, opts = {}) {
  const { maxJump = 3, minAbsAmp = 0 } = opts;
  const ns = slice.width;
  const nTraces = slice.height;
  const picks = new Float32Array(nTraces).fill(NULL_F32);
  const traceAt = (t) => slice.data.subarray(t * ns, (t + 1) * ns);

  const seedSnap = snapPick(traceAt(startTrace), startSample, opts);
  if (!seedSnap) return { picks, tracked: 0 };
  picks[startTrace] = seedSnap.sample;
  let tracked = 1;

  for (const dir of [1, -1]) {
    let prev = seedSnap.sample;
    for (let t = startTrace + dir; t >= 0 && t < nTraces; t += dir) {
      const hit = snapPick(traceAt(t), prev, opts);
      if (!hit || Math.abs(hit.sample - prev) > maxJump
        || Math.abs(hit.amp) < minAbsAmp) break;
      picks[t] = hit.sample;
      prev = hit.sample;
      tracked += 1;
    }
  }
  return { picks, tracked };
}

/**
 * 3D seeded region-grow over the volume.
 *
 * @param {(ilIdx: number, xlIdx: number) => Promise<Float32Array>} getTrace
 * @param {{nIl: number, nXl: number, ns: number}} geom
 * @param {{ilIdx: number, xlIdx: number, sample: number}} seed
 * @param {{mode?: string, window?: number, maxJump?: number,
 *          minAbsAmp?: number,
 *          onProgress?: (tracked: number, total: number) => void,
 *          shouldCancel?: () => boolean}} [opts]
 * @returns {Promise<{picks: Float32Array, tracked: number}>}
 *   picks[ilIdx * nXl + xlIdx] = sample (float) or NULL_VALUE
 */
export async function regionGrow3D(getTrace, geom, seed, opts = {}) {
  const {
    maxJump = 3, minAbsAmp = 0, onProgress, shouldCancel,
  } = opts;
  const { nIl, nXl } = geom;
  const total = nIl * nXl;
  const picks = new Float32Array(total).fill(NULL_F32);

  const seedSnap = snapPick(await getTrace(seed.ilIdx, seed.xlIdx), seed.sample, opts);
  if (!seedSnap) return { picks, tracked: 0 };

  picks[seed.ilIdx * nXl + seed.xlIdx] = seedSnap.sample;
  let tracked = 1;
  // FIFO breadth-first growth so the pick propagates evenly outward
  const queue = [[seed.ilIdx, seed.xlIdx]];
  const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (queue.length > 0) {
    if (shouldCancel && shouldCancel()) throw new Error('Horizon tracking cancelled.');
    const [il, xl] = queue.shift();
    const from = picks[il * nXl + xl];
    for (const [di, dx] of NEIGHBOURS) {
      const ni = il + di;
      const nx = xl + dx;
      if (ni < 0 || ni >= nIl || nx < 0 || nx >= nXl) continue;
      const idx = ni * nXl + nx;
      if (picks[idx] !== NULL_F32) continue;
      const hit = snapPick(await getTrace(ni, nx), from, opts);
      if (!hit || Math.abs(hit.sample - from) > maxJump
        || Math.abs(hit.amp) < minAbsAmp) continue;
      picks[idx] = hit.sample;
      tracked += 1;
      queue.push([ni, nx]);
      if (onProgress && tracked % 256 === 0) onProgress(tracked, total);
    }
  }
  if (onProgress) onProgress(tracked, total);
  return { picks, tracked };
}

/**
 * Horizon grid statistics with nulls excluded (they never enter sums).
 * @param {Float32Array} picks
 */
export function horizonStats(picks) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let n = 0;
  for (const v of picks) {
    if (v === NULL_F32) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    n += 1;
  }
  return {
    tracked: n,
    coverage: n / picks.length,
    minSample: n ? min : null,
    maxSample: n ? max : null,
    meanSample: n ? sum / n : null,
  };
}
