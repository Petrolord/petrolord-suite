/**
 * EC2-3 and EC2-6 (engines #190) as the Fiscal Regime Designer reads them.
 *
 * EC2-3: the capex sweep accumulated 0.1 in floating point and stopped at
 * 1.4 while its axis and the resilience verdict said 1.5. It runs on an
 * integer step count now: eight points, 0.8 to 1.5 exactly.
 *
 * EC2-6: the RRT capital uplift was deducted from the tax base in every one
 * of the 25 years, so relief over the life came to five times capex at the
 * default 20 percent. It sizes a one-time pool now, capex times one plus the
 * uplift, drawn down until it is exhausted.
 */
import fs from 'fs';
import path from 'path';
import { runFiscalComparison, CAPEX_SWEEP_MULTIPLIERS } from '@/utils/fiscalDesignerCalculations';

// The guide is a component, so its copy is read from the source, the way the
// other help-guide guards in this repo read theirs.
const HELP_GUIDE_PATH = path.resolve(__dirname, '../../components/fiscaldesigner/FiscalDesignerHelpGuide.jsx');
const helpGuideSource = fs.readFileSync(HELP_GUIDE_PATH, 'utf8');

const PROJECT = {
  name: 'Sweep project',
  production: {
    oil: { initial: 30000, decline: 12 },
    gas: { initial: 0, decline: 0 },
    ngl: { initial: 0, decline: 0 },
  },
  prices: [{ year: 1, oil: 80, gas: 3, ngl: 45 }],
  costs: { capex: { drilling: 400, facilities: 500, subsea: 100 }, opex: { fixed: 60, variable: 4 } },
  discountRate: 10,
};
const TOTAL_CAPEX_MM = 1000;
const RRT_RATE = 0.5;

const regime = (rrtUpliftPct) => ({
  id: `u${rrtUpliftPct}`,
  name: `Uplift ${rrtUpliftPct}`,
  royalty: { type: 'flat', rate: 12.5 },
  costRecoveryLimit: 100,
  profitSplit: { type: 'flat', split: 100 },
  tax: { cit: 30, rrt: RRT_RATE * 100, minTax: 0, rrtUpliftPct },
});

const govTake = async (rrtUpliftPct) => {
  const results = await runFiscalComparison({ projectInputs: PROJECT, regimes: [regime(rrtUpliftPct)] });
  return results.summary[0].govTake;
};

describe('the capex sweep', () => {
  it('is eight points and ends where the axis says', async () => {
    expect(CAPEX_SWEEP_MULTIPLIERS).toHaveLength(8);
    expect(CAPEX_SWEEP_MULTIPLIERS[0]).toBe(0.8);
    expect(CAPEX_SWEEP_MULTIPLIERS[7]).toBe(1.5);
    const results = await runFiscalComparison({ projectInputs: PROJECT, regimes: [regime(20)] });
    const { labels, data } = results.sensitivityData.capex;
    expect(labels).toEqual(['0.8', '0.9', '1.0', '1.1', '1.2', '1.3', '1.4', '1.5']);
    // Every swept point carries a value: the eighth is not a label with no number.
    expect(data[0].values).toHaveLength(8);
    data[0].values.forEach((v) => expect(Number.isFinite(v)).toBe(true));
    // Negative control: more capex is worth less to the contractor, so the
    // sweep really is running the multiplier.
    expect(data[0].values[7]).toBeLessThan(data[0].values[0]);
  });
});

describe('the RRT capital uplift', () => {
  it('relieves at most capex times one plus the uplift, once, over the whole life', async () => {
    const [take0, take20] = await Promise.all([govTake(0), govTake(20)]);
    // Royalty and the profit split do not move with the uplift, so the whole
    // difference in government cash flow is RRT: relief x the RRT rate.
    const extraRelief = (take0 - take20) / RRT_RATE;
    expect(extraRelief).toBeGreaterThan(0);
    // The extra pool the uplift buys is 0.2 x capex, once.
    expect(extraRelief).toBeLessThanOrEqual(0.2 * TOTAL_CAPEX_MM * (1 + 1e-9));
    expect(extraRelief).toBeCloseTo(0.2 * TOTAL_CAPEX_MM, 6);
    // The rule this replaces deducted 0.2 x capex in each of the 25 years,
    // which would put this figure at 5,000 rather than 200.
    expect(extraRelief).toBeLessThan(0.2 * TOTAL_CAPEX_MM * 2);
  });

  it('negative control: with no resource rent tax the uplift changes nothing', async () => {
    const noRrt = (rrtUpliftPct) => ({ ...regime(rrtUpliftPct), tax: { cit: 30, rrt: 0, minTax: 0, rrtUpliftPct } });
    const results = await runFiscalComparison({
      projectInputs: PROJECT, regimes: [noRrt(0), noRrt(20)],
    });
    expect(results.summary[0].govTake).toBeCloseTo(results.summary[1].govTake, 9);
  });
});

describe('the help guide states both', () => {
  it('says the sweep is eight points and the uplift is a one-time pool', () => {
    expect(helpGuideSource).toMatch(/eight points, 0\.8 to 1\.5/);
    expect(helpGuideSource).toMatch(/one-time cost pool for the resource rent tax/);
    expect(helpGuideSource).toMatch(/at most 1\.2 times capex/);
  });

  it('keeps the owner copy rule: no em dashes in what it says', () => {
    expect(helpGuideSource).not.toMatch(/—/);
  });
});
