// Monte Carlo uncertainty engine for the Waterflood Design Studio (W4).
//
// Samples uncertain displacement and pattern inputs through the canonical
// Suite Monte Carlo module (src/lib/monteCarlo.js, Gaussian copula) and
// pushes every realization through the golden-tested five-spot forecast
// engine (patternForecastCalculations.forecastPattern). No forecast physics
// is re-implemented here; a realization is just the working case with the
// sampled values substituted in.
//
// Outputs use the petroleum percentile convention (P90 = low case).
// Sensitivity is Spearman rank correlation of each sampled input against
// cumulative oil Np: the engine response is nonlinear but monotone in every
// supported input, so rank correlation is the honest measure (a standardized
// linear-regression coefficient would understate curved responses).
//
// Realizations that violate the same validity gates the deterministic tabs
// enforce (e.g. sampled Swc + Sor leaving no mobile saturation window) are
// rejected and counted, mirroring ReservoirCalc Pro's truncation accounting.

import { createCorrelatedSampler, basicStats, rankCorrelationSensitivity } from '@/lib/monteCarlo';
import { forecastPattern } from './patternForecastCalculations';

// Parameters the engine knows how to vary. `coreyOnly` marks rel-perm shape
// parameters that only exist when the displacement uses Corey curves (a
// pasted kr table has no Swc/Sor/endpoint knobs to perturb).
export const UNCERTAINTY_PARAMS = [
  { key: 'Swc', group: 'displacement', label: 'Connate water Swc', coreyOnly: true },
  { key: 'Sor', group: 'displacement', label: 'Residual oil Sor', coreyOnly: true },
  { key: 'krwMax', group: 'displacement', label: 'krw endpoint', coreyOnly: true },
  { key: 'kroMax', group: 'displacement', label: 'kro endpoint', coreyOnly: true },
  { key: 'muO', group: 'displacement', label: 'Oil viscosity (cp)' },
  { key: 'muW', group: 'displacement', label: 'Water viscosity (cp)' },
  { key: 'area_acres', group: 'pattern', label: 'Pattern area (acres)' },
  { key: 'h_ft', group: 'pattern', label: 'Net thickness (ft)' },
  { key: 'phi', group: 'pattern', label: 'Porosity (frac)' },
  { key: 'Bo', group: 'pattern', label: 'Bo (rb/stb)' },
  { key: 'iw_bpd', group: 'pattern', label: 'Injection rate (rb/d)' },
  { key: 'EV', group: 'pattern', label: 'Vertical sweep EV' },
];

const DISPLACEMENT_KEYS = new Set(['muO', 'muW']);
const COREY_KEYS = new Set(['Swc', 'Sor', 'krwMax', 'kroMax']);
const PATTERN_KEYS = new Set(['area_acres', 'h_ft', 'phi', 'Bo', 'iw_bpd', 'EV']);

const PARAM_LABELS = Object.fromEntries(UNCERTAINTY_PARAMS.map((p) => [p.key, p.label]));
export const uncertaintyParamLabel = (key) => PARAM_LABELS[key] || key;

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Parse the studio's string-valued uncertainty config into numeric
 * distributions for the sampler. Returns { distributions, iterations,
 * errors } where errors are user-facing messages for invalid entries
 * (an invalid enabled parameter is an error, not a silent skip).
 *
 * config = {
 *   iterations: '1000',
 *   params: { key: { enabled, type, min, mode, max, mean, stdDev } },
 * }
 */
