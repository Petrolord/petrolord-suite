/**
 * Batch B: average pressures of the data table taken from a saved Voidage
 * Replacement Monitor project by id, provenance printed, edits marked.
 */
import { runSample, reportArgs, SAMPLE_CASE_IDS, AT } from './mbalTestKit';
import { buildMbalPdf } from '@/utils/mbalReportExport';
import { readPdf, flat, chartLogo } from '@/lib/reportKit/testKit';

import { vrrSurveys, matchSurveys, takeSurveys, pressureProvenance } from '../vrrPressureIntake';

describe('pressure rows from a saved VRR project, by id', () => {
  const vrr = {
    id: 'vrr-1', project_name: 'East pattern', updated_at: '2026-10-01T10:00:00Z',
    inputs_data: { inputs: { pressureSurveys: [{ date: '2015-01', p_psia: 3642 }, { date: '2020-01-01', p_psia: '3358' }, { date: '2030-01', p_psia: 2900 }, { date: 'bad', p_psia: 1 }, { date: '2016-01', p_psia: '' }] } },
  };
  const state = runSample(SAMPLE_CASE_IDS.ahmed);
  const rows = state.caseData.production_data;

  test('surveys are matched to the dated row of the same day, or of the same month; the rest are listed', () => {
    expect(vrrSurveys(vrr).map((s) => s.date)).toEqual(['2015-01', '2020-01-01', '2030-01']);
    const m = matchSurveys(rows, vrrSurveys(vrr));
    expect(m.matches.map((x) => [x.timestep_index, x.from, x.to])).toEqual([[5, 3640, 3642], [10, 3360, 3358]]);
    expect(m.unmatched.map((s) => s.date)).toEqual(['2030-01']);
  });

  test('taking them changes only those rows, records the project, and the report says which were edited after', () => {
    const got = takeSurveys(vrr, rows, { now: '2026-10-03T09:00:00Z' });
    expect(got.rows.filter((r, i) => r.pressure_psia !== rows[i].pressure_psia).map((r) => r.timestep_index)).toEqual([5, 10]);
    expect(got.handoff).toMatchObject({ app: 'Voidage Replacement Monitor', record: 'East pattern (vrr-1)', rows: { 5: 3642, 10: 3358 } });
    const study = { handoffs: { pressure_rows: got.handoff } };
    const asRun = got.rows.map((r) => ({ timestep_index: r.timestep_index, pressure: r.pressure_psia }));
    expect(pressureProvenance(study, asRun).text).toBe('Pressures of timesteps 5, 10: Taken from Voidage Replacement Monitor project "East pattern", pressure surveys of its Pressure tab (psia as typed there), record East pattern (vrr-1), taken 2026-10-03.');
    // negative control: an edit of one taken pressure afterwards is said
    const editedRows = asRun.map((r) => (r.timestep_index === 10 ? { ...r, pressure: 3350 } : r));
    expect(pressureProvenance(study, editedRows).edited).toEqual([10]);
    expect(pressureProvenance(study, editedRows).text).toMatch(/Edited in this app after the handoff: timestep 10\./);
  });

  test('the report prints the source of the taken pressures, read back from the PDF', () => {
    const got = takeSurveys(vrr, rows, { now: '2026-10-03T09:00:00Z' });
    const taken = runSample(SAMPLE_CASE_IDS.ahmed, { mutateStore: (db) => { db.rb_production_data = db.rb_production_data.map((r) => (r.case_id === SAMPLE_CASE_IDS.ahmed && got.handoff.rows[String(r.timestep_index)] ? { ...r, pressure_psia: got.handoff.rows[String(r.timestep_index)] } : r)); } });
    const { doc } = buildMbalPdf(reportArgs({ ...taken, study: { ...taken.study, handoffs: { pressure_rows: got.handoff } } }), { logo: chartLogo(), generatedAt: AT });
    expect(flat(readPdf(doc).text)).toMatch(/Pressures of timesteps 5, 10: Taken from Voidage Replacement Monitor project "East pattern"/);
  });

  test('a project with no dated survey, or none on a row of the case, is refused with the reason', () => {
    expect(takeSurveys({ ...vrr, inputs_data: { inputs: { pressureSurveys: [] } } }, rows).error).toMatch(/no dated pressure survey/);
    expect(takeSurveys({ ...vrr, inputs_data: { inputs: { pressureSurveys: [{ date: '2040-01', p_psia: 1000 }] } } }, rows).error).toMatch(/No survey of "East pattern" falls on a dated row/);
  });
});
