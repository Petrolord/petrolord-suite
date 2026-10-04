/**
 * SIM-U2-002: the `sim-forecast-1` contract, read by id, into Forecast
 * Scenario Hub (a profile case) and Petroleum Economics Studio (a production
 * file). Gates call the shipped functions on summaries OPM Flow 2026.04
 * really wrote (the worker fixtures of the Model Builder decks): the sum of
 * the simulator's step rates equals its own cumulative FOPT (an independent
 * channel inside the simulator); the calendar years sum to Np exactly; the
 * hub case reproduces the run day for day; the EPE rows are the contract's
 * years; the cash-flow engine ignores the provenance record; the source is
 * re-read by id and a newer run is named.
 * Negative controls: a summary without FOPR is refused; a thinned series
 * without FOPT is refused; the hub case without its profile kind is an Arps
 * case and is refused; a volume filter without the new key counts the
 * record as a row.
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { computeCashFlow } from '../../../../supabase/functions/_shared/epe-engine.ts';
import {
  PIA_WORKED_EXAMPLE_CFG, PIA_WORKED_EXAMPLE_CAPEX, PIA_WORKED_EXAMPLE_OPEX,
} from '../../../../tools/validation/fixtures/epe-pia-worked-example.ts';
import builtSummary from '@/dev/fixtures/sim-built-summary.json';
import s4Summary from '@/dev/fixtures/sim-built-s4-summary.json';
import {
  buildSimForecastContract, annualFromRateSteps, compareSimWithSource, simSourceLine, simBasisLine,
} from '@/utils/simstudio/simForecastContract';
import { getSimForecast, listSimForecasts } from '@/utils/simstudio/simForecastService';
import { caseFromSimContract, caseSourceText, editedAfterHandoff } from '@/utils/forecastScenarioIntake';
import { runCase, compareCases } from '@/utils/forecastScenarioCalculations';
import { collectHubReportArgs } from '@/utils/forecastScenarioReport';
import { epeRowsFromSimContract, simProvenanceOf, simProvenanceText, SIM_PROVENANCE_KEY, simFileName } from '@/pages/apps/epe/epeSimIntake';
import { volumeRowsOf, dcaProvenanceOf } from '@/pages/apps/epe/epeDcaIntake';
import { wfProvenanceOf } from '@/pages/apps/epe/epeWfIntake';

const GEN = path.join(__dirname, '../../../../worker/sim-worker/tests/integration/fixtures/generated');
const S4_DECK = fs.readFileSync(path.join(GEN, 'BUILT_S4.DATA'), 'utf8');
const BUILT_DECK = fs.readFileSync(path.join(GEN, 'BUILT.DATA'), 'utf8');
const AT = '2026-10-04T12:00:00.000Z';
const caseRow = { id: 'case-1', name: 'Ekene base', user_id: 'u1', deck_path: 'u1/case-1/deck/MODEL.DATA', deck_source: 'generated', updated_at: AT };
const runOf = (summary, over = {}) => ({ id: 'run-aaaa1111', case_id: 'case-1', status: 'complete', finished_at: '2026-10-04T10:00:00Z', deck_sha256: summary.deck_sha256, opm_version: summary.opm_version, worker_id: 'w', result_path: 'u1/case-1/runs/run-aaaa1111/summary.json', ...over });
const make = (summary = builtSummary, o = {}) => buildSimForecastContract({ caseRow, run: runOf(summary), summary, build: 'test', ...o });

describe('the sim-forecast-1 contract', () => {
  it('the steps sum to the simulator\'s own FOPT; the calendar years sum to Np exactly', () => {
    const r = make();
    expect(r.ok).toBe(true);
    const k = r.contract;
    expect(k.schema).toBe('sim-forecast-1');
    expect(k.run.deckSha256).toBe(builtSummary.deck_sha256);
    expect(k.forecast.start).toBe('2026-01-01');
    // OPM's FOPT is an independent channel: the step rates integrate to it
    expect(k.check.FOPT).toBe(builtSummary.field.FOPT[builtSummary.field.FOPT.length - 1]);
    expect(k.check.closure).toBeLessThan(1e-5);
    const oil = k.forecast.annual.reduce((s, y) => s + y.oil, 0);
    expect(Math.abs(oil - k.forecast.Np) / k.forecast.Np).toBeLessThan(1e-12);
    const gas = k.forecast.annual.reduce((s, y) => s + y.gas, 0);
    expect(Math.abs(gas - k.forecast.Gp) / k.forecast.Gp).toBeLessThan(1e-12);
    const days = k.forecast.annual.reduce((s, y) => s + y.days, 0);
    expect(days).toBeCloseTo(k.forecast.elapsedDays, 6);
    expect(k.forecast.annual[0]).toMatchObject({ year: 2026 });
    expect(k.forecast.annual[0].days).toBeCloseTo(365, 6);
    expect(simSourceLine(k)).toBe('run run-aaaa of case "Ekene base" (Reservoir Simulation Studio), the whole run from 2026-01-01');
    expect(simBasisLine(k)).toMatch(/^OPM Flow 2026.04 run of deck SHA-256 c76c333451d5, finished 2026-10-04; The deck is FIELD: no conversion; oil from FOPR, every time step/);
  });

  it('a hand-checked split: a step across a year end goes to both years by days', () => {
    const y = annualFromRateSteps([{ t_days: 10, qo: 100, qw: 10, qg: 50 }], '2026-12-27', [['qo', 'oil'], ['qw', 'water'], ['qg', 'gas']]);
    expect(y.map((r) => [r.year, r.days, r.oil, r.gas])).toEqual([[2026, 5, 500, 250], [2027, 5, 500, 250]]);
  });

  it('the prediction phase starts at the history end; history plus prediction is the whole run', () => {
    const whole = make(s4Summary).contract;
    const pred = make(s4Summary, { phase: 'prediction', historyEnd: '2025-04-01' });
    expect(pred.ok).toBe(true);
    const p = pred.contract;
    expect(p.forecast.start).toBe('2025-04-01');
    expect(p.forecast.steps[0].t_days).toBeCloseTo(120.438 - 90, 9);
    // the history phase: 90 days at the observed 2,000 then 1,677 STB/d (what the simulator delivered)
    let hist = 0; let prev = 0;
    s4Summary.days.forEach((d, i) => { if (d <= 90) { hist += s4Summary.field.FOPR[i] * (d - prev); prev = d; } });
    expect(hist + p.forecast.Np).toBeCloseTo(whole.forecast.Np, 6);
    expect(p.forecast.Np).toBeCloseTo(4000 * (455.256 - 90), 3);
    // refused without a history end, with the reason
    expect(make(s4Summary, { phase: 'prediction' }).reason).toMatch(/no history phase/);
  });

  it('METRIC deck: sm3/d converted with the registry (1 sm3 = 6.289811 STB, pinned)', () => {
    const metric = { ...builtSummary, unit_system: 'METRIC', field: { FOPR: builtSummary.days.map(() => 1) } };
    const k = make(metric).contract;
    expect(k.forecast.steps[0].qo).toBeCloseTo(6.289811, 5);
    expect(k.basis.conversion).toMatch(/METRIC/);
    expect(k.forecast.gasReported).toBe(false);
  });

  it('negative controls: no FOPR is refused; a thinned series rebuilds from FOPT or is refused', () => {
    const noOil = { ...builtSummary, field: { FPR: builtSummary.field.FPR } };
    expect(make(noOil).reason).toMatch(/No oil profile: FOPR is not in the summary/);
    const thin = (keepCum) => {
      const idx = builtSummary.days.map((_, i) => i).filter((i) => i % 2 === 1 || i === builtSummary.days.length - 1);
      const pick = (a) => idx.map((i) => a[i]);
      const field = { FOPR: pick(builtSummary.field.FOPR), ...(keepCum ? { FOPT: pick(builtSummary.field.FOPT) } : {}) };
      return { ...builtSummary, days: pick(builtSummary.days), field, steps: { ...builtSummary.steps, stride: 2 } };
    };
    expect(make(thin(false)).reason).toMatch(/FOPR is thinned 1 in 2 and FOPT is not in the summary/);
    const k = make(thin(true)).contract;
    expect(k.basis.steps.oil).toMatch(/FOPT differences/);
    expect(k.forecast.Np).toBeCloseTo(builtSummary.field.FOPT[builtSummary.field.FOPT.length - 1], 3);
    expect(buildSimForecastContract({ caseRow, run: { ...runOf(builtSummary), status: 'failed' }, summary: builtSummary }).reason).toMatch(/not complete/);
  });

  it('the fingerprint moves with the run and not with the build', () => {
    const a = make().contract;
    const b = buildSimForecastContract({ caseRow, run: runOf(builtSummary), summary: builtSummary, build: 'another' }).contract;
    expect(b.fingerprint).toBe(a.fingerprint);
    const c = buildSimForecastContract({ caseRow, run: runOf(builtSummary, { id: 'run-bbbb2222' }), summary: builtSummary }).contract;
    expect(c.fingerprint).not.toBe(a.fingerprint);
  });
});

/** A Supabase double: sim_cases, sim_runs and the sim bucket. */
function fakeSupabase({ runs, files }) {
  const tables = { sim_cases: [caseRow], sim_runs: runs };
  const from = (t) => {
    let rows = [...(tables[t] || [])];
    const q = {
      select: () => q,
      eq: (k, v) => { rows = rows.filter((r) => r[k] === v); return q; },
      in: (k, vs) => { rows = rows.filter((r) => vs.includes(r[k])); return q; },
      order: (k, { ascending }) => { rows.sort((x, y) => (ascending ? 1 : -1) * String(x[k]).localeCompare(String(y[k]))); return q; },
      limit: async () => ({ data: rows, error: null }),
    };
    return q;
  };
  const storage = { from: () => ({ download: async (p) => (files[p] != null ? { data: { text: async () => files[p] }, error: null } : { data: null, error: { message: 'Object not found' } }) }) };
  return { from, storage };
}