export function parseUncertaintyConfig(config) {
  const errors = [];
  const distributions = {};
  const iterations = Math.floor(num(config?.iterations));

  Object.entries(config?.params || {}).forEach(([key, p]) => {
    if (!p?.enabled) return;
    const label = uncertaintyParamLabel(key);
    if (!PARAM_LABELS[key]) {
      errors.push(`Unknown uncertain parameter "${key}".`);
      return;
    }
    const type = p.type || 'triangular';
    if (type === 'triangular') {
      const min = num(p.min);
      const mode = num(p.mode);
      const max = num(p.max);
      if (![min, mode, max].every(Number.isFinite) || !(min <= mode && mode <= max) || !(max > min)) {
        errors.push(`${label}: triangular needs min <= mode <= max with max > min.`);
        return;
      }
      distributions[key] = { type, min, mode, max };
    } else if (type === 'uniform') {
      const min = num(p.min);
      const max = num(p.max);
      if (![min, max].every(Number.isFinite) || !(max > min)) {
        errors.push(`${label}: uniform needs max > min.`);
        return;
      }
      distributions[key] = { type, min, max };
    } else if (type === 'normal' || type === 'lognormal') {
      const mean = num(p.mean);
      const stdDev = num(p.stdDev);
      if (![mean, stdDev].every(Number.isFinite) || !(stdDev > 0)) {
        errors.push(`${label}: ${type} needs a numeric mean and a positive standard deviation.`);
        return;
      }
      if (type === 'lognormal' && !(mean > 0)) {
        errors.push(`${label}: lognormal needs a positive mean.`);
        return;
      }
      distributions[key] = { type, mean, stdDev };
    } else {
      errors.push(`${label}: unsupported distribution type "${type}".`);
    }
  });

  if (!Number.isFinite(iterations) || iterations < 100 || iterations > 20000) {
    errors.push('Iterations must be between 100 and 20,000.');
  }

  return { distributions, iterations, errors };
}

// Validity gates for one realization; mirrors buildDisplacementSpec and the
// pattern gate in the deterministic tabs. Returns a rejection reason or null.
export function realizationRejection(spec, pattern) {
  const kr = spec.krSpec;
  if (kr?.type === 'corey') {
    if (!(1 - kr.Swc - kr.Sor > 0.01)) return 'no mobile saturation window (1 - Swc - Sor <= 0.01)';
    if (!(kr.krwMax > 0) || !(kr.kroMax > 0)) return 'non-positive rel-perm endpoint';
    if (!(kr.Swc >= 0) || !(kr.Sor >= 0)) return 'negative saturation endpoint';
  }
  if (!(spec.muW > 0) || !(spec.muO > 0)) return 'non-positive viscosity';
  if (![pattern.area_acres, pattern.h_ft, pattern.phi, pattern.Bo, pattern.Bw, pattern.iw_bpd].every((v) => v > 0)) {
    return 'non-positive pattern input';
  }
  if (!(pattern.phi < 1)) return 'porosity at or above 1';
  if (!(pattern.EV > 0 && pattern.EV <= 1)) return 'vertical sweep EV outside (0, 1]';
  return null;
}

// Apply one sample's values onto copies of the base spec and pattern.
function applySample(displacementSpec, pattern, values) {
  const spec = { ...displacementSpec, krSpec: { ...displacementSpec.krSpec } };
  const pat = { ...pattern };
  Object.entries(values).forEach(([key, val]) => {
    if (COREY_KEYS.has(key)) spec.krSpec[key] = val;
    else if (DISPLACEMENT_KEYS.has(key)) spec[key] = val;
    else if (PATTERN_KEYS.has(key)) pat[key] = val;
  });
  return { spec, pat };
}

/**
 * Incremental run state shared by the sync and async entry points.
 * step(count) advances up to `count` iterations; finalize() builds the
 * result object.
 */
