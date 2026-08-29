// Economics E1 gates for the rebuilt probabilistic breakeven engine.
//
// The load-bearing checks here are the PARITY ones: a breakeven price is
// only meaningful if feeding it back into the sanctioned screening
// engine actually lands on the target NPV. That is checked directly,
// against calculateEconomics rather than against anything this module
// computes for itself, so the two cannot drift.
import {
  generateBreakevenData,
  solveBreakevenPrice,
  npvAtPrice,
  DEFAULT_SEED,
} from '@/utils/breakevenCalculations';
import { calculateEconomics } from '@/utils/npvCalculations';

const rows = Array.from({ length: 10 }, (_, i) => ({
  year: 2026 + i,
  oil_production_bbl: 3_000_000 * (0.85 ** i),
}));

const base = {
  rows,
  discountRate: 10,
  royaltyRate: 12.5,
  taxRate: 30,
  capexMM: 1000,
  opexMM: 60,
  efficiency: 0.9,
};

const inputs = {
  iterations: 300,
  discountRate: 10,
  royaltyRate: 12.5,
  taxRate: 30,
  targetNpv: 0,
  productionData: { data: rows },
  variables: [
    { id: 1, name: 'Total CAPEX ($MM)', p10: 800, p50: 1000, p90: 1300 },
    { id: 2, name: 'Annual OPEX ($MM/year)', p10: 50, p50: 60, p90: 75 },
    { id: 3, name: 'Production Efficiency (%)', p10: 85, p50: 90, p90: 95 },
  ],
};

describe('breakeven price solve', () => {
  test('PARITY: the solved price zeroes the sanctioned engine, not a private one', () => {
    const price = solveBreakevenPrice(base, 0);
    expect(price).toBeGreaterThan(0);

    // Rebuild the case independently and run calculateEconomics directly.
    const projectLife = rows.length;
    const capex = new Array(projectLife).fill(0);
    capex[0] = base.capexMM;
    const econ = calculateEconomics({
      startYear: rows[0].year,
      projectLife,
      discountRate: base.discountRate,
      fiscalType: 'TaxRoyalty',
      production: {
        oil: rows.map((r) => r.oil_production_bbl * base.efficiency),
        gas: new Array(projectLife).fill(0),
      },
      price: {
        oil: new Array(projectLife).fill(price),
        gas: new Array(projectLife).fill(0),
      },
      capex,
      opexFixed: new Array(projectLife).fill(base.opexMM),
      opexVariable: new Array(projectLife).fill(0),
      abandonment: new Array(projectLife).fill(0),
      royaltyRate: base.royaltyRate,
      taxRate: base.taxRate,
    });
    expect(econ.metrics.npv).toBeCloseTo(0, 6);
  });

  test('solves a non-zero NPV target too', () => {
    const price = solveBreakevenPrice(base, 250);
    expect(npvAtPrice({ ...base, price })).toBeCloseTo(250, 6);
    // A higher hurdle needs a higher price.
    expect(price).toBeGreaterThan(solveBreakevenPrice(base, 0));
  });

  test('NPV is monotone in price, which is what makes bisection legitimate', () => {
    let prev = -Infinity;
    for (let p = 10; p <= 200; p += 10) {
      const npv = npvAtPrice({ ...base, price: p });
      expect(npv).toBeGreaterThan(prev);
      prev = npv;
    }
  });

  test('an unreachable target returns null rather than a fabricated price', () => {
    // No profile breaks even at a 500,000 million dollar NPV target.
    expect(solveBreakevenPrice(base, 5e5)).toBeNull();
  });

  test('higher costs raise the breakeven, higher efficiency lowers it', () => {
    const b = solveBreakevenPrice(base, 0);
    expect(solveBreakevenPrice({ ...base, capexMM: 1300 }, 0)).toBeGreaterThan(b);
    expect(solveBreakevenPrice({ ...base, opexMM: 75 }, 0)).toBeGreaterThan(b);
    expect(solveBreakevenPrice({ ...base, efficiency: 0.95 }, 0)).toBeLessThan(b);
  });
});

describe('probabilistic run', () => {
  test('REPRODUCIBLE: the same seed gives the identical distribution', () => {
    const a = generateBreakevenData({ ...inputs, seed: 12345 });
    const b = generateBreakevenData({ ...inputs, seed: 12345 });
    expect(a.kpis).toEqual(b.kpis);
    expect(a.plotData.histogram.x).toEqual(b.plotData.histogram.x);
  });

  test('a different seed gives a different sample but a similar distribution', () => {
    const a = generateBreakevenData({ ...inputs, seed: 1 });
    const b = generateBreakevenData({ ...inputs, seed: 2 });
    expect(a.plotData.histogram.x).not.toEqual(b.plotData.histogram.x);
    // Same underlying distribution, so the medians should be close.
    expect(Math.abs(a.kpis.p50 - b.kpis.p50) / a.kpis.p50).toBeLessThan(0.05);
  });

  test('the default seed is used and reported when none is given', () => {
    const r = generateBreakevenData(inputs);
    expect(r.seed).toBe(DEFAULT_SEED);
    expect(r.insights).toContain(String(DEFAULT_SEED));
  });

  test('percentiles are ordered and bracket the deterministic base case', () => {
    const r = generateBreakevenData({ ...inputs, seed: 7 });
    expect(r.kpis.p10).toBeLessThan(r.kpis.p50);
    expect(r.kpis.p50).toBeLessThan(r.kpis.p90);
    expect(r.baseBreakeven).toBeGreaterThan(r.kpis.p10);
    expect(r.baseBreakeven).toBeLessThan(r.kpis.p90);
  });

  test('the fitted ranges extend beyond the stated percentiles', () => {
    // The defect this rebuild fixes: percentiles are not endpoints.
    const r = generateBreakevenData({ ...inputs, seed: 7 });
    expect(r.distributionFits.capex.min).toBeLessThan(800);
    expect(r.distributionFits.capex.max).toBeGreaterThan(1300);
    // And the sampler actually reaches out there.
    expect(Math.min(...r.plotData.histogram.x))
      .toBeLessThan(r.kpis.p10);
  });

  test('the tornado carries BOTH sides of every swing', () => {
    const r = generateBreakevenData({ ...inputs, seed: 7 });
    expect(r.tornadoData.low).toHaveLength(3);
    expect(r.tornadoData.high).toHaveLength(3);
    r.tornadoData.low.forEach((lowSide, i) => {
      // one side below the base case, the other above it
      expect(lowSide).toBeLessThan(0);
      expect(r.tornadoData.high[i]).toBeGreaterThan(0);
    });
    // Sorted by swing, biggest first.
    const spans = r.tornadoData.high.map((h, i) => h - r.tornadoData.low[i]);
    expect(spans[0]).toBeGreaterThanOrEqual(spans[1]);
    expect(spans[1]).toBeGreaterThanOrEqual(spans[2]);
  });

  test('missing production data and missing variables both fail loudly', () => {
    expect(() => generateBreakevenData({ ...inputs, productionData: null }))
      .toThrow(/Production data/);
    expect(() => generateBreakevenData({ ...inputs, variables: [] }))
      .toThrow(/required/);
  });
});
