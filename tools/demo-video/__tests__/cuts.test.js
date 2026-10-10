import { normaliseCuts, cutTime, cutFilter, cutTotal } from '../lib/cuts.mjs';

test('times after a cut move earlier by its length; inside a cut they land on the cut point', () => {
  const cuts = [{ from: 30, to: 90 }, { from: 120, to: 150 }];
  expect(cutTime(10, cuts)).toBe(10);
  expect(cutTime(30, cuts)).toBe(30);
  expect(cutTime(60, cuts)).toBe(30);
  expect(cutTime(100, cuts)).toBe(40);
  expect(cutTime(200, cuts)).toBe(110);
  expect(cutTotal(cuts)).toBe(90);
});

test('overlapping, touching, unordered and empty cuts are merged or dropped', () => {
  expect(normaliseCuts([{ from: 50, to: 60 }, { from: 10, to: 20 }, { from: 15, to: 30 }, { from: 40, to: 40 }, null]))
    .toEqual([{ from: 10, to: 30 }, { from: 50, to: 60 }]);
  expect(cutFilter([])).toBe('');
  expect(cutFilter([{ from: 1, to: 2.5 }])).toBe(",select='not(between(t,1.000,2.500))',setpts=N/FRAME_RATE/TB");
});
