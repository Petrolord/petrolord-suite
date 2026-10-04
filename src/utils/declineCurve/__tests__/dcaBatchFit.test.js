/**
 * DCA U2-005: batch fit across wells. The gate holds every batch result
 * against the single-well path run by hand on the same window (fitWell and
 * forecastWell, identical to the last digit), checks the window rule, keeps
 * each well's own settings, and reports a well that cannot be fitted without
 * touching it. Negative control: the "last N months" rule on a well with a
 * change of decline fits a different curve from the whole history.
 */
import { sampleWell } from '@/utils/declineCurve/sampleWell';
import { fitWell, forecastWell, withStreamResults } from '@/utils/declineCurve/dcaAnalysis';
import { analysisOf } from '@/utils/declineCurve/dcaModel';
import { batchFitWells, ruleWindow } from '@/utils/declineCurve/batchFit';
import { calculateArpsHyperbolic } from '@/utils/declineCurve/dcaEngine';

const AT = new Date('2026-10-03T12:00:00Z');
const DAY = 86400000;
const twoRegimes = () => {
  // 24 months of a steep decline, then 24 months of a shallow one
  const t0 = Date.UTC(2020, 0, 1);
  const data = Array.from({ length: 48 }, (_, i) => {
    const t = Date.UTC(2020, i, 1);
    const days = (t - t0) / DAY;
    const q = i < 24 ? 500 * Math.exp(-0.002 * days) : 500 * Math.exp(-0.002 * 731) * Math.exp(-0.0004 * (days - 731));
    return { date: new Date(t).toISOString().slice(0, 10), oilRate: q, rate: q };
  });
  return { id: 'two', name: 'TWO-1', data, analysis: { streams: { oil: { forecastConfig: { economicLimit: 5, stopAtLimit: true, durationDays: 7305 } } } } };
};
const hyp = () => {
  const t0 = Date.UTC(2021, 0, 1);
  const data = Array.from({ length: 30 }, (_, i) => {
    const t = Date.UTC(2021, i, 1);
    const q = calculateArpsHyperbolic(600, 0.003, 0.7, (t - t0) / DAY);
    return { date: new Date(t).toISOString().slice(0, 10), oilRate: q, rate: q };
  });
  return { id: 'hyp', name: 'HYP-7', data, analysis: { streams: { oil: { modelType: 'Hyperbolic', constraints: { minB: 0, maxB: 1 } } } } };
};
const wells = () => ({ s1: { ...sampleWell('p'), id: 's1' }, two: twoRegimes(), hyp: hyp(), dry: { id: 'dry', name: 'DRY-1', data: [{ date: '2021-01-01', gasRate: 100 }] } });

describe('batch fit across wells', () => {
  it('each well equals its own single-well fit and forecast on the rule window', () => {
    const res = batchFitWells(wells(), 'oil', { rule: 'last', months: 12, now: AT });
    for (const id of ['s1', 'two', 'hyp']) {
      const w0 = wells()[id];
      const win = ruleWindow(w0, 'oil', { rule: 'last', months: 12 });
      let byHand = { ...w0, analysis: { ...analysisOf(w0), fitWindow: win } };
      const f = fitWell(byHand, 'oil', { now: AT });
      byHand = withStreamResults(byHand, 'oil', { fitResults: f.fit });
      const fc = forecastWell(byHand, 'oil', { now: AT });
      const got = analysisOf(res.wells[id]).streams.oil;
      expect(got.fitResults).toEqual(f.fit);
      expect(got.forecastResults.eurTotal).toBe(fc.eurTotal);
      expect(analysisOf(res.wells[id]).fitWindow).toEqual(win);
      const row = res.rows.find((r) => r.wellId === id);
      expect(row.ok).toBe(true);
      expect(row.eur).toBe(fc.eurTotal);
    }
  });

  it('the rule windows: whole history, and the last N months', () => {
    expect(ruleWindow(twoRegimes(), 'oil', { rule: 'whole' })).toEqual({ startDate: '2020-01-01', endDate: '2023-12-01' });
    expect(ruleWindow(twoRegimes(), 'oil', { rule: 'last', months: 12 })).toEqual({ startDate: '2022-12-01', endDate: '2023-12-01' });
    // shorter than N: the whole history
    expect(ruleWindow(hyp(), 'oil', { rule: 'last', months: 60 }).startDate).toBe('2021-01-01');
  });

  it('a well keeps its own model choice and b limits; one that cannot be fitted is reported and untouched', () => {
    const res = batchFitWells(wells(), 'oil', { rule: 'whole', now: AT });
    expect(analysisOf(res.wells.hyp).streams.oil.fitResults.modelType).toBe('Hyperbolic');
    expect(analysisOf(res.wells.hyp).streams.oil.fitResults.b).toBeCloseTo(0.7, 9);
    const dry = res.rows.find((r) => r.wellId === 'dry');
    expect(dry.ok).toBe(false);
    expect(dry.reason).toBe('No oil rates.');
    expect(analysisOf(res.wells.dry).streams.oil.fitResults).toBeNull();
  });

  it('negative control: the last 24 months see the shallow decline; the whole history does not', () => {
    const last = batchFitWells({ two: twoRegimes() }, 'oil', { rule: 'last', months: 23, now: AT }).rows[0];
    const whole = batchFitWells({ two: twoRegimes() }, 'oil', { rule: 'whole', now: AT }).rows[0];
    expect(last.diPctYr).toBeCloseTo(0.0004 * 365.25 * 100, 6);
    expect(Math.abs(whole.diPctYr - last.diPctYr)).toBeGreaterThan(5);
  });
});
