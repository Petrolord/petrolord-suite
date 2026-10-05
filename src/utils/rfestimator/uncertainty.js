/**
 * Recovery factor times in-place volume, with uncertainty (RF-U2-002).
 *
 * Every draw goes through the canonical Suite Monte Carlo module
 * (src/lib/monteCarlo.js: createCorrelatedSampler, its seeded mulberry32
 * generator and basicStats), the sanctioned home of Monte Carlo in the Suite
 * (CLAUDE.md; docs/scope/ReservoirEngineering-Module.md section 5). Nothing
 * here samples on its own: a realisation is one RF and one in-place volume
 * from the sampler, and the recoverable volume is their product.
 *
 * Percentiles follow the Suite's exceedance convention (SPE PRMS): P90 is
 * the low case, a 90 percent probability that the outcome meets or exceeds
 * it; P10 the high case. The run is seeded; the seed and the realisation
 * count are saved with the project and printed.
 *
 * Distributions:
 *   RF   'analog'    triangular: the edges of the analog range as minimum and
 *                    maximum, the typical value as the mode
 *        'estimate'  triangular: the range edges, with the estimate of the
 *                    method as the mode (the estimate must lie inside)
 *        'stated'    triangular: minimum, mode and maximum typed
 *   In place  'fixed'        the deterministic value of the case
 *             'stated'       triangular: minimum, mode and maximum typed
 *             'percentiles'  P90, P50, P10 typed (as ReservoirCalc Pro prints
 *                            them), fitted to a triangular through those three
 *                            percentiles by the canonical fitTriangularToPercentiles
 *             'intake95'     the 95 percent interval of a Material Balance
 *                            history match, read as a normal distribution
 *                            (mean the value, standard deviation the half
 *                            width over 1.96)
 * RF and in-place volume are sampled independently. The typed in-place
 * values are stored in MMSTB (oil) or Bscf (gas), the multiple the screen
 * shows; the run works in STB or scf.
 *
 * A realisation with RF outside (0, 1) or an in-place volume not above zero
 * is rejected and counted (it is not clamped).
 *
 * Pure.
 */
import {
  createCorrelatedSampler, basicStats, mulberry32, fitTriangularToPercentiles, representativeValue,
} from '@/lib/monteCarlo';
import { EXCEEDANCE_DEFINITION } from '@/lib/percentileConventions';

export const RF_MC_DEFAULTS = Object.freeze({
  enabled: false, rfSource: 'analog', ipSource: 'fixed', iterations: '5000', seed: '',
  rfMin: '', rfMode: '', rfMax: '', ipMin: '', ipMode: '', ipMax: '', ipP90: '', ipP50: '', ipP10: '',
});
export const RF_MC_CONVENTION = `${EXCEEDANCE_DEFINITION} P90 is the low case and P10 the high case.`;
export const Z95 = 1.959963984540054;
export const MAX_SEED = 4294967295;

const num = (v) => {
  if (v === '' || v == null) return NaN;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

/** A fresh 32-bit seed (recorded with the run). */
export function drawSeed() {
  try {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0];
  } catch {
    return Math.floor(Math.random() * (MAX_SEED + 1));
  }
}

const tri = (min, mode, max) => ({ type: 'triangular', min, mode, max });
const triOk = (d) => [d.min, d.mode, d.max].every(Number.isFinite) && d.min <= d.mode && d.mode <= d.max;

/**
 * The distributions of a run from the stored config and the case.
 * @param {object} mc stored config (strings; in-place in STB or scf)
 * @param {{result: object, inPlace: ?number, inPlaceIntake?: ?object, phase?: 'oil'|'gas'}} c
 * @returns {{rf: ?object, ip: ?object, iterations: number, seed: ?number, errors: string[], notes: string[], words: {rf: string, ip: string}}}
 */
