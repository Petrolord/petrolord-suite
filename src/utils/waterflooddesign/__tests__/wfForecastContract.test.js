/**
 * WF-U2-001: the `wf-forecast-1` contract, read by id, into Forecast
 * Scenario Hub (a profile case) and Petroleum Economics Studio (a production
 * file). Gates call the shipped functions: the contract's calendar years sum
 * to the engine's Np; the hub case reproduces the forecast day for day; the
 * EPE rows are the contract's years; the cash-flow engine ignores the
 * provenance record; the source is re-read and a change is named.
 * Negative controls: the volume filter without the new key counts the
 * record as a row; a hub case run as Arps (no profile kind) is refused.
 */
import { computeCashFlow } from '../../../../supabase/functions/_shared/epe-engine.ts';
import {
  PIA_WORKED_EXAMPLE_CFG, PIA_WORKED_EXAMPLE_CAPEX, PIA_WORKED_EXAMPLE_OPEX,
} from '../../../../tools/validation/fixtures/epe-pia-worked-example.ts';
import { reviewerPayload, BUILDERS, AT } from '@/components/waterflooddesign/__tests__/wfTestKit';
import {
  buildWfForecastContract, annualFromSteps, compareWfWithSource, wfSourceLine, wfBasisLine, floodStartOf,
} from '../wfForecastContract';
import { getWfForecast, listWfForecasts } from '../wfForecastService';
import { caseFromWfContract, caseSourceText, editedAfterHandoff } from '@/utils/forecastScenarioIntake';
import { compareCases, runCase, dailyFromSteps } from '@/utils/forecastScenarioCalculations';
import { buildHubCaseContract } from '@/utils/forecastScenarioContract';
import { epeRowsFromWfContract, wfProvenanceOf, wfProvenanceText, WF_PROVENANCE_KEY, wfFileName } from '@/pages/apps/epe/epeWfIntake';
import { volumeRowsOf, dcaProvenanceOf } from '@/pages/apps/epe/epeDcaIntake';
import { hubProvenanceText, epeRowsFromHubContract } from '@/pages/apps/epe/epeHubIntake';
import { collectHubReportArgs } from '@/utils/forecastScenarioReport';

const payload = () => ({ ...reviewerPayload(), floodStart: '2027-03-15' });
const make = (p = payload()) => buildWfForecastContract({ projectId: 'wf1', projectName: 'Ekene P-1 waterflood', projectSavedAt: AT.toISOString(), payload: p, build: 'test' }, BUILDERS);