describe('read by id through the service', () => {
  const sha = (t) => createHash('sha256').update(t).digest('hex');
  const hash = async (t) => sha(t);
  it('the deck that ran gives the history end; a newer run is named; a gone run is missing', async () => {
    expect(sha(S4_DECK)).toBe(s4Summary.deck_sha256);
    const r1 = runOf(s4Summary);
    const files = { [caseRow.deck_path]: S4_DECK, [r1.result_path]: JSON.stringify(s4Summary) };
    const sb = fakeSupabase({ runs: [r1], files });
    const list = await listSimForecasts(sb, { hash });
    expect(list.map((f) => [f.phase, f.ok])).toEqual([['run', true], ['prediction', true]]);
    const got = await getSimForecast(sb, { caseId: 'case-1', runId: r1.id, phase: 'prediction' }, { hash });
    expect(got.ok).toBe(true);
    expect(got.contract.source.historyEnd).toBe('2025-04-01');
    expect(compareSimWithSource(got.contract, got).state).toBe('unchanged');
    // a newer completed run of the same case (another deck)
    const r2 = runOf(builtSummary, { id: 'run-cccc3333', finished_at: '2026-10-05T10:00:00Z', result_path: 'u1/case-1/runs/run-cccc3333/summary.json' });
    const sb2 = fakeSupabase({ runs: [r1, r2], files: { ...files, [r2.result_path]: JSON.stringify(builtSummary) } });
    const now = await getSimForecast(sb2, { caseId: 'case-1', runId: r1.id, phase: 'run' }, { hash });
    const cmp = compareSimWithSource(make(s4Summary).contract, now);
    expect(cmp.state).toBe('changed');
    expect(cmp.text).toMatch(/newer completed run since this was received \(run run-cccc, finished 2026-10-05, a different deck\)/);
    expect(cmp.now.run.id).toBe('run-cccc3333');
    expect(compareSimWithSource(make(s4Summary).contract, await getSimForecast(sb, { caseId: 'case-1', runId: 'gone', phase: 'run' })).state).toBe('missing');
  });

  it('negative control: the deck changed after the run, so no prediction is offered', async () => {
    const r1 = runOf(s4Summary);
    const sb = fakeSupabase({ runs: [r1], files: { [caseRow.deck_path]: `${S4_DECK}\n-- edited`, [r1.result_path]: JSON.stringify(s4Summary) } });
    const got = await getSimForecast(sb, { caseId: 'case-1', runId: r1.id, phase: 'prediction' }, { hash });
    expect(got.ok).toBe(false);
    expect(got.reason).toMatch(/the case deck changed after this run/);
    const list = await listSimForecasts(sb, { hash });
    expect(list.map((f) => f.phase)).toEqual(['run']);
    expect(BUILT_DECK.length).toBeGreaterThan(0);
  });
});

