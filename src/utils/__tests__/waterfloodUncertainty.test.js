// Validation suite for the Waterflood Design Studio Monte Carlo engine (W4).
//
// The physics is forecastPattern's (already golden-tested); what this suite
// locks is the uncertainty layer on top of it: config parsing, realization
// validity gates and rejection accounting, the petroleum percentile
// convention, convergence to the deterministic answer as spreads collapse,
// and the SIGNS of the rank-correlation sensitivities, which are known from
// the physics:
//   Sor up  -> less mobile oil            -> Np down (rho < 0)
//   muO up  -> adverse mobility ratio     -> Np down (rho < 0)
//   h_ft up -> more pore volume flooded   -> Np up   (rho > 0)
//   Bo up   -> fewer stock-tank barrels   -> Np down (rho < 0)
// All runs use a seeded LCG so results are reproducible.
import {
  parseUncertaintyConfig,
  runWaterfloodUncertainty,
  runWaterfloodUncertaintyAsync,
  realizationRejection,
  UNCERTAINTY_PARAMS,
} from '@/utils/waterfloodUncertainty';
import { forecastPattern } from '@/utils/patternForecastCalculations';

const makeLcg = (seed = 42) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
};

const BASE_SPEC = {
  krSpec: { type: 'corey', Swc: 0.2, Sor: 0.2, krwMax: 0.4, kroMax: 1.0, nw: 2, no: 2 },
  muW: 0.5,
  muO: 5.0,
};
const BASE_PATTERN = {
  area_acres: 40, h_ft: 25, phi: 0.22, Bo: 1.25, Bw: 1.02, iw_bpd: 800,
  Sgi: 0, EV: 1, worLimit: 25, maxYears: 30,
};

describe('parseUncertaintyConfig', () => {
  it('parses enabled triangular and normal entries into numeric distributions', () => {
    const { distributions, iterations, errors } = parseUncertaintyConfig({
      iterations: '500',
      params: {
        muO: { enabled: true, type: 'triangular', min: '3', mode: '5', max: '9' },
        phi: { enabled: true, type: 'normal', mean: '0.22', stdDev: '0.02' },
        h_ft: { enabled: false, type: 'triangular', min: '10', mode: '25', max: '40' },
      },
    });
    expect(errors).toEqual([]);
    expect(iterations).toBe(500);
    expect(distributions).toEqual({
      muO: { type: 'triangular', min: 3, mode: 5, max: 9 },
      phi: { type: 'normal', mean: 0.22, stdDev: 0.02 },
    });
  });

  it('reports user-facing errors for invalid enabled entries', () => {
    const { errors } = parseUncertaintyConfig({
      iterations: '500',
      params: {
        muO: { enabled: true, type: 'triangular', min: '9', mode: '5', max: '3' }, // reversed
        phi: { enabled: true, type: 'lognormal', mean: '-1', stdDev: '0.1' },     // negative mean
        Bo: { enabled: true, type: 'normal', mean: '1.2', stdDev: '0' },          // zero spread
      },
    });
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatch(/min <= mode <= max/);
    expect(errors[1]).toMatch(/positive mean/);
    expect(errors[2]).toMatch(/positive standard deviation/);
  });

  it('bounds iterations to 100..20,000', () => {
    expect(parseUncertaintyConfig({ iterations: '50', params: {} }).errors[0]).toMatch(/Iterations/);
    expect(parseUncertaintyConfig({ iterations: '50000', params: {} }).errors[0]).toMatch(/Iterations/);
    expect(parseUncertaintyConfig({ iterations: 'abc', params: {} }).errors[0]).toMatch(/Iterations/);
    expect(parseUncertaintyConfig({ iterations: '1000', params: {} }).errors).toEqual([]);
  });
});

