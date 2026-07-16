import {
  triangularRandom, calculateSingleNPV, runSensitivityAnalysis, runMonteCarloSimulation,
} from '../riskedReservesCalculations';

// Deterministic LCG so the Monte Carlo tests are reproducible.
const makeLcg = (seed = 42) => {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
};

const PARAMS = (over = {}) => ({
  'Oil Reserves (MMSTB)': 1,
  'Initial Oil Price ($/STB)': 80,
  'CAPEX ($MM)': 30,
  'OPEX ($/boe)': 10,
  'Decline Rate (%/yr)': 10,
  ...over,
});

describe('triangularRandom', () => {
  it('returns the bounds at the CDF extremes and the mode branch point', () => {
    expect(triangularRandom(0, 50, 100, () => 0)).toBeCloseTo(0, 9);
    expect(triangularRandom(0, 50, 100, () => 0.999999999)).toBeCloseTo(100, 2);
    // Symmetric case at rand = 0.5: 100 - sqrt(0.5*100*50) = 50
    expect(triangularRandom(0, 50, 100, () => 0.5)).toBeCloseTo(50, 9);
  });

  it('always samples inside [p10, p90]', () => {
    const rng = makeLcg(7);
    for (let i = 0; i < 500; i++) {
      const x = triangularRandom(10, 30, 90, rng);
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThanOrEqual(90);
    }
  });
});

describe('calculateSingleNPV', () => {
  it('matches the one-year hand calculation', () => {
    // Life 1, decline 50% -> q1 = reserves (all produced in year 1).
    // revenue 80e6, royalty 8e6, opex 10e6, PBT 62e6, tax 18.6e6,
    // CF 43.4e6, discounted 43.4/1.1 = 39.4545e6; NPV = -30 + 39.4545
    const npv = calculateSingleNPV(
      PARAMS({ 'Decline Rate (%/yr)': 50 }),
      { discountRate: 10, taxRate: 30, royaltyRate: 10, projectLife: 1 },
    );
    expect(npv).toBeCloseTo(-30 + 43.4 / 1.1, 6);
  });

  it('conserves reserves: undiscounted untaxed $1/bbl NPV equals the reserves', () => {
    // price 1, no royalty/opex/tax/discount/capex -> NPV($MM) = reserves (MMSTB)
    const clean = { discountRate: 0, taxRate: 0, royaltyRate: 0, projectLife: 20 };
    const npv = calculateSingleNPV(
      PARAMS({ 'Initial Oil Price ($/STB)': 1, 'CAPEX ($MM)': 0, 'OPEX ($/boe)': 0 }),
      clean,
    );
    expect(npv).toBeCloseTo(1, 9);
  });

  it('handles zero decline (uniform production) without NaN', () => {
    const clean = { discountRate: 0, taxRate: 0, royaltyRate: 0, projectLife: 4 };
    const npv = calculateSingleNPV(
      PARAMS({ 'Decline Rate (%/yr)': 0, 'Initial Oil Price ($/STB)': 1, 'CAPEX ($MM)': 0, 'OPEX ($/boe)': 0 }),
      clean,
    );
    expect(npv).toBeCloseTo(1, 9);
  });

  it('does not credit negative tax when the year loses money', () => {
    const settings = { discountRate: 0, taxRate: 50, royaltyRate: 0, projectLife: 1 };
    const losing = calculateSingleNPV(
      PARAMS({ 'Initial Oil Price ($/STB)': 5, 'OPEX ($/boe)': 10, 'CAPEX ($MM)': 0, 'Decline Rate (%/yr)': 50 }),
      settings,
    );
    // PBT = (5-10)*1e6 = -5e6; no tax credit -> NPV = -5 $MM
    expect(losing).toBeCloseTo(-5, 9);
  });
});

describe('runSensitivityAnalysis', () => {
  it('orders variables by NPV swing, largest first', () => {
    const settings = { discountRate: 10, taxRate: 30, royaltyRate: 10, projectLife: 10 };
    const base = PARAMS();
    const variables = [
      { name: 'Initial Oil Price ($/STB)', p10: 40, p50: 80, p90: 120 },
      { name: 'OPEX ($/boe)', p10: 9, p50: 10, p90: 11 },
    ];
    const tornado = runSensitivityAnalysis(base, variables, settings);
    expect(tornado[0].variable).toBe('Initial Oil Price');
    expect(tornado[0].swing).toBeGreaterThan(tornado[1].swing);
    expect(tornado[1].swing).toBeGreaterThan(0);
  });
});

describe('runMonteCarloSimulation', () => {
  const inputs = {
    variables: [
      { name: 'Oil Reserves (MMSTB)', p10: 5, p50: 10, p90: 20 },
      { name: 'Initial Oil Price ($/STB)', p10: 50, p50: 75, p90: 110 },
      { name: 'CAPEX ($MM)', p10: 200, p50: 300, p90: 450 },
      { name: 'OPEX ($/boe)', p10: 8, p50: 12, p90: 18 },
      { name: 'Decline Rate (%/yr)', p10: 8, p50: 12, p90: 18 },
    ],
    simulationSettings: { iterations: 2000 },
    economicSettings: { discountRate: 10, taxRate: 30, royaltyRate: 10, projectLife: 15 },
  };

  it('is deterministic under an injected RNG and follows the petroleum convention', async () => {
    const a = await runMonteCarloSimulation(inputs, makeLcg(42));
    const b = await runMonteCarloSimulation(inputs, makeLcg(42));
    expect(a.summary).toEqual(b.summary);
    // P10 (high) >= P50 >= P90 (low)
    expect(a.summary.p10).toBeGreaterThanOrEqual(a.summary.p50);
    expect(a.summary.p50).toBeGreaterThanOrEqual(a.summary.p90);
    expect(a.summary.chanceOfSuccess).toBeGreaterThanOrEqual(0);
    expect(a.summary.chanceOfSuccess).toBeLessThanOrEqual(100);
  });

  it('produces a complete CDF and a histogram that accounts for every run', async () => {
    const r = await runMonteCarloSimulation(inputs, makeLcg(7));
    expect(r.cdfData).toHaveLength(2000);
    expect(r.cdfData[1999].prob).toBeCloseTo(100, 9);
    const counted = r.histogramData.reduce((s, b) => s + b.count, 0);
    expect(counted).toBe(2000); // the max lands in the closed last bin
    expect(r.tornadoData).toHaveLength(5);
    expect(r.tornadoData[0].swing).toBeGreaterThanOrEqual(r.tornadoData[4].swing);
  });
});
