/**
 * WF-U2-005: the Monte Carlo is seeded through the canonical module
 * (src/lib/monteCarlo.js mulberry32 into createCorrelatedSampler). The same
 * seed, inputs and iterations give the same percentiles to the last digit;
 * the seed and the realization count are saved with the summary and printed
 * in the report. Negative control: two runs without a seed draw different
 * seeds and different P50s (the WF-U1-022 defect: Math.random).
 */
import { runWaterfloodUncertainty, parseUncertaintyConfig } from '@/utils/waterfloodUncertainty';
import { mulberry32 } from '@/lib/monteCarlo';
import { mcSummaryRecord, mcInputsFingerprint } from '../mcSummary';
import { reviewerPayload, BUILDERS, reportOf } from '@/components/waterflooddesign/__tests__/wfTestKit';

const p = reviewerPayload();
const spec = BUILDERS.buildDisplacementSpec(p.displacementInputs).spec;
const pattern = BUILDERS.buildPatternInputs(p.patternInputs);
const config = { iterations: '300', params: { Sor: { enabled: true, type: 'triangular', min: '0.18', mode: '0.22', max: '0.26' }, iw_bpd: { enabled: true, type: 'uniform', min: '700', max: '900' } } };
const run = (cfg) => {
  const parsed = parseUncertaintyConfig(cfg);
  expect(parsed.errors).toEqual([]);
  return runWaterfloodUncertainty({ displacementSpec: spec, pattern, distributions: parsed.distributions, iterations: parsed.iterations, seed: parsed.seed });
};

describe('seeded Monte Carlo through the canonical module', () => {
  it('the same seed gives the same percentiles; another seed does not', () => {
    const a = run({ ...config, seed: '20261004' });
    const b = run({ ...config, seed: '20261004' });
    const c = run({ ...config, seed: '7' });
    expect(a.seed).toBe(20261004);
    expect(b.stats.np).toEqual(a.stats.np);
    expect(c.stats.np.p50).not.toBe(a.stats.np.p50);
  });

  it('is the canonical generator: passing mulberry32(seed) as the rng gives the same run', () => {
    const a = run({ ...config, seed: '42' });
    const parsed = parseUncertaintyConfig(config);
    const viaRng = runWaterfloodUncertainty({ displacementSpec: spec, pattern, distributions: parsed.distributions, iterations: 300, rng: mulberry32(42) });
    expect(viaRng.stats.np).toEqual(a.stats.np);
  });

  it('negative control: without a seed each run draws its own, records it, and the P50 moves', () => {
    const a = run(config);
    const b = run(config);
    expect(Number.isInteger(a.seed)).toBe(true);
    expect(a.seed).not.toBe(b.seed);
    expect(a.stats.np.p50).not.toBe(b.stats.np.p50);
    // the drawn seed reproduces its run
    expect(run({ ...config, seed: String(a.seed) }).stats.np).toEqual(a.stats.np);
  });

  it('refuses a seed that is not a 32-bit whole number', () => {
    expect(parseUncertaintyConfig({ ...config, seed: '1.5' }).errors).toEqual(['The seed must be a whole number from 0 to 4,294,967,295, or blank to draw one.']);
    expect(parseUncertaintyConfig({ ...config, seed: '4294967296' }).errors).toHaveLength(1);
    expect(parseUncertaintyConfig({ ...config, seed: ' ' }).seed).toBeNull();
  });

  it('the summary keeps the seed and the count; the report prints them', () => {
    const r = run({ ...config, seed: '20261004' });
    const uncertaintyConfig = { ...config, seed: '20261004' };
    const summary = mcSummaryRecord({ ...r, seedFrom: 'entered' }, { ranAt: '2026-10-04T09:00:00Z', fingerprint: mcInputsFingerprint({ displacementInputs: p.displacementInputs, patternInputs: p.patternInputs, uncertaintyConfig }) });
    expect(summary.seed).toBe(20261004);
    expect(summary.seedFrom).toBe('entered');
    expect(summary.iterations).toBe(300);
    const rep = reportOf({ ...p, uncertaintyConfig, mcSummary: summary });
    const row = rep.model.headline.rows ? rep.model.headline.rows.find((x) => /Monte Carlo/.test(x[0])) : rep.model.headline.find((x) => /Monte Carlo/.test(x[0]));
    expect(row[3]).toMatch(/of 300; seed 20261004 \(entered\); run on the inputs of this report/);
    expect(rep.figures.find((f) => f.id === 'mc').statement).toMatch(/300 realizations, seed 20261004/);
  });
});
