/**
 * WS-U2-004: the `ws-case-1` contract, read by id, into Forecast Scenario
 * Hub (a profile case) and Petroleum Economics Studio (a production file).
 * Gates call the shipped functions: the contract's steps and calendar years
 * sum to the engine's own field volume, which is the volume the case's
 * canonical economics ran on; the hub case reproduces the profile; the EPE
 * rows are the contract's years; the cash-flow engine ignores the provenance
 * record; the source is re-read and a change is named.
 * Negative controls: the volume filter without the new key counts the
 * record as a row; the hub case run as Arps (no profile kind) is refused.
 */
import { computeCashFlow } from '../../../../supabase/functions/_shared/epe-engine.ts';
import {
  PIA_WORKED_EXAMPLE_CFG, PIA_WORKED_EXAMPLE_CAPEX, PIA_WORKED_EXAMPLE_OPEX,
} from '../../../../tools/validation/fixtures/epe-pia-worked-example.ts';
import { runSpacingCases, spacingEconomicsInputs } from '@/utils/wellSpacingCalculations';
import { defaultInputs, projectPayload, inputsFromPayload } from '../model';
import { buildWsCaseContract, compareWsWithSource, wsSourceLine, wsBasisLine, firstProductionOf } from '../wsCaseContract';
import { getWsCase, listWsCases, WS_NOT_SWITCHED_ON } from '../wsCaseService';
import { caseFromWsContract, caseSourceText, editedAfterHandoff } from '@/utils/forecastScenarioIntake';
import { compareCases, runCase } from '@/utils/forecastScenarioCalculations';
import { collectHubReportArgs } from '@/utils/forecastScenarioReport';
import { epeRowsFromWsContract, wsProvenanceOf, wsProvenanceText, WS_PROVENANCE_KEY, wsFileName } from '@/pages/apps/epe/epeWsIntake';
import { volumeRowsOf, dcaProvenanceOf } from '@/pages/apps/epe/epeDcaIntake';

const AT = new Date('2026-10-05T12:00:00Z');
const inputsOf = (sender = { spacing: '80', start: '2027-03-15' }) => {
  const i = defaultInputs('oilfield', { sample: true });
  i.identification = { field: 'Ekene', reservoir: 'E-2000' };
  i.sender = sender;
  return i;
};
const payloadOf = (inputs) => projectPayload({ id: 'ws1', name: 'Ekene spacing', inputs });
const make = (inputs = inputsOf()) => buildWsCaseContract({ projectId: 'ws1', projectName: 'Ekene spacing', projectSavedAt: AT.toISOString(), payload: payloadOf(inputs), build: 'test' });

