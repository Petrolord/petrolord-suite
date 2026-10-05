/**
 * Well Spacing Optimizer: uncertainty on the recovery factor, the reservoir
 * area and the oil price (WS-U2-008), per spacing case.
 *
 * No private Monte Carlo: the draws come from the Suite's canonical sampler
 * (src/lib/monteCarlo.js, the module CLAUDE.md and
 * docs/scope/ReservoirEngineering-Module.md section 5 name), seeded with its
 * mulberry32; every realisation is a full case run through the app engine,
 * whose NPV is the canonical calculateEconomics. The same draws are used for
 * every spacing (common random numbers), so the cases are compared on the
 * same uncertainty.
 *
 * Each uncertain input is triangular: low, the value on the form as the most
 * likely, high. A blank low and high hold the input at its value.
 *
 * Percentiles are read with the quantile rule of the screening Monte Carlo
 * and labelled by the Suite convention (src/lib/percentileConventions.js):
 * NPV is an outcome where more is better, so P90 is the LOW case (90
 * percent probability of meeting or exceeding it, the 10th percentile of the
 * sorted values) and P10 the high case.
 *
 * Pure.
 */
import { quantile } from 'simple-statistics';
import { createCorrelatedSampler, mulberry32 } from '@/lib/monteCarlo';
import { EXCEEDANCE_DEFINITION } from '@/lib/percentileConventions';
import { DEFAULT_MC_SEED } from '@/utils/npvCalculations';
import { runSpacingCases, spacingParameters, spacingNpv } from '@/utils/wellSpacingCalculations';

export const MC_DEFAULT_ITERATIONS = 300;
export const MC_MAX_ITERATIONS = 5000;
export { DEFAULT_MC_SEED };

/** The uncertain inputs: the form key of the most likely value and of its low and high. */
export const MC_VARIABLES = Object.freeze([
  { key: 'recoveryFactor', low: 'mcRfLow', high: 'mcRfHigh', label: 'Recovery factor', unit: '%' },
  { key: 'reservoirArea', low: 'mcAreaLow', high: 'mcAreaHigh', label: 'Reservoir area', unit: 'acres' },
  { key: 'oilPrice', low: 'mcPriceLow', high: 'mcPriceHigh', label: 'Oil price', unit: 'US$/STB' },
]);

export const MC_CONVENTION = `NPV is an outcome where more is better: P90 is the low case (the 10th percentile of the realisations) and P10 the high case. ${EXCEEDANCE_DEFINITION}`;

const num = (v) => (v == null || String(v).trim() === '' ? NaN : Number(v));

/** The distributions of the form, or the reasons they cannot be built. */
export function mcDistributions(form) {
  const dists = {};
  const errors = [];
  for (const v of MC_VARIABLES) {
    const mode = num(form[v.key]);
    const lo = num(form[v.low]);
    const hi = num(form[v.high]);
    if (Number.isNaN(lo) && Number.isNaN(hi)) { dists[v.key] = { type: 'constant', value: mode }; continue; }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) { errors.push(`${v.label}: give both the low and the high, or neither.`); continue; }
    if (!(lo <= mode && mode <= hi)) { errors.push(`${v.label}: the low (${lo}) and high (${hi}) must bracket the value on the form (${mode}).`); continue; }
    if (!(lo > 0)) { errors.push(`${v.label}: the low must be greater than zero.`); continue; }
    if (v.key === 'recoveryFactor' && hi > 100) { errors.push('Recovery factor: the high must be 100 or less.'); continue; }
    dists[v.key] = lo === hi ? { type: 'constant', value: mode } : { type: 'triangular', min: lo, mode, max: hi };
  }
  return { dists, errors };
}

/**
 * The uncertainty run of a study.
 * @param {object} form the study form (validated)
 * @returns {{ok: true, seed, iterations, varying: string[], convention, cases: Array<{spacing, p90, p50, p10, mean, probLoss, npvs?}>}|{ok: false, errors: string[]}}
 */
export function runSpacingMonteCarlo(form, { keepValues = false } = {}) {
  const { dists, errors } = mcDistributions(form);
  const itRaw = num(form.mcIterations);
  const iterations = Number.isFinite(itRaw) ? Math.round(itRaw) : MC_DEFAULT_ITERATIONS;
  const seedRaw = num(form.mcSeed);
  const seed = Number.isFinite(seedRaw) ? Math.round(seedRaw) : DEFAULT_MC_SEED;
  if (!(iterations >= 50 && iterations <= MC_MAX_ITERATIONS)) errors.push(`Realisations must be between 50 and ${MC_MAX_ITERATIONS}.`);
  if (errors.length) return { ok: false, errors };
  const sampler = createCorrelatedSampler({ inputs: dists, paramOrder: MC_VARIABLES.map((v) => v.key), rng: mulberry32(seed) });
  if (!sampler.varKeys.length) return { ok: false, errors: ['No input is uncertain: give a low and a high for at least one of recovery factor, area and oil price.'] };
  const base = runSpacingCases(form);
  const spacings = base.spacingResults.map((r) => r.spacing);
  const npvs = spacings.map(() => []);
  const p0 = spacingParameters(form);
  // the drawn values in the engine's own parsing: RF a fraction, area acres, price US$/STB
  const toP = { recoveryFactor: (v) => ({ recoveryFactor: v / 100 }), reservoirArea: (v) => ({ reservoirArea: v }), oilPrice: (v) => ({ oilPrice: v }) };
  for (let i = 0; i < iterations; i += 1) {
    const { values } = sampler.sample();
    let p = p0;
    for (const k of sampler.varKeys) p = { ...p, ...toP[k](values[k]) };
    // each case's NPV is the canonical run of the case table; a spacing no whole well fits has no wells, no capex and no oil
    spacings.forEach((s, j) => npvs[j].push(spacingNpv(s, p)));
  }
  const cases = spacings.map((s, j) => {
    const v = [...npvs[j]].sort((a, b) => a - b);
    return {
      spacing: s,
      p90: quantile(v, 0.1),
      p50: quantile(v, 0.5),
      p10: quantile(v, 0.9),
      mean: v.reduce((a, b) => a + b, 0) / v.length,
      probLoss: v.filter((x) => x < 0).length / v.length,
      base: base.spacingResults[j].npv,
      ...(keepValues ? { npvs: v } : {}),
    };
  });
  return { ok: true, seed, iterations, varying: sampler.varKeys, distributions: dists, convention: MC_CONVENTION, cases };
}
