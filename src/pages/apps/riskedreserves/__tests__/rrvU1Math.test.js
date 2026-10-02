/**
 * Risked Reserves Valuation upgrade U1: the parts the report shows (RL2,
 * RL3, RL6). Every figure here is built from the engine's own exports, and
 * each test holds it against the engine's totals: valueProspect is called,
 * never restated (the "a gate must call the engine" rule).
 */
import { valueProspect, lognormalFromP90P10, exceedance } from '@/utils/prospectValuation';
import {
  emvParts, outcomes, riskedPercentile, volumeTable, volumeCurves, valueExceedance, valueCurves,
} from '../services/rrvMath';

const CASES = [
  { name: 'base', pg: 0.32, p90: 12, p50: 30, p10: 75, mefs: 10, unitValue: 8, devCost: 100, wellCost: 25 },
  { name: 'no MEFS', pg: 0.18, p90: 40, p50: 95, p10: 230, mefs: 0, unitValue: 6, devCost: 300, wellCost: 40 },
  { name: 'MEFS inside the range', pg: 0.5, p90: 5, p50: 20, p10: 80, mefs: 30, unitValue: 12, devCost: 250, wellCost: 15 },
  { name: 'MEFS that loses money', pg: 0.25, p90: 10, p50: 25, p10: 60, mefs: 5, unitValue: 4, devCost: 200, wellCost: 30 },
  { name: 'certain', pg: 1, p90: 10, p50: 25, p10: 60, mefs: 10, unitValue: 8, devCost: 100, wellCost: 25 },
];

describe('the EMV in its parts closes on the engine EMV', () => {
  test.each(CASES)('$name', (e) => {
    const v = valueProspect(e);
    const parts = emvParts(e);
    expect(parts.revenue - parts.development - parts.well).toBeCloseTo(v.emv, 9);
    expect(parts.emv).toBeCloseTo(v.emv, 9);
    expect(parts.pCommercialGivenSuccess).toBeCloseTo(v.pCommercialGivenSuccess, 12);
    expect(parts.well).toBe(e.wellCost);
  });
  test('negative control: leaving the development cost out of the parts misses the engine by its chance-weighted size', () => {
    const e = CASES[0];
    const parts = emvParts(e);
    expect(Math.abs((parts.revenue - parts.well) - valueProspect(e).emv)).toBeGreaterThan(25);
  });
});

describe('the outcome table: chances sum to one, chance-weighted values to the EMV', () => {
  test.each(CASES)('$name', (e) => {
    const v = valueProspect(e);
    const o = outcomes(e, v);
    expect(o.chance).toBeCloseTo(1, 12);
    expect(o.expected).toBeCloseTo(v.emv, 9);
    expect(o.rows.map((r) => r.key)).toEqual(['dry', 'sub', 'commercial']);
    expect(o.rows[0].value).toBe(-e.wellCost);
    expect(o.rows[2].chance).toBeCloseTo(v.pc, 12);
  });
});

describe('risked percentiles are read from the risked expectation curve', () => {
  test('the risked curve at the risked percentile is the stated probability; zero when Pg does not reach it', () => {
    const e = CASES[2]; // Pg 0.5
    const ln = lognormalFromP90P10(e.p90, e.p10);
    const x10 = riskedPercentile(e, 0.1);
    expect(e.pg * exceedance(ln, x10)).toBeCloseTo(0.1, 6);
    expect(riskedPercentile(e, 0.5)).toBe(0);
    expect(riskedPercentile(e, 0.9)).toBe(0);
    // with certainty the risked percentiles are the success-case ones
    const sure = CASES[4];
    expect(riskedPercentile(sure, 0.9)).toBeCloseTo(sure.p90, 4);
    expect(riskedPercentile(sure, 0.1)).toBeCloseTo(sure.p10, 4);
  });
  test('the volume table: fitted percentiles pass through the entered P90 and P10; means are the engine means', () => {
    const e = CASES[0];
    const v = valueProspect(e);
    const t = Object.fromEntries(volumeTable(e, v).map((r) => [r.key, r]));
    expect(t.p90.fitted).toBeCloseTo(12, 5);
    expect(t.p10.fitted).toBeCloseTo(75, 4);
    expect(t.p50.entered).toBe(30);
    expect(t.mean.fitted).toBe(v.successCase.mean);
    expect(t.mean.risked).toBe(v.riskedMean);
    expect(t.p90.risked).toBe(0);
    expect(t.p10.risked).toBeGreaterThan(0);
  });
});

