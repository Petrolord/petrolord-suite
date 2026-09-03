import { hitZoneEdgeAt, hitTopAt } from '../viewer/hitTest';

const yOf = (d) => (d - 2000) * 2; // 2 px per metre
const zones = [{ id: 'z1', name: 'SAND A', top_md_m: 2010, base_md_m: 2030 }];
const tops = [{ id: 't1', name: 'Top Shale', md_m: 2030 }, { id: 't2', name: 'Top Sand A', md_m: 2010 }, { id: 't3', name: 'Hidden', md_m: 2050, hidden: true }];

test('a top coincident with a zone edge is hit as the zone edge mid-plot and as the top inside the tag zone', () => {
  const y = yOf(2030);
  expect(hitZoneEdgeAt(y, zones, yOf)).toMatchObject({ edge: 'base' });
  expect(hitTopAt({ x: 200, y }, tops, yOf, { tagLeft: 500 })).toBeNull();
  expect(hitTopAt({ x: 520, y }, tops, yOf, { tagLeft: 500 })).toMatchObject({ id: 't1' });
});

test('hidden tops are not hit; the nearest top wins within tolerance', () => {
  expect(hitTopAt({ x: 520, y: yOf(2050) }, tops, yOf, { tagLeft: 500 })).toBeNull();
  expect(hitTopAt({ x: 520, y: yOf(2011) }, tops, yOf, { tagLeft: 500 })).toMatchObject({ id: 't2' });
  expect(hitTopAt({ x: 520, y: yOf(2020) }, tops, yOf, { tagLeft: 500 })).toBeNull();
  expect(hitZoneEdgeAt(yOf(2020), zones, yOf)).toBeNull();
});

test('trackGeometry splits the plot width by ratio to the right of the gutter', async () => {
  const { trackGeometry } = await import('../viewer/trackRender');
  const g = trackGeometry([{ width: 1 }, { width: 3 }], 456);
  expect(g).toEqual([{ x0: 56, w: 100 }, { x0: 156, w: 300 }]);
  expect(trackGeometry([], 400)).toEqual([]);
});
