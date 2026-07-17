// Golden tests for the canonical Monte Carlo module (src/lib/monteCarlo.js),
// extracted from ReservoirCalc Pro's MonteCarloEngine. The primitives were
// already covered indirectly by the RC Pro engine suite; this file locks the
// extracted API directly, plus the new pieces (injectable rng, correlated
// sampler, average-rank Spearman).
import {
  cholesky,
  randomNormal,
  normalCDF,
  triInvCDF,
  isVariable,
  representativeValue,
  marginalValue,
  createCorrelatedSampler,
  basicStats,
  rankArray,
  spearman,
  rankCorrelationSensitivity,
  varianceDecomposition,
} from '@/lib/monteCarlo';

const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Deterministic uniform RNG (Park-Miller minimal standard LCG) so sampling
// tests are reproducible.
const makeLcg = (seed = 42) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
};

describe('normalCDF / triInvCDF anchors', () => {
  it('matches the standard normal table', () => {
    expect(near(normalCDF(0), 0.5, 1e-9)).toBe(true);
    expect(near(normalCDF(1.6448536), 0.95, 1e-4)).toBe(true);
    expect(near(normalCDF(-1.959964), 0.025, 1e-4)).toBe(true);
  });

  it('inverts the triangular CDF at its anchor points', () => {
    // Symmetric triangle a=1, c=2, b=3: median = mode = 2.
    expect(near(triInvCDF(0.5, 1, 2, 3), 2, 1e-12)).toBe(true);
    // At u = F(c) = (c-a)/(b-a) the value is exactly the mode.
    expect(near(triInvCDF(0.25, 0, 1, 4), 1, 1e-12)).toBe(true);
    // Endpoints.
    expect(near(triInvCDF(0, 1, 2, 3), 1, 1e-12)).toBe(true);
    expect(near(triInvCDF(1, 1, 2, 3), 3, 1e-12)).toBe(true);
    // Degenerate range collapses to the single value.
    expect(triInvCDF(0.7, 5, 5, 5)).toBe(5);
  });
});

describe('cholesky', () => {
  it('factors a known 2x2 correlation matrix', () => {
    // [[1, .5], [.5, 1]] -> L = [[1, 0], [.5, sqrt(.75)]]
    const L = cholesky([[1, 0.5], [0.5, 1]]);
    expect(near(L[0][0], 1, 1e-12)).toBe(true);
    expect(L[0][1]).toBe(0);
    expect(near(L[1][0], 0.5, 1e-12)).toBe(true);
    expect(near(L[1][1], Math.sqrt(0.75), 1e-12)).toBe(true);
  });

  it('degrades gracefully on a non-positive-definite matrix (no NaNs)', () => {
    const L = cholesky([[1, 2], [2, 1]]); // rho=2 is invalid; diagonal clamps at 0
    L.flat().forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });
});

describe('distribution helpers', () => {
  it('isVariable distinguishes spread from degenerate inputs', () => {
    expect(isVariable({ type: 'triangular', min: 1, mode: 2, max: 3 })).toBe(true);
    expect(isVariable({ type: 'triangular', min: 2, mode: 2, max: 2 })).toBe(false);
    expect(isVariable({ type: 'normal', mean: 1, stdDev: 0.1 })).toBe(true);
    expect(isVariable({ type: 'normal', mean: 1, stdDev: 0 })).toBe(false);
    expect(isVariable({ type: 'constant', value: 5 })).toBe(false);
    expect(isVariable(null)).toBe(false);
  });

  it('representativeValue returns the central value per type', () => {
    expect(representativeValue({ type: 'triangular', min: 1, mode: 2, max: 4 })).toBe(2);
    expect(representativeValue({ type: 'uniform', min: 10, max: 20 })).toBe(15);
    expect(representativeValue({ type: 'lognormal', mean: 100, stdDev: 20 })).toBe(100);
    expect(representativeValue({ type: 'constant', value: '7' })).toBe(7);
  });

  it('marginalValue maps x=0 to the median of each marginal', () => {
    expect(near(marginalValue({ type: 'normal', mean: 0.2, stdDev: 0.03 }, 0), 0.2, 1e-9)).toBe(true);
    expect(near(marginalValue({ type: 'triangular', min: 1, mode: 2, max: 3 }, 0), 2, 1e-6)).toBe(true);
    expect(near(marginalValue({ type: 'uniform', min: 10, max: 20 }, 0), 15, 1e-6)).toBe(true);
    // Lognormal stays positive even for deep-left draws.
    expect(marginalValue({ type: 'lognormal', mean: 100, stdDev: 20 }, -3)).toBeGreaterThan(0);
  });
});

