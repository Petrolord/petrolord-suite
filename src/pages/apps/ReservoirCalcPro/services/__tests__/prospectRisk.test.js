/**
 * G5.0 — prospect risking. Exact arithmetic, hand-derived expected
 * values (no oracle — the correlation/wellPath precedent). The key
 * invariant: risked-mean and success-case percentiles stay SEPARATE,
 * so the dry-hole risk is never hidden behind a single number.
 */

import {
  chanceOfSuccess, riskProspect, portfolioRollup, RISK_FACTORS,
} from '../ProspectRiskEngine';

const close = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));

describe('chanceOfSuccess', () => {
  test('product of the four factors', () => {
    expect(close(chanceOfSuccess({ trap: 0.5, reservoir: 0.8, charge: 0.9, seal: 0.7 }), 0.5 * 0.8 * 0.9 * 0.7)).toBe(true);
  });
  test('missing factors default to 1 (no risk)', () => {
    expect(chanceOfSuccess({ trap: 0.5 })).toBe(0.5);
    expect(chanceOfSuccess({})).toBe(1);
  });
  test('optional other multiplier folds in', () => {
    expect(close(chanceOfSuccess({ trap: 0.5, other: 0.5 }), 0.25)).toBe(true);
  });
  test('factors clamp to [0,1]', () => {
    expect(chanceOfSuccess({ trap: 1.5, reservoir: -0.2 })).toBe(0); // reservoir clamps to 0
    expect(chanceOfSuccess({ trap: 1.5 })).toBe(1);
    expect(RISK_FACTORS).toEqual(['trap', 'reservoir', 'charge', 'seal']);
  });
});

describe('riskProspect', () => {
  const unrisked = { p90: 10, p50: 25, p10: 60, mean: 30 };
  test('risked mean = Pg·mean; success case is the UNSCALED distribution', () => {
    const r = riskProspect({ name: 'Alpha', factors: { trap: 0.5, reservoir: 0.6 }, unrisked });
    expect(close(r.pg, 0.3)).toBe(true);
    expect(close(r.riskedMean, 0.3 * 30)).toBe(true);      // 9
    expect(r.successCase).toEqual({ p90: 10, p50: 25, p10: 60, mean: 30 }); // NOT scaled
    expect(close(r.pFailure, 0.7)).toBe(true);
  });
  test('deterministic case (mean only) works', () => {
    const r = riskProspect({ factors: { trap: 0.4 }, unrisked: { mean: 100 } });
    expect(close(r.riskedMean, 40)).toBe(true);
    expect(r.successCase.p50).toBeNull();
  });
  test('Pg=1 leaves the mean unrisked; Pg via missing unrisked -> 0', () => {
    expect(riskProspect({ factors: {}, unrisked: { mean: 50 } }).riskedMean).toBe(50);
    expect(riskProspect({ factors: { trap: 0.5 }, unrisked: {} }).riskedMean).toBe(0);
  });
});

describe('portfolioRollup', () => {
  const prospects = [
    riskProspect({ name: 'A', factors: { trap: 0.5 }, unrisked: { mean: 100, p50: 90 } }), // pg 0.5, risked 50
    riskProspect({ name: 'B', factors: { trap: 0.2 }, unrisked: { mean: 200, p50: 180 } }), // pg 0.2, risked 40
  ];
  test('EMV aggregates', () => {
    const p = portfolioRollup(prospects);
    expect(p.count).toBe(2);
    expect(close(p.expectedRiskedVolume, 50 + 40)).toBe(true);   // 90
    expect(close(p.expectedDiscoveries, 0.5 + 0.2)).toBe(true);  // 0.7
    expect(close(p.successCaseMeanTotal, 100 + 200)).toBe(true); // 300
    // P(at least one) = 1 - (1-0.5)(1-0.2) = 1 - 0.4 = 0.6
    expect(close(p.pAtLeastOneDiscovery, 0.6)).toBe(true);
    expect(close(p.meanPg, 0.35)).toBe(true);
  });
  test('empty portfolio is well-defined', () => {
    const p = portfolioRollup([]);
    expect(p).toMatchObject({ count: 0, expectedRiskedVolume: 0, expectedDiscoveries: 0, pAtLeastOneDiscovery: 0, meanPg: 0 });
  });
});