describe('the ws-case-1 contract', () => {
  it('is refused without a case or a first production date, with the reason', () => {
    expect(make(inputsOf({ spacing: '', start: '2027-01-01' })).reason).toMatch(/Choose the case to send/);
    expect(make(inputsOf({ spacing: '80', start: '' })).reason).toMatch(/Set the first production date/);
    expect(make(inputsOf({ spacing: '85', start: '2027-01-01' })).reason).toMatch(/no case at 85 acres/);
    const bad = inputsOf();
    bad.form.porosity = '';
    expect(make(bad).reason).toMatch(/Porosity is required/);
    expect(firstProductionOf({ start: '2027-02-30' })).toBeNull();
  });

  it('the sender settings survive the saved payload', () => {
    expect(inputsFromPayload(payloadOf(inputsOf())).sender).toEqual({ spacing: '80', start: '2027-03-15' });
    expect(inputsFromPayload({ inputs: { form: {} } }).sender).toEqual({ spacing: '', start: '' });
  });

  it('carries the case; its steps and calendar years sum to the volume the canonical economics ran on', () => {
    const r = make();
    expect(r.ok).toBe(true);
    const k = r.contract;
    expect(k.schema).toBe('ws-case-1');
    expect(k.source).toMatchObject({ spacingAcres: 80, wells: 62, field: 'Ekene', layout: 'square' });
    const res = runSpacingCases(inputsOf().form);
    const econ = spacingEconomicsInputs(80, res.parameters);
    const econOil = econ.production.oil.reduce((s, v) => s + v, 0);
    expect(Math.abs(k.forecast.Np - econOil) / econOil).toBeLessThan(1e-12);
    const row = res.spacingResults.find((x) => x.spacing === 80);
    expect(k.forecast.Np).toBeCloseTo(row.numberOfWells * row.producedPerWell * 1000, 3);
    const annual = k.forecast.annual.reduce((s, y) => s + y.oil, 0);
    expect(Math.abs(annual - k.forecast.Np) / k.forecast.Np).toBeLessThan(1e-12);
    let prev = 0;
    let stepSum = 0;
    for (const s of k.forecast.steps) { stepSum += s.qo * (s.t_days - prev); prev = s.t_days; }
    expect(Math.abs(stepSum - k.forecast.Np) / k.forecast.Np).toBeLessThan(1e-12);
    expect(k.forecast.steps[k.forecast.steps.length - 1].Np).toBeCloseTo(k.forecast.Np, 3);
    expect(k.forecast.Gp).toBeCloseTo((k.forecast.Np * 500) / 1000, 6);
    // the first calendar year is part-year: from 2027-03-15 to the year end
    expect(k.forecast.annual[0].year).toBe(2027);
    expect(k.forecast.annual[0].days).toBeCloseTo(292, 6);
    // the rate limit binds at 80 acres on the example: the first steps are the plateau, 62 wells at the deliverable rate
    expect(k.basis.rateLimit.binding).toBe(true);
    expect(k.forecast.steps[0].qo).toBeCloseTo(62 * k.basis.rateLimit.deliverableStbd, 6);
    expect(k.model.npvUsdMM).toBeCloseTo(row.npv, 9);
    expect(wsSourceLine(k)).toBe('case 80 acres a well (62 wells, Ekene) from 2027-03-15, project "Ekene spacing" (Well Spacing Optimizer)');
    expect(wsBasisLine(k)).toMatch(/rate-limited at 297.7 STB\/d a well for 4.69 years; all wells on stream in year 1/);
  });

  it('the fingerprint moves with the case and not with the build', () => {
    const a = make().contract;
    const b = buildWsCaseContract({ projectId: 'ws1', projectName: 'Ekene spacing', payload: payloadOf(inputsOf()), build: 'another' }).contract;
    expect(b.fingerprint).toBe(a.fingerprint);
    const moved = inputsOf();
    moved.form.oilPrice = '80';
    const c = make(moved);
    // a price moves no volume, and still moves the fingerprint: the inputs the case ran on changed
    expect(c.contract.fingerprint).not.toBe(a.fingerprint);
    expect(c.contract.forecast.Np).toBe(a.forecast.Np);
    expect(compareWsWithSource(a, c).text).toMatch(/\(the inputs\)/);
  });

  it('is read by id through the service; a missing table is said in words', async () => {
    const row = { id: 'ws1', project_name: 'Ekene spacing', inputs_data: payloadOf(inputsOf()), updated_at: AT.toISOString() };
    const q = { select: () => q, eq: () => q, order: () => q, limit: async () => ({ data: [row], error: null }) };
    const got = await getWsCase({ from: () => q }, { projectId: 'ws1' });
    expect(got.ok).toBe(true);
    expect(got.contract.fingerprint).toBe(make().contract.fingerprint);
    expect((await listWsCases({ from: () => q }))[0].ok).toBe(true);
    const qm = { select: () => qm, eq: () => qm, order: () => qm, limit: async () => ({ data: null, error: { code: 'PGRST205', message: 'Could not find the table public.saved_well_spacing_projects in the schema cache' } }) };
    await expect(listWsCases({ from: () => qm })).rejects.toThrow(WS_NOT_SWITCHED_ON);
  });
});

