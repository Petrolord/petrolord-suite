// Phase and amplitude misties at 2D line crossings (upgrade U2-014). The
// time mistie solve (engines solveMisties) aligned the picks; this measures
// what is left at each crossing once the times agree: the constant phase
// rotation and the amplitude ratio between the two lines' traces in a
// window about the horizon, and solves a per-line phase rotation and
// amplitude scalar for the whole network (least squares, mean zero phase
// and unit geometric-mean scale, like the statics).
//
// Conventions: phiDeg at a crossing is the rotation that takes line A's
// trace to line B's (tieWarp.estimatePhaseRotation, validated against
// its analytic Hilbert case); ratio = RMS(B) / RMS(A). A line's correction
// is the rotation and scale that REMOVE its offset from the network:
// rotation -p, scale exp(-l). Corrections are applied display-side when a
// line section is assembled; stored samples never change.

import { estimatePhaseRotation, rotateConstantPhase } from '../engine/tieWarp';

const NULL_F32 = Math.fround(1.0e30);
const live = (v) => v !== NULL_F32 && Number.isFinite(v);

/** Window of a trace centred on a (fractional) sample, nulls kept. */
export function traceWindow(trace, centre, half) {
  const c = Math.round(centre);
  const out = new Float32Array(2 * half + 1).fill(NULL_F32);
  for (let k = -half; k <= half; k++) {
    const i = c + k;
    if (i >= 0 && i < trace.length) out[k + half] = trace[i];
  }
  return out;
}

const rmsOf = (w) => {
  let s = 0;
  let n = 0;
  for (const v of w) if (live(v)) { s += v * v; n += 1; }
  return n ? Math.sqrt(s / n) : 0;
};

/**
 * Character mistie at one crossing.
 * @param {Float32Array} traceA line A's trace at the crossing
 * @param {Float32Array} traceB line B's trace at the crossing
 * @param {number} sampleA the horizon pick on A (display time, samples)
 * @param {number} sampleB the horizon pick on B
 * @param {{half?: number}} [opts] half window in samples
 * @returns {?{phiDeg: number, ratio: number, corr0: number, corr: number}}
 */
export function crossingCharacter(traceA, traceB, sampleA, sampleB, { half = 25 } = {}) {
  const a = traceWindow(traceA, sampleA, half);
  const b = traceWindow(traceB, sampleB, half);
  const ra = rmsOf(a);
  const rb = rmsOf(b);
  if (!(ra > 0) || !(rb > 0)) return null;
  const est = estimatePhaseRotation(a, b, { minOverlap: Math.min(16, half) });
  if (!est) return null;
  return {
    phiDeg: est.phiDeg, ratio: rb / ra, corr0: est.corr0, corr: est.corr,
  };
}

/**
 * Least-squares network adjustment: values[a->b] ~ c[b] - c[a], mean(c) = 0.
 * @param {number} n lines
 * @param {{a: number, b: number, value: number}[]} obs
 * @returns {number[]} c
 */
export function solveNetwork(n, obs) {
  const G = Array.from({ length: n }, () => new Array(n).fill(1)); // gauge row folded in
  const r = new Array(n).fill(0);
  for (const o of obs) {
    G[o.a][o.a] += 1; G[o.b][o.b] += 1; G[o.a][o.b] -= 1; G[o.b][o.a] -= 1;
    r[o.b] += o.value; r[o.a] -= o.value;
  }
  const A = G.map((row, i) => [...row, r[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let q = c + 1; q < n; q++) if (Math.abs(A[q][c]) > Math.abs(A[p][c])) p = q;
    if (Math.abs(A[p][c]) < 1e-12) return new Array(n).fill(0);
    [A[c], A[p]] = [A[p], A[c]];
    for (let q = 0; q < n; q++) {
      if (q === c) continue;
      const f = A[q][c] / A[c][c];
      for (let m = c; m <= n; m++) A[q][m] -= f * A[c][m];
    }
  }
  return A.map((row, i) => row[n] / A[i][i]);
}

/** Wrap degrees to (-180, 180]. */
export const wrapDeg = (d) => {
  let x = ((d + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
};

/**
 * The character solve for a mistie result.
 * @param {number} nLines
 * @param {{a, b, phiDeg, ratio}[]} crossings measured crossings
 * @returns {{rotationDeg: number[], scale: number[], rmsPhaseBefore: number,
 *   rmsPhaseAfter: number, rmsLogAmpBefore: number, rmsLogAmpAfter: number}}
 */
export function solveCharacter(nLines, crossings) {
  const ok = crossings.filter((c) => c && Number.isFinite(c.phiDeg) && c.ratio > 0);
  const p = solveNetwork(nLines, ok.map((c) => ({ a: c.a, b: c.b, value: c.phiDeg })));
  const l = solveNetwork(nLines, ok.map((c) => ({ a: c.a, b: c.b, value: Math.log(c.ratio) })));
  const rms = (v) => (v.length ? Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length) : 0);
  return {
    rotationDeg: p.map((x) => -x),
    scale: l.map((x) => Math.exp(-x)),
    rmsPhaseBefore: rms(ok.map((c) => c.phiDeg)),
    rmsPhaseAfter: rms(ok.map((c) => wrapDeg(c.phiDeg - (p[c.b] - p[c.a])))),
    rmsLogAmpBefore: rms(ok.map((c) => Math.log(c.ratio))),
    rmsLogAmpAfter: rms(ok.map((c) => Math.log(c.ratio) - (l[c.b] - l[c.a]))),
    used: ok.length,
  };
}

/**
 * Apply a line's stored character correction to its assembled section
 * (display side). Trace-major data, width = samples.
 * @param {{data: Float32Array, width: number, height: number}} section
 * @param {?{rotation_deg?: number, amp_scale?: number}} corr
 */
export function applyCharacter(section, corr) {
  const rot = Number(corr?.rotation_deg) || 0;
  const scale = Number(corr?.amp_scale) > 0 ? Number(corr.amp_scale) : 1;
  if (!rot && scale === 1) return section;
  const { data, width, height } = section;
  const out = new Float32Array(data.length);
  const phi = (rot * Math.PI) / 180;
  for (let t = 0; t < height; t++) {
    const tr = data.subarray(t * width, (t + 1) * width);
    const r = rot ? rotateConstantPhase(tr, phi) : tr;
    for (let k = 0; k < width; k++) {
      const v = r[k];
      out[t * width + k] = live(v) ? v * scale : NULL_F32;
    }
  }
  return { ...section, data: out };
}

/** Compose a new correction on top of the one a line already carries. */
export function composeCharacter(prev, rotationDeg, scale) {
  return {
    rotation_deg: Math.round(wrapDeg((Number(prev?.rotation_deg) || 0) + rotationDeg) * 100) / 100,
    amp_scale: Math.round((Number(prev?.amp_scale) > 0 ? Number(prev.amp_scale) : 1) * scale * 1e4) / 1e4,
  };
}
