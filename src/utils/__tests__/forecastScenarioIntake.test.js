/**
 * DCA-U1-008: the dca-forecast-1 contract and Forecast Scenario Hub as its
 * receiver. A hub case made from the contract restarts the fitted curve at
 * the data cut-off, so the hub's forecast is the DCA forecast day for day:
 * the gate calls the hub's own engine (runCase) and DCA's own forecast
 * (forecastWell) and holds one against the other. The negative control is
 * the retyping the contract replaces: qi and Di of the fit start, given to a
 * forecast that starts at the cut-off.
 */
import { sampleWell } from '@/utils/declineCurve/sampleWell';
import { fitWell, forecastWell, withStreamResults } from '@/utils/declineCurve/dcaAnalysis';
import { buildDcaForecastContract, compareWithSource, annualVolumes, DCA_FORECAST_SCHEMA } from '@/utils/declineCurve/dcaForecastContract';
import { caseFromDcaContract, editedAfterHandoff, caseSourceText } from '@/utils/forecastScenarioIntake';
import { runCase } from '@/utils/forecastScenarioCalculations';
import { analysisOf } from '@/utils/declineCurve/dcaModel';

const AT = new Date('2026-10-03T12:00:00Z');

// a hyperbolic well, so the restart of Di at the cut-off matters
const hyperbolicWell = () => {
  const t0 = Date.UTC(2021, 0, 1);
  const data = Array.from({ length: 30 }, (_, i) => {
    const t = Date.UTC(2021, i, 1);
    const days = (t - t0) / 86400000;
    const q = 800 / (1 + 0.5 * 0.004 * days) ** 2;
    return { date: new Date(t).toISOString().slice(0, 10), oilRate: q, rate: q };
  });
  return { id: 'hyp', name: 'HYP-1', data, analysis: { fitWindow: { startDate: data[0].date, endDate: data[29].date }, streams: { oil: { forecastConfig: { economicLimit: 20, stopAtLimit: true, durationDays: 20000 } } } } };
};

