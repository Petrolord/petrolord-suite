/**
 * DCA U2-001: the modified hyperbolic (terminal decline Dmin) through the
 * app's own path: fitWell, forecastWell, the report, the dca-forecast-1
 * contract and Forecast Scenario Hub as its receiver.
 *
 * Truth: a b = 1.3 well (qi 800 bbl/d, Di 0.004 per day) and the engine's
 * closed forms (packages/engines dca/arps, gated against CED P03-004 there).
 * Negative controls: the same forecast without Dmin (no switch, larger EUR);
 * a hub case that drops the terminal decline misses the DCA forecast.
 */
import { fitWell, forecastWell, withStreamResults } from '@/utils/declineCurve/dcaAnalysis';
import { analysisOf, analysisStatus, forecastConfigKey } from '@/utils/declineCurve/dcaModel';
import { buildDcaForecastContract } from '@/utils/declineCurve/dcaForecastContract';
import { caseFromDcaContract, editedAfterHandoff } from '@/utils/forecastScenarioIntake';
import { runCase } from '@/utils/forecastScenarioCalculations';
import { collectDcaReportArgs, buildDcaPdf, engineInputsOf } from '@/utils/declineCurve/dcaReport';
import { missingInputRows } from '@/lib/reportKit';
import { readPdf, chartLogo, flat, expectFigureDrawn } from '@/lib/reportKit/testKit';
import {
  calculateModifiedHyperbolicCumulative, modifiedHyperbolicSwitch, calculateArpsHyperbolic,
} from '@/utils/declineCurve/dcaEngine';
import { terminalDeclinePerDay } from '@/utils/declineCurve/declineInput';
import { buildForecastCsv } from '@/utils/declineCurve/dcaExport';

const AT = new Date('2026-10-03T12:00:00Z');
const DAY = 86400000;
const TRUTH = { qi: 800, Di: 0.004, b: 1.3 };

const hypWell = (terminalDecline = null) => {
  const t0 = Date.UTC(2021, 0, 1);
  const data = Array.from({ length: 36 }, (_, i) => {
    const t = Date.UTC(2021, i, 1);
    const q = calculateArpsHyperbolic(TRUTH.qi, TRUTH.Di, TRUTH.b, (t - t0) / DAY);
    return { date: new Date(t).toISOString().slice(0, 10), oilRate: q, rate: q };
  });
  return {
    id: 'hyp', name: 'HYP-13', data,
    analysis: {
      fitWindow: { startDate: data[0].date, endDate: data[35].date },
      streams: { oil: { modelType: 'Hyperbolic', constraints: { minB: 0, maxB: 2 }, forecastConfig: { economicLimit: 10, stopAtLimit: true, durationDays: 18263, terminalDecline } } },
    },
  };
};
const run = (well) => {
  const f = fitWell(well, 'oil', { now: AT });
  if (!f.ok) throw new Error(f.error);
  const w = withStreamResults(well, 'oil', { fitResults: f.fit });
  return withStreamResults(w, 'oil', { forecastResults: forecastWell(w, 'oil', { now: AT }) });
};
const contractOf = (well) => {
  const res = buildDcaForecastContract({ projectId: 'p1', projectName: 'Gate', payload: { payloadVersion: 2, wells: { [well.id]: well } }, wellId: well.id, stream: 'oil', build: 'test' });
  if (!res.ok) throw new Error(res.reason);
  return res.contract;
};
const EFF10 = { value: 10, unit: '%/yr', basis: 'effective-tangent' };
const EFF30 = { value: 30, unit: '%/yr', basis: 'effective-tangent' };

