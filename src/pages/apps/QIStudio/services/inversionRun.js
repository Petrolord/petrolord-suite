// Post-stack impedance inversion of a study volume (QI programme Q8a,
// 2026-10-06). One module for the seismic worker (the poststack_inversion
// job: the whole volume, or only the well traces for the blind-well check)
// and the tests: the job's params are checked here, the well logs become the
// horizon-guided low-frequency model (engines qi/lfm.js), the wavelet is
// scaled to the seismic at the wells, and each trace is inverted with the
// engines' qi/inversion.js. Pure apart from nothing: brick and horizon reads
// stay in the handler.
//
// Conventions. Time is the volume's own axis, sample k at k * dt (horizon
// picks are sample indices on it). Well ln(AI) arrives on that axis, NaN
// where the log has no value. Output samples where the input trace is null
// stay null. Absolute methods write AI (the exp of ln(AI)); the coloured
// method writes relative impedance.

import {
  modelBased, sparseSpike, colouredOperator, applyColoured, impedanceSpectrumSlope,
  forwardPoststack, lowFrequencyModel,
} from '../engine/inversion';
import { lfmTrace, blindWellScore } from '../engine/lfm';
import { fft, nextPow2 } from '../../../../../packages/engines/lib/fft';

export const INVERSION_METHODS = {
  model_based: { label: 'Model-based', absolute: true },
  blocky: { label: 'Model-based, blocky', absolute: true },
  sparse_spike: { label: 'Sparse-spike', absolute: true },
  coloured: { label: 'Coloured (relative impedance)', absolute: false },
};

export const INVERSION_DEFAULTS = {
  lfmHz: 8, // the low-frequency model keeps what the seismic lacks, below about 8 Hz
  truthHz: 50, // the well log is compared after a high cut at about the seismic top
  eps: 0.05,
  epsTV: 0.02,
  outer: 4,
  iters: 60,
  lambda: 0.002,
  idwPower: 2,
  band: [8, 60],
};

const MAX_HORIZONS = 6;
const MAX_WELLS = 60;
const NULL_LIM = 1e29; // brick nulls are 1e30
const fin = Number.isFinite;
const isNull = (v) => !(Math.abs(v) <= NULL_LIM);

/** Why a job's params cannot run, or null. */
export function validateInversionParams(p) {
  if (!p || typeof p !== 'object') return 'Missing inversion settings.';
  const inv = p.inversion;
  if (!inv || !INVERSION_METHODS[inv.method]) return `Unknown inversion method "${inv?.method}".`;
  if (p.mode !== 'blind' && p.mode !== 'volume') return 'The inversion mode must be blind or volume.';
  const w = inv.wavelet;
  if (!w || !Array.isArray(w.samples) || w.samples.length < 5 || w.samples.length % 2 === 0) return 'The wavelet needs an odd number of samples, at least five.';
  if (!w.samples.every(fin)) return 'The wavelet has a missing sample.';
  const wells = inv.wells;
  if (!Array.isArray(wells) || !wells.length) return 'The inversion needs at least one well.';
  if (wells.length > MAX_WELLS) return `At most ${MAX_WELLS} wells per inversion.`;
  for (const x of wells) {
    if (!x?.name || !Number.isInteger(x.il) || !Number.isInteger(x.xl)) return 'Each well needs a name and its inline and crossline index.';
    if (!Array.isArray(x.ln_ai) || !x.ln_ai.some((v) => fin(v))) return `Well ${x.name} has no impedance log in time.`;
  }
  if (p.mode === 'blind' && wells.length < 2) return 'A blind-well check needs at least two wells.';
  const h = inv.horizon_ids || [];
  if (!Array.isArray(h) || h.length > MAX_HORIZONS) return `Use at most ${MAX_HORIZONS} horizons.`;
  return null;
}

