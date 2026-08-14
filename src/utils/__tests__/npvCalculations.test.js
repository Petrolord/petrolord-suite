// D1 tests for the canonical client-side screening economics engine.
// Conventions under test are documented in the npvCalculations.js header:
// mid-year discounting, PSC carryforward, opt-in straight-line depreciation.
// The PSC case reuses the hand-derived numbers from the EPE oracle harness
// (tools/validation/epe-validation.ts Case 3) so the two engines are proven
// to agree on annual net cash flows for the same PSC terms.

import { calculateEconomics } from '../npvCalculations';

const flat = (v, n) => new Array(n).fill(v);

describe('calculateEconomics TaxRoyalty (hand-derived, mid-year discounting)', () => {
  // $100 oil, 1 MMbbl/yr for 2 years, royalty 20%, tax 50%,
  // capex $50MM year 1, opex $10MM/yr, immediate expensing.
  // Year 1: royalty 20, taxable = 80 - 10 - 50 = 20, tax 10, ncf = 80-60-10 = +10
  // Year 2: taxable = 80 - 10 = 70, tax 35, ncf = 80-10-35 = +35
  // NPV(10%, mid-year) = 10/1.1^0.5 + 35/1.1^1.5
  const inputs = {
    startYear: 2030, projectLife: 2, discountRate: 10, fiscalType: 'TaxRoyalty',
    production: { oil: [1_000_000, 1_000_000], gas: [0, 0] },
    price: { oil: [100, 100], gas: [0, 0] },
    capex: [50, 0], opexFixed: [10, 10], opexVariable: [0, 0], abandonment: [0, 0],
    royaltyRate: 20, taxRate: 50,
  };

  it('matches the closed-form royalty, tax, and net cash flow', () => {
    const { cashflow } = calculateEconomics(inputs);
    expect(cashflow[0].royalty).toBeCloseTo(20, 9);
    expect(cashflow[0].tax).toBeCloseTo(10, 9);
    expect(cashflow[0].ncf).toBeCloseTo(10, 9);
    expect(cashflow[1].tax).toBeCloseTo(35, 9);
    expect(cashflow[1].ncf).toBeCloseTo(35, 9);
  });

  it('discounts mid-year', () => {
    const { metrics } = calculateEconomics(inputs);
    const expected = 10 / Math.pow(1.1, 0.5) + 35 / Math.pow(1.1, 1.5);
    expect(metrics.npv).toBeCloseTo(expected, 9);
  });

  it('spreads CAPEX for tax via capexDepreciationYears without changing cash timing', () => {
    const res = calculateEconomics({ ...inputs, capexDepreciationYears: 2 });
    // Depreciation 25/yr: Y1 taxable = 80-10-25 = 45 -> tax 22.5, ncf = 80-60-22.5 = -2.5
    // Y2 taxable = 80-10-25 = 45 -> tax 22.5, ncf = 80-10-22.5 = +47.5
    expect(res.cashflow[0].depreciation).toBeCloseTo(25, 9);
    expect(res.cashflow[0].tax).toBeCloseTo(22.5, 9);
    expect(res.cashflow[0].ncf).toBeCloseTo(-2.5, 9);
    expect(res.cashflow[1].ncf).toBeCloseTo(47.5, 9);
    // Total pre-tax cash out is unchanged: only tax timing moved.
    const cashOut = res.cashflow.reduce((s, c) => s + c.capex + c.opex, 0);
    expect(cashOut).toBeCloseTo(70, 9);
  });
});

describe('calculateEconomics PSC carryforward (cross-engine with epe-engine Case 3)', () => {
  // Same terms as tools/validation/epe-validation.ts Case 3:
  // royalty 10%, cost oil cap 40%, contractor share 50%, tax 50%,
  // $100 oil, 1 MMbbl/yr, capex $80MM year 1, opex $10MM/yr.
  // Expected (hand-derived there): ncf year 1 = -40.5, year 2 = +39.5,
  // unrecovered pool 54 -> 28.
  const inputs = {
    startYear: 2030, projectLife: 2, discountRate: 10, fiscalType: 'PSC',
    production: { oil: [1_000_000, 1_000_000], gas: [0, 0] },
    price: { oil: [100, 100], gas: [0, 0] },
    capex: [80, 0], opexFixed: [10, 10], opexVariable: [0, 0], abandonment: [0, 0],
    royaltyRate: 10, taxRate: 50, costRecoveryCap: 40, profitSplitContractor: 50,
  };

  it('carries unrecovered costs forward and matches the server engine', () => {
    const { cashflow } = calculateEconomics(inputs);
    expect(cashflow[0].ncf).toBeCloseTo(-40.5, 9);
    expect(cashflow[0].pscUnrecoveredCost).toBeCloseTo(54, 9);
    expect(cashflow[1].ncf).toBeCloseTo(39.5, 9);
    expect(cashflow[1].pscUnrecoveredCost).toBeCloseTo(28, 9);
  });

  it('recovers the pool fully when later revenue allows', () => {
    // Extend to 4 years: pool 28 -> 0 by year 3 (recovery capped at 36).
    const long = {
      ...inputs, projectLife: 4,
      production: { oil: flat(1_000_000, 4), gas: flat(0, 4) },
      price: { oil: flat(100, 4), gas: flat(0, 4) },
      capex: [80, 0, 0, 0], opexFixed: flat(10, 4), opexVariable: flat(0, 4), abandonment: flat(0, 4),
    };
    const { cashflow } = calculateEconomics(long);
    // Year 3 pool: 28 + 10 = 38 -> recover 36, carry 2. Year 4: 2 + 10 = 12 -> recover 12, carry 0.
    expect(cashflow[2].pscUnrecoveredCost).toBeCloseTo(2, 9);
    expect(cashflow[3].pscUnrecoveredCost).toBeCloseTo(0, 9);
  });
});

describe('calculateEconomics IRR guard', () => {
  it('returns 0 when the cash flow never changes sign', () => {
    const { metrics } = calculateEconomics({
      startYear: 2030, projectLife: 2, discountRate: 10, fiscalType: 'TaxRoyalty',
      production: { oil: [1_000_000, 1_000_000], gas: [0, 0] },
      price: { oil: [100, 100], gas: [0, 0] },
      capex: [0, 0], opexFixed: [10, 10], opexVariable: [0, 0], abandonment: [0, 0],
      royaltyRate: 0, taxRate: 0,
    });
    expect(metrics.irr).toBe(0);
  });

  it('solves a known mid-year IRR', () => {
    // ncf = [-100, +121] (all revenue year 2, all capex year 1, no tax):
    // -100/(1+r)^0.5 + 121/(1+r)^1.5 = 0 -> (1+r) = 1.21 -> IRR 21%
    const { metrics, cashflow } = calculateEconomics({
      startYear: 2030, projectLife: 2, discountRate: 10, fiscalType: 'TaxRoyalty',
      production: { oil: [0, 1_210_000], gas: [0, 0] },
      price: { oil: [0, 100], gas: [0, 0] },
      capex: [100, 0], opexFixed: [0, 0], opexVariable: [0, 0], abandonment: [0, 0],
      royaltyRate: 0, taxRate: 0,
    });
    expect(cashflow[0].ncf).toBeCloseTo(-100, 9);
    expect(cashflow[1].ncf).toBeCloseTo(121, 9);
    expect(metrics.irr).toBeCloseTo(21, 3);
  });
});
