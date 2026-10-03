/**
 * DCA-U1-010: one year length across the decline apps.
 *
 * The registry's year is 365.25 days (the Julian year of the SPE metric
 * standard). Decline Curve Analysis, Forecast Scenario Hub and Well Spacing
 * used 365. They now use the registry's constant, and the decline rate a
 * user reads in one app is the number another app takes. Known values are
 * pinned: a round trip cannot see a wrong factor.
 */
import fs from 'fs';
import path from 'path';
import { convert, DAYS_PER_YEAR } from '@/lib/units/registry';
import { nominalAnnualPct, effectiveFirstYearPct, DAYS_PER_YEAR as DCA_YEAR } from '@/utils/declineCurve/declineDisplay';
import { dailyDecline, DAYS_PER_YEAR as HUB_YEAR } from '@/utils/forecastScenarioCalculations';
import { createDcaUnits, DCA_DAYS_PER_YEAR } from '@/utils/declineCurve/dcaUnits';

describe('DCA-U1-010: a year is 365.25 days in every decline app', () => {
  it('the registry, DCA, the hub and the unit view share the constant', () => {
    expect(DAYS_PER_YEAR).toBe(365.25);
    expect(DCA_YEAR).toBe(365.25);
    expect(HUB_YEAR).toBe(365.25);
    expect(DCA_DAYS_PER_YEAR).toBe(365.25);
  });

  it('Well Spacing reads the registry year, not its own 365', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../wellSpacingCalculations.js'), 'utf8');
    expect(src).toMatch(/const DAYS_PER_YEAR = REGISTRY_YEAR;/);
    expect(src).not.toMatch(/DAYS_PER_YEAR = 365;/);
  });

  it('known values: Ekene-1 Di 0.0012 per day', () => {
    // 0.0012 x 365.25 = 0.4383 per year nominal
    expect(nominalAnnualPct(0.0012)).toBeCloseTo(43.83, 10);
    expect(convert('declineRate', 0.0012, '1/d', '%/yr')).toBeCloseTo(43.83, 10);
    // effective over one year, exponential: 1 - exp(-0.4383) = 35.48678 percent
    expect(effectiveFirstYearPct(0.0012, 0)).toBeCloseTo(35.48678, 4);
    // per month: 0.0012 x 30.4375
    expect(createDcaUnits({ decline: '1/month' }).declineTo(0.0012)).toBeCloseTo(0.036525, 10);
    // negative control: the 365-day year prints 43.80
    expect(0.0012 * 365 * 100).not.toBeCloseTo(nominalAnnualPct(0.0012), 3);
  });

  it('the hub turns 18 %/yr nominal into the per-day rate DCA prints back as 18 %/yr', () => {
    const perDay = dailyDecline(18);
    expect(perDay).toBeCloseTo(0.18 / 365.25, 15);
    expect(nominalAnnualPct(perDay)).toBeCloseTo(18, 12);
  });
});
