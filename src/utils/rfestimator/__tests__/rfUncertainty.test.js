/**
 * RF-U2-002: RF x in-place uncertainty through the canonical Monte Carlo
 * (src/lib/monteCarlo.js). Every gate runs the shipped function
 * (rfUncertainty / runRfMonteCarlo) and compares its percentiles with the
 * closed-form quantiles of the stated distributions; none re-samples on its
 * own.
 *
 * Negative controls:
 *  - the module must call the canonical sampler (a spy on
 *    createCorrelatedSampler; a private sampler would leave it uncalled);
 *  - the percentile convention: a run that labelled the 90th percentile as
 *    P90 would fail the "P90 is the 10th percentile" gate (asserted against
 *    the closed-form quantile, both sides of it);
 *  - zero spread reproduces the deterministic product exactly.
 */
import * as mc from '@/lib/monteCarlo';
import { triInvCDF } from '@/lib/monteCarlo';
import { rfUncertainty, rfMcDistributions, runRfMonteCarlo, RF_MC_CONVENTION, Z95 } from '../uncertainty';
import { deriveRf } from '../workspace';
import { sampleInputs } from '../model';

const caseOf = (inputs = sampleInputs(), extra = {}) => {
  const d = deriveRf(inputs, extra);
  return { result: d.result, inPlace: d.inPlace, inPlaceIntake: extra.inPlaceIntake || null, phase: d.phase };
};
const ON = (o = {}) => ({ enabled: true, iterations: '20000', seed: '20261004', ...o });

