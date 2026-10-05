/**
 * WS-U2-003: the drilling schedule. Wells come on stream so many a year (or
 * rigs times wells per rig a year); each year's wells carry their capex in
 * that year and produce the same per-well profile from its start. The NPV is
 * calculateEconomics on the scheduled arrays. Gates call the engine; the
 * superposition check holds the scheduled field volumes to the all-in-year-1
 * per-well volumes shifted by each year's start (negative control: a
 * one-year slip of the start fails it).
 */
import { runSpacingCases, spacingEconomicsInputs, drillingCohorts, validateInputs } from '@/utils/wellSpacingCalculations';
import { calculateEconomics } from '@/utils/npvCalculations';
import { buildWellSpacingReportModel } from '../reportModel';
import { defaultInputs, SAMPLE_FORM } from '../model';

const SAMPLE = { ...SAMPLE_FORM };

describe('WS-U2-003: the drilling schedule', () => {
  it('cohorts: so many a year, the last year the rest; rigs times wells per rig', () => {
    expect(drillingCohorts(125, { schedule: 'wellsPerYear', wellsPerYear: 30 })).toEqual([
      { startYear: 0, wells: 30 }, { startYear: 1, wells: 30 }, { startYear: 2, wells: 30 }, { startYear: 3, wells: 30 }, { startYear: 4, wells: 5 },
    ]);
    expect(drillingCohorts(50, { schedule: 'rigs', rigCount: 2, wellsPerRigYear: 12.5 }).map((c) => c.wells)).toEqual([25, 25]);
    expect(drillingCohorts(125, { schedule: 'year1' })).toEqual([{ startYear: 0, wells: 125 }]);
    expect(drillingCohorts(20, { schedule: 'wellsPerYear', wellsPerYear: 30 })).toEqual([{ startYear: 0, wells: 20 }]);
  });

  it('the default stays all wells in year 1: the Step 1 and 001 numbers', () => {
    const r = runSpacingCases(SAMPLE).spacingResults.find((x) => x.spacing === 40);
    expect(r.npv).toBeCloseTo(1885.787, 2);
    expect(r.drillingYears).toBe(1);
  });

  it('superposition: the scheduled field year is the year-1 per-well volumes shifted by each start', () => {
    const base = runSpacingCases(SAMPLE);
    const w1 = spacingEconomicsInputs(40, base.parameters).production.oil.map((v) => v / 125);
    const sched = runSpacingCases({ ...SAMPLE, drillingSchedule: 'wellsPerYear', wellsPerYear: '30' });
    const e = spacingEconomicsInputs(40, sched.parameters);
    const cohorts = [30, 30, 30, 30, 5];
    for (let i = 0; i < 20; i += 1) {
      const expected = cohorts.reduce((sum, n, k) => sum + (i - k >= 0 ? n * (w1[i - k] || 0) : 0), 0);
      expect(e.production.oil[i]).toBeCloseTo(expected, 4);
    }
    expect(e.capex.slice(0, 6)).toEqual([150, 150, 150, 150, 25, 0]);
    // opex while on stream: year 3 has 90 wells on stream all year
    expect(e.opexFixed[2]).toBeCloseTo((90 * 200000) / 1e6, 9);
    // the project still ends at the duration: nothing after year 20
    expect(e.production.oil.length).toBe(20);
  });

  it('the NPV is calculateEconomics on the scheduled arrays, and it is lower than all in year 1 here', () => {
    const sched = runSpacingCases({ ...SAMPLE, drillingSchedule: 'rigs', rigCount: '2', wellsPerRigYear: '15' });
    const r = sched.spacingResults.find((x) => x.spacing === 40);
    expect(r.drillingYears).toBe(5);
    expect(r.npv).toBe(calculateEconomics(spacingEconomicsInputs(40, sched.parameters), { skipIrr: true }).metrics.npv);
    expect(r.npv).toBeLessThan(1885.787);
    expect(r.npv).toBeCloseTo(1627.75, 1);
    expect(r.economics.totalCapex).toBeCloseTo(625, 9);
  });

  it('validation names a missing schedule input; wells after the duration are flagged in the report', () => {
    expect(validateInputs({ ...SAMPLE, drillingSchedule: 'wellsPerYear', wellsPerYear: '' }).errors).toContain('Wells brought on stream a year is required for this drilling schedule and must be greater than zero.');
    expect(validateInputs({ ...SAMPLE, drillingSchedule: 'rigs', rigCount: '1', wellsPerRigYear: '0.5' }).errors).toContain('The drilling schedule brings fewer than one well on stream a year.');
    const inputs = defaultInputs('oilfield', { sample: true });
    inputs.form = { ...inputs.form, drillingSchedule: 'wellsPerYear', wellsPerYear: '10' };
    const results = runSpacingCases(inputs.form);
    const r20 = results.spacingResults.find((x) => x.spacing === 20);
    expect(r20.wellsAfterDuration).toBe(50);
    const m = buildWellSpacingReportModel(inputs, { results });
    expect(m.limits.flags.join(' ')).toMatch(/after the project duration ends \(50/);
    expect(m.identification.find(([k]) => k === 'Model')[1]).toMatch(/10 wells a year on stream from the start of each year/);
    expect(m.cases.rows.find((x) => x[0] === '20').at(-1)).toBe('25');
    expect(m.inputs.rows.find((x) => x.key === 'wellsPerYear')).toMatchObject({ value: '10', unit: 'wells per year' });
  });
});
