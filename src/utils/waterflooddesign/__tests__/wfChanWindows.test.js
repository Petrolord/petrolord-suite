/**
 * WF-U2-006: Chan late-time windows. Gates go through the engine
 * (analyzeWaterflood's computeChanDiagnostics, then its olsLine and
 * classifyChan). Known case: a producer with WOR = 0.01 t^2 to day 85, then
 * WOR growing as t^0.5 from there (Chan 1995: WOR' log-log slope m - 1, so
 * +1 channeling-like, then -0.5 coning-like). The engine window (last 40
 * percent) is reproduced to 1e-12 and now carries its interval; a window
 * chosen on the late segment reads about -0.5 and "coning". Negative
 * control: the engine window straddles the change and reads another slope.
 */
import { analyzeWaterflood } from '@/utils/waterfloodCalculations';
import { applyChanWindows, engineChanWindow, chanChoiceProblems, chanWindowText } from '../chanWindows';
import { reviewerPayload, reportOf } from '@/components/waterflooddesign/__tests__/wfTestKit';

const rows = [];
const T1 = 85;
const W1 = 0.01 * T1 ** 2;
for (let i = 0; i < 120; i += 1) {
  const t = i + 1;
  const wor = t <= T1 ? 0.01 * t ** 2 : W1 * Math.sqrt(t / T1);
  const date = new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
  rows.push({ date, well: 'P-1', oil_bbl: 1000, water_bbl: 1000 * wor });
  rows.push({ date, well: 'I-1', inj_bbl: 3000 });
}
const engine = analyzeWaterflood(rows, { bo: 1, bw: 1, time_weighting: 'calendar' });
const p1 = () => engine.chan.producers.find((p) => p.producer === 'P-1');

describe('Chan windows', () => {
  it('the engine window is reproduced to 1e-12 and gains its interval', () => {
    const w = engineChanWindow(p1().points);
    expect(w.slope).toBeCloseTo(p1().lateSlope, 12);
    expect(w.ci95[0]).toBeLessThan(w.slope);
    expect(w.ci95[1]).toBeGreaterThan(w.slope);
    const r = applyChanWindows(engine, {});
    expect(r.chan.producers.find((p) => p.producer === 'P-1').window.slope).toBeCloseTo(p1().lateSlope, 12);
  });

  it('a window chosen on the late segment reads about -0.5 and coning; the reason is kept', () => {
    const r = applyChanWindows(engine, { 'P-1': { from: 92, to: 118, reason: 'After the water shut-off', setAt: '2026-10-04T09:00:00Z' } });
    const s = r.chan.producers.find((p) => p.producer === 'P-1');
    expect(s.window.slope).toBeGreaterThan(-0.6);
    expect(s.window.slope).toBeLessThan(-0.4);
    expect(s.classification.code).toBe('coning');
    expect(s.lateSlope).toBe(s.window.slope);
    expect(chanWindowText(s.window)).toBe('day 92 to 118, chosen: After the water shut-off');
    // the early segment reads about +1, channeling
    const e = applyChanWindows(engine, { 'P-1': { from: 10, to: 80, reason: 'early' } }).chan.producers.find((p) => p.producer === 'P-1');
    expect(e.window.slope).toBeGreaterThan(0.9);
    expect(e.window.slope).toBeLessThan(1.1);
    expect(e.classification.code).toBe('channeling');
  });

  it('negative control: the engine window straddles the change', () => {
    expect(Math.abs(p1().lateSlope - -0.5)).toBeGreaterThan(0.05);
  });

  it('refuses a window it cannot fit, by name', () => {
    expect(chanChoiceProblems(p1(), { from: 92, to: 118, reason: '' })).toEqual(['Give the reason for the window: it is printed with it.']);
    expect(chanChoiceProblems(p1(), { from: 90, to: 80, reason: 'r' })).toEqual(['The window ends before it starts.']);
    expect(chanChoiceProblems(p1(), { from: 500, to: 600, reason: 'r' })[0]).toMatch(/holds 0 points/);
  });
});

describe('the report shows the Chan windows and plots', () => {
  it('a table row per series and a log-log figure per series', () => {
    const r = reportOf(reviewerPayload());
    expect(r.model.chan.rows.length).toBeGreaterThan(0);
    expect(r.model.chan.rows[0][1]).toMatch(/^the last 40 percent of the points/);
    const figs = r.figures.filter((f) => f.id.startsWith('chan-'));
    expect(figs.length).toBe(r.model.chan.rows.length);
    expect(figs[0].panels[0].spec.xLog).toBe(true);
  });
});