const fittedAndForecast = (well) => {
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

describe('the dca-forecast-1 contract', () => {
  it('carries units, basis, source, the fit with its date, a fingerprint', () => {
    const w = fittedAndForecast({ ...sampleWell('p1'), id: 's1' });
    const c = contractOf(w);
    expect(c.schema).toBe(DCA_FORECAST_SCHEMA);
    expect(c.units).toEqual(expect.objectContaining({ rate: 'bbl/d', volume: 'bbl', time: 'day' }));
    expect(c.decline.basis).toMatch(/nominal \(instantaneous\) decline per day/);
    expect(c.decline.daysPerYear).toBe(365.25);
    expect(c.decline.diNominalPctPerYear).toBeCloseTo(43.83, 6);
    expect(c.source).toEqual(expect.objectContaining({ kind: 'well', wellName: 'Ekene-1 (sample)', sample: true }));
    expect(c.fit.fittedAt).toBe(AT.toISOString());
    expect(c.forecast.eur).toBeCloseTo(c.forecast.produced + c.forecast.remaining, 6);
    expect(c.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    // the calendar-year volumes sum to the remaining volume
    expect(c.forecast.annual.reduce((s, y) => s + y.volume, 0)).toBeCloseTo(c.forecast.remaining, 6);
  });

  it('a stale or missing forecast is refused with the reason', () => {
    const w = fittedAndForecast({ ...sampleWell('p1'), id: 's1' });
    const a = analysisOf(w);
    const stale = { ...w, analysis: { ...a, fitWindow: { ...a.fitWindow, startDate: '2020-05-01' } } };
    const res = buildDcaForecastContract({ projectId: 'p1', payload: { payloadVersion: 2, wells: { s1: stale } }, wellId: 's1', stream: 'oil' });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/fit window changed/);
    const none = buildDcaForecastContract({ projectId: 'p1', payload: { payloadVersion: 2, wells: { s1: { ...sampleWell('p1'), id: 's1' } } }, wellId: 's1', stream: 'oil' });
    expect(none.ok).toBe(false);
  });

  it('annual volumes are calendar years of the daily forecast', () => {
    expect(annualVolumes([{ date: '2022-12-31T00:00:00Z', rate: 10 }, { date: '2023-01-01T00:00:00Z', rate: 5 }, { date: '2023-01-02T00:00:00Z', rate: 5 }]))
      .toEqual([{ year: 2022, volume: 10, days: 1 }, { year: 2023, volume: 10, days: 2 }]);
  });
});

describe('Forecast Scenario Hub receives it', () => {
  it('the hub case reproduces the DCA forecast day for day (hyperbolic)', () => {
    const w = fittedAndForecast(hyperbolicWell());
    const fc = analysisOf(w).streams.oil.forecastResults;
    const c = contractOf(w);
    expect(c.decline.model).toBe('Hyperbolic');
    const made = caseFromDcaContract(c, { id: 'k1', receivedAt: AT.toISOString() });
    expect(made.ok).toBe(true);
    const hub = runCase(made.case);
    expect(hub.startDate).toBe(c.forecast.start);
    // the same number of days to the limit, and the same volume
    expect(hub.rates.length).toBe(fc.rates.length);
    expect(Math.abs(hub.cumHorizon - fc.remaining) / fc.remaining).toBeLessThan(1e-9);
    expect(hub.rates[0].rate).toBeCloseTo(fc.rates[0].rate, 8);
    expect(String(hub.rates[0].date).slice(0, 10)).toBe(String(fc.rates[0].date).slice(0, 10));
    // negative control: retyping qi and Di of the fit start
    const naive = runCase({ ...made.case, qi: c.decline.qi, declineAnnualPct: c.decline.diNominalPctPerYear });
    expect(Math.abs(naive.cumHorizon - fc.remaining) / fc.remaining).toBeGreaterThan(0.5);
  });

  it('a gas forecast is refused by the hub with the reason', () => {
    const w = fittedAndForecast({ ...sampleWell('p1'), id: 's1' });
    const gas = withStreamResults(w, 'gas', {});
    const res = buildDcaForecastContract({ projectId: 'p1', payload: { payloadVersion: 2, wells: { s1: gas } }, wellId: 's1', stream: 'oil' });
    const c = { ...res.contract, stream: 'gas' };
    expect(caseFromDcaContract(c).ok).toBe(false);
    expect(caseFromDcaContract(c).reason).toMatch(/oil cases/);
  });

  it('the case says where it came from, and when it was edited after', () => {
    const w = fittedAndForecast({ ...sampleWell('p1'), id: 's1' });
    const made = caseFromDcaContract(contractOf(w), { id: 'k1', receivedAt: AT.toISOString() }).case;
    expect(editedAfterHandoff(made)).toEqual([]);
    expect(caseSourceText(made)).toMatch(/^From Ekene-1 \(sample\), oil, Exponential fitted 2026-10-03, project "Gate" \(Decline Curve Analysis\), received 2026-10-03\./);
    expect(caseSourceText(made)).toMatch(/nominal \(a year of 365\.25 days\) at the data cut-off 2022-12-01/);
    const edited = { ...made, qi: made.qi + 5 };
    expect(editedAfterHandoff(edited)).toEqual(['qi']);
    expect(caseSourceText(edited)).toMatch(/Edited here after the handoff: qi\./);
  });

  it('source changed since: the fingerprint moves when the forecast changes', () => {
    const w = fittedAndForecast({ ...sampleWell('p1'), id: 's1' });
    const received = contractOf(w);
    const same = buildDcaForecastContract({ projectId: 'p1', projectName: 'Gate', payload: { payloadVersion: 2, wells: { s1: w } }, wellId: 's1', stream: 'oil', build: 'another build' });
    expect(compareWithSource(received, same).state).toBe('unchanged');
    // a new limit and a new forecast
    const a = analysisOf(w);
    let w2 = { ...w, analysis: { ...a, streams: { ...a.streams, oil: { ...a.streams.oil, forecastConfig: { ...a.streams.oil.forecastConfig, economicLimit: 20 } } } } };
    w2 = withStreamResults(w2, 'oil', { forecastResults: forecastWell(w2, 'oil', { now: AT }) });
    const now = buildDcaForecastContract({ projectId: 'p1', projectName: 'Gate', payload: { payloadVersion: 2, wells: { s1: w2 } }, wellId: 's1', stream: 'oil' });
    const cmp = compareWithSource(received, now);
    expect(cmp.state).toBe('changed');
    expect(cmp.text).toMatch(/the volumes, the economic limit/);
    expect(compareWithSource(received, null).state).toBe('missing');
  });
});