describe('the forecast with a terminal decline', () => {
  it('the fit recovers b 1.3; the forecast switches where the decline falls to Dmin', () => {
    const w = run(hypWell(EFF10));
    const s = analysisOf(w).streams.oil;
    expect(s.fitResults.b).toBeCloseTo(1.3, 9);
    const fc = s.forecastResults;
    const Dmin = -Math.log(0.9) / 365.25;
    expect(terminalDeclinePerDay(s.forecastConfig)).toBeCloseTo(Dmin, 15);
    const sw = modifiedHyperbolicSwitch(s.fitResults.qi, s.fitResults.Di, s.fitResults.b, Dmin);
    expect(fc.terminalDecline.tSwitchDays).toBeCloseTo(sw.tSwitch, 9);
    expect(fc.terminalDecline.switchDate).toBe(new Date(Date.UTC(2021, 0, 1) + sw.tSwitch * DAY).toISOString().slice(0, 10));
    expect(fc.terminalDecline.beforeCutoff).toBe(false);
    expect(fc.terminalDecline.entered).toEqual(EFF10);
  });

  it('remaining volume equals the closed-form modified cumulative from the cut-off to the limit (daily sum)', () => {
    const w = run(hypWell(EFF10));
    const { fitResults: fit, forecastResults: fc } = analysisOf(w).streams.oil;
    const Dmin = fc.terminalDecline.dminPerDay;
    const tH = Math.round((Date.parse(fc.historyEndDate) - Date.parse(fit.t0)) / DAY);
    const tEnd = tH + fc.timeToLimit;
    const closed = calculateModifiedHyperbolicCumulative(fit.qi, fit.Di, fit.b, Dmin, tEnd) - calculateModifiedHyperbolicCumulative(fit.qi, fit.Di, fit.b, Dmin, tH);
    expect(fc.limitReached).toBe(true);
    expect(Math.abs(fc.remaining - closed) / closed).toBeLessThan(2e-3);
  });

  it('negative control: without Dmin the forecast has no switch and a much larger EUR', () => {
    const mod = analysisOf(run(hypWell(EFF10))).streams.oil.forecastResults;
    const plain = analysisOf(run(hypWell(null))).streams.oil.forecastResults;
    expect(plain.terminalDecline).toBeUndefined();
    expect(plain.eurTotal).toBeGreaterThan(mod.eurTotal * 1.15);
  });

  it('setting Dmin withdraws the forecast; a config with none keeps its key (saved forecasts stay current)', () => {
    const w = run(hypWell(null));
    expect(analysisStatus(w, 'oil').forecast).toBe('current');
    const a = analysisOf(w);
    const changed = { ...w, analysis: { ...a, streams: { ...a.streams, oil: { ...a.streams.oil, forecastConfig: { ...a.streams.oil.forecastConfig, terminalDecline: EFF10 } } } } };
    expect(analysisStatus(changed, 'oil').forecast).toBe('stale');
    expect(analysisStatus(changed, 'oil').forecastReasons).toContain('the forecast settings changed');
    const cfg = { economicLimit: 10, durationDays: 3653, facilityLimit: 0, stopAtLimit: true };
    expect(forecastConfigKey({ ...cfg, terminalDecline: null })).toBe(forecastConfigKey(cfg));
  });

  it('the CSV header names the terminal decline and the switch', () => {
    const w = run(hypWell(EFF10));
    const s = analysisOf(w).streams.oil;
    const csv = buildForecastCsv(s.forecastResults.rates.slice(0, 3), 'HYP-13', 'oil', { results: s.forecastResults, fit: s.fitResults, config: s.forecastConfig });
    expect(csv).toMatch(/# Terminal decline Dmin: 10 %\/yr effective \(tangent, the exponential form\), nominal 10\.54 %\/yr/);
    expect(csv).toMatch(/switch to exponential on \d{4}-\d\d-\d\d/);
  });
});

describe('the contract and Forecast Scenario Hub carry it', () => {
  it.each([
    ['switch after the cut-off', EFF10, false],
    ['switch before the cut-off', EFF30, true],
  ])('%s: the hub case reproduces the DCA forecast day for day', (_, td, before) => {
    const w = run(hypWell(td));
    const fc = analysisOf(w).streams.oil.forecastResults;
    expect(fc.terminalDecline.beforeCutoff).toBe(before);
    const c = contractOf(w);
    expect(c.decline.terminal.dminPerDay).toBeCloseTo(fc.terminalDecline.dminPerDay, 15);
    expect(c.decline.terminal.switchDate).toBe(fc.terminalDecline.switchDate);
    expect(c.atCutoff.pastSwitch).toBe(before);
    const made = caseFromDcaContract(c, { id: 'k1', receivedAt: AT.toISOString() });
    expect(made.ok).toBe(true);
    expect(editedAfterHandoff(made.case)).toEqual([]);
    const hub = runCase(made.case);
    expect(hub.rates.length).toBe(fc.rates.length);
    for (const i of [0, 100, 1000, fc.rates.length - 1]) {
      expect(Math.abs(hub.rates[i].rate - fc.rates[i].rate) / fc.rates[i].rate).toBeLessThan(1e-8);
    }
    expect(Math.abs(hub.cumHorizon - fc.remaining) / fc.remaining).toBeLessThan(1e-8);
    // negative control: the same case with the terminal decline dropped
    const noDmin = runCase({ ...made.case, terminalDeclinePct: null });
    expect(Math.abs(noDmin.eur - hub.eur) / hub.eur).toBeGreaterThan(0.05);
    expect(editedAfterHandoff({ ...made.case, terminalDeclinePct: null })).toEqual(['terminal decline']);
  });
});

describe('the report carries it (RL1, RL6, RL9)', () => {
  const logo = chartLogo();
  it('inputs row, life row, decline rows, the switch on figure 1, the b above 1 flag answered', () => {
    const w = run(hypWell(EFF10));
    const m = collectDcaReportArgs({ project: { name: 'Gate' }, well: w, stream: 'oil', build: 'test', generatedAt: AT });
    expect(m.ok).toBe(true);
    expect(missingInputRows(engineInputsOf(w, 'oil'), m.inputs)).toEqual([]);
    // the guard sees the new input: drop the row and it is named
    expect(missingInputRows(engineInputsOf(w, 'oil'), m.inputs.filter((r) => r.key !== 'terminal')))
      .toEqual(expect.arrayContaining(['forecast.config.terminalDecline.value']));
    const built = buildDcaPdf(m, { logo });
    const pdf = readPdf(built.doc, { ink: true });
    const t = flat(pdf.text);
    expect(m.inputs.find((r) => r.key === 'terminal').value).toBe('10 %/yr effective (tangent, the exponential form), nominal 10.54 %/yr (0.0002885 per day)');
    expect(t).toMatch(/Terminal decline Dmin \(modified 10 %\/yr effective \(tangent, the/);
    expect(t).toMatch(/Switch to the terminal decline \d{4}-\d\d-\d\d, at [\d,.]+ bbl\/d/);
    expect(t).toMatch(/Terminal decline Dmin, nominal per year 10\.54 %\/yr/);
    expect(t).toMatch(/b is 1\.3, above 1; the forecast switches to an exponential at the terminal decline/);
    expect(t).not.toMatch(/no terminal decline is set/);
    expect(t).toMatch(/switches to the terminal decline on \d{4}-\d\d-\d\d \(marked\)/);
    const rateTime = built.figuresBuilt.find((f) => f.id === 'rate-time');
    expectFigureDrawn(pdf, rateTime, { logo: true });
    pdf.close();
  });

  it('without Dmin the b above 1 flag says none is set and how to set one', () => {
    const w = run(hypWell(null));
    const m = collectDcaReportArgs({ project: { name: 'Gate' }, well: w, stream: 'oil', build: 'test', generatedAt: AT });
    expect(m.flags.join(' ')).toMatch(/above 1, and no terminal decline is set/);
    expect(m.inputs.find((r) => r.key === 'terminal').value).toBe('not set');
  });
});
