/**
 * WS-U2-008: uncertainty through the canonical Monte Carlo sampler
 * (src/lib/monteCarlo.js) and calculateEconomics. Gates call the engine:
 * seeded and reproducible; P90 is the 10th percentile (the low case); with
 * only the oil price uncertain the NPV is linear in the price, so each NPV
 * percentile is the case run at the same percentile of the drawn prices (the
 * prices drawn again here by the same canonical sampler and seed). Negative
 * control: the percentile labels swapped (P90 read as the 90th percentile)
 * break the order P90 <= P50 <= P10.
 */
import { quantile } from 'simple-statistics';
import { createCorrelatedSampler, mulberry32 } from '@/lib/monteCarlo';
import { runSpacingCases } from '@/utils/wellSpacingCalculations';
import { runSpacingMonteCarlo, mcDistributions, DEFAULT_MC_SEED } from '../monteCarlo';
import { buildWellSpacingReportModel } from '../reportModel';
import { defaultInputs, SAMPLE_FORM } from '../model';

const BASE = { ...SAMPLE_FORM, mcIterations: '200' };
const priceOnly = { ...BASE, mcRfLow: '', mcRfHigh: '', mcAreaLow: '', mcAreaHigh: '' };

describe('WS-U2-008: Monte Carlo per spacing case', () => {
  it('is seeded: the same seed and count give the same numbers, another seed others', () => {
    const a = runSpacingMonteCarlo(BASE);
    const b = runSpacingMonteCarlo(BASE);
    expect(a.ok).toBe(true);
    expect(a.seed).toBe(20260829);
    expect(DEFAULT_MC_SEED).toBe(20260829);
    expect(a.iterations).toBe(200);
    expect(b.cases).toEqual(a.cases);
    const c = runSpacingMonteCarlo({ ...BASE, mcSeed: '7' });
    expect(c.cases[3].p50).not.toBe(a.cases[3].p50);
    expect(a.varying).toEqual(['recoveryFactor', 'reservoirArea', 'oilPrice']);
    for (const k of a.cases) {
      expect(k.p90).toBeLessThanOrEqual(k.p50);
      expect(k.p50).toBeLessThanOrEqual(k.p10);
    }
  });

  it('price only: each NPV percentile is the case run at that percentile of the canonically drawn prices', () => {
    const mc = runSpacingMonteCarlo(priceOnly, { keepValues: true });
    const { dists } = mcDistributions(priceOnly);
    const s = createCorrelatedSampler({ inputs: dists, paramOrder: ['recoveryFactor', 'reservoirArea', 'oilPrice'], rng: mulberry32(20260829) });
    const prices = Array.from({ length: 200 }, () => s.sample().values.oilPrice).sort((x, y) => x - y);
    const npvAt = (price, spacing) => runSpacingCases({ ...priceOnly, oilPrice: String(price) }).spacingResults.find((r) => r.spacing === spacing).npv;
    const k = mc.cases.find((c) => c.spacing === 100);
    expect(k.p90).toBeCloseTo(npvAt(quantile(prices, 0.1), 100), 6);
    expect(k.p50).toBeCloseTo(npvAt(quantile(prices, 0.5), 100), 6);
    expect(k.p10).toBeCloseTo(npvAt(quantile(prices, 0.9), 100), 6);
    expect(k.base).toBeCloseTo(npvAt(75, 100), 9);
    // NEGATIVE CONTROL: the labels swapped break the exceedance order
    const swapped = { p90: quantile(k.npvs, 0.9), p10: quantile(k.npvs, 0.1) };
    expect(swapped.p90).toBeGreaterThan(swapped.p10);
  });

  it('refuses what it cannot run, with the reason', () => {
    expect(runSpacingMonteCarlo({ ...BASE, mcRfLow: '40' }).errors[0]).toMatch(/must bracket the value on the form/);
    expect(runSpacingMonteCarlo({ ...BASE, mcPriceHigh: '' }).errors[0]).toMatch(/give both the low and the high/);
    expect(runSpacingMonteCarlo({ ...priceOnly, mcPriceLow: '', mcPriceHigh: '' }).errors[0]).toMatch(/No input is uncertain/);
    expect(runSpacingMonteCarlo({ ...BASE, mcIterations: '10' }).errors[0]).toMatch(/between 50 and 5000/);
  });

  it('the report prints the seed, the count, the distributions and the convention', () => {
    const inputs = defaultInputs('oilfield', { sample: true });
    const results = runSpacingCases(inputs.form);
    const mc = runSpacingMonteCarlo(inputs.form);
    const m = buildWellSpacingReportModel(inputs, { results, mc });
    expect(m.uncertainty.rows.length).toBe(15);
    expect(m.uncertainty.note).toMatch(/^300 realisations, seed 20260829, drawn by the Suite's canonical Monte Carlo sampler/);
    expect(m.uncertainty.note).toMatch(/recovery factor 25 \/ 35 \/ 45 %/);
    expect(m.uncertainty.note).toMatch(/P90 is the low case/);
    expect(m.inputs.rows.find((r) => r.key === 'mcSeed')).toMatchObject({ label: 'Seed [uncertainty]', value: '20260829' });
    const none = buildWellSpacingReportModel(inputs, { results });
    expect(none.uncertainty.note).toMatch(/Not run yet/);
  });
});
