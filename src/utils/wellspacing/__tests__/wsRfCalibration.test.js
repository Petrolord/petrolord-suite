/**
 * WS-U2-002: recovery that responds to spacing, from the user's cited points
 * only (owner default 2026-10-05: never a built-in uncited curve). Gates:
 * the least-squares fit of RF on ln S against a hand computation; the engine
 * gives each case the fit at its spacing and the EUR follows it exactly;
 * the NPV is calculateEconomics on that case. Negative control: a point
 * without a source is refused, so no curve is fitted to it.
 */
import { calculateEconomics } from '@/utils/npvCalculations';
import { runSpacingCases, spacingEconomicsInputs, validateInputs, rfOf } from '@/utils/wellSpacingCalculations';
import { fitRfAgainstSpacing, rfPointsText, rfAtSpacing } from '../rfCalibration';
import { runSpacingMonteCarlo } from '../monteCarlo';
import { buildWellSpacingReportModel } from '../reportModel';
import { defaultInputs, SAMPLE_FORM } from '../model';

const POINTS = [
  { spacing: '20', rf: '40', kind: 'simulation', source: 'Ekene sector model, run 12 (20 acres)' },
  { spacing: '40', rf: '37', kind: 'analog', source: 'E-1000 sand, same field, 40-acre development' },
  { spacing: '80', rf: '31', kind: 'dca', source: 'Decline type well EK-2 at 80 acres, project "Ekene decline"' },
];
const CAL = { ...SAMPLE_FORM, recoveryModel: 'calibrated', rfPoints: rfPointsText(POINTS) };

describe('WS-U2-002: recovery against spacing, calibrated', () => {
  it('fits RF = a + b ln S by least squares (hand computation), and two points give the line through them', () => {
    const fit = fitRfAgainstSpacing(POINTS);
    const X = [20, 40, 80].map(Math.log);
    const Y = [40, 37, 31];
    const mx = X.reduce((a, b) => a + b) / 3;
    const my = Y.reduce((a, b) => a + b) / 3;
    const b = X.reduce((s, x, i) => s + (x - mx) * (Y[i] - my), 0) / X.reduce((s, x) => s + (x - mx) ** 2, 0);
    expect(fit.b).toBeCloseTo(b, 12);
    expect(fit.a).toBeCloseTo(my - b * mx, 12);
    expect(fit.b).toBeCloseTo(-6.49213, 4);
    const two = fitRfAgainstSpacing(POINTS.slice(0, 2));
    expect(rfAtSpacing(two, 20)).toBeCloseTo(40, 12);
    expect(rfAtSpacing(two, 40)).toBeCloseTo(37, 12);
    expect(two.r2).toBeNull();
  });

  it('NEGATIVE CONTROL: a point without its source is refused; one spacing is not a relation', () => {
    expect(fitRfAgainstSpacing([...POINTS.slice(0, 2), { spacing: '80', rf: '31', source: '' }]).errors[0]).toMatch(/Point 3: give its source/);
    expect(fitRfAgainstSpacing([POINTS[0], { ...POINTS[1], spacing: '20' }]).errors[0]).toMatch(/at least two points at different spacings/);
    expect(validateInputs({ ...CAL, rfPoints: rfPointsText([POINTS[0]]) }).ok).toBe(false);
  });

  it('each case takes the fit at its spacing; the EUR follows it; the NPV is the engine on the case', () => {
    const stated = runSpacingCases(SAMPLE_FORM);
    const cal = runSpacingCases(CAL);
    const fit = fitRfAgainstSpacing(POINTS);
    for (const r of cal.spacingResults) {
      expect(rfOf(r.spacing, cal.parameters) * 100).toBeCloseTo(rfAtSpacing(fit, r.spacing), 12);
      const s = stated.spacingResults.find((x) => x.spacing === r.spacing);
      expect(r.eurPerWell / s.eurPerWell).toBeCloseTo(rfAtSpacing(fit, r.spacing) / 35, 10);
      expect(r.npv).toBe(calculateEconomics(spacingEconomicsInputs(r.spacing, cal.parameters), { skipIrr: true }).metrics.npv);
    }
    // tighter spacing now recovers more: the field recovery falls with spacing
    const fr = cal.spacingResults.map((r) => r.totalFieldRecovery);
    expect(fr[0]).toBeGreaterThan(fr[fr.length - 1]);
  });

  it('the report prints the points with their sources, the fit, each case, and flags extrapolation', () => {
    const inputs = defaultInputs('oilfield', { sample: true });
    inputs.form = { ...inputs.form, recoveryModel: 'calibrated', rfPoints: rfPointsText(POINTS), mcRfLow: '', mcRfHigh: '' };
    const m = buildWellSpacingReportModel(inputs, { results: runSpacingCases(inputs.form) });
    expect(m.calibration.pointsRows).toEqual([
      ['20', '40', 'Simulation run', 'Ekene sector model, run 12 (20 acres)'],
      ['40', '37', 'Analog field', 'E-1000 sand, same field, 40-acre development'],
      ['80', '31', 'Decline type well (DCA)', 'Decline type well EK-2 at 80 acres, project "Ekene decline"'],
    ]);
    expect(m.calibration.note).toMatch(/^RF = 59\.\d+ - 6\.4921 ln\(S\)/);
    expect(m.calibration.casesRows.find((r) => r[0] === '160')[2]).toBe('no, extrapolated');
    expect(m.limits.flags.join(' ')).toMatch(/extrapolated beyond the calibration points \(20 to 80 acres\/well\)/);
    expect(m.identification.find(([k]) => k === 'Model')[1]).toMatch(/calibration against spacing/);
    expect(m.inputs.rows.find((r) => r.key === 'rfPoints').value).toMatch(/^3 points; RF = /);
  });

  it('the Monte Carlo refuses an RF range the calibrated model does not use', () => {
    expect(runSpacingMonteCarlo({ ...CAL, mcIterations: '50' }).errors[0]).toMatch(/stated RF is not used/);
  });
});