describe('Forecast Scenario Hub takes it as a profile case', () => {
  it('reproduces the run day for day; the EUR is the run Np', () => {
    const k = make().contract;
    const made = caseFromSimContract(k, { id: 'sim-a', receivedAt: AT });
    expect(made.ok).toBe(true);
    const c = made.case;
    expect(c.kind).toBe('profile');
    expect(c.name).toBe('Ekene base (Simulation)');
    const run = runCase(c);
    expect(run.error).toBeUndefined();
    expect(Math.abs(run.eur - k.forecast.Np) / k.forecast.Np).toBeLessThan(1e-12);
    expect(run.rates[0].date.slice(0, 10)).toBe('2026-01-01');
    const sum = compareCases([c], null, '2026-01-01T00:00:00Z').summaries[0];
    expect(sum.model).toBe('Profile');
    expect(caseSourceText(c)).toMatch(/^From run run-aaaa of case "Ekene base" \(Reservoir Simulation Studio\), the whole run from 2026-01-01, received 2026-10-04\. OPM Flow 2026.04/);
    expect(editedAfterHandoff(c)).toEqual([]);
    const m = collectHubReportArgs({ cases: [{ id: 'x', name: 'Entered', qi: 1000, declineAnnualPct: 18, b: 0.5, years: 20, economicLimit: 30 }, c], econ: { pricePerBbl: 70, opexPerBbl: 18, discountRatePct: 10 }, setStart: '2026-01-01', generatedAt: new Date(AT) });
    expect(m.identification.find((r) => r[0] === 'Cases')[1]).toBe('2 (0 from Decline Curve Analysis, 1 from Reservoir Simulation Studio, 1 entered here)');
    expect(m.caseRows[1][1]).toBe('Profile from Reservoir Simulation Studio');
    expect(m.assumptions.join(' ')).toMatch(/sim-forecast-1 contract/);
  });

  it('negative control: the same case without its profile kind is an Arps case and is refused', () => {
    const { kind: _k, ...asArps } = caseFromSimContract(make().contract).case;
    expect(runCase(asArps).error).toMatch(/qi, decline and horizon must be positive/);
  });
});

