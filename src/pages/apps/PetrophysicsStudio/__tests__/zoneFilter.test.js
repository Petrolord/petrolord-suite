// PT8 (2026-09-05): the Pickett plot's zone filter. Pure, so the rules a
// tester would otherwise have to click through — what "all zones" means,
// when points take zone colours, how overlaps resolve — are pinned here.
import { planZoneFilter, ZONE_COLORS } from '../services/zoneFilter';

const zones = [
  { id: 'z2', name: 'SAND B', top_md_m: 2050, base_md_m: 2080 },
  { id: 'z1', name: 'SAND A', top_md_m: 2010, base_md_m: 2030 },
];

test('no selection means all zones and no filtering at all', () => {
  for (const ids of [null, undefined, []]) {
    const f = planZoneFilter(zones, ids);
    expect(f.filtering).toBe(false);
    expect(f.colouring).toBe(false);
    expect(f.label).toBe('all zones');
    expect(f.legend).toEqual([]);
    // a depth in no zone at all still plots — this is the default view
    expect(f.inFilter(2040)).toBe(true);
    expect(f.inFilter(2020)).toBe(true);
    expect(f.colorOf(2020)).toBeNull();
  }
  // the resolved list is sorted shallowest first whatever order it came in
  expect(planZoneFilter(zones, []).selected.map((z) => z.id)).toEqual(['z1', 'z2']);
});

test('one zone filters to its interval and does not colour by zone', () => {
  const f = planZoneFilter(zones, ['z1']);
  expect(f.filtering).toBe(true);
  expect(f.colouring).toBe(false);
  expect(f.label).toBe('SAND A');
  expect(f.legend).toEqual([]);
  expect(f.inFilter(2010)).toBe(true);   // inclusive at both edges
  expect(f.inFilter(2030)).toBe(true);
  expect(f.inFilter(2030.5)).toBe(false);
  expect(f.inFilter(2060)).toBe(false);  // inside the OTHER zone
  expect(f.colorOf(2020)).toBeNull();    // one zone needs no colour key
});

test('two or more zones filter and colour, with a legend in the same order', () => {
  const f = planZoneFilter(zones, ['z1', 'z2']);
  expect(f.filtering).toBe(true);
  expect(f.colouring).toBe(true);
  expect(f.label).toBe('SAND A, SAND B');
  expect(f.legend).toEqual([
    { name: 'SAND A', color: ZONE_COLORS[0] },
    { name: 'SAND B', color: ZONE_COLORS[1] },
  ]);
  expect(f.colorOf(2020)).toBe(ZONE_COLORS[0]);
  expect(f.colorOf(2060)).toBe(ZONE_COLORS[1]);
  expect(f.colorOf(2040)).toBeNull();    // between the two zones
  expect(f.inFilter(2040)).toBe(false);
});

test('overlapping zones resolve first-by-top, as the zoned pipeline does', () => {
  const overlapping = [
    { id: 'a', name: 'UPPER', top_md_m: 2000, base_md_m: 2060 },
    { id: 'b', name: 'LOWER', top_md_m: 2040, base_md_m: 2100 },
  ];
  const f = planZoneFilter(overlapping, ['a', 'b']);
  expect(f.zoneAt(2050).id).toBe('a');   // in both; the shallower wins
  expect(f.colorOf(2050)).toBe(ZONE_COLORS[0]);
  expect(f.zoneAt(2070).id).toBe('b');
});

test('a stale id from a deleted zone falls back to no filter, never a blank plot', () => {
  const f = planZoneFilter(zones, ['gone']);
  expect(f.filtering).toBe(false);
  expect(f.selected).toHaveLength(2);
  expect(f.inFilter(2040)).toBe(true);
  // a live id alongside a dead one still filters, on the live one
  const mixed = planZoneFilter(zones, ['gone', 'z2']);
  expect(mixed.filtering).toBe(true);
  expect(mixed.colouring).toBe(false);
  expect(mixed.label).toBe('SAND B');
});

test('zones with unusable depths are dropped rather than swallowing samples', () => {
  const f = planZoneFilter([...zones, { id: 'z3', name: 'BAD', top_md_m: null, base_md_m: 2200 }], []);
  expect(f.selected.map((z) => z.id)).toEqual(['z1', 'z2']);
  expect(planZoneFilter([], []).filtering).toBe(false);
  expect(planZoneFilter(zones, ['z1']).zoneAt(NaN)).toBeNull();
});
