// ReservoirCalc Pro upgrade U2-017: spider plot data from the engine and
// distribution fitting validated on samples drawn from known distributions
// (drawn with the canonical engine's own marginals and a seeded stream).

import { fitDistributions, parseValues, ksDistance, toPanelDist } from '../services/distributionFit';
import { MonteCarloEngine } from '../services/MonteCarloEngine';
import { formatDistributions } from '../services/distributions';
import { marginalValue, randomNormal, mulberry32 } from '@/lib/monteCarlo';

jest.setTimeout(120000);

const draw = (dist, n, seed) => {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => marginalValue(dist, randomNormal(rng)));
};

describe('U2-017 fitting recovers known distributions', () => {
  it('normal(0.20, 0.03): normal ranks first, mean within 0.003, sd within 6 percent, KS under the critical value', () => {
    const f = fitDistributions(draw({ type: 'normal', mean: 0.2, stdDev: 0.03 }, 2000, 11), { fraction: true });
    expect(f.best.type).toBe('normal');
    expect(Math.abs(f.best.dist.mean - 0.2)).toBeLessThan(0.003);
    expect(Math.abs(f.best.dist.stdDev / 0.03 - 1)).toBeLessThan(0.06);
    expect(f.best.ks).toBeLessThan(f.ksCritical);
  });

  it('lognormal(mean 100, sd 40): lognormal ranks first and its moments come back within 5 percent', () => {
    const f = fitDistributions(draw({ type: 'lognormal', mean: 100, stdDev: 40 }, 3000, 12));
    expect(f.best.type).toBe('lognormal');
    expect(Math.abs(f.best.dist.mean / 100 - 1)).toBeLessThan(0.05);
    expect(Math.abs(f.best.dist.stdDev / 40 - 1)).toBeLessThan(0.05);
    // negative control: the normal fitted to the same skewed data is rejected by KS
    const normal = f.candidates.find((c) => c.type === 'normal');
    expect(normal.ks).toBeGreaterThan(f.ksCritical);
  });

  it('uniform(10, 20) ranks first with end points within 1 percent of the range', () => {
    const f = fitDistributions(draw({ type: 'uniform', min: 10, max: 20 }, 2000, 13));
    expect(f.best.type).toBe('uniform');
    expect(Math.abs(f.best.dist.min - 10)).toBeLessThan(0.1);
    expect(Math.abs(f.best.dist.max - 20)).toBeLessThan(0.1);
  });

  it('triangular(0.10, 0.15, 0.30) ranks first with min, mode and max close', () => {
    const f = fitDistributions(draw({ type: 'triangular', min: 0.1, mode: 0.15, max: 0.3 }, 4000, 14));
    expect(f.best.type).toBe('triangular');
    expect(Math.abs(f.best.dist.min - 0.1)).toBeLessThan(0.005);
    expect(Math.abs(f.best.dist.max - 0.3)).toBeLessThan(0.005);
    expect(Math.abs(f.best.dist.mode - 0.15)).toBeLessThan(0.01);
  });

  it('the KS distance itself: a perfect uniform grid against its own CDF is 1/(2n)', () => {
    const xs = Array.from({ length: 10 }, (_, i) => (i + 0.5) / 10);
    expect(ksDistance(xs, (v) => v)).toBeCloseTo(0.05, 12);
  });

  it('pasted text, refusals, and the fitted shape runs in the engine through the panel\'s own formatter', () => {
    const p = parseValues('0.21, 0.19; 0.22 x 0.18\n0.2');
    expect(p.values).toEqual([0.21, 0.19, 0.22, 0.18, 0.2]);
    expect(p.skipped).toBe(1);
    expect(fitDistributions([1, 2, 3]).reason).toMatch(/at least 8/);
    expect(fitDistributions(new Array(10).fill(3)).reason).toMatch(/the same/);
    const f = fitDistributions(draw({ type: 'normal', mean: 0.2, stdDev: 0.03 }, 500, 21));
    const { formatted, problems } = formatDistributions({ porosity: toPanelDist(f.best.dist) }, ['porosity']);
    expect(problems).toEqual([]);
    const r = MonteCarloEngine.simulate({ fluidType: 'oil', unitSystem: 'field', iterations: 500, grvMode: 'analytic', seed: 3 }, { ...formatted, area: { type: 'constant', value: 1000 }, thickness: { type: 'constant', value: 50 } });
    expect(r.stats.stooip.p50).toBeGreaterThan(0);
  });
});

describe('U2-017 spider plot data from the engine', () => {
  const tri = (min, mode, max) => ({ type: 'triangular', min, mode, max });
  const inputs = { area: tri(800, 1000, 1300), thickness: tri(40, 50, 70), porosity: tri(0.15, 0.2, 0.25), sw: tri(0.2, 0.3, 0.4), fvf: tri(1.1, 1.2, 1.3) };
  const res = MonteCarloEngine.simulate({ fluidType: 'oil', unitSystem: 'field', iterations: 4000, grvMode: 'analytic', seed: 8 }, inputs);
  const sp = res.stats.spider;

  it('one line per uncertain input, five points each, the median point equal to the base', () => {
    expect(sp.lines.map((l) => l.key).sort()).toEqual(['area', 'fvf', 'porosity', 'sw', 'thickness']);
    for (const l of sp.lines) {
      expect(l.points.map((p) => p.pct)).toEqual([0.1, 0.25, 0.5, 0.75, 0.9]);
      expect(l.points[2].volume).toBeCloseTo(sp.base, 6);
    }
  });

  it('each point is the engine\'s volume at those inputs: STOIIP is linear in area and falls with Sw and Bo', () => {
    const area = sp.lines.find((l) => l.key === 'area');
    // STOIIP = 7758 A h NTG phi (1 - Sw) / Bo: proportional to area at fixed others
    expect(area.points[4].volume / area.points[0].volume).toBeCloseTo(area.points[4].input / area.points[0].input, 9);
    const sw = sp.lines.find((l) => l.key === 'sw');
    expect(sw.points[4].volume).toBeLessThan(sw.points[0].volume);
    const fvf = sp.lines.find((l) => l.key === 'fvf');
    expect(fvf.points[0].volume / fvf.points[4].volume).toBeCloseTo(fvf.points[4].input / fvf.points[0].input, 9);
  });

  it('negative control: with no uncertain input there is no spider', () => {
    const c = MonteCarloEngine.simulate({ fluidType: 'oil', unitSystem: 'field', iterations: 100, grvMode: 'analytic', seed: 1 }, { area: { type: 'constant', value: 1000 } });
    expect(c.stats.spider).toBeUndefined();
  });
});
