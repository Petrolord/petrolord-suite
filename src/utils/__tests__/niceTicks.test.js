// niceTicks (chartTheme): round axis ticks for the senior-testing chart fixes.
import { niceTicks } from '../chartTheme';

test('a distillation range from 80 to 1500 F gets round 250 F ticks, not the data ends', () => {
  const t = niceTicks(80, 1500);
  expect(t.domain).toEqual([0, 1500]);
  expect(t.ticks).toEqual([0, 250, 500, 750, 1000, 1250, 1500]);
  expect(t.ticks).not.toContain(80);
});

test('yields up to 27.8 vol% tick at 10 with about five intervals asked', () => {
  expect(niceTicks(0, 27.8, 5)).toEqual({ domain: [0, 30], ticks: [0, 10, 20, 30] });
});

test('small and awkward ranges stay round and free of float noise', () => {
  expect(niceTicks(0.12, 0.93, 4).ticks).toEqual([0, 0.25, 0.5, 0.75, 1]);
  expect(niceTicks(5, 5).domain[1]).toBeGreaterThan(5);
  expect(niceTicks(NaN, 3).ticks).toBeUndefined();
});