function createRun({ displacementSpec, pattern, distributions, correlations = [], iterations, rng = Math.random }) {
  if (!displacementSpec || !pattern) {
    throw new Error('Uncertainty run needs a valid working displacement spec and pattern.');
  }
  if (displacementSpec.krSpec?.type === 'table') {
    const bad = Object.keys(distributions).filter((k) => COREY_KEYS.has(k));
    if (bad.length) {
      throw new Error('Rel-perm shape parameters cannot be varied with a tabular kr curve. Disable them or switch to Corey.');
    }
  }

  const paramOrder = UNCERTAINTY_PARAMS.map((p) => p.key);
  const sampler = createCorrelatedSampler({ inputs: distributions, paramOrder, correlations, rng });
  if (sampler.varKeys.length === 0) {
    throw new Error('Enable at least one uncertain parameter with genuine spread.');
  }

  const iters = Math.max(100, Math.floor(iterations || 1000));
  const inputSeries = Object.fromEntries(sampler.varKeys.map((k) => [k, []]));
  const npArr = [];
  const rfArr = [];
  const ooipArr = [];
  const btArr = [];
  const rejectionReasons = {};
  let done = 0;
  let rejected = 0;
  let btNever = 0;

  const step = (count) => {
    const end = Math.min(iters, done + count);
    for (; done < end; done++) {
      const { values } = sampler.sample();
      const { spec, pat } = applySample(displacementSpec, pattern, values);
      const reason = realizationRejection(spec, pat);
      if (reason) {
        rejected++;
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
        continue;
      }
      const { summary, breakthrough } = forecastPattern({ displacementSpec: spec, pattern: pat });
      if (!summary || !Number.isFinite(summary.Np_stb)) {
        rejected++;
        rejectionReasons['degenerate forecast'] = (rejectionReasons['degenerate forecast'] || 0) + 1;
        continue;
      }
      sampler.varKeys.forEach((k) => inputSeries[k].push(values[k]));
      npArr.push(summary.Np_stb);
      rfArr.push(summary.recoveryFactorOfFloodedOOIP ?? 0);
      ooipArr.push(summary.ooip_flooded_stb);
      if (breakthrough) btArr.push(breakthrough.t_days / 365.25);
      else btNever++;
    }
    return done / iters;
  };

  const finalize = () => {
    const warnings = [];
    const rejectionRate = (rejected / iters) * 100;
    if (rejectionRate > 5) {
      warnings.push(`High rejection rate: ${rejectionRate.toFixed(1)}% of realizations were physically invalid. Tighten the distributions.`);
    }
    if (btNever > 0) {
      warnings.push(`${btNever} realizations never reached breakthrough within the forecast horizon; breakthrough statistics exclude them.`);
    }
    if (npArr.length === 0) {
      return {
        iterations: iters,
        validCount: 0,
        rejectedCount: rejected,
        rejectionReasons,
        btNeverCount: btNever,
        stats: { np: {}, rf: {}, ooip: {}, btYears: {} },
        sensitivity: [],
        varKeys: sampler.varKeys,
        warnings: [...warnings, 'No valid realizations were generated. Check the distribution ranges.'],
      };
    }

    const sensitivity = rankCorrelationSensitivity(inputSeries, npArr).map((e) => ({
      ...e,
      label: uncertaintyParamLabel(e.parameter),
    }));

    return {
      iterations: iters,
      validCount: npArr.length,
      rejectedCount: rejected,
      rejectionReasons,
      btNeverCount: btNever,
      stats: {
        np: basicStats(npArr),
        rf: basicStats(rfArr),
        ooip: basicStats(ooipArr),
        btYears: basicStats(btArr),
      },
      sensitivity,
      varKeys: sampler.varKeys,
      warnings,
    };
  };

  return { step, finalize, total: iters };
}

/** Synchronous full run (tests, small runs). */
export function runWaterfloodUncertainty(args) {
  const run = createRun(args);
  run.step(run.total);
  return run.finalize();
}

/**
 * Chunked asynchronous run for the UI: yields to the event loop between
 * chunks so the studio stays responsive, reporting progress in [0, 1].
 */
export function runWaterfloodUncertaintyAsync(args, onProgress, chunkSize = 200) {
  return new Promise((resolve, reject) => {
    let run;
    try {
      run = createRun(args);
    } catch (e) {
      reject(e);
      return;
    }
    const tick = () => {
      try {
        const progress = run.step(chunkSize);
        if (typeof onProgress === 'function') onProgress(progress);
        if (progress >= 1) resolve(run.finalize());
        else setTimeout(tick, 0);
      } catch (e) {
        reject(e);
      }
    };
    setTimeout(tick, 0);
  });
}