describe('createCorrelatedSampler', () => {
  it('excludes constants and degenerate ranges from varKeys', () => {
    const { varKeys } = createCorrelatedSampler({
      inputs: {
        a: { type: 'triangular', min: 1, mode: 2, max: 3 },
        b: { type: 'constant', value: 5 },
        c: { type: 'uniform', min: 4, max: 4 },
      },
      paramOrder: ['a', 'b', 'c'],
    });
    expect(varKeys).toEqual(['a']);
  });

  it('keeps triangular draws inside [min, max]', () => {
    const rng = makeLcg(7);
    const { sample } = createCorrelatedSampler({
      inputs: { t: { type: 'triangular', min: 10, mode: 12, max: 20 } },
      paramOrder: ['t'],
      rng,
    });
    for (let i = 0; i < 2000; i++) {
      const v = sample().values.t;
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(20);
    }
  });

  it('reproduces a requested rank of correlation between two normals', () => {
    const rng = makeLcg(42);
    const { sample } = createCorrelatedSampler({
      inputs: {
        x: { type: 'normal', mean: 0, stdDev: 1 },
        y: { type: 'normal', mean: 0, stdDev: 1 },
      },
      paramOrder: ['x', 'y'],
      correlations: [{ a: 'x', b: 'y', rho: 0.8 }],
      rng,
    });
    const xs = [];
    const ys = [];
    for (let i = 0; i < 4000; i++) {
      const { values } = sample();
      xs.push(values.x);
      ys.push(values.y);
    }
    // Sample Pearson correlation should be near the target 0.8.
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const mx = mean(xs);
    const my = mean(ys);
    let cov = 0;
    let vx = 0;
    let vy = 0;
    for (let i = 0; i < xs.length; i++) {
      cov += (xs[i] - mx) * (ys[i] - my);
      vx += (xs[i] - mx) ** 2;
      vy += (ys[i] - my) ** 2;
    }
    const r = cov / Math.sqrt(vx * vy);
    expect(near(r, 0.8, 0.05)).toBe(true);
  });

  it('preserves the arithmetic mean and stdDev of a lognormal marginal', () => {
    const rng = makeLcg(99);
    const { sample } = createCorrelatedSampler({
      inputs: { v: { type: 'lognormal', mean: 100, stdDev: 30 } },
      paramOrder: ['v'],
      rng,
    });
    const draws = [];
    for (let i = 0; i < 8000; i++) draws.push(sample().values.v);
    const m = draws.reduce((s, v) => s + v, 0) / draws.length;
    const sd = Math.sqrt(draws.reduce((s, v) => s + (v - m) ** 2, 0) / (draws.length - 1));
    expect(near(m, 100, 2.5)).toBe(true);
    expect(near(sd, 30, 3)).toBe(true);
  });

  it('flags normal draws outside optional truncation bounds', () => {
    const rng = makeLcg(5);
    const { sample } = createCorrelatedSampler({
      inputs: { n: { type: 'normal', mean: 0, stdDev: 1, min: -0.5, max: 0.5 } },
      paramOrder: ['n'],
      rng,
    });
    let flagged = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const { values, truncated } = sample();
      if (truncated.includes('n')) {
        flagged++;
        expect(Math.abs(values.n)).toBeGreaterThan(0.5);
      }
    }
    // P(|Z| > 0.5) ~ 0.617; expect roughly that share flagged.
    expect(flagged / N).toBeGreaterThan(0.55);
    expect(flagged / N).toBeLessThan(0.68);
  });
});

describe('basicStats', () => {
  it('uses the petroleum percentile convention (P90 low, P10 high)', () => {
    const data = Array.from({ length: 1000 }, (_, i) => i + 1); // 1..1000
    const s = basicStats(data);
    expect(s.p90).toBe(101); // 10th percentile
    expect(s.p50).toBe(501);
    expect(s.p10).toBe(901); // 90th percentile
    expect(s.min).toBe(1);
    expect(s.max).toBe(1000);
    expect(s.p90).toBeLessThanOrEqual(s.p50);
    expect(s.p50).toBeLessThanOrEqual(s.p10);
    expect(s.cdf[s.cdf.length - 1]).toEqual({ x: 1000, y: 100 });
  });

  it('returns an empty object for empty input', () => {
    expect(basicStats([])).toEqual({});
  });
});

