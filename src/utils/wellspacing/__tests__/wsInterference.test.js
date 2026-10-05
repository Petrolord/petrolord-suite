/**
 * WS-U2-006: measurable interference. The drop at the neighbouring well
 * after the stated time, from the validated line source of Step 1 (Ahmed and
 * McKinney 2005 Eq. 1.2.134; E1 held on Abramowitz and Stegun Table 5.1).
 * The gate calls the engine (runSpacingCases) at a time chosen so the Ei
 * argument is exactly 1, where E1(1) = 0.219384 is tabulated. Negative
 * control: the time read in days in place of hours moves the argument 24
 * times and the drop away from the tabulated value.
 */
import { runSpacingCases } from '@/utils/wellSpacingCalculations';
import { buildWellSpacingReportModel } from '../reportModel';
import { defaultInputs, SAMPLE_FORM } from '../model';
import { wsUnits } from '../units';

const SAMPLE = { ...SAMPLE_FORM };
const E1_AT_1 = 0.219384; // Abramowitz and Stegun, Table 5.1

describe('WS-U2-006: the drop at the neighbour', () => {
  it('at x = 1 the drop is 70.6 q mu B / (k h) E1(1), with r the distance between wells', () => {
    const base = runSpacingCases(SAMPLE);
    const r40 = base.spacingResults.find((r) => r.spacing === 40);
    const p = base.parameters;
    const rFt = 1320;
    const tHours = (948 * p.porosity * 1.2 * 0.000015 * rFt * rFt) / 5;
    const res = runSpacingCases({ ...SAMPLE, interferenceDays: String(tHours / 24) });
    const I = res.spacingResults.find((r) => r.spacing === 40).interference;
    expect(I.rFt).toBeCloseTo(1320, 9);
    expect(I.qStbd).toBeCloseTo(r40.initialRateBpd, 9); // 40 acres is not rate-limited on the example
    expect(I.x).toBeCloseTo(1, 12);
    const expected = ((70.6 * I.qStbd * 1.2 * p.bo) / (5 * 60)) * E1_AT_1;
    expect(I.dropPsi / expected).toBeCloseTo(1, 5);
  });

  it('NEGATIVE CONTROL: the same time read in days moves x 24 times and the drop off the table value', () => {
    const p = runSpacingCases(SAMPLE).parameters;
    const tHours = (948 * p.porosity * 1.2 * 0.000015 * 1320 * 1320) / 5;
    const wrong = runSpacingCases({ ...SAMPLE, interferenceDays: String(tHours / 24 / 24) }).spacingResults.find((r) => r.spacing === 40).interference;
    expect(wrong.x).toBeCloseTo(24, 9);
    const q = wrong.qStbd;
    const atOne = ((70.6 * q * 1.2 * p.bo) / (5 * 60)) * E1_AT_1;
    expect(Math.abs(wrong.dropPsi / atOne - 1)).toBeGreaterThan(0.99);
  });

  it('a rate-limited case uses the rate produced; the gauge decides measurable; the report prints it', () => {
    const inputs = defaultInputs('oilfield', { sample: true });
    const results = runSpacingCases(inputs.form);
    const r100 = results.spacingResults.find((r) => r.spacing === 100);
    expect(r100.interference.qStbd).toBeCloseTo(r100.drainage.pssRateStbd, 9);
    const all = results.spacingResults.map((r) => r.interference);
    expect(all.every((I) => I.computed)).toBe(true);
    // the drop falls as the wells move apart
    for (let i = 1; i < all.length; i += 1) expect(all[i].dropPsi).toBeLessThan(all[i - 1].dropPsi);
    const m = buildWellSpacingReportModel(inputs, { results });
    expect(m.interference.rows.length).toBe(15);
    const quiet = results.spacingResults.filter((r) => r.interference.measurable === false).map((r) => r.spacing);
    if (quiet.length) expect(m.limits.flags.join(' ')).toMatch(/below the gauge resolution/);
    expect(m.inputs.rows.find((x) => x.key === 'gaugeResolutionPsi')).toMatchObject({ value: '0.01', unit: 'psi' });
  });

  it('blank time: not computed, and the reason is printed', () => {
    const inputs = defaultInputs('oilfield', { sample: true });
    inputs.form.interferenceDays = '';
    const results = runSpacingCases(inputs.form);
    expect(results.spacingResults[0].interference.computed).toBe(false);
    const m = buildWellSpacingReportModel(inputs, { results });
    expect(m.interference.rows).toEqual([]);
    expect(m.interference.note).toMatch(/Not computed: interference test time not given/);
  });

  it('units: a pressure difference is psi or kPa, never psia (1 psi = 6.894757 kPa)', () => {
    expect(wsUnits('oilfield').label('pressureDiff')).toBe('psi');
    expect(wsUnits('si').show('pressureDiff', 1)).toBeCloseTo(6.894757, 5);
  });
});
