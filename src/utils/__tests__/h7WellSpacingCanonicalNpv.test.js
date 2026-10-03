/**
 * H7 (Reservoir honesty sweep): Well Spacing Optimizer carried its own NPV
 * loop (year-end discounting, well cost undiscounted at time zero), against
 * the rule that the Suite has one screening NPV, `calculateEconomics`. The
 * NPV column now comes from that engine, which discounts at mid-year, and
 * the numbers move. This file holds the row to the canonical engine and to a
 * closed form, and records the move on the app's own sample.
 */
import fs from 'fs';
import path from 'path';
import * as npvModule from '@/utils/npvCalculations';

jest.mock('@/utils/npvCalculations', () => {
  const actual = jest.requireActual('@/utils/npvCalculations');
  return { ...actual, calculateEconomics: jest.fn(actual.calculateEconomics) };
});
import {
  evaluateSpacingCases, spacingEconomicsInputs, generateJSON, generateCSV, NPV_CONVENTION_NOTE,
} from '../wellSpacingCalculations';

// The "Load example field" case of the app.
const SAMPLE = {
  fieldName: 'Example field', reservoirArea: '5000', avgNetPayThickness: '60', porosity: '15.2',
  initialWaterSaturation: '0.25', reservoirTemperature: '180', reservoirPressure: '3500', recoveryFactor: '35',
  oilGravity: '35', gasGravity: '0.75', initialSolutionGOR: '500',
  wellCost: '5000000', operatingExpense: '200000', minEconomicFlowRate: '10', typicalWellDeclineRate: '15',
  oilPrice: '75', gasPrice: '3.5', discountRate: '10', projectDuration: '20', royaltiesTaxes: '25',
  minSpacing: '20', maxSpacing: '160', spacingIncrement: '10',
};

// What the private loop printed on the sample before this change ($MM).
const BEFORE = { 20: 1006.339, 40: 1741.143, 80: 2094.967, 160: 2278.844 };
// What the canonical engine gives ($MM), recorded for the PR.
// DCA-U1-010 (2026-10-03): the year became 365.25 days in every decline
// app, which moves the economic rate a year by a quarter day: 20 ac 1,174.640
// -> 1,174.775, 40 ac 1,885.718 -> 1,885.787, 80 ac 2,226.778 -> 2,226.812,
// 160 ac 2,404.851 -> 2,404.868 $MM (at most 0.012 percent).
const AFTER = { 20: 1174.775, 40: 1885.787, 80: 2226.812, 160: 2404.868 };

describe('H7: the NPV column is the canonical screening NPV', () => {
  it('every row equals calculateEconomics on the inputs the engine built for it', async () => {
    npvModule.calculateEconomics.mockClear();
    const results = await evaluateSpacingCases(SAMPLE);
    expect(npvModule.calculateEconomics).toHaveBeenCalledTimes(results.spacingResults.length);
    for (const row of results.spacingResults) {
      const inputs = spacingEconomicsInputs(row.spacing, results.parameters);
      const { metrics } = npvModule.calculateEconomics(inputs, { skipIrr: true });
      expect(row.npv).toBe(metrics.npv);
      // components the row carries come from the same run
      expect(row.economics.totalCapex).toBe(metrics.totalCapex);
      expect(row.totalCapex).toBeCloseTo(metrics.totalCapex, 9);
    }
  });

  it('agrees with a closed form at mid-year discounting, and not with year-end', async () => {
    const results = await evaluateSpacingCases(SAMPLE);
    const row = results.spacingResults.find((r) => r.spacing === 40);
    // 125 wells; exponential decline anchored on the EUR; life capped at 20 years
    const bo = results.boUsed;
    const eur = (40 * 60 * 0.152 * 0.75 * 7758 * 0.35) / bo;
    const Dn = -Math.log(1 - 0.15);
    // mid-year at the 365.25-day year the app uses (DCA-U1-010); year-end at
    // the 365-day year the old private loop used, for the negative control
    const closedForm = (daysPerYear) => {
      const qLim = 10 * daysPerYear;
      const qi = eur * Dn + qLim;
      const life = Math.min(Math.log(qi / qLim) / Dn, 20);
      let mid = 0;
      let yearEnd = 0;
      for (let y = 0; y < Math.ceil(life); y += 1) {
        const to = Math.min(y + 1, life);
        const oil = (qi / Dn) * (Math.exp(-Dn * y) - Math.exp(-Dn * to));
        const cash = (oil * 75 + ((oil * 500) / 1000) * 3.5) * (1 - 0.25) - 200000 * (to - y);
        mid += cash / 1.1 ** (y + 0.5);
        yearEnd += cash / 1.1 ** (y + 1);
      }
      return { midNpv: (125 * (mid - 5e6 / 1.1 ** 0.5)) / 1e6, yearEndNpv: (125 * (yearEnd - 5e6)) / 1e6 };
    };
    const { midNpv } = closedForm(365.25);
    const { yearEndNpv } = closedForm(365);
    expect(row.npv).toBeCloseTo(midNpv, 6);
    // negative control: the old private loop's convention gives the old number
    expect(yearEndNpv).toBeCloseTo(BEFORE[40], 2);
    expect(Math.abs(row.npv - yearEndNpv)).toBeGreaterThan(100);
  });

  it('before and after on the sample', async () => {
    const results = await evaluateSpacingCases(SAMPLE);
    for (const spacing of [20, 40, 80, 160]) {
      const row = results.spacingResults.find((r) => r.spacing === spacing);
      expect(row.npv).toBeCloseTo(AFTER[spacing], 2);
      expect(row.npv).not.toBeCloseTo(BEFORE[spacing], 0);
    }
    // the order of the cases does not change: NPV still rises with spacing on this sample
    const order = (key) => [...results.spacingResults].sort((a, b) => b[key] - a[key])[0].spacing;
    expect(order('npv')).toBe(160);
    // volumes, capex, cost per barrel and life do not move
    const r40 = results.spacingResults.find((r) => r.spacing === 40);
    expect(r40.costPerBarrel).toBeCloseTo(15.583, 3);
    expect(r40.totalCapex).toBeCloseTo(625, 9);
  });

  it('the convention is stated wherever the NPV goes', async () => {
    const results = await evaluateSpacingCases(SAMPLE);
    expect(NPV_CONVENTION_NOTE).toMatch(/mid-year/);
    expect(results.npvConvention).toEqual({ engine: 'calculateEconomics', discounting: 'mid-year', note: NPV_CONVENTION_NOTE });
    expect(generateJSON(SAMPLE, results).metadata.npv.discounting).toBe('mid-year');
    expect(generateCSV(results).split('\n')[0]).toMatch(/NPV \(\$MM; mid-year discounting\)/);
  });

  it('the engine file has no discounting loop of its own', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../wellSpacingCalculations.js'), 'utf8');
    expect(src).not.toMatch(/Math\.pow\(\s*1\s*\+\s*p?\.?discountRate/);
    expect(src).not.toMatch(/\*\*\s*-?\s*year/);
    expect(src).toMatch(/calculateEconomics/);
  });
});
