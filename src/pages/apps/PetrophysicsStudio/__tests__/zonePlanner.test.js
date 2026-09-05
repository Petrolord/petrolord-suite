import {
  validateZoneWindow, planZoneFromTops, planZonesBetweenConsecutiveTops, defaultZoneNameAt,
  planZonesAfterTopMove,
} from '../services/zonePlanner';

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
  expect(planZoneFromTops(tops[2], tops[0])).toEqual({ name: 'Top Sand A', topMdM: 2010, baseMdM: 2050, fromTops: { top: 't1', base: 't3' } });
  expect(planZoneFromTops(tops[0], tops[1], ' Reservoir ')).toEqual({ name: 'Reservoir', topMdM: 2010, baseMdM: 2030, fromTops: { top: 't1', base: 't2' } });
  expect(() => planZoneFromTops(tops[0], tops[0])).toThrow(/two different tops/);
});

test('planZonesBetweenConsecutiveTops skips existing names and zero spans; includeToTd appends the last', () => {
  const r = planZonesBetweenConsecutiveTops(tops, { existingZones: [{ name: 'top sand a' }] });
  expect(r.zones).toEqual([{ name: 'Top Shale', topMdM: 2030, baseMdM: 2050, fromTops: { top: 't2', base: 't3' } }]);
  expect(r.skipped).toEqual([{ name: 'Top Sand A', reason: 'zone exists' }]);
  const dup = planZonesBetweenConsecutiveTops([...tops, { id: 't4', name: 'Dup', md_m: 2050 }]);
  expect(dup.skipped.some((s) => s.reason === 'zero span')).toBe(true);
  const td = planZonesBetweenConsecutiveTops(tops, { tdM: 2100, includeToTd: true });
  expect(td.zones[td.zones.length - 1]).toEqual({ name: 'Top Sand B', topMdM: 2050, baseMdM: 2100, fromTops: { top: 't3', base: null } });
});

test('defaultZoneNameAt takes the nearest top above, else a counter', () => {
  expect(defaultZoneNameAt(2040, tops, [])).toBe('Top Shale');
  expect(defaultZoneNameAt(2005, tops, [{}, {}])).toBe('Zone 3');
});

// ---- PT8: zones follow the top they were cut from (2026-09-05) -------------

const linked = (id, name, top, base, fromTops) => ({ id, name, top_md_m: top, base_md_m: base, properties: fromTops ? { from_tops: fromTops } : {} });

test('planZonesAfterTopMove moves a linked edge exactly, whatever its depth', () => {
  const zones = [
    linked('z1', 'Sand A', 2010, 2030, { top: 't1', base: 't2' }),
    linked('z2', 'Shale', 2030, 2050, { top: 't2', base: 't3' }),
  ];
  // Top Shale 2030 -> 2036 is z1's base AND z2's top
  const { moves, blocked } = planZonesAfterTopMove(zones, { id: 't2', fromMdM: 2030, toMdM: 2036 });
  expect(blocked).toEqual([]);
  expect(moves).toHaveLength(2);
  expect(moves.find((m) => m.zone.id === 'z1')).toMatchObject({ edge: 'base', by: 'link', patch: { base_md_m: 2036 } });
  expect(moves.find((m) => m.zone.id === 'z2')).toMatchObject({ edge: 'top', by: 'link', patch: { top_md_m: 2036 } });
});

test('a linked zone that does not name the moved top stays put even when its edge coincides', () => {
  // z3 was cut from t1/t3 and happens to have an edge exactly at t2's depth
  const zones = [linked('z3', 'Other', 2030, 2050, { top: 't1', base: 't3' })];
  const { moves } = planZonesAfterTopMove(zones, { id: 't2', fromMdM: 2030, toMdM: 2036 });
  expect(moves).toEqual([]);
});

test('a zone with no provenance follows by depth coincidence, within the drag rounding', () => {
  const zones = [
    linked('z4', 'Legacy', 2030, 2050, null),
    linked('z5', 'Elsewhere', 2044, 2060, null),
  ];
  const { moves } = planZonesAfterTopMove(zones, { id: 't2', fromMdM: 2030, toMdM: 2036 });
  expect(moves).toHaveLength(1);
  expect(moves[0]).toMatchObject({ edge: 'top', by: 'depth', patch: { top_md_m: 2036 } });
  // a drag commits to 2 dp, so a hundredth of a metre still counts as the same edge
  expect(planZonesAfterTopMove([linked('z6', 'Rounded', 2030.01, 2050, null)], { id: 't2', fromMdM: 2030, toMdM: 2036 }).moves).toHaveLength(1);
  expect(planZonesAfterTopMove([linked('z7', 'Apart', 2030.5, 2050, null)], { id: 't2', fromMdM: 2030, toMdM: 2036 }).moves).toHaveLength(0);
});

test('a move that would invert a zone is blocked, not applied, and the rest still move', () => {
  const zones = [
    linked('z8', 'Thin', 2030, 2032, { top: 't2', base: 't9' }),
    linked('z9', 'Above', 2000, 2030, { top: 't0', base: 't2' }),
  ];
  // dragging Top Shale below z8's base would put its top under its base
  const { moves, blocked } = planZonesAfterTopMove(zones, { id: 't2', fromMdM: 2030, toMdM: 2040 });
  expect(blocked).toHaveLength(1);
  expect(blocked[0]).toMatchObject({ zone: { id: 'z8' }, edge: 'top' });
  expect(moves).toHaveLength(1);
  expect(moves[0]).toMatchObject({ zone: { id: 'z9' }, patch: { base_md_m: 2040 } });
});

test('a non-finite move plans nothing', () => {
  const zones = [linked('z1', 'Sand A', 2010, 2030, { top: 't1', base: 't2' })];
  expect(planZonesAfterTopMove(zones, { id: 't1', fromMdM: 2010, toMdM: NaN }).moves).toEqual([]);
  expect(planZonesAfterTopMove([], { id: 't1', fromMdM: 2010, toMdM: 2020 })).toEqual({ moves: [], blocked: [] });
});
