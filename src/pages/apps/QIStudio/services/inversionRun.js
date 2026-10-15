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
//
// The wavelet scale, the high cut and the blind-well table live in the
// engines (engines/qi/inversionQc.js, QI course gate E2, 2026-10-11; goldens
// and an independent oracle there) and are re-exported here.

export { halfWindowFor, lowPassFinite, waveletScale };

import {
  modelBased, sparseSpike, colouredOperator, applyColoured, impedanceSpectrumSlope, forwardPoststack,
} from '../engine/inversion';
import { lfmTrace, blindWellScore } from '../engine/lfm';
import { lfmTraceModel, intervalFromRms, fitVelocityTrend, velocityTrendLnAi } from '../engine/lfmModels';
import {
  halfWindowFor, lowPassFinite, waveletScale, blindWellTable as engineBlindWellTable,
} from '../engine/inversionQc';
import { fft, nextPow2 } from '../../../../../packages/engines/lib/fft';
import { quantilesAcross, quantileSorted, relativeSpread, addNoise } from '../engine/inversionSpread';

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
  const lfmWhy = validateLfmOptions(inv);
  if (lfmWhy) return lfmWhy;
  if (inv.blind_wavelets != null) {
    if (!Array.isArray(inv.blind_wavelets)) return 'The blind wavelets must be a list.';
    for (const bw of inv.blind_wavelets) {
      if (!bw?.name || !Array.isArray(bw.samples) || bw.samples.length < 5 || bw.samples.length % 2 === 0 || !bw.samples.every(fin)) return 'Each blind wavelet needs the well name and an odd number of samples, at least five.';
    }
  }
  return validateSensitivity(inv.sensitivity, inv.method);
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
/**
 * Horizon grids ordered top to bottom by their median time. The picker passes
 * them in the order they were ticked; taken as given, a deeper horizon ticked
 * first made every CDP fail the increasing-time check below, and the
 * low-frequency model fell back to constant time without a word (found
 * 2026-10-10).
 */
export function orderTopDown(grids) {
  const median = (g) => {
    const v = [];
    for (let i = 0; i < g.length; i += Math.max(1, Math.floor(g.length / 2000))) if (!isNull(g[i]) && fin(g[i])) v.push(g[i]);
    v.sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : Infinity;
  };
  return grids.map((g) => [median(g), g]).sort((a, b) => a[0] - b[0]).map(([, g]) => g);
}

