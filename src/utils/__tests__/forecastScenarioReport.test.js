/**
 * DCA U2-018: Forecast Scenario Hub's own report on the Report Kit, read back
 * from the PDF with the kit's test kit. A set of three cases: one entered
 * here, one received from Decline Curve Analysis (`dca-forecast-1`, a
 * hyperbolic well with a terminal decline), and the same received case edited
 * after the handoff. The report names each case's source, marks the edited
 * fields, prints the decline basis and the nominal it became, and draws the
 * cases from the hub's own engine (compareCases): the point counts of the
 * figures are held against the case runs. Negative controls: an inputs row
 * removed is named by the completeness guard; a set with no case is refused.
 */
import path from 'path';
import { readPdf, chartLogo, flat, listCaptions, pointCounts, expectFigureDrawn, checkGolden } from '@/lib/reportKit/testKit';
import { missingInputRows } from '@/lib/reportKit';
import { collectHubReportArgs, buildHubPdf, hubEngineInputsOf } from '@/utils/forecastScenarioReport';
import { compareCases } from '@/utils/forecastScenarioCalculations';
import { caseFromDcaContract } from '@/utils/forecastScenarioIntake';
import { fitWell, forecastWell, withStreamResults } from '@/utils/declineCurve/dcaAnalysis';
import { buildDcaForecastContract } from '@/utils/declineCurve/dcaForecastContract';
import { calculateArpsHyperbolic } from '@/utils/declineCurve/dcaEngine';

const AT = new Date('2026-10-03T12:00:00Z');
const GOLDEN_DIR = path.join(__dirname, '__fixtures__', 'reportGolden');
const UPDATE = process.env.UPDATE_REPORT_GOLDENS === '1';
const logo = chartLogo();
const DAY = 86400000;

const dcaContract = () => {
  const t0 = Date.UTC(2023, 0, 1);
  const data = Array.from({ length: 30 }, (_, i) => {
    const t = Date.UTC(2023, i, 1);
    const q = calculateArpsHyperbolic(600, 0.003, 1.2, (t - t0) / DAY);
    return { date: new Date(t).toISOString().slice(0, 10), oilRate: q, rate: q };
  });
  let w = {
    id: 'w7', name: 'Obodo-7', data, identification: { field: 'Obodo' },
    analysis: { fitWindow: { startDate: data[0].date, endDate: data[29].date }, streams: { oil: { modelType: 'Hyperbolic', constraints: { minB: 0, maxB: 2 }, forecastConfig: { economicLimit: 15, stopAtLimit: true, durationDays: 7305, terminalDecline: { value: 8, unit: '%/yr', basis: 'effective-tangent' } } } } },
  };
  const f = fitWell(w, 'oil', { now: AT });
  w = withStreamResults(w, 'oil', { fitResults: f.fit });
  w = withStreamResults(w, 'oil', { forecastResults: forecastWell(w, 'oil', { now: AT }) });
  const res = buildDcaForecastContract({ projectId: 'p7', projectName: 'Obodo DCA', payload: { payloadVersion: 2, wells: { w7: w } }, wellId: 'w7', stream: 'oil', build: 'test' });
  if (!res.ok) throw new Error(res.reason);
  return res.contract;
};

const SET = () => {
  const received = caseFromDcaContract(dcaContract(), { id: 'dca1', receivedAt: '2026-10-03T10:00:00Z' }).case;
  return [
    { id: 'c1', name: 'Infill (entered)', qi: 900, declineAnnualPct: 30, declineBasis: 'effective-secant', b: 0.6, years: 15, economicLimit: 20, startDate: '2026-01-01' },
    received,
    { ...received, id: 'dca2', name: 'Obodo-7 edited', qi: received.qi * 1.1 },
  ];
};
const ECON = { pricePerBbl: 70, opexPerBbl: 18, discountRatePct: 10 };
const model = (over = {}) => collectHubReportArgs({
  cases: SET(), econ: ECON, setStart: '2026-01-01', setName: 'Obodo cases', identification: { analyst: 'A. Analyst' },
  organizationName: 'Petrolord Sample Co', build: 'test (dca-u2)', generatedAt: AT,
  sourceStates: { dca1: { state: 'unchanged', text: 'Unchanged since it was received.' }, dca2: { state: 'changed', text: 'The source changed since it was received (the fit). Refresh to take the new forecast.' } },
  ...over,
});

