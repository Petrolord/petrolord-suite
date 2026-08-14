// Tests for the Petroleum Economics Studio engine: the D0 real-breakeven
// solve and the D1 PSC unrecovered-cost carryforward. The PSC case uses the
// same hand-derived numbers as tools/validation/epe-validation.ts Case 3,
// proving this engine agrees with the canonical EPE engine on annual net
// cash flows for identical PSC terms.

import { calculateEconomics } from '../petroleumEconomicsEngine';

const PSC_CASE = {
  modelSettings: { startYear: 2030, endYear: 2031, discountRate: 0.10 },
  productionData: [
    { year: 2030, oil_rate: 1_000_000, gas_rate: 0, condensate_rate: 0 },
    { year: 2031, oil_rate: 1_000_000, gas_rate: 0, condensate_rate: 0 },
  ],
  costData: {
    capexProfile: [{ year: 2030, drilling_capex: 80_000_000 }],
    opexProfile: [
      { year: 2030, fixed_opex: 10_000_000 },
      { year: 2031, fixed_opex: 10_000_000 },
    ],
  },
  fiscalTerms: { template_type: 'psc', royalty_rate: 10, tax_rate: 50, cost_oil_limit: 40, profit_split: 50 },
  priceAssumptions: { oilPrice: 100, gasPrice: 0, escalation: 0 },
  assumptions: {},
  streams: {},
};

const TAX_ROYALTY_CASE = {
  modelSettings: { startYear: 2027, endYear: 2031, discountRate: 0.10 },
  productionData: [2027, 2028, 2029, 2030, 2031].map(y => ({ year: y, oil_rate: 1.0, gas_rate: 0, condensate_rate: 0 })),
  costData: {
    capexProfile: [{ year: 2027, drilling_capex: 100 }],
    opexProfile: [2027, 2028, 2029, 2030, 2031].map(y => ({ year: y, fixed_opex: 5 })),
  },
  fiscalTerms: { template_type: 'tax_royalty', royalty_rate: 10, tax_rate: 30 },
  priceAssumptions: { oilPrice: 70, gasPrice: 3, escalation: 0 },
  assumptions: {},
  streams: {},
};

describe('petroleumEconomicsEngine PSC carryforward (D1)', () => {
  it('matches the EPE oracle case: -40.5M then +39.5M', () => {
    const r = calculateEconomics(PSC_CASE);
    expect(r.annualResults[0].net_cashflow).toBeCloseTo(-40_500_000, 4);
    expect(r.annualResults[1].net_cashflow).toBeCloseTo(39_500_000, 4);
  });
});

describe('petroleumEconomicsEngine breakeven (D0)', () => {
  it('solves a breakeven price at which NPV is zero', () => {
    const r = calculateEconomics(TAX_ROYALTY_CASE);
    expect(r.metrics.breakeven_price).not.toBeNull();
    const atBreakeven = calculateEconomics({
      ...TAX_ROYALTY_CASE,
      priceAssumptions: { ...TAX_ROYALTY_CASE.priceAssumptions, oilPrice: r.metrics.breakeven_price },
    });
    expect(atBreakeven.metrics.npv).toBeCloseTo(0, 2);
  });

  it('returns null when no production exists', () => {
    const r = calculateEconomics({ ...TAX_ROYALTY_CASE, productionData: [] });
    expect(r.metrics.breakeven_price).toBeNull();
  });
});
