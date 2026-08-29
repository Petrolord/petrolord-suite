// Tests for the EPE Monte Carlo layer (D2).
//
// The first block is the ANTI-DRIFT GATE: epe-mc.ts vendors the canonical
// sampling primitives from src/lib/monteCarlo.js (which edge functions
// cannot import because of its npm dependency). These tests feed both
// implementations identical seeded RNG streams and require bit-identical
// output. If either side changes, this fails until both agree again.

import * as mcCanon from '../../../../src/lib/monteCarlo.js';
import {
  mulberry32, cholesky, randomNormal, erf, normalCDF, triInvCDF,
  marginalValue, createCorrelatedSampler, basicStats, tornadoSwings,
  runEpeMonteCarlo,
} from '../epe-mc.ts';
import { computeCashFlow } from '../epe-engine.ts';
import {
  PIA_WORKED_EXAMPLE_CFG,
  PIA_WORKED_EXAMPLE_PROD,
  PIA_WORKED_EXAMPLE_CAPEX,
  PIA_WORKED_EXAMPLE_OPEX,
} from '../../../../tools/validation/fixtures/epe-pia-worked-example.ts';

describe('anti-drift: epe-mc primitives vs canonical src/lib/monteCarlo.js', () => {
  it('erf / normalCDF / triInvCDF are bit-identical', () => {
    for (const x of [-3, -1.5, -0.2, 0, 0.7, 1.9, 3.4]) {
      expect(erf(x)).toBe(mcCanon.erf(x));
      expect(normalCDF(x)).toBe(mcCanon.normalCDF(x));
    }
    for (const u of [0.01, 0.3, 0.5, 0.77, 0.99]) {
      expect(triInvCDF(u, 10, 25, 60)).toBe(mcCanon.triInvCDF(u, 10, 25, 60));
    }
  });

  it('cholesky is bit-identical', () => {
    const C = [[1, 0.6, 0.2], [0.6, 1, -0.3], [0.2, -0.3, 1]];
    expect(cholesky(C)).toEqual(mcCanon.cholesky(C));
  });

  it('randomNormal is bit-identical on the same RNG stream', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(randomNormal(a)).toBe(mcCanon.randomNormal(b));
    }
  });

  it('marginalValue is bit-identical for all four spread types', () => {
    const dists = [
      { type: 'normal', mean: 100, stdDev: 15 },
      { type: 'lognormal', mean: 50, stdDev: 20 },
      { type: 'triangular', min: 10, mode: 25, max: 60 },
      { type: 'uniform', min: 5, max: 9 },
    ];
    for (const d of dists) {
      for (const x of [-2.5, -1, 0, 0.5, 2.2]) {
        expect(marginalValue(d, x)).toBe(mcCanon.marginalValue(d, x));
      }
    }
  });

  it('createCorrelatedSampler draws identical realizations on the same stream', () => {
    const spec = {
      inputs: {
        oil_price: { type: 'lognormal', mean: 80, stdDev: 15 },
        capex_scale: { type: 'triangular', min: 0.8, mode: 1.0, max: 1.4 },
        opex_scale: { type: 'normal', mean: 1.0, stdDev: 0.1 },
      },
      paramOrder: ['oil_price', 'capex_scale', 'opex_scale'],
      correlations: [{ a: 'oil_price', b: 'opex_scale', rho: 0.5 }],
    };
    const ours = createCorrelatedSampler({ ...spec, rng: mulberry32(7) });
    const canon = mcCanon.createCorrelatedSampler({ ...spec, rng: mulberry32(7) });
    expect(ours.varKeys).toEqual(canon.varKeys);
    for (let i = 0; i < 200; i++) {
      expect(ours.sample()).toEqual(canon.sample());
    }
  });

  it('basicStats percentiles and CDF are identical (mean/stdDev to 1e-9)', () => {
    const rng = mulberry32(123);
    const data = Array.from({ length: 1000 }, () => rng() * 100);
    const ours = basicStats(data);
    const canon = mcCanon.basicStats(data);
    expect(ours.p90).toBe(canon.p90);
    expect(ours.p50).toBe(canon.p50);
    expect(ours.p10).toBe(canon.p10);
    expect(ours.cdf).toEqual(canon.cdf);
    expect(ours.mean).toBeCloseTo(canon.mean, 9);
    expect(ours.stdDev).toBeCloseTo(canon.stdDev, 9);
  });

  it('tornadoSwings agrees with the canonical implementation', () => {
    const rng = mulberry32(99);
    const samples = Array.from({ length: 500 }, () => {
      const a = rng();
      const b = rng();
      return { targetVol: 3 * a + 0.5 * b, inputs: { a, b } };
    });
    expect(tornadoSwings(samples)).toEqual(mcCanon.tornadoSwings(samples));
  });
});