describe('the hub report', () => {
  let built; let pdf; let text;
  beforeAll(() => {
    built = buildHubPdf(model(), { logo });
    pdf = readPdf(built.doc, { ink: true });
    text = flat(pdf.text);
  });
  afterAll(() => pdf && pdf.close());

  it('RL4: identification names the company, field, set, cases and the wells behind them', () => {
    const id = Object.fromEntries(model().identification);
    expect(id).toEqual(expect.objectContaining({
      Company: 'Petrolord Sample Co', Field: 'Obodo', 'Scenario set': 'Obodo cases',
      Cases: '3 (2 from Decline Curve Analysis, 1 entered here)', 'Wells behind the cases': 'Obodo-7', Analyst: 'A. Analyst',
    }));
    expect(text).toMatch(/Company Petrolord Sample Co Field Obodo Scenario set Obodo cases/);
  });

  it('RL1: every engine input has a row; the guard names a removed one', () => {
    const m = model();
    expect(m.missing).toEqual([]);
    expect(missingInputRows(hubEngineInputsOf({ cases: SET(), econ: ECON, setStart: '2026-01-01' }), m.inputs.filter((r) => r.key !== 'discount'))).toEqual(['econ.discountRatePct']);
  });

  it('RL7, RL11: decline basis and the nominal it became; sources; edited marks; source now', () => {
    const m = model();
    expect(m.caseRows[0][3]).toBe('30.00 effective, secant (with the case b); 39.77 nominal');
    // the terminal decline travelled from DCA as nominal and the switch is dated
    expect(m.caseRows[1][5]).toMatch(/^8\.34 nominal; switch \d{4}-\d\d-\d\d$/);
    expect(m.sourceRows[0][1]).toBe('Entered in Forecast Scenario Hub');
    expect(m.sourceRows[1][1]).toBe('From Obodo-7, oil, Hyperbolic fitted 2026-10-03, project "Obodo DCA" (Decline Curve Analysis), received 2026-10-03');
    expect(m.sourceRows[1][2]).toBe('As received');
    expect(m.sourceRows[2][2]).toBe('Edited here after the handoff: qi');
    expect(m.sourceRows[2][3]).toMatch(/The source changed since it was received \(the fit\)/);
    expect(text).toMatch(/Obodo-7 edited: received from Decline Curve Analysis and edited here after the handoff \(qi\); it no longer reproduces the source forecast/);
    expect(text).toMatch(/Where each case came from/);
  });

  it('RL6: three figures drawn from the hub engine runs', () => {
    expect(listCaptions(pdf).map((c) => c.title)).toEqual(['Rate against time, every case (log rate)', 'Cumulative production against time, every case', 'EUR by case']);
    const runs = compareCases(SET(), ECON, '2026-01-01T00:00:00Z').cases;
    const counts = pointCounts(built.figuresBuilt);
    const thinLen = (n) => Math.ceil(n / 30) + ((n - 1) % 30 !== 0 ? 1 : 0);
    expect(counts['hub-rate'][0]['Infill (entered)']).toBe(thinLen(runs[0].rates.length));
    for (const f of built.figuresBuilt.filter((x) => x.plotted)) expectFigureDrawn(pdf, f, { logo: true });
  });

  it('RL3, RL9: EUR and the horizon cumulative apart; limits and flags', () => {
    expect(text).toMatch(/Results by case Case EUR \(MMbbl\) To horizon \(MMbbl\)/);
    expect(text).toMatch(/The economics are indicative/);
    expect(text).toMatch(/The hub holds oil cases only/);
  });

  it('a golden of the hub report', () => {
    checkGolden(built, { dir: GOLDEN_DIR, name: 'hub-three-cases', update: UPDATE });
  });

  it('negative control: a set with no case is refused', () => {
    expect(collectHubReportArgs({ cases: [], econ: ECON }).ok).toBe(false);
  });
});
