/**
 * A level plot shows a level line as level.
 *
 * On a closed tank the Campbell points sit within a few barrels of one
 * another (Ekene: 12.1395 to 12.1396 MMSTB). On their own range the axis
 * spread them over the full height, every tick read "12.14" and a flat line
 * looked like scatter. The axis now always spans LEVEL_BAND either side of
 * the run's level. Gates read the model the screen and the report draw,
 * from a real engine run of the Ahmed 11-3 sample (no aquifer).
 */
import { buildPlotModels, levelAxis, LEVEL_BAND } from '../plotModels';
import { buildMbalSeries } from '../mbalSeries';
import { OILFIELD_UNITS } from '../mbalUnits';
import { niceTicks } from '@/lib/reportKit/plot.js';
import { runSample, SAMPLE_CASE_IDS } from './mbalTestKit';

const span = (m) => {
  const ys = [...m.series.flatMap((s) => s.pts.map((p) => p[1])), ...(m.yInclude ?? []), ...m.lines.map((l) => l.y)].filter(Number.isFinite);
  const t = niceTicks(Math.min(...ys), Math.max(...ys), 6);
  return [t[0], t[t.length - 1]];
};

test('L-1 levelAxis brackets the level by the band, and gives nothing without a level', () => {
  expect(levelAxis(100)).toEqual([100 * (1 - LEVEL_BAND), 100, 100 * (1 + LEVEL_BAND)]);
  expect(levelAxis(null)).toBeUndefined();
  expect(levelAxis(0)).toBeUndefined();
});

test('L-2 the Campbell axis of a run spans at least the band either side of its OOIP', () => {
  const s = runSample(SAMPLE_CASE_IDS.ahmed);
  const series = buildMbalSeries({ result: s.result, runConfig: s.runConfig, caseData: s.caseData });
  const m = buildPlotModels({ series, result: s.result, units: OILFIELD_UNITS }).find((x) => x.id === 'campbell');
  expect(m.applies).toBe(true);
  const level = m.lines[0].y;
  const [lo, hi] = span(m);
  expect(lo).toBeLessThanOrEqual(level * (1 - LEVEL_BAND) + 1e-9);
  expect(hi).toBeGreaterThanOrEqual(level * (1 + LEVEL_BAND) - 1e-9);
});

test('L-3 negative control: the Ekene closed tank on its points alone zooms into round-off; with the band it does not', () => {
  // F/Et of the Ekene tank history as the studio plotted it (MMSTB) and its OOIP
  const ys = [12.13947, 12.13958, 12.13959, 12.13958, 12.13958, 12.13959];
  const level = 12.13956;
  const old = niceTicks(Math.min(...ys, level), Math.max(...ys, level), 6);
  expect((old[old.length - 1] - old[0]) / level).toBeLessThan(1e-4);
  const m = { series: [{ pts: ys.map((y, i) => [i, y]) }], yInclude: levelAxis(level), lines: [{ y: level }] };
  const [lo, hi] = span(m);
  expect((hi - lo) / level).toBeGreaterThanOrEqual(2 * LEVEL_BAND - 1e-9);
});