describe('the wf-forecast-1 contract', () => {
  it('is refused without a flood start, with the reason', () => {
    const r = make(reviewerPayload());
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/flood start date on the Pattern tab/);
    expect(floodStartOf({ floodStart: '2027-02-30' })).toBeNull();
    expect(floodStartOf({ floodStart: '2027-02-28' })).toBe('2027-02-28');
  });

  it('carries the forecast, its basis and sources; the calendar years sum to Np exactly', () => {
    const r = make();
    expect(r.ok).toBe(true);
    const k = r.contract;
    expect(k.schema).toBe('wf-forecast-1');
    expect(k.model.arealSweep.mobilityBasis).toBe('craig');
    expect(k.model.arealSweep.M).toBeCloseTo(k.model.arealSweep.M_craig, 12);
    expect(k.sources.kr.app).toMatch(/SCAL/);
    expect(k.sources.pvt.pressurePsia).toBe(2500);
    expect(k.basis.fvf).toMatch(/2500 psia/);
    const oil = k.forecast.annual.reduce((s, y) => s + y.oil, 0);
    expect(Math.abs(oil - k.forecast.Np) / k.forecast.Np).toBeLessThan(1e-12);
    const water = k.forecast.annual.reduce((s, y) => s + y.water, 0);
    expect(Math.abs(water - k.forecast.Wp) / k.forecast.Wp).toBeLessThan(1e-12);
    const days = k.forecast.annual.reduce((s, y) => s + y.days, 0);
    expect(days).toBeCloseTo(k.forecast.elapsedDays, 6);
    // the first calendar year is part-year: from 2027-03-15 to the year end
    expect(k.forecast.annual[0].year).toBe(2027);
    expect(k.forecast.annual[0].days).toBeCloseTo(292, 6);
    expect(wfSourceLine(k)).toBe('Five-spot P-1, five-spot forecast from 2027-03-15, project "Ekene P-1 waterflood" (Waterflood Design Studio)');
    expect(wfBasisLine(k)).toMatch(/Craig's basis/);
  });

  it('a hand-checked split: a step across a year end goes to both years by days', () => {
    const y = annualFromSteps([{ t_days: 10, qo: 100, qw: 10, iw: 200 }], '2026-12-27');
    expect(y.map((r) => [r.year, r.days, r.oil])).toEqual([[2026, 5, 500], [2027, 5, 500]]);
  });

  it('the fingerprint moves with the forecast and not with the build', () => {
    const a = make().contract;
    const b = buildWfForecastContract({ projectId: 'wf1', projectName: 'Ekene P-1 waterflood', payload: payload(), build: 'another' }, BUILDERS).contract;
    expect(b.fingerprint).toBe(a.fingerprint);
    const p = payload();
    p.patternInputs = { ...p.patternInputs, iw_bpd: '900' };
    const c = make(p);
    expect(c.contract.fingerprint).not.toBe(a.fingerprint);
    const cmp = compareWfWithSource(a, c);
    expect(cmp.state).toBe('changed');
    expect(cmp.text).toMatch(/the pattern inputs/);
    expect(compareWfWithSource(a, make()).state).toBe('unchanged');
    expect(compareWfWithSource(a, null).state).toBe('missing');
  });

  it('marks values edited after the kr-1 intake', () => {
    const p = payload();
    p.displacementInputs = { ...p.displacementInputs, nw: '3.3' };
    expect(make(p).contract.sources.kr.edited).toEqual(['nw']);
  });

  it('is read by id through the service', async () => {
    const row = { id: 'wf1', project_name: 'Ekene P-1 waterflood', inputs_data: payload(), updated_at: AT.toISOString() };
    const q = { select: () => q, eq: () => q, order: () => q, limit: async () => ({ data: [row], error: null }) };
    const supabase = { from: () => q };
    const got = await getWfForecast(supabase, { projectId: 'wf1' });
    expect(got.ok).toBe(true);
    expect(got.contract.fingerprint).toBe(make().contract.fingerprint);
    const list = await listWfForecasts(supabase);
    expect(list[0].ok).toBe(true);
  });
});

