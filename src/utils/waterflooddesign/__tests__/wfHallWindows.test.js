/**
 * WF-U2-003: Hall plot windows chosen by the user. Gates go through the
 * engine (analyzeWaterflood, then its olsLine through applyHallWindows) on a
 * known case: 1,000 bbl/d at 2,000 psi for 8 days, then 3,000 psi (Hall
 * 1963: the slope is p/q, 2 then 3 psi.d/bbl). The engine's first third
 * straddles the change; the chosen windows recover 2 and 3 exactly.
 * Negative control: the thirds miss the baseline slope.
 */
import { analyzeWaterflood } from '@/utils/waterfloodCalculations';
import { applyHallWindows, hallChoiceProblems, indexRangeByDates, hallChoiceText } from '../hallWindows';
import { hallWindowLines } from '@/components/waterflood/hallLines';
import { reviewerPayload, reportOf } from '@/components/waterflooddesign/__tests__/wfTestKit';

const rows = [];
for (let i = 0; i < 30; i += 1) {
  const date = new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
  rows.push({ date, well: 'INJ', inj_bbl: 1000, whp_psi: i < 8 ? 2000 : 3000 });
  rows.push({ date, well: 'PROD', oil_bbl: 500, water_bbl: 400 });
}
const engine = analyzeWaterflood(rows, { bo: 1, bw: 1 });
const CHOICE = { baseline: { from: '2024-01-01', to: '2024-01-08' }, recent: { from: '2024-01-10', to: '2024-01-30' }, reason: 'Before and after the choke change of 2024-01-09', setAt: '2026-10-04T09:00:00Z' };

describe('Hall windows chosen by date', () => {
  it('negative control: the engine thirds straddle the change and miss the baseline slope', () => {
    const h = engine.hall_plots[0];
    expect(Math.abs(h.windows.baseline.slope - 2)).toBeGreaterThan(0.1);
  });

  it('the chosen windows refit through the engine line: slopes 2 and 3 exactly, ratio 1.5, the alert decided again', () => {
    const r = applyHallWindows(engine, { INJ: CHOICE });
    const h = r.hall_plots[0];
    expect(h.windows.baseline.slope).toBeCloseTo(2, 10);
    expect(h.windows.recent.slope).toBeCloseTo(3, 10);
    expect(h.windows.baseline.r2).toBeCloseTo(1, 10);
    expect([h.windows.baseline.lo, h.windows.baseline.hi]).toEqual([0, 8]);
    expect(h.slope_ratio).toBeCloseTo(1.5, 10);
    expect(h.windowChoice).toEqual({ reason: CHOICE.reason, setAt: CHOICE.setAt, applied: true, problems: [] });
    expect(r.alerts.injectivity_issue.map((a) => a.message)).toEqual(['Injector INJ: Hall slope up 1.50× vs baseline, declining injectivity (rising skin / near-well plugging).']);
    const lines = hallWindowLines(h);
    expect(lines.map((l) => l.label)).toEqual(['Baseline window (chosen 2024-01-01 to 2024-01-08)', 'Recent window (chosen 2024-01-10 to 2024-01-30)']);
    expect(hallChoiceText(h)).toBe('Windows chosen 2026-10-04: Before and after the choke change of 2024-01-09');
    // the engine result is not mutated
    expect(engine.hall_plots[0].windowChoice).toBeUndefined();
  });

  it('one window chosen keeps the other third', () => {
    const r = applyHallWindows(engine, { INJ: { baseline: CHOICE.baseline, reason: 'x' } });
    expect(r.hall_plots[0].windows.recent).toEqual(engine.hall_plots[0].windows.recent);
  });

  it('refuses a choice it cannot fit, by name, and leaves the thirds', () => {
    const p = engine.hall_plots[0];
    expect(hallChoiceProblems(p, { ...CHOICE, reason: ' ' })).toEqual(['Give the reason for the windows: it is printed with them.']);
    expect(hallChoiceProblems(p, { baseline: { from: '2024-01-01', to: '2024-01-02' }, reason: 'r' })).toEqual(['The baseline window holds 2 points; at least 3 are needed for a slope with an interval.']);
    expect(hallChoiceProblems(p, { recent: { from: '2024-01-20', to: '2024-01-10' }, reason: 'r' })).toEqual(['The recent window ends before it starts.']);
    const r = applyHallWindows(engine, { INJ: { ...CHOICE, reason: '' } });
    expect(r.hall_plots[0].windows).toEqual(engine.hall_plots[0].windows);
    expect(r.hall_plots[0].windowChoice.applied).toBe(false);
    expect(indexRangeByDates(p.dates, '2025-01-01', '2025-02-01')).toBeNull();
  });
});

describe('the report shows the chosen windows', () => {
  it('rows named as chosen, with the reason; the default report is unchanged in words', () => {
    const p = reviewerPayload();
    const plain = reportOf(p).model.hall.rows;
    expect(plain.some((r) => r[1] === 'Why these windows')).toBe(false);
    const inj = reportOf(p).state.surveillanceResult.hall_plots[0];
    const d = inj.dates;
    p.hallWindows = { [inj.injector]: { baseline: { from: d[0], to: d[20] }, recent: { from: d[60], to: d[d.length - 1] }, reason: 'Reviewer windows', setAt: '2026-10-04T09:00:00Z' } };
    const r = reportOf(p);
    const rows = r.model.hall.rows.filter((x) => x[0] === inj.injector);
    expect(rows[0][1]).toBe('Baseline (chosen)');
    expect(rows[0][2]).toBe(`${d[0]} to ${d[20]}`);
    expect(rows[0][3]).toBe('21');
    expect(rows.find((x) => x[1] === 'Why these windows')[4]).toBe('Windows chosen 2026-10-04: Reviewer windows');
    const fig = r.figures?.find?.((f) => f.id === `hall-${inj.injector}`);
    if (fig) expect(fig.caption).toMatch(/Baseline window \(chosen/);
  });
});