describe('Forecast Scenario Hub takes it as a profile case', () => {
  it('reproduces the profile; the EUR is the sender Np', () => {
    const k = make().contract;
    const made = caseFromWsContract(k, { id: 'ws-a', receivedAt: AT.toISOString() });
    expect(made.ok).toBe(true);
    const c = made.case;
    expect(c.kind).toBe('profile');
    expect(c.startDate).toBe('2027-03-15');
    const run = runCase(c);
    expect(run.error).toBeUndefined();
    expect(Math.abs(run.eur - k.forecast.Np) / k.forecast.Np).toBeLessThan(1e-9);
    const sum = compareCases([c], null, '2027-01-01T00:00:00Z').summaries[0];
    expect(sum.model).toBe('Profile');
    expect(caseSourceText(c)).toMatch(/^From case 80 acres a well \(62 wells, Ekene\) from 2027-03-15/);
    expect(editedAfterHandoff(c)).toEqual([]);
    const m = collectHubReportArgs({ cases: [c], econ: { pricePerBbl: 70, opexPerBbl: 18, discountRatePct: 10 }, setStart: '2027-01-01', generatedAt: AT });
    expect(m.identification.find((r) => r[0] === 'Cases')[1]).toBe('1 (0 from Decline Curve Analysis, 1 from Well Spacing Optimizer, 0 entered here)');
    expect(m.caseRows[0][1]).toBe('Profile from Well Spacing Optimizer');
  });

  it('negative control: the same case without its profile kind is an Arps case and is refused', () => {
    const { kind: _k, ...asArps } = caseFromWsContract(make().contract).case;
    expect(runCase(asArps).error).toMatch(/qi, decline and horizon must be positive/);
  });
});

describe('Petroleum Economics Studio takes it as a production file', () => {
  it('rows are the calendar years; the contract rides last; the engine never sees it', () => {
    const k = make().contract;
    const data = epeRowsFromWsContract(k, { receivedAt: AT.toISOString(), build: 'b' });
    const rows = volumeRowsOf(data);
    expect(rows.length).toBe(k.forecast.annual.length);
    expect(rows[0]).toEqual({ year: 2027, oil_bbl: Math.round(k.forecast.annual[0].oil), gas_mscf: Math.round(k.forecast.annual[0].gas) });
    const p = wsProvenanceOf({ data });
    expect(p.fingerprint).toBe(k.fingerprint);
    expect(dcaProvenanceOf({ data })).toBeNull();
    expect(wsFileName(k)).toBe('Well spacing - Ekene 80 acres.generated');
    expect(wsProvenanceText(p)).toMatch(/Wells on stream: 62 in year 1; enter the matching drilling capex/);
    const run = (prodRows) => computeCashFlow({ cfg: PIA_WORKED_EXAMPLE_CFG, prodRows, capexRows: PIA_WORKED_EXAMPLE_CAPEX, opexRows: PIA_WORKED_EXAMPLE_OPEX });
    expect(run(data).kpis.npv).toBeCloseTo(run(rows).kpis.npv, 6);
    // negative control: a volume filter that does not know the key counts the record as a row
    const old = data.filter((r) => !(r && typeof r === 'object' && (r.dca_forecast_1 || r.fsh_case_1 || r.wf_forecast_1 || r.sim_forecast_1)));
    expect(old.length).toBe(rows.length + 1);
    expect(old[old.length - 1][WS_PROVENANCE_KEY]).toBeTruthy();
  });

  it('the source is re-read and a change is named', () => {
    const a = make().contract;
    expect(compareWsWithSource(a, make()).state).toBe('unchanged');
    expect(compareWsWithSource(a, null).state).toBe('missing');
    const moved = make(inputsOf({ spacing: '100', start: '2027-03-15' }));
    const cmp = compareWsWithSource(a, moved);
    expect(cmp.state).toBe('changed');
    expect(cmp.text).toMatch(/the case chosen/);
    const date = compareWsWithSource(a, make(inputsOf({ spacing: '80', start: '2028-01-01' })));
    expect(date.text).toMatch(/the first production date/);
  });
});
