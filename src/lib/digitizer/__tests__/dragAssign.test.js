// MAP-U2-006: drag across contours to assign values with an increment.
import { assignValuesByDrag, crossingsAlong, describeDragAssign } from '../dragAssign';

const square = (id, r) => ({ id, value: null, points: [[100 - r, 100 - r], [100 + r, 100 - r], [100 + r, 100 + r], [100 - r, 100 + r], [100 - r, 100 - r]] });
const lines = [square('outer', 60), square('inner', 20), square('mid', 40)];

test('a drag from the crest outwards values each ring in crossing order', () => {
  const r = assignValuesByDrag(lines, [[100, 100], [130, 100], [190, 100]], { start: -1500, increment: -10 });
  expect(r.order).toEqual(['inner', 'mid', 'outer']);
  expect(r.values.get('inner')).toBe(-1500);
  expect(r.values.get('mid')).toBe(-1510);
  expect(r.values.get('outer')).toBe(-1520);
  expect(r.crossedAgain).toEqual([]);
  // negative control: the same drag the other way round reverses the values
  const back = assignValuesByDrag(lines, [[190, 100], [100, 100]], { start: -1500, increment: -10 });
  expect(back.values.get('outer')).toBe(-1500);
  expect(back.values.get('inner')).toBe(-1520);
});

test('a drag right through the dome crosses rings twice: first crossing wins, and it is said', () => {
  const r = assignValuesByDrag(lines, [[10, 100], [190, 100]], { start: -1520, increment: 10 });
  expect(r.order).toEqual(['outer', 'mid', 'inner']);
  expect(r.crossedAgain.sort()).toEqual(['inner', 'mid', 'outer']);
  expect(describeDragAssign(r, { start: -1520, increment: 10 })).toMatch(/crossed twice .* first crossing/);
});

test('untouched lines keep their values; replaced typed values are counted; hostile input refuses', () => {
  const typed = [{ ...square('a', 20), value: -1400 }, { ...square('far', 5), points: square('far', 5).points.map(([x, y]) => [x + 500, y]), value: -1333 }];
  const r = assignValuesByDrag(typed, [[100, 100], [200, 100]], { start: -1500, increment: -10 });
  expect(r.values.has('far')).toBe(false);
  expect(r.overwritten).toBe(1);
  expect(describeDragAssign(r, { start: -1500, increment: -10 })).toMatch(/1 typed value was replaced/);
  expect(() => assignValuesByDrag(lines, [[0, 0], [1, 1]], { start: 0, increment: 5 })).toThrow(/crossed no contour/);
  expect(() => assignValuesByDrag(lines, [[0, 0]], { start: 0, increment: 5 })).toThrow(/Drag across/);
  expect(() => assignValuesByDrag(lines, [[0, 0], [1, 1]], { start: NaN, increment: 5 })).toThrow(/first contour/);
  expect(() => assignValuesByDrag(lines, [[0, 0], [1, 1]], { start: 0, increment: 0 })).toThrow(/increment/);
  expect(crossingsAlong([[0, 0], [10, 0]], [[5, -1], [5, 1]])).toEqual([5]);
});

test('closed contours (last vertex on the first) grid; before the fix the duplicates made the spline singular', () => {
  // eslint-disable-next-line global-require
  const { planDigitizedSurface } = require('../contoursToSurface');
  // eslint-disable-next-line global-require
  const { gridSurface } = require('@/lib/gridding/gridding');
  // eslint-disable-next-line global-require
  const { specForPoints } = require('@/pages/apps/MappingSurfaceStudio/engine/surface');
  // eslint-disable-next-line global-require
  const { contourControlPoints } = require('../contoursToSurface');
  const ring = (R, v) => ({ id: `r${R}`, value: v, points: Array.from({ length: 49 }, (_, k) => [200 + R * Math.cos((k / 48) * 2 * Math.PI), 200 + R * Math.sin((k / 48) * 2 * Math.PI)]) });
  const layers = { contours: [ring(60, 1500), ring(110, 1550), ring(160, 1600)], faults: [] };
  const p2w = (x, y) => [500000 + 10 * x, 6700000 - 10 * y];
  const plan = planDigitizedSurface(layers, p2w, { valuesAre: 'depth', cellSize: 100 });
  expect(plan.mergedPoints).toBe(3);
  expect(plan.stats.max).toBeLessThan(-1450);
  // negative control: the raw control points (with the closing duplicates) are singular
  const raw = contourControlPoints(layers, p2w).points;
  expect(() => gridSurface(raw, specForPoints(raw, 100), { maxExtrapolation: 200 })).toThrow(/singular/);
});
