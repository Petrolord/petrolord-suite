/**
 * DCA U2-004 in Forecast Scenario Hub: a case's decline typed as nominal,
 * effective secant (with the case's b) or effective tangent, converted to the
 * engine's nominal per day through the registry's declineRate family.
 * Pinned: SPEE REP #6 Table 1 (nominal 50 %/yr is 36 percent secant effective
 * at b 0.5) and CED P03-004 p. 21 (35 %/yr effective is 0.4308 per year
 * nominal). The forecast itself loses the typed share of its rate in the first
 * year (read off the hub's own run). Negative control: the same number typed
 * as nominal.
 */
import { runCase, caseDailyDecline, compareCases } from '@/utils/forecastScenarioCalculations';
import { buildHubCsv } from '@/utils/forecastScenarioExport';
import { editedAfterHandoff } from '@/utils/forecastScenarioIntake';

const YEAR = 365.25;
const base = { id: 'k', name: 'K', qi: 1000, b: 0.5, years: 5, economicLimit: 0, startDate: '2027-01-01' };

describe('a typed decline on its basis', () => {
  it('SPEE REP #6: 36 %/yr secant effective at b 0.5 is 50 %/yr nominal', () => {
    const d = caseDailyDecline({ ...base, declineAnnualPct: 36, declineBasis: 'effective-secant' });
    expect(d * YEAR * 100).toBeCloseTo(50, 9);
  });

  it('CED P03-004: 35 %/yr tangent effective is 0.4308 per year nominal', () => {
    const d = caseDailyDecline({ ...base, b: 1, declineAnnualPct: 35, declineBasis: 'effective-tangent' });
    expect(d * YEAR).toBeCloseTo(0.4308, 4);
  });

  it('a case with no basis is nominal, as every saved case was', () => {
    expect(caseDailyDecline({ ...base, declineAnnualPct: 18 })).toBeCloseTo(0.18 / YEAR, 15);
  });

  it('the hub forecast loses the typed secant share of its rate in the first year', () => {
    const run = runCase({ ...base, declineAnnualPct: 36, declineBasis: 'effective-secant' });
    // day index 365 is day 366 of the case: interpolate the rate at 365.25 days
    const q = (t) => 1000 / (1 + 0.5 * run.diPerDay * t) ** 2;
    expect(1 - q(YEAR) / 1000).toBeCloseTo(0.36, 9);
    expect(run.rates[364].rate).toBeCloseTo(q(365), 9);
    // negative control: 36 typed as nominal declines more slowly
    const nominal = runCase({ ...base, declineAnnualPct: 36 });
    expect(nominal.cumHorizon).toBeGreaterThan(run.cumHorizon * 1.05);
  });

  it('an effective decline of 100 percent or more is refused', () => {
    expect(runCase({ ...base, declineAnnualPct: 100, declineBasis: 'effective-tangent' }).error).toMatch(/below 100 percent/);
  });

  it('the summary and the CSV state the basis and the nominal it became', () => {
    const c = { ...base, declineAnnualPct: 36, declineBasis: 'effective-secant' };
    const { summaries } = compareCases([c], null, '2027-01-01T00:00:00Z');
    expect(summaries[0].declineBasis).toBe('effective-secant');
    expect(summaries[0].diNominalPctPerYear).toBeCloseTo(50, 9);
    const csv = buildHubCsv(summaries[0], c);
    expect(csv).toMatch(/# qi 1000 bbl\/d; decline 36 %\/yr effective \(secant, with this b\) at the case start, 50 %\/yr nominal/);
  });

  it('a case received before the basis existed is not marked edited', () => {
    const contract = { decline: { b: 0.5 }, atCutoff: { rate: 500, diNominalPctPerYear: 20 }, forecast: { horizonDays: 3653, economicLimit: 10, start: '2027-01-01' } };
    const old = { qi: 500, declineAnnualPct: 20, b: 0.5, years: 3653 / YEAR, economicLimit: 10, startDate: '2027-01-01', source: { contract } };
    expect(editedAfterHandoff(old)).toEqual([]);
    expect(editedAfterHandoff({ ...old, declineBasis: 'effective-secant' })).toEqual(['decline basis']);
  });
});