export function horizonsAtFrom(grids, nXl, dtMs) {
  const ordered = orderTopDown(grids);
  return (il, xl) => {
    if (!ordered.length) return null;
    const out = [];
    for (const g of ordered) {
      const s = g[il * nXl + xl];
      if (isNull(s) || !fin(s)) return null;
      out.push(s * dtMs);
    }
    for (let i = 1; i < out.length; i++) if (!(out[i] > out[i - 1])) return null;
    return out;
  };
}

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
export function makeTraceInverter({ inv, wavelet, wells, posOf, horizonsAt, ns, dtMs, coloured = null, trendFit = null, trendAt = null }) {
  const s = { ...INVERSION_DEFAULTS, ...inv };
  const grid = { t0Ms: 0, dtMs, ns };
  // QI upgrade P2.8: kriging, faults and a velocity trend (engines qi/lfmModels.js); with none the original model
  const opts = lfmOptionsOf(inv);
  const lfmAt = (pos, il, xl, exclude) => {
    const at = { x: pos.x, y: pos.y, horizons: horizonsAt(il, xl) || undefined };
    if (!opts && !trendFit) return lfmTrace(wells, at, grid, { power: s.idwPower, exclude });
    if (trendFit) {
      const v = trendAt ? trendAt(il, xl) : null;
      if (!v) throw new Error('The velocity trend has no velocity at this trace.');
      at.trend = velocityTrendLnAi(v, trendFit);
    }
    return lfmTraceModel(wells, at, grid, { ...(opts || {}), power: s.idwPower, exclude });
  };
  return (trace, il, xl, exclude) => {
    const d = new Float64Array(ns);
    for (let i = 0; i < ns; i++) d[i] = isNull(trace[i]) ? 0 : trace[i];
    let out;
    if (s.method === 'coloured') {
      out = Float64Array.from(applyColoured(d, coloured));
    } else {
      const pos = posOf(il, xl);
      const m0 = lfmAt(pos, il, xl, exclude);
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
  const operator = colouredOperator({ seismicAmp, alpha, n: ns, dtMs, band });
  // polarity from the wells (F3 benchmark F-6, 2026-10-15): the operator is
  // built from amplitude spectra, so on reversed-polarity seismic its output
  // was anticorrelated with the logs. Each well's output is compared with its
  // log in the inversion band; a negative sum flips the operator.
  const polarity = colouredPolarity({ operator, wellTraces, wellLogs, dtMs, band, ns });
  if (polarity < 0) for (let k = 0; k < operator.gain.length; k++) operator.gain[k] = -operator.gain[k];
  return { alpha, operator, polarity };
}

/** The sign that makes the coloured output follow the logs at the wells: 1, or -1 for reversed polarity. */
export function colouredPolarity({ operator, wellTraces, wellLogs, dtMs, band, ns }) {
  let total = 0;
  wellTraces.forEach((trace, k) => {
    const log = wellLogs[k];
    const d = new Float64Array(ns);
    for (let i = 0; i < ns; i++) d[i] = isNull(trace[i]) ? 0 : trace[i];
    const out = applyColoured(d, operator);
    const hi = lowPassFinite(log, halfWindowFor(band[1], dtMs));
    const lo = lowPassFinite(log, halfWindowFor(band[0], dtMs));
    let sxy = 0; let sxx = 0; let syy = 0;
    for (let i = 0; i < ns; i++) {
      const y = hi[i] - lo[i];
      if (!fin(y) || !fin(out[i]) || isNull(trace[i])) continue;
      sxy += out[i] * y; sxx += out[i] * out[i]; syy += y * y;
    }
    if (sxx > 0 && syy > 0) total += sxy / Math.sqrt(sxx * syy);
  });
  return total < 0 ? -1 : 1;
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
export function blindWellTable(p) {
  return engineBlindWellTable({ lowCutHz: INVERSION_DEFAULTS.band[0], ...p });
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

// ---------------------------------------------------------------------------
// Truly blind wells (QI upgrade P1.2, 2026-10-15). Before this, a well left
// out of the blind check was out of the low-frequency model only: the
// wavelet scale (or the coloured operator) was fitted on every well,
// including the one being tested, and the field wavelet averaged its tie.
// Now a held-back well is out of everything the inversion learns from the
// wells: the low-frequency model, the wavelet scale, the coloured operator's
// impedance spectrum and seismic spectrum, and (when the field wavelet is
// used) the wavelet average itself (the browser sends the average of the
// other ties as blind_wavelets). The with-well column is unchanged.

export const BLIND_PROTOCOL = 'held-back-v2';

/**
 * The protocol statement of a result: what a held-back well was left out of.
 * @param {{absolute: boolean, blindWavelets: boolean, waveletWell?: ?string}} p
 */
export function blindProtocol({ absolute, blindWavelets, waveletWell = null }) {
  const out = ['the low-frequency model', absolute ? 'the wavelet scale' : 'the coloured operator (its impedance and seismic spectra)'];
  if (blindWavelets) out.push('the field wavelet average');
  return { version: BLIND_PROTOCOL, excluded_from: out, ...(waveletWell ? { wavelet_from_well: waveletWell } : {}) };
}

/** The protocol in words, for the panel and the report (older results say what they did). */
export function blindProtocolText(result) {
  const p = result?.blind_protocol || result?.settings?.blind_protocol;
  if (!p) return 'Each well was left out of the low-frequency model only; the wavelet scale used every well (a result from before the truly blind check of 2026-10-15).';
  const parts = p.excluded_from || [];
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] || 'the low-frequency model';
  // F3 benchmark F-10 (QI round 3): the polarity each held-out coloured run took from its kept wells
  const pol = (p.held_back || []).filter((h) => h.polarity === 1 || h.polarity === -1);
  const polText = pol.length ? ` Polarity from the kept wells, with each well held out: ${pol.map((h) => `${h.name} ${h.polarity === -1 ? 'reversed' : 'normal'}`).join(', ')}.${new Set(pol.map((h) => h.polarity)).size > 1 ? ' The wells disagree on polarity, so the blind results are not comparable between wells; check the ties.' : ''}` : '';
  return `Truly blind: each held-back well was left out of ${list}.${p.wavelet_from_well ? ` The wavelet is ${p.wavelet_from_well}'s own tie wavelet, so that well's blind result is not independent of the wavelet.` : ''}${(p.notes || []).length ? ` ${p.notes.join(' ')}` : ''}${polText}`;
}

/**
 * The inverter for the blind check and the volume: with no well named it is
 * the full inversion (every well); with a well named it is rebuilt without
 * that well (wavelet scale or coloured operator from the others, the other
 * ties' wavelet average when given, and the low-frequency model without it).
 * The blind traces it produced are kept, so a volume run can record them for
 * the property check.
 * @param {Object} p
 * @param {Object} p.inv the job's inversion block
 * @param {Float64Array} p.wavelet the unscaled wavelet on the volume's grid
 * @param {(samples, dtMs) => Float64Array} [p.onGrid] puts a blind wavelet on the grid
 * @param {Array} p.wells the job's wells (name, il, xl, ln_ai)
 * @param {Array<ArrayLike<number>>} p.traces the seismic at each well
 * @returns {{invert, scale: ?number, alpha: ?number, protocol, scales: Array<{name, scale}>, blindTraces: Map<string, Float64Array>}}
 */
/**
 * How well the scaled synthetic follows the seismic at the wells, over the
 * samples the wavelet scale was fitted on (the log covered within the
 * wavelet's half length): the magnitude of their correlation. The least
 * squares scale shrinks towards zero as the tie degrades, and an absolute
 * inversion with a near-zero wavelet scale overflows (F3 benchmark F-3,
 * 2026-10-15), so a poor tie refuses the run.
 * @returns {{corr: number, samples: number}}
 */
export function scaleTieQuality(pairs, wavelet) {
  const half = (wavelet.length - 1) / 2;
  let sxy = 0; let sxx = 0; let syy = 0; let n = 0;
  for (const { trace, lnAi } of pairs) {
    const v = Array.from(lnAi, (x) => (Number.isFinite(x) ? x : NaN));
    const first = v.findIndex(Number.isFinite);
    if (first < 0) continue;
    for (let i = 0; i < first; i++) v[i] = v[first];
    for (let i = first + 1; i < v.length; i++) if (!Number.isFinite(v[i])) v[i] = v[i - 1];
    const syn = forwardPoststack(Float64Array.from(v), wavelet);
    for (let i = 0; i < trace.length; i++) {
      let ok = Number.isFinite(trace[i]) && Math.abs(trace[i]) < 1e29;
      for (let j = i - half - 1; ok && j <= i + half + 1; j++) ok = j >= 0 && j < lnAi.length && Number.isFinite(lnAi[j]);
      if (!ok) continue;
      sxy += syn[i] * trace[i]; sxx += syn[i] * syn[i]; syy += trace[i] * trace[i]; n += 1;
    }
  }
  return { corr: sxx > 0 && syy > 0 ? Math.abs(sxy) / Math.sqrt(sxx * syy) : 0, samples: n };
}
export const MIN_SCALE_TIE = 0.3;

export function makeBlindInverter({ inv, wavelet, onGrid = (x) => Float64Array.from(x), wells, traces, posOf, horizonsAt, ns, dtMs, velocityAtWells = null, trendAt = null }) {
  const s = { ...INVERSION_DEFAULTS, ...inv };
  const absolute = INVERSION_METHODS[s.method].absolute;
  const lfm = absolute ? lfmWells(wells, { dtMs, lfmHz: s.lfmHz, posOf, horizonsAt }) : [];
  // QI upgrade P2.8: the velocity trend is calibrated on the wells kept, so a held-back well is out of it too
  const useTrend = absolute && !!inv.velocity && Array.isArray(velocityAtWells);
  const trendFor = (keep) => {
    if (!useTrend) return { fit: null, wellsT: lfm };
    const fit = fitVelocityTrend(keep.map((k) => ({ lnAi: lfm[k].values, v: velocityAtWells[k] })));
    return { fit, wellsT: lfm.map((w, k) => ({ ...w, trend: velocityTrendLnAi(velocityAtWells[k], fit) })) };
  };
  const blindW = new Map((inv.blind_wavelets || []).map((w) => [w.name, onGrid(w.samples, w.dt_ms)]));
  const notes = [];
  const build = (exclude) => {
    const keep = wells.map((w, k) => k).filter((k) => wells[k].name !== exclude);
    const w0 = (exclude && blindW.get(exclude)) || wavelet;
    if (absolute) {
      const scale = waveletScale(keep.map((k) => ({ trace: traces[k], lnAi: wells[k].ln_ai })), w0).scale;
      const scaled = w0.map((v) => v * scale);
      const { fit, wellsT } = trendFor(keep);
      return { scale, wavelet: scaled, trendFit: fit, invert: makeTraceInverter({ inv, wavelet: scaled, wells: wellsT, posOf, horizonsAt, ns, dtMs, trendFit: fit, trendAt }) };
    }
    const c = colouredFromWells({ wellTraces: keep.map((k) => traces[k]), wellLogs: keep.map((k) => wells[k].ln_ai), dtMs, ns, band: s.band });
    return { alpha: c.alpha, polarity: c.polarity, invert: makeTraceInverter({ inv, wavelet: w0, wells: lfm, posOf, horizonsAt, ns, dtMs, coloured: c.operator }) };
  };
  let tie = null;
  if (absolute) {
    tie = scaleTieQuality(wells.map((w, k) => ({ trace: traces[k], lnAi: w.ln_ai })), wavelet);
    if (!(tie.corr >= MIN_SCALE_TIE)) throw new Error(`The wells tie too poorly to scale the wavelet: the synthetic follows the seismic at a correlation of ${(Math.floor(tie.corr * 1000) / 1000).toFixed(3)} over the wells, under ${MIN_SCALE_TIE}. An absolute inversion scaled on it would not be trustworthy. Improve the ties (Well ties tab: commit a shift and a phase, or load measured checkshots) or run a coloured inversion.`);
  }
  const full = build(null);
  const held = new Map();
  const scales = [];
  const blindTraces = new Map();
  const heldFor = (name) => {
    if (!held.has(name)) {
      let b = null;
      try { b = build(name); } catch (e) {
        notes.push(`${name}: ${e.message} Its blind row is empty.`);
      }
      held.set(name, b);
      // F3 benchmark F-10 (QI round 3): the polarity each held-out coloured run took from its kept wells
      if (b) scales.push({ name, ...(b.scale != null ? { scale: b.scale } : { slope: b.alpha, ...(b.polarity != null ? { polarity: b.polarity } : {}) }) });
    }
    return held.get(name);
  };
  const invert = (trace, il, xl, exclude) => {
    if (!exclude) return full.invert(trace, il, xl);
    const b = heldFor(exclude);
    const out = b ? b.invert(trace, il, xl, exclude) : new Float64Array(ns).fill(NaN);
    blindTraces.set(exclude, out);
    return out;
  };
  const waveletWell = typeof inv.wavelet_well === 'string' && inv.wavelet_well ? inv.wavelet_well : null;
  const base = blindProtocol({ absolute, blindWavelets: blindW.size > 0, waveletWell });
  const protocol = { ...base, excluded_from: useTrend ? [...base.excluded_from, 'the velocity trend calibration'] : base.excluded_from, notes };
  return { invert, scale: full.scale ?? null, alpha: full.alpha ?? null, polarity: full.polarity ?? null, scaledWavelet: full.wavelet || null, trendFit: full.trendFit || null, protocol, scales, blindTraces, scaleTie: tie };
}

// ---------------------------------------------------------------------------
// Sensitivity (QI Q8a): the same inversion under alternative assumptions,
// summarised per sample as Q10, Q50 and Q90 (the 10th, 50th and 90th
// percentiles; parameters carry no P-labels, PT10 owner decision 1) and the
// relative spread (Q90 - Q10) / Q50. Scenarios vary the wavelet (each one
// scaled to the seismic at the wells on its own), the low-frequency model
// cut, and seeded noise at a stated signal-to-noise ratio.

export const MAX_SCENARIOS = 12;

/** Why a sensitivity block cannot run, or null. */
export function validateSensitivity(sens, method) {
  if (!sens) return null;
  if (!INVERSION_METHODS[method]?.absolute) return 'Sensitivity runs on the absolute methods (model-based, blocky, sparse-spike).';
  const ws = sens.wavelets || [];
  if (!Array.isArray(ws) || ws.some((w) => !Array.isArray(w?.samples) || w.samples.length < 5 || w.samples.length % 2 === 0 || !w.samples.every(fin))) return 'Each sensitivity wavelet needs an odd number of samples, at least five.';
  const f = sens.lfm_factors || [1];
  if (!Array.isArray(f) || !f.length || f.some((x) => !(x > 0 && x <= 4))) return 'The model cut factors must be between 0 and 4.';
  if (sens.snr != null && !(sens.snr > 0)) return 'The signal-to-noise ratio must be positive.';
  const seeds = sens.snr != null ? Math.max(1, sens.seeds || 1) : 1;
  const n = (ws.length || 1) * f.length * seeds;
  if (n < 2) return 'A sensitivity run needs at least two scenarios.';
  if (n > MAX_SCENARIOS) return `At most ${MAX_SCENARIOS} scenarios per run (this one has ${n}).`;
  return null;
}

/**
 * The scenario list: wavelet x model cut x noise seed. The base wavelet is
 * the first when the block names none.
 * @returns {Array<{label: string, wavelet: number[], lfmHz: number, seed: ?number}>}
 */
export function sensitivityScenarios(inv) {
  const sens = inv.sensitivity;
  const s = { ...INVERSION_DEFAULTS, ...inv };
  const ws = sens.wavelets?.length ? sens.wavelets : [{ label: 'the chosen wavelet', samples: inv.wavelet.samples }];
  const factors = sens.lfm_factors || [1];
  const seeds = sens.snr != null ? Array.from({ length: Math.max(1, sens.seeds || 1) }, (_, k) => k + 1) : [null];
  const out = [];
  for (const w of ws) {
    for (const f of factors) {
      for (const seed of seeds) {
        out.push({
          label: [w.label, `model below ${Number((s.lfmHz * f).toFixed(2))} Hz`, seed != null ? `noise ${seed}` : ''].filter(Boolean).join(', '),
          wavelet: w.samples, lfmHz: s.lfmHz * f, seed,
        });
      }
    }
  }
  return out;
}

/** A per-trace noise seed that does not depend on the order traces are visited in. */
const traceSeed = (seed, il, xl) => (((seed * 73856093) ^ (il * 19349663) ^ (xl * 83492791)) >>> 0);

/**
 * Build one inverter per scenario (each wavelet scaled at the wells, each
 * model from the wells low-passed at its own cut) and a function that
 * returns every scenario's ln(AI) for a trace.
 * @returns {{scenarios, scales: number[], realise: (trace, il, xl, exclude?) => Float64Array[]}}
 */
export function makeScenarioInverters({ inv, wells, traces, posOf, horizonsAt, ns, dtMs }) {
  const scenarios = sensitivityScenarios(inv);
  const pairs = wells.map((w, k) => ({ trace: traces[k], lnAi: w.ln_ai, name: w.name }));
  const lfmCache = new Map();
  // truly blind (P1.2): a held-back well is out of each scenario's wavelet
  // scale as well as its low-frequency model; the inverters are rebuilt per
  // held-back well (cached), so the blind spread does not lean on that well
  const buildAll = (exclude) => {
    const scaleCache = new Map();
    const keep = exclude ? pairs.filter((x) => x.name !== exclude) : pairs;
    return scenarios.map((sc) => {
      if (!scaleCache.has(sc.wavelet)) scaleCache.set(sc.wavelet, waveletScale(keep, sc.wavelet).scale);
      const scale = scaleCache.get(sc.wavelet);
      if (!lfmCache.has(sc.lfmHz)) lfmCache.set(sc.lfmHz, lfmWells(wells, { dtMs, lfmHz: sc.lfmHz, posOf, horizonsAt }));
      const invert = makeTraceInverter({
        inv: { ...inv, lfmHz: sc.lfmHz }, wavelet: sc.wavelet.map((v) => v * scale), wells: lfmCache.get(sc.lfmHz), posOf, horizonsAt, ns, dtMs,
      });
      return { invert, scale, seed: sc.seed };
    });
  };
  const inverters = buildAll(null);
  const heldBack = new Map();
  const live = (v) => Math.abs(v) <= NULL_LIM && fin(v);
  const realise = (trace, il, xl, exclude) => {
    let set = inverters;
    if (exclude) {
      if (!heldBack.has(exclude)) heldBack.set(exclude, buildAll(exclude));
      set = heldBack.get(exclude);
    }
    return set.map(({ invert, seed }) => {
      const t = seed != null ? addNoise(trace, inv.sensitivity.snr, traceSeed(seed, il, xl), live) : trace;
      return invert(t, il, xl, exclude);
    });
  };
  return { scenarios, scales: inverters.map((x) => x.scale), realise };
}

/**
 * The blind-well check under every scenario: per well the Q10, Q50 and Q90
 * of the blind AI error across scenarios, and per scenario the mean blind
 * error over the wells (which assumption moves the result most).
 */
export function blindSensitivity({ realise, scenarios, wells, traces, dtMs, truthHz, blindTraces = null }) {
  const half = halfWindowFor(truthHz, dtMs);
  const perScenario = scenarios.map(() => []);
  const rows = wells.map((w, k) => {
    const truth = lowPassFinite(w.ln_ai, half);
    const real = realise(traces[k], w.il, w.xl, w.name);
    // the blind Q50 (ln AI) at the well, for the property check of a Q50 volume
    if (blindTraces) blindTraces.set(w.name, Float64Array.from(quantilesAcross(real.map((m) => m.map(Math.exp)), [0.5])[0], (v) => Math.log(v)));
    const errs = real.map((m) => blindWellScore(m, truth).rmsPct);
    errs.forEach((e, j) => perScenario[j].push(e));
    const sorted = errs.filter(fin).sort((a, b) => a - b);
    return { name: w.name, q10: quantileSorted(sorted, 0.1), q50: quantileSorted(sorted, 0.5), q90: quantileSorted(sorted, 0.9) };
  });
  const byScenario = scenarios.map((sc, j) => {
    const e = perScenario[j].filter(fin);
    return { label: sc.label, meanRmsPct: e.length ? e.reduce((a, v) => a + v, 0) / e.length : NaN };
  });
  return { rows, byScenario };
}

/** The four products of one trace from its realisations: AI at Q10, Q50 and Q90, and the relative spread. */
export function spreadProducts(realisations) {
  const ai = realisations.map((m) => m.map(Math.exp));
  const [q10, q50, q90] = quantilesAcross(ai, [0.1, 0.5, 0.9]);
  return [q10, q50, q90, relativeSpread(q10, q50, q90)];
}

// ---------------------------------------------------------------------------
// Seismic reconstruction residual (QI upgrade P1.4, 2026-10-15): the input
// trace minus the synthetic of the inverted ln(AI) through the same scaled
// wavelet and operator the inversion fitted (engines qi/inversion.js
// forwardPoststack). Where the inversion explains the seismic the residual
// is small; structured energy left in it marks what the model could not fit
// (a wrong wavelet, a tuning or noise problem). Absolute methods only: the
// coloured operator is not a forward model.

const holdFillLn = (m) => {
  const out = Float64Array.from(m, (v) => (fin(v) ? v : NaN));
  let first = -1;
  for (let i = 0; i < out.length; i++) if (fin(out[i])) { first = i; break; }
  if (first < 0) return null;
  for (let i = 0; i < first; i++) out[i] = out[first];
  for (let i = first + 1; i < out.length; i++) if (!fin(out[i])) out[i] = out[i - 1];
  return out;
};

/**
 * The residual trace. NaN where the input is null or there is no estimate.
 * @param {ArrayLike<number>} trace the input seismic
 * @param {ArrayLike<number>} lnAi the inverted ln(AI)
 * @param {ArrayLike<number>} wavelet the scaled wavelet the inversion used
 */
export function residualTrace(trace, lnAi, wavelet) {
  const n = trace.length;
  const out = new Float64Array(n).fill(NaN);
  const m = holdFillLn(lnAi);
  if (!m) return out;
  const syn = forwardPoststack(m, wavelet);
  for (let i = 0; i < n; i++) if (!isNull(trace[i]) && fin(lnAi[i])) out[i] = trace[i] - syn[i];
  return out;
}

/** The residual's RMS as a percentage of the input's RMS over the same samples. */
export function residualPercent(trace, residual) {
  let sr = 0; let sd = 0; let n = 0;
  for (let i = 0; i < trace.length; i++) {
    if (!fin(residual[i]) || isNull(trace[i])) continue;
    sr += residual[i] ** 2; sd += trace[i] ** 2; n += 1;
  }
  return n && sd > 0 ? 100 * Math.sqrt(sr / sd) : NaN;
}

// ---------------------------------------------------------------------------
// Low-frequency model options (QI upgrade P2.8, 2026-10-15): kriging in place
// of inverse distance, faults as barriers between wells, a velocity trend
// from a velocity volume calibrated at the wells, and named scenarios
// compared at the blind wells. The maths is engines qi/lfmModels.js.

export const LFM_VARIOGRAMS = ['spherical', 'exponential', 'gaussian'];
export const MAX_LFM_SCENARIOS = 6;

/** The engine options of an inversion block, or null for the original model. */
export function lfmOptionsOf(inv) {
  const l = inv?.lfm;
  if (!l || (l.method !== 'kriging' && !(l.barriers || []).length)) return null;
  return {
    method: l.method === 'kriging' ? 'kriging' : 'idw',
    ...(l.method === 'kriging' ? { variogram: { model: l.variogram?.model || 'spherical', range: Number(l.variogram?.range), sill: 1, nugget: Number(l.variogram?.nugget ?? 0) } } : {}),
    barriers: (l.barriers || []).map((line) => line.map((p) => ({ x: Number(p.x), y: Number(p.y) }))),
  };
}

/** Why the model options cannot run, or null. */
export function validateLfmOptions(inv) {
  const l = inv?.lfm;
  if (l != null) {
    if (typeof l !== 'object') return 'The model options must be an object.';
    if (l.method != null && !['idw', 'kriging'].includes(l.method)) return 'The model is interpolated by inverse distance or kriging.';
    if (l.method === 'kriging') {
      const v = l.variogram || {};
      if (!LFM_VARIOGRAMS.includes(v.model || 'spherical')) return 'The variogram is spherical, exponential or gaussian.';
      if (!(Number(v.range) > 0)) return 'Give the variogram range in metres, above zero.';
      if (v.nugget != null && !(Number(v.nugget) >= 0 && Number(v.nugget) < 1)) return 'The nugget is a share of the sill, 0 to below 1.';
    }
    if (l.barriers != null && (!Array.isArray(l.barriers) || l.barriers.length > 50 || l.barriers.some((b) => !Array.isArray(b) || b.length < 2 || b.length > 500 || b.some((p) => !fin(Number(p?.x)) || !fin(Number(p?.y)))))) return 'Each fault trace needs two map points or more (at most 50 faults).';
  }
  if (inv?.velocity != null) {
    const v = inv.velocity;
    if (!v?.volume_id) return 'Choose the velocity volume for the trend.';
    if (!['interval', 'rms'].includes(v.kind)) return 'The velocity volume holds interval or RMS velocity.';
    if (!INVERSION_METHODS[inv.method]?.absolute) return 'A velocity trend needs an absolute method.';
    if (inv.sensitivity) return 'The velocity trend runs with a single inversion; run the uncertainty run on the wells-only or kriged model.';
  }
  if (inv?.lfm_scenarios != null) {
    if (!Array.isArray(inv.lfm_scenarios) || !inv.lfm_scenarios.length || inv.lfm_scenarios.length > MAX_LFM_SCENARIOS) return `Compare one to ${MAX_LFM_SCENARIOS} model scenarios.`;
    for (const sc of inv.lfm_scenarios) {
      if (!sc?.name) return 'Each model scenario needs a name.';
      const why = validateLfmOptions({ method: inv.method, lfm: sc.lfm || null, velocity: sc.velocity ? inv.velocity || {} : null });
      if (why) return `${sc.name}: ${why}`;
    }
  }
  return null;
}

/**
 * A velocity trace ready for the trend: RMS taken to interval by Dix, nulls
 * as gaps, low-passed at the model cut like the well logs.
 */
export function velocityForLfm(trace, { kind, dtMs, lfmHz }) {
  const v = Float64Array.from(trace, (x) => (isNull(x) || !(x > 0) ? NaN : x));
  const vi = kind === 'rms' ? intervalFromRms(v, dtMs) : v;
  return lowPassFinite(vi, halfWindowFor(lfmHz, dtMs));
}

/** A fault's map trace: the middle point of each stick, in stick order, on the survey's world grid. */
export function faultTraceXY(fault, posOf) {
  const pts = [];
  for (const st of fault?.sticks || []) {
    const p = st.points || [];
    if (!p.length) continue;
    const m = p[Math.floor(p.length / 2)];
    if (Number.isFinite(m.il) && Number.isFinite(m.xl)) pts.push(posOf(m.il, m.xl));
  }
  return pts;
}