/** Moving-average half window in samples for a cut frequency. */
export const halfWindowFor = (hz, dtMs) => Math.max(1, Math.round(1000 / (hz * dtMs) / 2));

/** A copy of an array with its NaN runs left alone and its finite runs low-passed. */
function lowPassFinite(values, half) {
  const out = Float64Array.from(values, (v) => (fin(v) ? v : NaN));
  const lp = lowFrequencyModel(out, half);
  for (let i = 0; i < out.length; i++) out[i] = fin(out[i]) ? lp[i] : NaN;
  return out;
}

/**
 * The LFM wells: positions, horizon times at the well and the low-passed log.
 * @param {Array<{name, il, xl, ln_ai}>} wells
 * @param {{dtMs, lfmHz, posOf: (il, xl) => {x, y}, horizonsAt: (il, xl) => ?number[]}} p
 */
export function lfmWells(wells, { dtMs, lfmHz, posOf, horizonsAt }) {
  const half = halfWindowFor(lfmHz, dtMs);
  return wells.map((w) => {
    const pos = posOf(w.il, w.xl);
    return {
      name: w.name, x: pos.x, y: pos.y, t0Ms: 0, dtMs,
      values: lowPassFinite(w.ln_ai, half),
      horizons: horizonsAt(w.il, w.xl) || undefined,
    };
  });
}

/**
 * Horizon times at a trace, or null when any horizon has no pick there (the
 * trace then interpolates at constant time).
 * @param {Float32Array[]} grids sample-index picks, nIl x nXl, 1e30 nulls
 */
export function horizonsAtFrom(grids, nXl, dtMs) {
  return (il, xl) => {
    if (!grids.length) return null;
    const out = [];
    for (const g of grids) {
      const s = g[il * nXl + xl];
      if (isNull(s) || !fin(s)) return null;
      out.push(s * dtMs);
    }
    for (let i = 1; i < out.length; i++) if (!(out[i] > out[i - 1])) return null;
    return out;
  };
}

/**
 * The least-squares scale s that makes s * forward(ln AI) match the seismic
 * at the wells, pooled over every well sample where both are defined.
 * @param {Array<{trace: ArrayLike<number>, lnAi: ArrayLike<number>}>} pairs
 */
export function waveletScale(pairs, wavelet) {
  let sxy = 0; let sxx = 0; let n = 0;
  for (const { trace, lnAi } of pairs) {
    // fill the log's gaps with its own edge values so the forward model has no step at a gap
    const filled = holdFill(lnAi);
    if (!filled) continue;
    const syn = forwardPoststack(filled, wavelet);
    const half = (wavelet.length - 1) / 2;
    for (let i = 0; i < trace.length; i++) {
      if (isNull(trace[i]) || !coveredWithin(lnAi, i, half)) continue;
      sxy += syn[i] * trace[i]; sxx += syn[i] * syn[i]; n += 1;
    }
  }
  if (n < 10 || !(sxx > 0)) throw new Error('The wells overlap too little seismic to scale the wavelet.');
  return { scale: sxy / sxx, samples: n };
}

function holdFill(values) {
  let first = -1;
  for (let i = 0; i < values.length; i++) if (fin(values[i])) { first = i; break; }
  if (first < 0) return null;
  const out = Float64Array.from(values, (v) => (fin(v) ? v : NaN)); // JSON carries NaN as null
  for (let i = 0; i < first; i++) out[i] = out[first];
  for (let i = first + 1; i < out.length; i++) if (!fin(out[i])) out[i] = out[i - 1];
  return out;
}

const coveredWithin = (values, i, half) => {
  for (let j = i - half - 1; j <= i + half + 1; j++) if (!(j >= 0 && j < values.length && fin(values[j]))) return false;
  return true;
};