describe('the expectation curves', () => {
  test('volume: sixty points from the 99 to the 1 percent volume, risked = Pg x unrisked at every point', () => {
    const e = CASES[0];
    const c = volumeCurves(e);
    expect(c.success).toHaveLength(60);
    expect(c.risked).toHaveLength(60);
    expect(c.success[0][1]).toBeCloseTo(99, 3);
    expect(c.success[59][1]).toBeCloseTo(1, 3);
    for (let i = 0; i < 60; i += 1) {
      expect(c.risked[i][0]).toBe(c.success[i][0]);
      expect(c.risked[i][1]).toBeCloseTo(e.pg * c.success[i][1], 10);
    }
  });
  // E[Y] = y0 + integral over y > y0 of P(Y >= y): the mean of the value
  // curve must be the engine's EMV. Integrated on a fine grid well past the
  // curve's drawn range.
  const meanOfCurve = (e, given) => {
    const ln = lognormalFromP90P10(e.p90, e.p10);
    const top = e.unitValue * ln.percentile(1e-7);
    const lo = Math.min(-e.wellCost, e.unitValue * e.mefs - e.devCost - e.wellCost) - 1;
    // midpoint rule, split at the step so the jump falls on a panel edge
    const piece = (a, b, n) => {
      let sum = 0;
      for (let i = 0; i < n; i += 1) sum += valueExceedance(e, a + ((i + 0.5) / n) * (b - a), { given });
      return (sum * (b - a)) / n;
    };
    const step = -e.wellCost;
    return lo + piece(lo, step, 4000) + piece(step, top, 60000);
  };
  test.each(CASES)('value: the mean of the risked curve is the engine EMV ($name)', (e) => {
    const v = valueProspect(e);
    expect(meanOfCurve(e, 'all')).toBeCloseTo(v.emv, 1);
  });
  test('value: the unrisked curve is the same prospect with Pg = 1', () => {
    const e = CASES[0];
    expect(meanOfCurve(e, 'success')).toBeCloseTo(valueProspect({ ...e, pg: 1 }).emv, 1);
  });
  test('value: the step at minus the well cost is the chance of no commercial discovery', () => {
    const e = CASES[0];
    const v = valueProspect(e);
    const W = e.wellCost;
    const ln = lognormalFromP90P10(e.p90, e.p10);
    // just above -W only the commercial outcomes that beat a dry hole remain:
    // u V - D > 0, so V above D / u (12.5), not merely above the MEFS (10)
    expect(valueExceedance(e, -W + 1e-9)).toBeCloseTo(e.pg * exceedance(ln, e.devCost / e.unitValue), 9);
    // at -W the dry hole and the sub-commercial discovery join them
    expect(valueExceedance(e, -W)).toBeCloseTo(1 - v.pc + e.pg * exceedance(ln, e.devCost / e.unitValue), 9);
    // a discovery of exactly the MEFS is worth -20 - W here: commercial by
    // the MEFS and yet worse than a dry hole. Below that value sits nothing.
    expect(valueExceedance(e, -W - 20 - 1e-9)).toBeCloseTo(1, 12);
    expect(valueExceedance(e, -W - 1e-9)).toBeLessThan(1);
  });
  test('negative control: a curve that ignores the development cost has a different mean', () => {
    const e = CASES[0];
    expect(Math.abs(meanOfCurve({ ...e, devCost: 0 }, 'all') - valueProspect(e).emv)).toBeGreaterThan(20);
  });
  test('value curves: drawn from the worst outcome up, with the step, and null without a value per barrel', () => {
    const c = valueCurves(CASES[0]);
    expect(c.risked.length).toBeGreaterThan(60);
    expect(c.risked[0][1]).toBeCloseTo(100, 6);
    expect(c.risked[c.risked.length - 1][1]).toBeLessThan(1);
    expect(c.risked.some(([y]) => y === -CASES[0].wellCost)).toBe(true);
    for (let i = 1; i < c.risked.length; i += 1) expect(c.risked[i][1]).toBeLessThanOrEqual(c.risked[i - 1][1] + 1e-9);
    expect(valueCurves({ ...CASES[0], unitValue: 0 })).toBeNull();
  });
});
