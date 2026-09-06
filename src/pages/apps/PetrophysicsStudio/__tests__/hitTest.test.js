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

// ---- PT8 (2026-09-05) -------------------------------------------------------

test('hitTrackDragAt: the tag grabs its top, a zone edge wins mid-plot, the line grabs elsewhere', async () => {
  const { hitTrackDragAt } = await import('../viewer/hitTest');
  const opts = { zones, tops, yOf, tagLeft: 500 };
  // Top Shale sits exactly on SAND A's base at 2030: mid-plot the edge wins,
  // in the tag the top does — the PT3 rule, now stated in one place
  expect(hitTrackDragAt({ x: 200, y: yOf(2030) }, opts)).toMatchObject({ kind: 'zone-edge', edge: 'base' });
  expect(hitTrackDragAt({ x: 520, y: yOf(2030) }, opts)).toMatchObject({ kind: 'top', top: { id: 't1' } });
  // Top Sand A at 2010 also coincides with the zone top
  expect(hitTrackDragAt({ x: 200, y: yOf(2010) }, opts)).toMatchObject({ kind: 'zone-edge', edge: 'top' });
});

test('hitTrackDragAt: a top away from any zone edge is grabbable across the whole track', async () => {
  const { hitTrackDragAt } = await import('../viewer/hitTest');
  const lone = [{ id: 't9', name: 'Top Lone', md_m: 2070 }];
  const opts = { zones, tops: lone, yOf, tagLeft: 500 };
  // this is what PT3 could not do: mid-plot, far from the name tag
  expect(hitTrackDragAt({ x: 100, y: yOf(2070) }, opts)).toMatchObject({ kind: 'top', top: { id: 't9' } });
  expect(hitTrackDragAt({ x: 520, y: yOf(2070) }, opts)).toMatchObject({ kind: 'top', top: { id: 't9' } });
  // and empty space still grabs nothing, so panning survives
  expect(hitTrackDragAt({ x: 100, y: yOf(2060) }, opts)).toBeNull();
});

test('hitTrackDragAt: a hidden top is never grabbed, mid-plot or in the tag', async () => {
  const { hitTrackDragAt } = await import('../viewer/hitTest');
  const opts = { zones: [], tops, yOf, tagLeft: 500 };
  expect(hitTrackDragAt({ x: 100, y: yOf(2050) }, opts)).toBeNull();
  expect(hitTrackDragAt({ x: 520, y: yOf(2050) }, opts)).toBeNull();
});

test('snapToSample lands a dragged depth on the nearest logged sample', async () => {
  const { snapToSample } = await import('../viewer/depthModes');
  const depth = Float64Array.from({ length: 5 }, (_, i) => 2000 + i * 0.5); // 2000..2002
  expect(snapToSample(2000.6, depth)).toBeCloseTo(2000.5, 10);
  expect(snapToSample(2000.74, depth)).toBeCloseTo(2000.5, 10);
  expect(snapToSample(2000.76, depth)).toBeCloseTo(2001, 10);
  expect(snapToSample(2000.75, depth)).toBeCloseTo(2000.5, 10); // ties go shallow
  // outside the log clamps to its ends, and a well with no samples is a no-op
  expect(snapToSample(1990, depth)).toBeCloseTo(2000, 10);
  expect(snapToSample(2100, depth)).toBeCloseTo(2002, 10);
  expect(snapToSample(2000.6, new Float64Array(0))).toBeCloseTo(2000.6, 10);
  expect(snapToSample(NaN, depth)).toBeNaN();
});
