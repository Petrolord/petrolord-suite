import { validateZoneWindow, planZoneFromTops, planZonesBetweenConsecutiveTops, defaultZoneNameAt } from '../services/zonePlanner';

const tops = [
  { id: 't1', name: 'Top Sand A', md_m: 2010 },
  { id: 't2', name: 'Top Shale', md_m: 2030 },
  { id: 't3', name: 'Top Sand B', md_m: 2050 },
];

test('validateZoneWindow messages mention base below top and the unit', () => {
  expect(validateZoneWindow(2010, 2030)).toBeNull();
  expect(validateZoneWindow(2030, 2010)).toMatch(/base below top \(m MD\)/);
  expect(validateZoneWindow(NaN, 2010, 'ft')).toMatch(/base below top \(ft MD\)/);
});

test('planZoneFromTops orders the pair and names after the upper top', () => {
  expect(planZoneFromTops(tops[2], tops[0])).toEqual({ name: 'Top Sand A', topMdM: 2010, baseMdM: 2050 });
  expect(planZoneFromTops(tops[0], tops[1], ' Reservoir ')).toEqual({ name: 'Reservoir', topMdM: 2010, baseMdM: 2030 });
  expect(() => planZoneFromTops(tops[0], tops[0])).toThrow(/two different tops/);
});

test('planZonesBetweenConsecutiveTops skips existing names and zero spans; includeToTd appends the last', () => {
  const r = planZonesBetweenConsecutiveTops(tops, { existingZones: [{ name: 'top sand a' }] });
  expect(r.zones).toEqual([{ name: 'Top Shale', topMdM: 2030, baseMdM: 2050 }]);
  expect(r.skipped).toEqual([{ name: 'Top Sand A', reason: 'zone exists' }]);
  const dup = planZonesBetweenConsecutiveTops([...tops, { id: 't4', name: 'Dup', md_m: 2050 }]);
  expect(dup.skipped.some((s) => s.reason === 'zero span')).toBe(true);
  const td = planZonesBetweenConsecutiveTops(tops, { tdM: 2100, includeToTd: true });
  expect(td.zones[td.zones.length - 1]).toEqual({ name: 'Top Sand B', topMdM: 2050, baseMdM: 2100 });
});

test('defaultZoneNameAt takes the nearest top above, else a counter', () => {
  expect(defaultZoneNameAt(2040, tops, [])).toBe('Top Shale');
  expect(defaultZoneNameAt(2005, tops, [{}, {}])).toBe('Zone 3');
});