describe('RF x in-place through the canonical sampler (RF-U2-002)', () => {
  test('the analog triangular on the sample (water drive 35/50/75 percent) at fixed OOIP: P90, P50, P10 are the closed-form quantiles', () => {
    const c = caseOf();
    const out = rfUncertainty(ON(), c);
    expect(out.ok).toBe(true);
    expect(out.accepted).toBe(20000);
    expect(out.rejected).toBe(0);
    // exceedance convention: P90 is the 10th percentile of the outcome (the low case)
    const q = (u) => triInvCDF(u, 0.35, 0.50, 0.75);
    expect(out.stats.rf.p90).toBeCloseTo(q(0.1), 2);
    expect(out.stats.rf.p50).toBeCloseTo(q(0.5), 2);
    expect(out.stats.rf.p10).toBeCloseTo(q(0.9), 2);
    expect(Math.abs(out.stats.rf.p90 - q(0.1))).toBeLessThan(Math.abs(out.stats.rf.p90 - q(0.9)));
    expect(out.stats.rf.p90).toBeLessThan(out.stats.rf.p50);
    expect(out.stats.rf.p50).toBeLessThan(out.stats.rf.p10);
    // the mean of a triangular is (a + c + b) / 3
    expect(out.stats.rf.mean).toBeCloseTo((0.35 + 0.5 + 0.75) / 3, 2);
    // recoverable = RF x OOIP, the OOIP fixed: each percentile is the RF percentile times OOIP
    expect(out.stats.recoverable.p50 / c.inPlace).toBeCloseTo(out.stats.rf.p50, 10);
    expect(out.stats.inPlace.p50).toBe(c.inPlace);
    expect(out.convention).toBe(RF_MC_CONVENTION);
    expect(out.convention).toMatch(/P90 is the low case/);
  });

  test('zero spread reproduces the deterministic product exactly', () => {
    const c = caseOf();
    const out = rfUncertainty(ON({ rfSource: 'stated', rfMin: '0.42', rfMode: '0.42', rfMax: '0.42', iterations: '500' }), c);
    expect(out.ok).toBe(true);
    for (const k of ['p90', 'p50', 'p10']) expect(out.stats.recoverable[k]).toBe(0.42 * c.inPlace);
    expect(out.varying).toEqual([]);
  });

  test('RF and in-place both uncertain: the mean of the product is the product of the means (independent draws)', () => {
    const c = caseOf();
    const out = rfUncertainty(ON({ ipSource: 'stated', ipMin: '20', ipMode: '40', ipMax: '70' }), c);
    expect(out.ok).toBe(true);
    expect(out.varying).toEqual(['rf', 'ip']);
    const mRf = (0.35 + 0.5 + 0.75) / 3; const mIp = (20e6 + 40e6 + 70e6) / 3;
    expect(out.stats.recoverable.mean / (mRf * mIp)).toBeCloseTo(1, 2);
    expect(out.stats.inPlace.p50).toBeCloseTo(triInvCDF(0.5, 20e6, 40e6, 70e6), -5);
  });

  test('seeded: the same seed gives the same numbers; another seed moves them; the seed and the count are reported', () => {
    const c = caseOf();
    const a = rfUncertainty(ON({ iterations: '2000' }), c);
    const b = rfUncertainty(ON({ iterations: '2000' }), c);
    const d = rfUncertainty(ON({ iterations: '2000', seed: '7' }), c);
    expect(a.stats).toEqual(b.stats);
    expect(d.stats.rf.p50).not.toBe(a.stats.rf.p50);
    expect(a.seed).toBe(20261004);
    expect(a.iterations).toBe(2000);
  });

  test('the draws go through the canonical module (negative control: a private sampler leaves the spy uncalled)', () => {
    const spy = jest.spyOn(mc, 'createCorrelatedSampler');
    const d = rfMcDistributions(ON({ iterations: '100' }), caseOf());
    runRfMonteCarlo(d);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].paramOrder).toEqual(['rf', 'ip']);
    spy.mockRestore();
  });

  test('P90/P50/P10 typed for the in-place volume (ReservoirCalc Pro style) are honoured by the fit', () => {
    const c = caseOf();
    const out = rfUncertainty(ON({ rfSource: 'stated', rfMin: '0.3', rfMode: '0.3', rfMax: '0.3', ipSource: 'percentiles', ipP90: '30', ipP50: '40', ipP10: '55' }), c);
    expect(out.ok).toBe(true);
    expect(out.stats.inPlace.p90 / 30e6).toBeCloseTo(1, 1);
    expect(out.stats.inPlace.p50 / 40e6).toBeCloseTo(1, 1);
    expect(out.stats.inPlace.p10 / 55e6).toBeCloseTo(1, 1);
  });

  test('the Material Balance 95 percent interval is read as a normal: about 95 percent of draws inside it', () => {
    const intake = { quantity: 'OOIP', value: 40e6, ci95: [32e6, 48e6] };
    const inputs = { ...sampleInputs(), inPlaceMode: 'direct', ooipDirect: '40000000', origin: 'entered' };
    const c = caseOf(inputs, { inPlaceIntake: intake });
    const d = rfMcDistributions(ON({ ipSource: 'intake95' }), c);
    expect(d.ip).toMatchObject({ type: 'normal', mean: 40e6 });
    expect(d.ip.stdDev).toBeCloseTo(8e6 / Z95, 6);
    const out = rfUncertainty(ON({ ipSource: 'intake95' }), c);
    // P90 and P10 of a normal sit 1.2816 standard deviations either side of the mean
    expect(out.stats.inPlace.p90 / (40e6 - 1.2816 * d.ip.stdDev)).toBeCloseTo(1, 2);
    expect(out.stats.inPlace.p10 / (40e6 + 1.2816 * d.ip.stdDev)).toBeCloseTo(1, 2);
  });

  test('the in-place values are typed in MMSTB (oil) or Bscf (gas), the multiple on screen', () => {
    const oil = rfMcDistributions(ON({ ipSource: 'stated', ipMin: '20', ipMode: '40', ipMax: '70' }), caseOf());
    expect(oil.ip).toMatchObject({ min: 20e6, mode: 40e6, max: 70e6 });
    const gas = rfMcDistributions(ON({ ipSource: 'stated', ipMin: '20', ipMode: '40', ipMax: '70' }), { ...caseOf(), phase: 'gas' });
    expect(gas.ip).toMatchObject({ min: 20e9, mode: 40e9, max: 70e9 });
    // the run of the case held by deriveRf is the same function's
    const inputs = { ...sampleInputs(), mc: ON({ iterations: '1000' }) };
    expect(deriveRf(inputs).uncertainty.stats).toEqual(rfUncertainty(ON({ iterations: '1000' }), caseOf()).stats);
  });

  test('what cannot run says why: no seed, an estimate outside the range as the mode, no interval at the source, off', () => {
    const c = caseOf();
    expect(rfUncertainty({ enabled: false }, c)).toBeNull();
    expect(rfUncertainty(ON({ seed: '' }), c).errors.join(' ')).toMatch(/seed must be a whole number/);
    const api = { ...sampleInputs(), method: 'api_solution_gas', driveCode: 'water_drive' };
    const out = rfUncertainty(ON({ rfSource: 'estimate' }), caseOf(api));
    expect(out.ok).toBe(false);
    expect(out.errors[0]).toMatch(/lies outside the analog range/);
    expect(rfUncertainty(ON({ ipSource: 'intake95' }), c).errors[0]).toMatch(/states no 95 percent interval/);
    expect(rfUncertainty(ON({ rfSource: 'stated', rfMin: '0.5', rfMode: '0.4', rfMax: '0.6' }), c).errors[0]).toMatch(/minimum <= mode <= maximum/);
  });

  test('a realisation outside the physical range is rejected and counted, never clamped', () => {
    const c = caseOf();
    const out = rfUncertainty(ON({ ipSource: 'percentiles', ipP90: '1', ipP50: '2', ipP10: '40', iterations: '5000' }), c);
    expect(out.ok).toBe(true);
    expect(out.rejected).toBeGreaterThan(0);
    expect(out.accepted + out.rejected).toBe(5000);
    expect(out.stats.inPlace.min).toBeGreaterThan(0);
    expect(out.notes.join(' ')).toMatch(/rejected/);
  });
});
