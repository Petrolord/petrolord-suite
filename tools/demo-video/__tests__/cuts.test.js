import { normaliseCuts, cutTime, cutFilter, cutTotal, mapTime, normaliseRamps, rampFilter, rampWindows, planRamps } from '../lib/cuts.mjs';

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

test('a ramp at speed 4 keeps a quarter of its stretch; cuts inside it are not counted twice', () => {
  const ramps = [{ from: 10, to: 30, speed: 4 }];
  expect(mapTime(10, [], ramps)).toBe(10);
  expect(mapTime(30, [], ramps)).toBe(15);
  expect(mapTime(40, [], ramps)).toBe(25);
  const cuts = [{ from: 20, to: 24 }];
  expect(normaliseRamps(ramps, cuts)).toEqual([{ from: 10, to: 20, speed: 4 }, { from: 24, to: 30, speed: 4 }]);
  expect(mapTime(22, cuts, ramps)).toBeCloseTo(12.5);
  expect(mapTime(40, cuts, ramps)).toBeCloseTo(40 - 4 - 16 * 0.75);
  expect(mapTime(50, [{ from: 30, to: 90 }], [])).toBe(cutTime(50, [{ from: 30, to: 90 }]));
});

test('the ramp filter retimes frames and the badge windows sit on the finished clock', () => {
  expect(rampFilter([{ from: 1, to: 2.5 }], [])).toBe(cutFilter([{ from: 1, to: 2.5 }]));
  const f = rampFilter([{ from: 1, to: 2 }], [{ from: 5, to: 9, speed: 2 }]);
  expect(f).toBe(",select='not(between(t,1.000,2.000))',setpts='(T-clip(T-1.000,0,1.000)*1-clip(T-5.000,0,4.000)*0.50000)/TB',fps=30");
  expect(rampWindows([{ from: 1, to: 2 }], [{ from: 5, to: 9, speed: 2 }])).toEqual([{ from: 4, to: 6, speed: 2 }]);
});

test('planRamps compresses the silent tail after the narration, up to the wait cut', () => {
  const sb = { steps: [{ id: 'a' }, { id: 'b', ramp: false }, { id: 'c', rampMax: 4 }, { id: 'd' }] };
  const clips = [{ duration: 5 }, { duration: 2 }, { duration: 2 }, { duration: 9 }];
  const rec = {
    timeline: [{ start: 0, sayAt: 0.25, end: 30 }, { start: 30, sayAt: 30.25, end: 50 }, { start: 50, sayAt: 50.25, end: 90 }, { start: 90, sayAt: 90.25, end: 100 }],
    cuts: [{ from: 70, to: 85 }],
  };
  const r = planRamps(sb, clips, rec, { min: 3, max: 8, base: 2, div: 4, keepAfter: 1, keepBefore: 0.8 });
  expect(r.map((x) => x.step)).toEqual(['a', 'c']);
  expect(r[0].from).toBeCloseTo(6.65); expect(r[0].to).toBeCloseTo(29.2);
  expect((r[0].to - r[0].from) / r[0].speed).toBeCloseTo(7.1375);
  expect(r[1].to).toBeCloseTo(69.2);
  expect((r[1].to - r[1].from) / r[1].speed).toBeCloseTo(4);
  const cut = planRamps(sb, clips, rec, { min: 3, max: 0, keepAfter: 1, keepBefore: 0.8 });
  expect(cut[0].speed).toBe(Infinity);
  expect(cut[1].speed).not.toBe(Infinity); // rampMax keeps seismic views as a time-lapse
});
