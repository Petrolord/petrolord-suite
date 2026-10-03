/**
 * MBAL-U2-003: timesteps left out of the fit by the analyst, with a reason.
 *
 * The engine has always read excluded_timesteps; no screen set them and the
 * report printed no reason. These gates run the canonical engine through the
 * edge function's row mapping (the /dev harness stand-in) on the published
 * Ahmed Example 11-3 case, and read the report back from the PDF file.
 */
import { applyExclusion, cleanReasons, exclusionRows, excludedOf } from '../exclusions';
import { readStudy, withStudy, serializeStudy, emptyStudy } from '../studyMeta';
import { assessRunStaleness } from '../runStaleness';
import { runSample, reportArgs, SAMPLE_CASE_IDS, AT } from './mbalTestKit';
import { buildMbalPdf } from '@/utils/mbalReportExport';
import { readPdf, flat, chartLogo } from '@/lib/reportKit/testKit';

const STEPS = [0, 1, 2, 3, 4, 5];

describe('the rules of an exclusion', () => {
  test('a reason is required, and kept with the timestep', () => {
    expect(applyExclusion({ excluded: [], reasons: {}, steps: STEPS }, 2, { exclude: true, reason: '  ' }).error).toMatch(/Give the reason/);
    expect(applyExclusion({ excluded: [], reasons: {}, steps: STEPS }, 2, { exclude: true, reason: 'Survey not built up' }))
      .toEqual({ excluded: [2], reasons: { 2: 'Survey not built up' } });
  });

  test('the initial state, a timestep not in the table, and a fit of fewer than two points are refused', () => {
    expect(applyExclusion({ excluded: [], reasons: {}, steps: STEPS }, 0, { exclude: true, reason: 'x' }).error).toMatch(/initial state is never in the fit/);
    expect(applyExclusion({ excluded: [], reasons: {}, steps: STEPS }, 9, { exclude: true, reason: 'x' }).error).toMatch(/not in the data table/);
    expect(applyExclusion({ excluded: [1, 2, 3], reasons: {}, steps: STEPS }, 4, { exclude: true, reason: 'x' }).error).toMatch(/At least two timesteps/);
  });

  test('a restore removes the timestep and its reason', () => {
    const next = applyExclusion({ excluded: [2, 3], reasons: { 2: 'a', 3: 'b' }, steps: STEPS }, 2, { exclude: false });
    expect(next).toEqual({ excluded: [3], reasons: { 3: 'b' } });
    expect(cleanReasons({ 2: 'a', 3: 'b', 7: 'c' }, [3])).toEqual({ 3: 'b' });
    expect(excludedOf({ excluded_timesteps: [3, '2', 3, -1, 1.5] })).toEqual([2, 3]);
  });

  test('the reasons travel in the study record and survive a save', () => {
    const study = { ...emptyStudy(), exclusions: { 2: 'Survey not built up', x: 'dropped' } };
    const back = readStudy({ pvt_correlations: withStudy({}, study) });
    expect(back.exclusions).toEqual({ 2: 'Survey not built up' });
    // a study with no exclusion saves exactly as before (no new key)
    expect(serializeStudy(emptyStudy())).not.toHaveProperty('exclusions');
  });
});

describe('on the engine and the stale rule', () => {
  const base = runSample(SAMPLE_CASE_IDS.ahmed);
  const reasons = { 1: 'Survey within days of first production', 2: 'Survey not built up' };
  const withOut = runSample(SAMPLE_CASE_IDS.ahmed, {
    patchDefault: {
      excluded_timesteps: [1, 2],
      pvt_correlations: withStudy({ pb_rs_bo: 'standing', oil_viscosity: 'beggs_robinson', z_factor: 'hall_yarborough', gas_viscosity: 'lee_gonzalez_eakin', water: 'mccain' }, { ...emptyStudy(), exclusions: reasons }),
    },
  });

  test('the excluded points leave the regression of the real engine', () => {
    expect(withOut.result.n_data_points).toBe(base.result.n_data_points - 2);
    expect(withOut.result.estimated_ooip_stb).not.toBe(base.result.estimated_ooip_stb);
    expect(withOut.result.plot_data.point_in_fit.slice(0, 4)).toEqual([false, false, false, true]);
  });

  test('a change of the list makes the stored run stale; a change of a reason alone does not', () => {
    const fresh = assessRunStaleness({ ...withOut, defaultCfg: withOut.defaultCfg });
    expect(fresh.stale).toBe(false);
    const listChanged = { ...withOut.defaultCfg, excluded_timesteps: [1] };
    expect(assessRunStaleness({ ...withOut, defaultCfg: listChanged }).stale).toBe(true);
    const reasonChanged = { ...withOut.defaultCfg, pvt_correlations: withStudy(withOut.defaultCfg.pvt_correlations, { ...readStudy(withOut.defaultCfg), exclusions: { 1: 'Another reason', 2: 'Survey not built up' } }) };
    expect(assessRunStaleness({ ...withOut, defaultCfg: reasonChanged }).stale).toBe(false);
  });

  test('the report lists each excluded timestep with its date, pressure and reason, read back from the PDF', () => {
    const { doc, model } = buildMbalPdf(reportArgs(withOut), { logo: chartLogo(), generatedAt: AT });
    const text = flat(readPdf(doc).text);
    expect(model.exclusions.body.map((r) => r[0])).toEqual(['1', '2']);
    expect(text).toMatch(/Timesteps excluded by the analyst/);
    expect(text).toMatch(/1 2011-01-01 3,680\.0 Survey within days of first production/);
    expect(text).toMatch(/2 \d{4}-\d{2}-\d{2} 3,676\.0 Survey not built up/);
    expect(text).toMatch(/Timesteps excluded from the fit by the analyst 1, 2/);
    // negative control: a run with no exclusion prints no such table
    expect(buildMbalPdf(reportArgs(base), { logo: chartLogo(), generatedAt: AT }).model.exclusions).toBeNull();
  });

  test('an exclusion saved before reasons were kept is listed as such', () => {
    const rows = exclusionRows([3], withOut.result ? [{ timestep_index: 3, date: '2011-03-01', pressure: 3667 }] : [], {});
    expect(rows[0].reason).toMatch(/No reason recorded/);
  });
});
