// D1 tests for the Fiscal Regime Designer screening engine: robust IRR
// (bisection, uncapped), honest tax base (contractor profit share, no
// invented opex/2 deduction), configurable RRT capital uplift.

import {
  calculateNPV,
  calculateIRR,
  calculateCashFlowForRegime,
  runFiscalComparison,
} from '../fiscalDesignerCalculations';

const cf = (pairs) => pairs.map(([year, contractorNCF]) => ({ year, contractorNCF }));

describe('calculateIRR (bisection)', () => {
  it('solves a textbook two-flow IRR exactly', () => {
    // -100/(1+r) + 121/(1+r)^2 = 0 -> r = 21%
    expect(calculateIRR(cf([[1, -100], [2, 121]]))).toBeCloseTo(21, 4);
  });

  it('is no longer capped at 50%', () => {
    // -100/(1+r) + 300/(1+r)^2 = 0 -> r = 200%
    expect(calculateIRR(cf([[1, -100], [2, 300]]))).toBeCloseTo(200, 3);
  });

  it('returns 0 when no sign change exists', () => {
    expect(calculateIRR(cf([[1, 50], [2, 50]]))).toBe(0);
  });

  it('returns 0 when NPV is negative even undiscounted', () => {
    expect(calculateIRR(cf([[1, -100], [2, 80]]))).toBe(0);
  });
});

const FLAT_REGIME = {
  id: 'r1',
  name: 'Flat Test Regime',
  royalty: { type: 'flat', rate: 10 },
  costRecoveryLimit: 50,
  profitSplit: { type: 'flat', split: 60 },
  tax: { cit: 30, rrt: 0, minTax: 0 },
};

const PROJECT = {
  production: {
    oil: { initial: 10000, decline: 10 },
    gas: { initial: 0, decline: 0 },
    ngl: { initial: 0, decline: 0 },
  },
  costs: {
    capex: { drilling: 200, facilities: 100, subsea: 0 },
    opex: { fixed: 20, variable: 5 },
  },
  prices: [{ year: 1, oil: 80, gas: 3, ngl: 40 }],
  discountRate: 10,
};

describe('calculateCashFlowForRegime tax base (D1 honest math)', () => {
  it('taxes the contractor profit share with no opex/2 deduction', () => {
    const flows = calculateCashFlowForRegime(FLAT_REGIME, PROJECT);
    // Recompute year 1 by hand from the engine's own published structure:
    const oilVol = 10000 * 365;
    const gross = (oilVol * 80) / 1e6;
    const royalty = gross * 0.10;
    const revAfterRoy = gross - royalty;
    const capex = 300;
    const costRecovered = Math.min(capex, revAfterRoy * 0.5);
    const profitOil = revAfterRoy - costRecovered;
    const contractorShare = profitOil * 0.6;
    const tax = contractorShare > 0 ? contractorShare * 0.3 : 0;
    const totalBoe = oilVol;
    const opex = 20 + (totalBoe * 5) / 1e6;
    const expectedNCF = contractorShare - tax - opex - capex;
    expect(flows[0].contractorNCF).toBeCloseTo(expectedNCF, 6);
  });

  it('honors a custom RRT uplift parameter', () => {
    const regimeRrt = { ...FLAT_REGIME, tax: { cit: 0, rrt: 40, minTax: 0, rrtUpliftPct: 50 } };
    const regimeRrtDefault = { ...FLAT_REGIME, tax: { cit: 0, rrt: 40, minTax: 0 } };
    const withCustom = calculateCashFlowForRegime(regimeRrt, PROJECT);
    const withDefault = calculateCashFlowForRegime(regimeRrtDefault, PROJECT);
    // Larger uplift -> smaller RRT base -> less tax -> higher contractor NCF
    // in every year where RRT binds.
    const totalCustom = withCustom.reduce((s, f) => s + f.contractorNCF, 0);
    const totalDefault = withDefault.reduce((s, f) => s + f.contractorNCF, 0);
    expect(totalCustom).toBeGreaterThan(totalDefault);
  });
});

describe('runFiscalComparison end to end', () => {
  it('returns a consistent summary with finite NPV and uncapped IRR', async () => {
    const { summary, annualCashFlows } = await runFiscalComparison({
      projectInputs: PROJECT,
      regimes: [FLAT_REGIME],
    });
    expect(summary).toHaveLength(1);
    expect(Number.isFinite(summary[0].npv)).toBe(true);
    expect(summary[0].npv).toBeCloseTo(
      calculateNPV(annualCashFlows[0].data, PROJECT.discountRate), 6);
    expect(summary[0].irr).toBeGreaterThanOrEqual(0);
  });
});
