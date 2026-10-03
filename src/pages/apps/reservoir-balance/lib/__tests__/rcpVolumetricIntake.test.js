/**
 * Batch B: the volumetric estimate of a case taken from a saved ReservoirCalc
 * Pro project by id, with its source printed and an edit after the handoff
 * said (reviewer lens RL11). Rows are the shapes ReservoirCalc Pro has saved
 * since its first working save (its own fixtures, savedFixtures.js).
 */
import { SAVED_PROJECT_ROWS } from '@/pages/apps/ReservoirCalcPro/services/savedFixtures';
import { volumetricOptions, intakeVolumetric, volumetricBasis } from '../rcpVolumetricIntake';
import { STB_TO_M3 } from '@/lib/mbalCaseSource';
import { runSample, reportArgs, SAMPLE_CASE_IDS, AT } from './mbalTestKit';
import { buildMbalPdf } from '@/utils/mbalReportExport';
import { readPdf, flat, chartLogo } from '@/lib/reportKit/testKit';

const single = SAVED_PROJECT_ROWS[0].row;
const multi = SAVED_PROJECT_ROWS[1].row;

test('a single-reservoir project offers its deterministic STOIIP in STB', () => {
  const opts = volumetricOptions(single);
  expect(opts).toEqual([expect.objectContaining({ reservoir: 'Main sand', fluid: 'oil', unitSystem: 'field', stooip_stb: 226275000, method: 'deterministic, simple method (area x thickness)' })]);
});

test('a reservoir with no saved result is not offered; a metric result is converted with a known factor', () => {
  expect(volumetricOptions(multi)).toEqual([]);
  const metric = { ...single, results_data: { ...single.results_data, stooip: 1e6, unitSystem: 'metric', volumeUnit: 'sm3' } };
  expect(volumetricOptions(metric)[0].stooip_stb).toBeCloseTo(1e6 / STB_TO_M3, 3);
  expect(1e6 / STB_TO_M3).toBeCloseTo(6289810.770, 2);   // 1 m3 = 6.28981077 bbl
});

test('the take writes the value, a source sentence and a handoff; a gas case refuses an oil project', () => {
  const got = intakeVolumetric(single, volumetricOptions(single)[0], { isGas: false, now: '2026-10-03T08:00:00Z' });
  expect(got.patch).toEqual({ volumetric_ooip_stb: 226275000, volumetric_ogip_scf: null, volumetric_estimate_source: 'ReservoirCalc Pro project "Aug single reservoir", reservoir "Main sand", deterministic, simple method (area x thickness), project saved 2026-08-02' });
  expect(got.handoff).toMatchObject({ app: 'ReservoirCalc Pro', value: 226275000, record: 'Aug single reservoir (saved-0802-single), Main sand' });
  expect(intakeVolumetric(single, volumetricOptions(single)[0], { isGas: true }).error).toMatch(/no gas in place/);
});

describe('in the report', () => {
  const got = intakeVolumetric(single, volumetricOptions(single)[0], { isGas: false, now: '2026-10-03T08:00:00Z' });
  const state = runSample(SAMPLE_CASE_IDS.ahmed, { patchCase: got.patch });
  const study = { ...state.study, handoffs: { volumetric: got.handoff } };

  test('the cross-check row prints the project it came from, read back from the PDF', () => {
    const { doc } = buildMbalPdf(reportArgs({ ...state, study }), { logo: chartLogo(), generatedAt: AT });
    const text = flat(readPdf(doc).text);
    expect(text).toMatch(/Volumetric estimate 226\.27 MMSTB/);
    expect(text).toMatch(/Taken from ReservoirCalc Pro project "Aug single reservoir", reservoir "Main sand"/);
  });

  test('an edit after the handoff is said (negative control: the unedited value claims the project)', () => {
    expect(volumetricBasis(state.caseData, study)).toMatch(/^Taken from ReservoirCalc Pro/);
    const edited = { ...state.caseData, volumetric_ooip_stb: 250e6 };
    expect(volumetricBasis(edited, study)).toMatch(/^Edited in this app after the handoff\. The handoff said: Taken from ReservoirCalc Pro/);
    expect(volumetricBasis({ ...state.caseData, volumetric_estimate_source: null }, { handoffs: {} })).toBe('Entered on the case, source not stated');
  });
});