describe('realizationRejection', () => {
  it('mirrors the deterministic validity gates', () => {
    expect(realizationRejection(BASE_SPEC, BASE_PATTERN)).toBeNull();
    expect(realizationRejection(
      { ...BASE_SPEC, krSpec: { ...BASE_SPEC.krSpec, Swc: 0.5, Sor: 0.5 } }, BASE_PATTERN,
    )).toMatch(/mobile saturation window/);
    expect(realizationRejection({ ...BASE_SPEC, muO: 0 }, BASE_PATTERN)).toMatch(/viscosity/);
    expect(realizationRejection(BASE_SPEC, { ...BASE_PATTERN, phi: -0.1 })).toMatch(/non-positive pattern/);
    expect(realizationRejection(BASE_SPEC, { ...BASE_PATTERN, EV: 1.4 })).toMatch(/EV/);
  });
});

describe('runWaterfloodUncertainty', () => {
  it('throws when no parameter carries genuine spread', () => {
    expect(() => runWaterfloodUncertainty({
      displacementSpec: BASE_SPEC,
      pattern: BASE_PATTERN,
      distributions: { muO: { type: 'uniform', min: 5, max: 5 } },
      iterations: 200,
    })).toThrow(/at least one uncertain parameter/);
  });

  it('refuses to vary Corey shape parameters against a tabular kr curve', () => {
    const tableSpec = {
      krSpec: {
        type: 'table',
        rows: [
          { Sw: 0.2, krw: 0, kro: 1 },
          { Sw: 0.5, krw: 0.1, kro: 0.3 },
          { Sw: 0.8, krw: 0.4, kro: 0 },
        ],
      },
      muW: 0.5,
      muO: 5,
    };
    expect(() => runWaterfloodUncertainty({
      displacementSpec: tableSpec,
      pattern: BASE_PATTERN,
      distributions: { Sor: { type: 'uniform', min: 0.1, max: 0.3 } },
      iterations: 200,
    })).toThrow(/tabular kr/);
  });

  it('collapses to the deterministic forecast as the spread vanishes', () => {
    const det = forecastPattern({ displacementSpec: BASE_SPEC, pattern: BASE_PATTERN });
    const res = runWaterfloodUncertainty({
      displacementSpec: BASE_SPEC,
      pattern: BASE_PATTERN,
      distributions: { muO: { type: 'uniform', min: 4.999, max: 5.001 } },
      iterations: 200,
      rng: makeLcg(1),
    });
    expect(res.validCount).toBe(200);
    expect(res.rejectedCount).toBe(0);
    expect(Math.abs(res.stats.np.p50 - det.summary.Np_stb) / det.summary.Np_stb).toBeLessThan(0.005);
    expect(Math.abs(res.stats.rf.p50 - det.summary.recoveryFactorOfFloodedOOIP)).toBeLessThan(0.005);
  });

  it('recovers the physics-known sensitivity signs and the percentile convention', () => {
    const res = runWaterfloodUncertainty({
      displacementSpec: BASE_SPEC,
      pattern: BASE_PATTERN,
      distributions: {
        Sor: { type: 'triangular', min: 0.1, mode: 0.2, max: 0.35 },
        muO: { type: 'lognormal', mean: 5, stdDev: 2.5 },
        h_ft: { type: 'triangular', min: 15, mode: 25, max: 40 },
        Bo: { type: 'uniform', min: 1.1, max: 1.4 },
      },
      iterations: 400,
      rng: makeLcg(42),
    });
    expect(res.validCount).toBeGreaterThan(380);

    const rho = Object.fromEntries(res.sensitivity.map((e) => [e.parameter, e.rho]));
    expect(rho.Sor).toBeLessThan(0);
    expect(rho.muO).toBeLessThan(0);
    expect(rho.h_ft).toBeGreaterThan(0);
    expect(rho.Bo).toBeLessThan(0);

    // Petroleum convention: P90 is the low case.
    expect(res.stats.np.p90).toBeLessThanOrEqual(res.stats.np.p50);
    expect(res.stats.np.p50).toBeLessThanOrEqual(res.stats.np.p10);
    expect(res.stats.rf.p90).toBeLessThanOrEqual(res.stats.rf.p10);

    // Contributions normalize to 100 and every entry carries a display label.
    const total = res.sensitivity.reduce((s, e) => s + e.contribution, 0);
    expect(Math.abs(total - 100)).toBeLessThan(1e-9);
    res.sensitivity.forEach((e) => expect(typeof e.label).toBe('string'));
  });

  it('rejects physically invalid realizations and reports the reason', () => {
    // Base Sor = 0.2, so any sampled Swc > 0.79 leaves no mobile window.
    const res = runWaterfloodUncertainty({
      displacementSpec: BASE_SPEC,
      pattern: BASE_PATTERN,
      distributions: { Swc: { type: 'uniform', min: 0.5, max: 0.9 } },
      iterations: 400,
      rng: makeLcg(7),
    });
    expect(res.rejectedCount).toBeGreaterThan(0);
    expect(res.validCount + res.rejectedCount).toBe(400);
    expect(Object.keys(res.rejectionReasons).join(' ')).toMatch(/mobile saturation window/);
    expect(res.warnings.join(' ')).toMatch(/rejection rate/i);
  });

  it('returns an empty-stats result when every realization is invalid', () => {
    const res = runWaterfloodUncertainty({
      displacementSpec: BASE_SPEC,
      pattern: BASE_PATTERN,
      distributions: { Swc: { type: 'uniform', min: 0.85, max: 0.95 } },
      iterations: 150,
      rng: makeLcg(3),
    });
    expect(res.validCount).toBe(0);
    expect(res.sensitivity).toEqual([]);
    expect(res.warnings.join(' ')).toMatch(/No valid realizations/);
  });

  it('excludes never-breakthrough realizations from breakthrough statistics', () => {
    // Two-year horizon with a large sampled area: high-area realizations
    // cannot inject enough water to reach breakthrough in time.
    const res = runWaterfloodUncertainty({
      displacementSpec: BASE_SPEC,
      pattern: { ...BASE_PATTERN, maxYears: 2 },
      distributions: { area_acres: { type: 'uniform', min: 40, max: 400 } },
      iterations: 300,
      rng: makeLcg(11),
    });
    expect(res.btNeverCount).toBeGreaterThan(0);
    expect(res.btNeverCount).toBeLessThan(res.validCount);
    expect(res.warnings.join(' ')).toMatch(/never reached breakthrough/);
    // bt stats come only from the realizations that did break through.
    expect(res.stats.btYears.max).toBeLessThanOrEqual(2);
  });
});

