/**
 * DCA U2-011: a downtime factor after the cut-off, stated, applied to the
 * forecast and the EUR, printed. Gates through the app's path (forecastWell,
 * the report, the contract, the hub): every forecast day is the no-downtime
 * day times the uptime; remaining is the uptime times the no-downtime
 * remaining (the limit is tested on the fitted rate, so the end date does not
 * move); EUR is produced plus that. The hub reproduces the DCA forecast with
 * the downtime day for day, and EPE's calendar-year volumes carry it.
 * Negative controls: no downtime leaves every number as it was (a saved
 * forecast keeps its key); a hub case that drops the downtime misses.
 */
import { sampleWell } from '@/utils/declineCurve/sampleWell';
import { fitWell, forecastWell, withStreamResults } from '@/utils/declineCurve/dcaAnalysis';
import { analysisOf, forecastConfigKey } from '@/utils/declineCurve/dcaModel';
import { buildDcaForecastContract } from '@/utils/declineCurve/dcaForecastContract';
import { caseFromDcaContract, editedAfterHandoff } from '@/utils/forecastScenarioIntake';
import { runCase } from '@/utils/forecastScenarioCalculations';
import { collectDcaReportArgs, engineInputsOf } from '@/utils/declineCurve/dcaReport';
import { missingInputRows } from '@/lib/reportKit';
import { epeRowsFromContract, volumeRowsOf } from '@/pages/apps/epe/epeDcaIntake';

const AT = new Date('2026-10-03T12:00:00Z');
const run = (downtimePct) => {
  let w = { ...sampleWell('p1'), id: 's1' };
  const a = analysisOf(w);
  w = { ...w, analysis: { ...a, streams: { ...a.streams, oil: { ...a.streams.oil, forecastConfig: { ...a.streams.oil.forecastConfig, downtimePct } } } } };
  w = withStreamResults(w, 'oil', { fitResults: fitWell(w, 'oil', { now: AT }).fit });
  return withStreamResults(w, 'oil', { forecastResults: forecastWell(w, 'oil', { now: AT }) });
};
const fcOf = (w) => analysisOf(w).streams.oil.forecastResults;

describe('the downtime factor', () => {
  it('every forecast day and the remaining volume scale by the uptime; the end date does not move', () => {
    const none = fcOf(run(null));
    const ten = fcOf(run(10));
    expect(ten.downtimePct).toBe(10);
    expect(ten.rates.length).toBe(none.rates.length);
    for (const i of [0, 50, none.rates.length - 1]) expect(ten.rates[i].rate).toBeCloseTo(none.rates[i].rate * 0.9, 9);
    expect(ten.remaining).toBeCloseTo(none.remaining * 0.9, 6);
    expect(ten.eurTotal).toBeCloseTo(ten.produced + 0.9 * none.remaining, 6);
    expect(ten.produced).toBe(none.produced);
    expect(ten.timeToLimit).toBe(none.timeToLimit);
  });

  it('negative control: none or 0 is the forecast as it was, with the same settings key', () => {
    const none = fcOf(run(null));
    const zero = fcOf(run(0));
    expect(zero.remaining).toBe(none.remaining);
    expect(zero.downtimePct).toBeUndefined();
    const cfg = { economicLimit: 10, durationDays: 3653, facilityLimit: 0, stopAtLimit: true };
    expect(forecastConfigKey({ ...cfg, downtimePct: null })).toBe(forecastConfigKey(cfg));
    expect(forecastConfigKey({ ...cfg, downtimePct: 10 })).not.toBe(forecastConfigKey(cfg));
  });

  it('the report prints it (input row, remaining row) and the guard holds it', () => {
    const w = run(10);
    const m = collectDcaReportArgs({ well: w, stream: 'oil', generatedAt: AT });
    expect(missingInputRows(engineInputsOf(w, 'oil'), m.inputs)).toEqual([]);
    expect(missingInputRows(engineInputsOf(w, 'oil'), m.inputs.filter((r) => r.key !== 'downtime'))).toEqual(['forecast.config.downtimePct']);
    expect(m.inputs.find((r) => r.key === 'downtime').value).toBe('10.0% of calendar time (uptime 90.0%)');
    expect(m.eurRows[1][3]).toMatch(/times the uptime \(90\.0%\)/);
    expect(m.assumptions.join(' ')).toMatch(/history's own downtime is already in them/);
  });

  it('the contract carries it; the hub reproduces it day for day; EPE volumes carry it', () => {
    const w = run(10);
    const fc = fcOf(w);
    const k = buildDcaForecastContract({ projectId: 'p1', projectName: 'Gate', payload: { payloadVersion: 2, wells: { s1: w } }, wellId: 's1', stream: 'oil', build: 'test' }).contract;
    expect(k.forecast.downtimePct).toBe(10);
    const made = caseFromDcaContract(k, { id: 'k1', receivedAt: AT.toISOString() });
    expect(made.case.downtimePct).toBe(10);
    const hub = runCase(made.case);
    expect(hub.rates.length).toBe(fc.rates.length);
    expect(Math.abs(hub.cumHorizon - fc.remaining) / fc.remaining).toBeLessThan(1e-8);
    const noDowntime = runCase({ ...made.case, downtimePct: null });
    expect(noDowntime.cumHorizon / hub.cumHorizon).toBeCloseTo(1 / 0.9, 6);
    expect(editedAfterHandoff({ ...made.case, downtimePct: null })).toEqual(['downtime']);
    const rows = volumeRowsOf(epeRowsFromContract(k));
    expect(Math.abs(rows.reduce((t, r) => t + r.oil_bbl, 0) - fc.remaining)).toBeLessThan(rows.length);
  });
});