/** The seismic amplitude spectrum averaged over traces, smoothed, as a function of frequency. */
export function averageAmplitude(traces, dtMs) {
  const n = traces[0].length;
  const N = nextPow2(n) * 2; // the coloured operator's transform length
  const acc = new Float64Array(N / 2 + 1);
  for (const t of traces) {
    const re = new Float64Array(N); const im = new Float64Array(N);
    for (let i = 0; i < n; i++) re[i] = isNull(t[i]) ? 0 : t[i];
    fft(re, im, false);
    for (let k = 0; k <= N / 2; k++) acc[k] += Math.hypot(re[k], im[k]) / traces.length;
  }
  // a 5-bin running mean keeps the operator smooth
  const sm = new Float64Array(acc.length);
  for (let k = 0; k < acc.length; k++) {
    let s = 0; let c = 0;
    for (let j = Math.max(0, k - 2); j <= Math.min(acc.length - 1, k + 2); j++) { s += acc[j]; c += 1; }
    sm[k] = s / c;
  }
  const df = 1000 / (N * dtMs);
  return (f) => {
    const x = f / df; const i = Math.floor(x);
    if (i < 0 || i >= sm.length - 1) return 0;
    return sm[i] + (x - i) * (sm[i + 1] - sm[i]);
  };
}

/**
 * The per-trace inversion.
 * @param {Object} p
 * @param {Object} p.inv the job's inversion block (method and settings)
 * @param {ArrayLike<number>} p.wavelet the scaled wavelet
 * @param {Array} p.wells lfmWells output
 * @param {(il, xl) => {x, y}} p.posOf
 * @param {(il, xl) => ?number[]} p.horizonsAt
 * @param {number} p.ns @param {number} p.dtMs
 * @param {?{N, gain}} [p.coloured] the coloured operator (coloured method)
 * @returns {(trace: ArrayLike<number>, il: number, xl: number, exclude?: string) => Float64Array}
 *   ln(AI) for absolute methods, relative impedance for coloured; NaN where the input is null
 */
export function makeTraceInverter({ inv, wavelet, wells, posOf, horizonsAt, ns, dtMs, coloured = null }) {
  const s = { ...INVERSION_DEFAULTS, ...inv };
  const grid = { t0Ms: 0, dtMs, ns };
  return (trace, il, xl, exclude) => {
    const d = new Float64Array(ns);
    for (let i = 0; i < ns; i++) d[i] = isNull(trace[i]) ? 0 : trace[i];
    let out;
    if (s.method === 'coloured') {
      out = Float64Array.from(applyColoured(d, coloured));
    } else {
      const pos = posOf(il, xl);
      const m0 = lfmTrace(wells, { x: pos.x, y: pos.y, horizons: horizonsAt(il, xl) || undefined }, grid, { power: s.idwPower, exclude });
      if (s.method === 'sparse_spike') {
        out = sparseSpike({ d, wavelet, m0, lambda: s.lambda, dtMs, crossoverHz: s.lfmHz, iters: s.iters }).m;
      } else {
        const blocky = s.method === 'blocky' ? { epsTV: s.epsTV, outer: s.outer } : null;
        out = modelBased({ d, wavelet, m0, eps: s.eps, blocky, iters: s.iters }).m;
      }
    }
    for (let i = 0; i < ns; i++) if (isNull(trace[i])) out[i] = NaN;
    return out;
  };
}

/** The coloured operator from the well logs and the seismic at the wells. */
export function colouredFromWells({ wellTraces, wellLogs, dtMs, ns, band }) {
  const slopes = [];
  for (const log of wellLogs) {
    const run = longestFiniteRun(log);
    if (run.length >= 64) slopes.push(impedanceSpectrumSlope(run.map(Math.exp), dtMs));
  }
  if (!slopes.length) throw new Error('Coloured inversion needs at least one impedance log of 64 samples or more.');
  const alpha = slopes.reduce((a, b) => a + b, 0) / slopes.length;
  const seismicAmp = averageAmplitude(wellTraces, dtMs);
  return { alpha, operator: colouredOperator({ seismicAmp, alpha, n: ns, dtMs, band }) };
}