describe('Forecast Scenario Hub takes it as a profile case', () => {
  it('reproduces the forecast day for day; the EUR is the sender Np', () => {
    const k = make().contract;
    const made = caseFromWfContract(k, { id: 'wf-a', receivedAt: AT.toISOString() });
    expect(made.ok).toBe(true);
    const c = made.case;
    expect(c.kind).toBe('profile');
    expect(c.startDate).toBe('2027-03-15');
    const run = runCase(c);
    expect(run.error).toBeUndefined();
    expect(Math.abs(run.eur - k.forecast.Np) / k.forecast.Np).toBeLessThan(1e-12);
    expect(run.rates[0].date.slice(0, 10)).toBe('2027-03-15');
    // the cumulative at the end of each engine step equals the engine Np there (whole-day steps)
    const daily = dailyFromSteps(k.forecast.steps);
    expect(daily.length).toBe(Math.ceil(k.forecast.elapsedDays));
    const s12 = k.forecast.steps[11];
    const cumWhole = daily.slice(0, Math.floor(s12.t_days)).reduce((s, v) => s + v, 0);
    const frac = s12.t_days - Math.floor(s12.t_days);
    expect(cumWhole + frac * daily[Math.floor(s12.t_days)]).toBeCloseTo(s12.Np, 6);
    const sum = compareCases([c], null, '2027-01-01T00:00:00Z').summaries[0];
    expect(sum.model).toBe('Profile');
    expect(sum.eurMMbbl * 1e6).toBeCloseTo(k.forecast.Np, 3);
    expect(caseSourceText(c)).toMatch(/^From Five-spot P-1, five-spot forecast from 2027-03-15/);
    expect(editedAfterHandoff(c)).toEqual([]);
    expect(editedAfterHandoff({ ...c, years: c.years + 1 })).toEqual(['horizon']);
  });

  it('negative control: the same case without its profile kind is an Arps case and is refused', () => {
    const c = caseFromWfContract(make().contract).case;
    const { kind: _k, ...asArps } = c;
    expect(runCase(asArps).error).toMatch(/qi, decline and horizon must be positive/);
  });

  it('the hub report prints the profile case with its source', () => {
    const c = caseFromWfContract(make().contract, { id: 'wf-a', receivedAt: AT.toISOString() }).case;
    const m = collectHubReportArgs({ cases: [{ id: 'x', name: 'Entered', qi: 1000, declineAnnualPct: 18, b: 0.5, years: 20, economicLimit: 30 }, c], econ: { pricePerBbl: 70, opexPerBbl: 18, discountRatePct: 10 }, setStart: '2027-01-01', generatedAt: AT });
    expect(m.ok).toBe(true);
    expect(m.identification.find((r) => r[0] === 'Cases')[1]).toBe('2 (0 from Decline Curve Analysis, 1 from Waterflood Design Studio, 1 entered here)');
    expect(m.caseRows[1][1]).toBe('Profile from Waterflood Design Studio');
    expect(m.sourceRows[1][1]).toMatch(/^From Five-spot P-1, five-spot forecast from 2027-03-15/);
  });

  it('the hub sends the case on to EPE with the waterflood source inside', () => {
    const c = caseFromWfContract(make().contract, { id: 'wf-a', receivedAt: AT.toISOString() }).case;
    const set = { name: 'Flood set', startDate: '2027-01-01', econ: null, cases: [c] };
    const h = buildHubCaseContract({ projectId: 'h1', projectName: 'Flood set', payload: set, caseId: 'wf-a', build: 'b' });
    expect(h.ok).toBe(true);
    expect(h.contract.parameters.kind).toBe('profile');
    expect(h.contract.upstream.contract.schema).toBe('wf-forecast-1');
    const data = epeRowsFromHubContract(h.contract, 2027, { receivedAt: AT.toISOString() });
    const t = hubProvenanceText(data[data.length - 1].fsh_case_1);
    expect(t).toMatch(/the case came from Five-spot P-1, five-spot forecast from 2027-03-15/);
    expect(t).toMatch(/A production profile \(no Arps parameters\)/);
  });
});

describe('Petroleum Economics Studio takes it as a production file', () => {
  it('rows are the calendar years; the contract rides last; the engine never sees it', () => {
    const k = make().contract;
    const data = epeRowsFromWfContract(k, { receivedAt: AT.toISOString(), build: 'b' });
    const rows = volumeRowsOf(data);
    expect(rows.length).toBe(k.forecast.annual.length);
    expect(rows.map((r) => r.oil_bbl)).toEqual(k.forecast.annual.map((y) => Math.round(y.oil)));
    expect(rows[0]).toEqual({ year: 2027, oil_bbl: Math.round(k.forecast.annual[0].oil), water_bbl: Math.round(k.forecast.annual[0].water) });
    const p = wfProvenanceOf({ data });
    expect(p.fingerprint).toBe(k.fingerprint);
    expect(dcaProvenanceOf({ data })).toBeNull();
    expect(wfFileName(k)).toBe('Waterflood - Five-spot P-1.generated');
    expect(wfProvenanceText(p)).toMatch(/From Five-spot P-1, five-spot forecast from 2027-03-15.*Craig's basis/);
    const run = (prodRows) => computeCashFlow({ cfg: PIA_WORKED_EXAMPLE_CFG, prodRows, capexRows: PIA_WORKED_EXAMPLE_CAPEX, opexRows: PIA_WORKED_EXAMPLE_OPEX });
    const plain = run(rows);
    const tagged = run(data);
    expect(tagged.kpis.npv).toBeCloseTo(plain.kpis.npv, 6);
    // negative control: a volume filter that does not know the key counts the record as a row
    const old = data.filter((r) => !(r && typeof r === 'object' && (r.dca_forecast_1 || r.fsh_case_1)));
    expect(old.length).toBe(rows.length + 1);
    expect(old[old.length - 1][WF_PROVENANCE_KEY]).toBeTruthy();
  });
});