export function rfMcDistributions(mc, { result, inPlace, inPlaceIntake = null, phase = 'oil' }) {
  const cfg = { ...RF_MC_DEFAULTS, ...(mc || {}) };
  const big = phase === 'gas' ? 1e9 : 1e6; // Bscf or MMSTB typed; scf or STB run
  const ipNum = (v) => num(v) * big;
  const errors = [];
  const notes = [];
  const a = result?.analog;
  let rf = null;
  let rfWords = '';
  if (cfg.rfSource === 'stated') {
    rf = tri(num(cfg.rfMin), num(cfg.rfMode), num(cfg.rfMax));
    if (!triOk(rf)) { errors.push('Recovery factor: a triangular needs minimum <= mode <= maximum.'); rf = null; } else if (!(rf.min > 0 && rf.max < 1)) { errors.push('Recovery factor: the triangular must lie inside 0 to 1 (a fraction).'); rf = null; }
    rfWords = 'Triangular, minimum, mode and maximum as stated';
  } else if (!a) {
    errors.push('Recovery factor: no drive mechanism is named, so there is no analog range to sample.');
  } else if (cfg.rfSource === 'estimate') {
    const est = result?.rf;
    if (!Number.isFinite(est)) errors.push('Recovery factor: the method gave no estimate to use as the mode.');
    else if (!(est >= a.low && est <= a.high)) errors.push(`Recovery factor: the estimate ${(est * 100).toFixed(1)} percent lies outside the analog range (${(a.low * 100).toFixed(0)} to ${(a.high * 100).toFixed(0)} percent), so it cannot be the mode of a triangular on the range edges. State a distribution instead.`);
    else rf = tri(a.low, est, a.high);
    rfWords = `Triangular on the ${a.label} range edges with the method's estimate as the mode`;
  } else {
    rf = tri(a.low, a.typical, a.high);
    rfWords = `Triangular on the ${a.label} range edges with the typical value as the mode`;
  }

  let ip = null;
  let ipWords = '';
  if (cfg.ipSource === 'stated') {
    ip = tri(ipNum(cfg.ipMin), ipNum(cfg.ipMode), ipNum(cfg.ipMax));
    if (!triOk(ip) || !(ip.min > 0)) { errors.push('In-place volume: a triangular needs 0 < minimum <= mode <= maximum.'); ip = null; }
    ipWords = 'Triangular, minimum, mode and maximum as stated';
  } else if (cfg.ipSource === 'percentiles') {
    const p90 = ipNum(cfg.ipP90); const p50 = ipNum(cfg.ipP50); const p10 = ipNum(cfg.ipP10);
    if (![p90, p50, p10].every(Number.isFinite) || !(p90 > 0 && p90 <= p50 && p50 <= p10)) {
      errors.push('In-place volume: P90, P50 and P10 must be above zero with P90 <= P50 <= P10 (P90 the low case).');
    } else {
      // exceedance P90 is the 10th percentile of the outcome
      const fit = fitTriangularToPercentiles(p90, p50, p10);
      ip = tri(fit.min, fit.mode, fit.max);
      if (!fit.exact && fit.note) notes.push(`In-place volume: ${fit.note}.`);
      if (fit.min <= 0) notes.push('In-place volume: the triangular fitted through the stated percentiles reaches below zero; realisations at or below zero are rejected and counted.');
    }
    ipWords = 'Triangular fitted through the stated P90, P50 and P10 (P90 the low case)';
  } else if (cfg.ipSource === 'intake95') {
    const ci = inPlaceIntake?.ci95;
    if (!Array.isArray(ci) || !ci.every(Number.isFinite) || !(ci[1] > ci[0])) {
      errors.push('In-place volume: the in-place source states no 95 percent interval. Take the volume from a Material Balance history match that has one, or state a distribution.');
    } else {
      const mean = Number.isFinite(inPlace) ? inPlace : (ci[0] + ci[1]) / 2;
      ip = { type: 'normal', mean, stdDev: (ci[1] - ci[0]) / (2 * Z95), min: 0 };
    }
    ipWords = `Normal: mean the ${inPlaceIntake?.quantity || 'in-place volume'} taken, standard deviation the half width of the source's 95 percent interval over 1.96`;
  } else {
    if (!(Number.isFinite(inPlace) && inPlace > 0)) errors.push('In-place volume: the case has no in-place volume to hold fixed.');
    else ip = { type: 'constant', value: inPlace };
    ipWords = 'Fixed at the deterministic value of the case';
  }

  const iterations = Math.floor(num(cfg.iterations));
  if (!Number.isFinite(iterations) || iterations < 100 || iterations > 50000) errors.push('Realisations must be a whole number from 100 to 50,000.');
  let seed = null;
  const seedText = String(cfg.seed ?? '').trim();
  const s = Number(seedText);
  if (seedText === '' || !Number.isInteger(s) || s < 0 || s > MAX_SEED) errors.push('The seed must be a whole number from 0 to 4,294,967,295. Press New seed to draw one.');
  else seed = s;
  return { rf, ip, iterations, seed, errors, notes, words: { rf: rfWords, ip: ipWords } };
}

/**
 * One seeded run: RF x in-place through the canonical sampler.
 * @param {{rf: object, ip: object, iterations: number, seed: number}} d
 */
export function runRfMonteCarlo({ rf, ip, iterations, seed }) {
  const rng = mulberry32(seed);
  const inputs = { rf, ip };
  const sampler = createCorrelatedSampler({ inputs, paramOrder: ['rf', 'ip'], rng });
  const fixed = { rf: representativeValue(rf), ip: representativeValue(ip) };
  const rfs = []; const ips = []; const recs = [];
  let rejected = 0;
  for (let i = 0; i < iterations; i += 1) {
    const { values } = sampler.sample();
    const r = values.rf ?? fixed.rf;
    const v = values.ip ?? fixed.ip;
    if (!(r > 0 && r < 1) || !(v > 0)) { rejected += 1; continue; }
    rfs.push(r); ips.push(v); recs.push(r * v);
  }
  const strip = (st) => (st && Number.isFinite(st.p50) ? { p90: st.p90, p50: st.p50, p10: st.p10, mean: st.mean, min: st.min, max: st.max, stdDev: st.stdDev, cdf: st.cdf } : null);
  return {
    seed, iterations, accepted: rfs.length, rejected, varying: sampler.varKeys,
    stats: { rf: strip(basicStats(rfs)), inPlace: strip(basicStats(ips)), recoverable: strip(basicStats(recs)) },
  };
}

/**
 * The run of a case, or why there is none. Pure and deterministic for a seed.
 * @returns {?object} null when uncertainty is off
 */
export function rfUncertainty(mc, c) {
  if (!mc?.enabled) return null;
  const d = rfMcDistributions(mc, c);
  if (d.errors.length) return { ok: false, errors: d.errors, notes: d.notes, words: d.words, seed: d.seed, iterations: d.iterations };
  const run = runRfMonteCarlo(d);
  if (!run.accepted) return { ok: false, errors: ['Every realisation was rejected (RF outside 0 to 1 or an in-place volume not above zero). Check the distributions.'], notes: d.notes, words: d.words, seed: d.seed, iterations: d.iterations };
  const notes = [...d.notes];
  if (run.rejected) notes.push(`${run.rejected} of ${run.iterations} realisations were rejected (RF outside 0 to 1 or an in-place volume not above zero) and are not in the statistics.`);
  return { ok: true, ...run, distributions: { rf: d.rf, ip: d.ip }, words: d.words, notes, convention: RF_MC_CONVENTION };
}
