/**
 * WTA-U2-005: the average pressure of a saved Well Test Analysis Studio
 * project as a pressure point of a Material Balance case, read by id
 * through wta-1. The Well Test record comes from the real Well Test
 * provider; the Material Balance side is the Ahmed sample case run by the
 * engine stand-in, and its PDF is read back.
 */
import '@testing-library/jest-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import { runSample, reportArgs, SAMPLE_CASE_IDS, AT } from './mbalTestKit';
import { buildMbalPdf } from '@/utils/mbalReportExport';
import { readPdf, flat, chartLogo } from '@/lib/reportKit/testKit';
import { mountStudio } from '@/components/welltest/__tests__/reportTestKit';
import { wellTestPressurePoint, planWellTestPoint, takeWellTestPoint, wellTestPointProvenance } from '../wellTestPressureIntake';
import { readStudy, withStudy, emptyStudy } from '../studyMeta';

const state = runSample(SAMPLE_CASE_IDS.ahmed);
const rows = state.caseData.production_data;
const target = rows.find((r) => r.timestep_index === 10);
const day = String(target.observation_date).slice(0, 10);

async function savedWellTest(setup = null) {
  const studio = mountStudio();
  await studio.act((c) => c.loadSampleTest());
  await studio.act((c) => c.setIdentificationField('testDateStart', day));
  await studio.act((c) => c.setIdentificationField('testDateEnd', day));
  if (setup) await studio.act(setup);
  const payload = studio.ctx.serializeInputs();
  studio.unmount();
  return { id: 'wt-1', project_name: 'Buildup W-1', updated_at: '2026-10-04T10:00:00Z', inputs_data: payload };
}

describe('WTA-U2-005: a Well Test pressure point in Material Balance', () => {
  test('the saved wta-1 record offers p* with its date; it lands on the row of that day and nothing else moves', async () => {
    const row = await savedWellTest();
    const pt = wellTestPressurePoint(row);
    expect(pt.ok).toBe(true);
    expect(pt.label).toBe('p*');
    expect(pt.date).toBe(day);
    expect(pt.p_psia).toBe(row.inputs_data.wta.pressure.p_star_psia);
    const got = takeWellTestPoint(row, rows, { now: '2026-10-04T12:00:00Z' });
    expect(got.match.timestep_index).toBe(10);
    const changed = got.rows.filter((r, i) => r.pressure_psia !== rows[i].pressure_psia).map((r) => r.timestep_index);
    expect(changed).toEqual([10]);
    expect(got.rows.find((r) => r.timestep_index === 10).pressure_psia).toBe(pt.p_psia);
    // the record survives the study's save and read
    const study = readStudy({ pvt_correlations: withStudy({}, { ...emptyStudy(), handoffs: { [got.key]: got.handoff } }) });
    const asRun = got.rows.map((r) => ({ timestep_index: r.timestep_index, pressure: r.pressure_psia }));
    const prov = wellTestPointProvenance(study, asRun);
    expect(prov.text).toMatch(new RegExp(`Timestep 10 \\(${day}\\): p\\* from Well Test Analysis Studio project "Buildup W-1", well Sample well 1, test of ${day}, absolute, at the gauge depth`));
    expect(prov.text).toMatch(/Extrapolated p\* of the Horner straight line/);
    expect(prov.edited).toEqual([]);
    // negative control: an edit afterwards is said
    const edited = wellTestPointProvenance(study, asRun.map((r) => (r.timestep_index === 10 ? { ...r, pressure: r.pressure + 5 } : r)));
    expect(edited.edited).toEqual([10]);
    expect(edited.text).toMatch(/Edited in this app after the handoff/);
  }, 600000);

  test("the Material Balance report cites the point; the case's numbers do not move until it is taken", async () => {
    const row = await savedWellTest();
    const before = flat(readPdf(buildMbalPdf(reportArgs(state), { logo: chartLogo(), generatedAt: AT }).doc).text);
    expect(before).not.toMatch(/Pressure points from Well Test Analysis Studio/);
    const got = takeWellTestPoint(row, rows, { now: '2026-10-04T12:00:00Z' });
    const taken = runSample(SAMPLE_CASE_IDS.ahmed, { mutateStore: (db) => { db.rb_production_data = db.rb_production_data.map((r) => (r.case_id === SAMPLE_CASE_IDS.ahmed && r.timestep_index === 10 ? { ...r, pressure_psia: got.handoff.value } : r)); } });
    const t = flat(readPdf(buildMbalPdf(reportArgs({ ...taken, study: { ...taken.study, handoffs: { [got.key]: got.handoff } } }), { logo: chartLogo(), generatedAt: AT }).doc).text);
    expect(t).toMatch(/Pressure points from Well Test Analysis Studio: Timestep 10/);
    expect(t).toMatch(/p\* from Well Test Analysis Studio project "Buildup W-1"/);
  }, 600000);

  test('with a stated gradient the point is the datum pressure and says so', async () => {
    const row = await savedWellTest((c) => {
      c.setCompletionField('gaugeDepthTvd', '9800'); c.setCompletionField('depthRefElev', '100');
      c.setCompletionField('datumDepthTvdss', '9900'); c.setCompletionField('datumGradient', '0.35');
    });
    const pt = wellTestPressurePoint(row);
    expect(pt.p_psia).toBeCloseTo(row.inputs_data.wta.pressure.p_star_psia + 70, 9);
    expect(pt.basis).toMatch(/at the datum 9900 ft TVDSS/);
  }, 600000);

  test('refused with the reason: no test date, no row on that day, a project saved before wta-1', async () => {
    const noDate = await savedWellTest((c) => { c.setIdentificationField('testDateStart', ''); c.setIdentificationField('testDateEnd', ''); });
    expect(planWellTestPoint(noDate, rows).error).toMatch(/has no test date/);
    const elsewhere = await savedWellTest((c) => { c.setIdentificationField('testDateEnd', '1999-01-01'); });
    expect(planWellTestPoint(elsewhere, rows).error).toMatch(/No dated row of this case falls on the test date 1999-01-01/);
    const old = { id: 'wt-0', project_name: 'Old', inputs_data: { gaugeRows: [] } };
    expect(planWellTestPoint(old, rows).error).toMatch(/saved before it carried its results/);
  }, 600000);
});