describe('runEpeMonteCarlo', () => {
  const baseArgs = {
    cfg: PIA_WORKED_EXAMPLE_CFG,
    prodRows: PIA_WORKED_EXAMPLE_PROD,
    capexRows: PIA_WORKED_EXAMPLE_CAPEX,
    opexRows: PIA_WORKED_EXAMPLE_OPEX,
  };

  it('with no uncertain variables, every iteration equals the deterministic run', () => {
    const res = runEpeMonteCarlo({ ...baseArgs, mcConfig: { iterations: 100, seed: 1, variables: {} } });
    const det = computeCashFlow(baseArgs);
    expect(res.npv.p90).toBeCloseTo(det.kpis.npv, 6);
    expect(res.npv.p10).toBeCloseTo(det.kpis.npv, 6);
    expect(res.npv.stdDev).toBeCloseTo(0, 6);
    expect(res.probNpvPositive).toBe(1);
    expect(res.base.npv).toBeCloseTo(det.kpis.npv, 6);
  });

  it('is reproducible for the same seed and differs for another', () => {
    const mcConfig = {
      iterations: 200, seed: 42,
      variables: { oil_price: { type: 'triangular', min: 60, mode: 80, max: 110 } },
    };
    const a = runEpeMonteCarlo({ ...baseArgs, mcConfig });
    const b = runEpeMonteCarlo({ ...baseArgs, mcConfig });
    const c = runEpeMonteCarlo({ ...baseArgs, mcConfig: { ...mcConfig, seed: 43 } });
    expect(a.npv.p50).toBe(b.npv.p50);
    expect(a.npv.mean).toBe(b.npv.mean);
    expect(a.npv.mean).not.toBe(c.npv.mean);
  });

  it('produces ordered percentiles, a sensible P(NPV>0), and fan bands', () => {
    const res = runEpeMonteCarlo({
      ...baseArgs,
      mcConfig: {
        iterations: 500, seed: 7,
        variables: {
          oil_price: { type: 'triangular', min: 40, mode: 80, max: 120 },
          capex_scale: { type: 'triangular', min: 0.8, mode: 1.0, max: 1.5 },
        },
      },
    });
    expect(res.npv.p90).toBeLessThan(res.npv.p50);
    expect(res.npv.p50).toBeLessThan(res.npv.p10);
    expect(res.probNpvPositive).toBeGreaterThan(0.5);
    expect(res.probNpvPositive).toBeLessThanOrEqual(1);
    expect(res.fan.ncf).toHaveLength(1); // single-year worked example
    expect(res.fan.ncf[0].p90).toBeLessThanOrEqual(res.fan.ncf[0].p10);
    expect(res.varKeys).toEqual(['oil_price', 'capex_scale']);
  });

  it('ranks the dominant uncertainty first in the tornado', () => {
    const res = runEpeMonteCarlo({
      ...baseArgs,
      mcConfig: {
        iterations: 600, seed: 11,
        variables: {
          oil_price: { type: 'triangular', min: 40, mode: 80, max: 120 }, // dominant
          opex_scale: { type: 'triangular', min: 0.97, mode: 1.0, max: 1.03 }, // minor
        },
      },
    });
    expect(res.tornado.length).toBe(2);
    expect(res.tornado[0].parameter).toBe('oil_price');
    expect(res.tornado[0].high - res.tornado[0].low)
      .toBeGreaterThan(5 * (res.tornado[1].high - res.tornado[1].low));
  });

  it('correlated price draws shift the NPV spread versus independent draws', () => {
    // Oil price and production positively correlated widens the revenue
    // distribution (high price with high volume compounds), so NPV stdDev
    // should exceed the independent case.
    const variables = {
      oil_price: { type: 'normal', mean: 80, stdDev: 15 },
      production_scale: { type: 'normal', mean: 1.0, stdDev: 0.15 },
    };
    const indep = runEpeMonteCarlo({
      ...baseArgs,
      mcConfig: { iterations: 800, seed: 5, variables },
    });
    const corr = runEpeMonteCarlo({
      ...baseArgs,
      mcConfig: {
        iterations: 800, seed: 5, variables,
        correlations: [{ a: 'oil_price', b: 'production_scale', rho: 0.8 }],
      },
    });
    expect(corr.npv.stdDev).toBeGreaterThan(indep.npv.stdDev * 1.1);
  });

  it('clamps iterations into [100, 5000]', () => {
    const res = runEpeMonteCarlo({ ...baseArgs, mcConfig: { iterations: 3, seed: 1, variables: {} } });
    expect(res.iterations).toBe(100);
  });

  it('Wave C: reports payback distribution, NPV standard error, and a convergence trace', () => {
    const res = runEpeMonteCarlo({
      ...baseArgs,
      mcConfig: {
        iterations: 400, seed: 11,
        variables: { oil_price: { type: 'triangular', min: 60, mode: 80, max: 100 } },
      },
    });
    expect(Number.isFinite(res.payback.p50)).toBe(true);
    expect(res.payback.p90).toBeLessThanOrEqual(res.payback.p10 + 1e-9); // petroleum convention on years... low years = p90? stats are value-sorted: p90 <= p10
    expect(res.payback.neverShare).toBeGreaterThanOrEqual(0);
    expect(res.payback.neverShare).toBeLessThanOrEqual(1);
    expect(res.npv.se).toBeGreaterThan(0);
    expect(res.npv.se).toBeCloseTo(res.npv.stdDev / Math.sqrt(400), 6);
    expect(res.convergence.length).toBeGreaterThanOrEqual(10);
    const last = res.convergence[res.convergence.length - 1];
    expect(last.n).toBe(400);
    expect(last.mean).toBeCloseTo(res.npv.mean, 6);
  });

  it('Wave C: all four distribution types sample within their support', () => {
    const res = runEpeMonteCarlo({
      ...baseArgs,
      mcConfig: {
        iterations: 300, seed: 21,
        variables: {
          oil_price: { type: 'lognormal', mean: 80, stdDev: 12 },
          capex_scale: { type: 'normal', mean: 1.0, stdDev: 0.1, min: 0.7, max: 1.3 },
          opex_scale: { type: 'uniform', min: 0.9, max: 1.15 },
          production_scale: { type: 'triangular', min: 0.85, mode: 1.0, max: 1.1 },
        },
      },
    });
    expect(res.varKeys.sort()).toEqual(['capex_scale', 'oil_price', 'opex_scale', 'production_scale']);
    expect(Number.isFinite(res.npv.p50)).toBe(true);
    expect(res.npv.stdDev).toBeGreaterThan(0);
  });

  // Economics E5: the per-iteration sample, parked since D2 as "raw-sample
  // export for auditors". A percentile nobody can check is a claim.
  describe('the raw per-iteration sample', () => {
    const mcConfig = {
      iterations: 120,
      seed: 7,
      variables: {
        oil_price: { type: 'triangular', min: 50, mode: 70, max: 95 },
        capex_scale: { type: 'triangular', min: 0.8, mode: 1.0, max: 1.3 },
      },
    };

    it('has exactly one row per iteration', () => {
      const res = runEpeMonteCarlo({ ...baseArgs, mcConfig });
      expect(res.samples).toHaveLength(120);
      expect(res.samples[0].i).toBe(1);
      expect(res.samples[119].i).toBe(120);
    });

    it('records the drawn inputs and the KPIs they produced', () => {
      const res = runEpeMonteCarlo({ ...baseArgs, mcConfig });
      res.samples.forEach((row: any) => {
        expect(Number.isFinite(row.inputs.oil_price)).toBe(true);
        expect(row.inputs.oil_price).toBeGreaterThanOrEqual(50);
        expect(row.inputs.oil_price).toBeLessThanOrEqual(95);
        expect(Number.isFinite(row.npv)).toBe(true);
      });
    });

    it('keeps the iterations where IRR or payback does not exist', () => {
      // The percentile arrays drop those by design, which is right for a
      // percentile and wrong for an audit trail: the count of undefined runs
      // is itself a result.
      const res = runEpeMonteCarlo({ ...baseArgs, mcConfig });
      const undefinedIrr = res.samples.filter((r: any) => r.irr === null).length;
      expect(undefinedIrr / res.iterations).toBeCloseTo(res.irr.nullShare, 10);
      const neverPays = res.samples.filter((r: any) => r.payback === null).length;
      expect(neverPays / res.iterations).toBeCloseTo(res.payback.neverShare, 10);
    });

    it('reproduces the reported percentiles from the sample itself', () => {
      // The point of the export: an auditor can re-derive the headline
      // numbers from the rows rather than taking them on trust.
      const res = runEpeMonteCarlo({ ...baseArgs, mcConfig });
      const npvs = res.samples.map((r: any) => r.npv).sort((a: number, b: number) => a - b);
      const at = (p: number) => npvs[Math.min(Math.floor(p * npvs.length), npvs.length - 1)];
      expect(at(0.1)).toBeCloseTo(res.npv.p90, 6);
      expect(at(0.5)).toBeCloseTo(res.npv.p50, 6);
      expect(at(0.9)).toBeCloseTo(res.npv.p10, 6);
    });

    it('is reproducible from the seed', () => {
      const a = runEpeMonteCarlo({ ...baseArgs, mcConfig });
      const b = runEpeMonteCarlo({ ...baseArgs, mcConfig });
      expect(b.samples.map((r: any) => r.npv)).toEqual(a.samples.map((r: any) => r.npv));
    });
  });
});