describe('rankArray / spearman', () => {
  it('averages tied ranks', () => {
    expect(rankArray([1, 2, 2, 3])).toEqual([1, 2.5, 2.5, 4]);
    expect(rankArray([5, 1, 5])).toEqual([2.5, 1, 2.5]);
  });

  it('matches the hand-computed tie-averaged Spearman', () => {
    // x = [1,2,2,3] -> ranks [1, 2.5, 2.5, 4]; y strictly increasing -> [1,2,3,4].
    // Pearson of the rank vectors: cov = 4.5, var_x = 4.5, var_y = 5
    // rho = 4.5 / sqrt(4.5 * 5) = 0.948683...
    const rho = spearman([1, 2, 2, 3], [10, 20, 25, 30]);
    expect(near(rho, 4.5 / Math.sqrt(4.5 * 5), 1e-12)).toBe(true);
  });

  it('is invariant under monotone transforms (rho = 1 for y = exp(x))', () => {
    const x = [0.1, 0.9, 2, 3.4, 5, 7.7];
    const y = x.map((v) => Math.exp(v));
    expect(near(spearman(x, y), 1, 1e-12)).toBe(true);
    const yDec = x.map((v) => -Math.log(v + 1));
    expect(near(spearman(x, yDec), -1, 1e-12)).toBe(true);
  });

  it('returns NaN for a constant series', () => {
    expect(Number.isNaN(spearman([1, 1, 1], [1, 2, 3]))).toBe(true);
  });
});

describe('rankCorrelationSensitivity', () => {
  it('ranks the dominant driver first with contributions summing to 100', () => {
    const rng = makeLcg(11);
    const n = 500;
    const a = Array.from({ length: n }, () => rng());
    const b = Array.from({ length: n }, () => rng());
    // Output driven mostly by a (positive) with a weak negative b effect.
    const out = a.map((v, i) => 10 * v - b[i] * 0.5);
    const sens = rankCorrelationSensitivity({ a, b }, out);
    expect(sens[0].parameter).toBe('a');
    expect(sens[0].rho).toBeGreaterThan(0.9);
    expect(sens[1].rho).toBeLessThan(0);
    const total = sens.reduce((s, e) => s + e.contribution, 0);
    expect(near(total, 100, 1e-9)).toBe(true);
  });

  it('drops constant inputs instead of returning NaN entries', () => {
    const out = [1, 2, 3, 4];
    const sens = rankCorrelationSensitivity({ flat: [5, 5, 5, 5], up: [1, 2, 3, 4] }, out);
    expect(sens.map((e) => e.parameter)).toEqual(['up']);
  });
});

describe('varianceDecomposition (RC Pro compatibility)', () => {
  it('decomposes a linear response and flags impact direction', () => {
    const rng = makeLcg(3);
    const samples = Array.from({ length: 400 }, () => {
      const p = rng();
      const q = rng();
      return { targetVol: 5 * p - 2 * q, inputs: { p, q } };
    });
    const dec = varianceDecomposition(samples);
    expect(dec[0].parameter).toBe('p');
    expect(dec[0].impactDirection).toBe(1);
    const qEntry = dec.find((d) => d.parameter === 'q');
    expect(qEntry.impactDirection).toBe(-1);
    expect(near(dec.reduce((s, d) => s + d.contribution, 0), 100, 1e-9)).toBe(true);
  });
});

describe('randomNormal', () => {
  it('draws a standard normal from the injected rng (mean ~0, sd ~1)', () => {
    const rng = makeLcg(21);
    const draws = Array.from({ length: 6000 }, () => randomNormal(rng));
    const m = draws.reduce((s, v) => s + v, 0) / draws.length;
    const sd = Math.sqrt(draws.reduce((s, v) => s + (v - m) ** 2, 0) / (draws.length - 1));
    expect(Math.abs(m)).toBeLessThan(0.05);
    expect(near(sd, 1, 0.05)).toBe(true);
  });
});