function longestFiniteRun(values) {
  let best = []; let cur = [];
  for (const v of values) {
    if (fin(v)) cur.push(v); else { if (cur.length > best.length) best = cur; cur = []; }
  }
  return cur.length > best.length ? cur : best;
}

/**
 * The blind-well table: each well inverted with the low-frequency model
 * built from the other wells, scored against its own log after a high cut
 * at truthHz; beside it the same well with itself in the model, so the
 * share of the match that comes from the model is visible. Relative
 * impedance (coloured) has no low frequencies, so its truth is the log
 * band-passed between lowCutHz and truthHz and only the correlation counts.
 * @returns {Array<{name, blind: {corr, rmsPct, n}, withWell: {corr, rmsPct, n}}>}
 */
export function blindWellTable({ invert, wells, traces, dtMs, truthHz, absolute, lowCutHz = INVERSION_DEFAULTS.band[0] }) {
  const half = halfWindowFor(truthHz, dtMs);
  return wells.map((w, k) => {
    let truth = lowPassFinite(w.ln_ai, half);
    if (!absolute) {
      const low = lowPassFinite(w.ln_ai, halfWindowFor(lowCutHz, dtMs));
      truth = truth.map((v, i) => v - low[i]);
    }
    const score = (est) => {
      if (absolute) return blindWellScore(est, truth);
      // relative impedance has no level or scale: compare the shapes only
      return correlationOnly(est, truth);
    };
    return {
      name: w.name,
      blind: score(invert(traces[k], w.il, w.xl, w.name)),
      withWell: score(invert(traces[k], w.il, w.xl)),
    };
  });
}

function correlationOnly(a, b) {
  const x = []; const y = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (fin(a[i]) && fin(b[i])) { x.push(a[i]); y.push(b[i]); }
  const n = x.length;
  if (n < 3) return { corr: NaN, rmsPct: null, n };
  const mx = x.reduce((s, v) => s + v, 0) / n; const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return { corr: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN, rmsPct: null, n };
}

/**
 * Issues for the register from a blind-well table. Thresholds: a blind
 * correlation under 0.6 is high (the inversion does not follow the well);
 * a blind AI error over 10 percent is medium; a blind error more than 5
 * points above the error with the well in the model is low (away from
 * wells the result leans on the low-frequency model).
 */
export function inversionIssues(blind, volumeName = 'the volume') {
  const out = [];
  const add = (key, severity, title, detail, remedy) => out.push({ key: `inversion:${volumeName}:${key}`, area: 'Inversion', severity, title, detail, remedy });
  for (const r of blind || []) {
    const b = r.blind || {}; const w = r.withWell || {};
    if (Number.isFinite(b.corr) && b.corr < 0.6) {
      add(`${r.name}:corr`, 'high', `${r.name}: the inversion does not follow the well`, `Blind correlation ${b.corr.toFixed(2)} on ${volumeName}.`, 'Check the tie and the wavelet at this well, then the horizons the model follows.');
    }
    if (Number.isFinite(b.rmsPct) && b.rmsPct > 10) {
      add(`${r.name}:err`, 'medium', `${r.name}: blind impedance error ${b.rmsPct.toFixed(1)} percent`, `With the well left out of the low-frequency model, on ${volumeName}.`, 'Add horizons to guide the model, or a velocity trend, and compare the result with the alternatives.');
    }
    if (Number.isFinite(b.rmsPct) && Number.isFinite(w.rmsPct) && b.rmsPct - w.rmsPct > 5) {
      add(`${r.name}:lfm`, 'low', `${r.name}: the result leans on the low-frequency model`, `Blind error ${b.rmsPct.toFixed(1)} percent against ${w.rmsPct.toFixed(1)} percent with the well in the model.`, 'Report impedance away from wells with its uncertainty; weigh it less where the wells are far apart.');
    }
  }
  return out;
}