describe('Petroleum Economics Studio takes it as a production file', () => {
  it('rows are the calendar years with oil, gas and water; the contract rides last; the engine never sees it', () => {
    const k = make().contract;
    const data = epeRowsFromSimContract(k, { receivedAt: AT, build: 'b' });
    const rows = volumeRowsOf(data);
    expect(rows.length).toBe(k.forecast.annual.length);
    expect(rows[0]).toEqual({ year: 2026, oil_bbl: Math.round(k.forecast.annual[0].oil), gas_mscf: Math.round(k.forecast.annual[0].gas), water_bbl: Math.round(k.forecast.annual[0].water) });
    const p = simProvenanceOf({ data });
    expect(p.fingerprint).toBe(k.fingerprint);
    expect(dcaProvenanceOf({ data })).toBeNull();
    expect(wfProvenanceOf({ data })).toBeNull();
    expect(simFileName(k)).toBe('Simulation - Ekene base run-aaaa.generated');
    expect(simProvenanceText(p)).toMatch(/^From run run-aaaa of case "Ekene base".*deck SHA-256 c76c333451d5/);
    const run = (prodRows) => computeCashFlow({ cfg: PIA_WORKED_EXAMPLE_CFG, prodRows, capexRows: PIA_WORKED_EXAMPLE_CAPEX, opexRows: PIA_WORKED_EXAMPLE_OPEX });
    const plain = run(rows);
    const tagged = run(data);
    expect(tagged.kpis.npv).toBeCloseTo(plain.kpis.npv, 6);
    // negative control: a volume filter that does not know the key counts the record as a row
    const old = data.filter((r) => !(r && typeof r === 'object' && (r.dca_forecast_1 || r.fsh_case_1 || r.wf_forecast_1)));
    expect(old.length).toBe(rows.length + 1);
    expect(old[old.length - 1][SIM_PROVENANCE_KEY]).toBeTruthy();
  });

  it('a stream the run did not report is left out, not sent as zero', () => {
    const noGas = { ...builtSummary, field: { FOPR: builtSummary.field.FOPR, FWPR: builtSummary.field.FWPR } };
    const rows = volumeRowsOf(epeRowsFromSimContract(make(noGas).contract));
    expect(rows[0].gas_mscf).toBeUndefined();
    expect(rows[0].water_bbl).toBeGreaterThanOrEqual(0);
  });
});