describe('runWaterfloodUncertaintyAsync', () => {
  it('matches the synchronous run for the same seed and reports monotone progress', async () => {
    const args = (seed) => ({
      displacementSpec: BASE_SPEC,
      pattern: BASE_PATTERN,
      distributions: {
        muO: { type: 'triangular', min: 3, mode: 5, max: 9 },
        phi: { type: 'normal', mean: 0.22, stdDev: 0.02 },
      },
      iterations: 300,
      rng: makeLcg(seed),
    });
    const sync = runWaterfloodUncertainty(args(1234));

    const progress = [];
    const async = await runWaterfloodUncertaintyAsync(args(1234), (p) => progress.push(p), 64);

    expect(async.validCount).toBe(sync.validCount);
    expect(async.stats.np.p50).toBe(sync.stats.np.p50);
    expect(async.sensitivity).toEqual(sync.sensitivity);

    expect(progress.length).toBeGreaterThan(2);
    progress.forEach((p, i) => {
      if (i > 0) expect(p).toBeGreaterThanOrEqual(progress[i - 1]);
    });
    expect(progress[progress.length - 1]).toBe(1);
  });

  it('rejects with the setup error instead of hanging', async () => {
    await expect(runWaterfloodUncertaintyAsync({
      displacementSpec: BASE_SPEC,
      pattern: BASE_PATTERN,
      distributions: {},
      iterations: 200,
    })).rejects.toThrow(/at least one uncertain parameter/);
  });
});

describe('UNCERTAINTY_PARAMS registry', () => {
  it('marks exactly the Corey shape parameters as coreyOnly', () => {
    const coreyOnly = UNCERTAINTY_PARAMS.filter((p) => p.coreyOnly).map((p) => p.key).sort();
    expect(coreyOnly).toEqual(['Sor', 'Swc', 'kroMax', 'krwMax']);
  });
});
