/**
 * AppUpgrade WC-U2-012: a section line and corridor drawn on the map picks
 * the wells along it, in order, and a deviated well drilled towards the line
 * from outside the corridor is found through its bottom hole. Negative
 * control: on origin/main there is no section line (services/sectionLine.js).
 */
import { projectOntoLine, wellsInCorridor, lineLength } from '../services/sectionLine';
import { columnLayout } from '@/components/wells/section/sectionFrame';
import { makeDepthFrame } from '@/pages/apps/WellDataManager/engine/checkshots';

const W = (id, x, y, extra = {}) => ({ id, name: id.toUpperCase(), surface_x: x, surface_y: y, crs: 'EPSG:32631', xy_unit: 'm', ...extra });

test('projection onto a polyline: along and off distance', () => {
  const L = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }];
  expect(lineLength(L)).toBe(2000);
  expect(projectOntoLine({ x: 400, y: 30 }, L)).toMatchObject({ along: 400, offset: 30, segment: 0 });
  expect(projectOntoLine({ x: 1050, y: 600 }, L)).toMatchObject({ along: 1600, offset: 50, segment: 1 });
});

test('wells in the corridor, ordered along the line; others left out with a reason', () => {
  const L = [{ x: 0, y: 0 }, { x: 5000, y: 0 }];
  const wells = [W('c', 3000, 200), W('a', 500, -100), W('far', 2000, 900), W('b', 1500, 450), W('x', 100, 0, { crs: 'EPSG:2277' }), W('nol', null, null)];
  const r = wellsInCorridor(wells, L, { halfWidthM: 500, crs: 'EPSG:32631', unit: 'm' });
  expect(r.picked.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  expect(r.picked.map((p) => p.alongM)).toEqual([500, 1500, 3000]);
  expect(r.left).toEqual([{ name: 'X', reason: 'in EPSG:2277' }, { name: 'NOL', reason: 'no surface location' }]);
});

test('a deviated well drilled into the corridor from outside is found by its bottom hole', () => {
  const frame = makeDepthFrame({ deviation: [{ md: 0, inc: 0, azi: 180 }, { md: 500, inc: 0, azi: 180 }, { md: 2500, inc: 60, azi: 180 }], kbM: 0 });
  const bh = frame.mdToPosition(2500);
  const w = W('dev', 2000, 900, { frame, td_md_m: 2500 });
  const r = wellsInCorridor([w], [{ x: 0, y: 0 }, { x: 5000, y: 0 }], { halfWidthM: 300, unit: 'm' });
  expect(900 + bh.y).toBeLessThan(300); // the bottom hole lies in the corridor, the wellhead does not
  expect(r.picked).toHaveLength(1);
  expect(r.picked[0]).toMatchObject({ id: 'dev', deviated: true });
  const vertical = wellsInCorridor([W('v', 2000, 900)], [{ x: 0, y: 0 }, { x: 5000, y: 0 }], { halfWidthM: 300, unit: 'm' });
  expect(vertical.picked).toHaveLength(0);
});

test('a line drawn in US feet measures the corridor in metres', () => {
  const ft = 1200 / 3937;
  const wells = [W('a', 1000 / ft, 400 / ft, { xy_unit: 'ftUS', crs: null })];
  expect(wellsInCorridor(wells, [{ x: 0, y: 0 }, { x: 5000 / ft, y: 0 }], { halfWidthM: 500, unit: 'ftUS' }).picked).toHaveLength(1);
  expect(wellsInCorridor(wells, [{ x: 0, y: 0 }, { x: 5000 / ft, y: 0 }], { halfWidthM: 300, unit: 'ftUS' }).picked).toHaveLength(0);
});

test('spacing along the line uses the along-line distances, not wellhead to wellhead', () => {
  const wells = [W('a', 0, 0), W('b', 1000, 2000), W('c', 3000, 0)];
  const boxes = columnLayout(wells, { mode: 'proportional', plotLeft: 0, plotW: 1000, distances: [1000, 2000] });
  const centre = (b) => b.x0 + b.w / 2;
  // centres at 0, 1/3 and 1 of the span (1000 then 2000 along the line)
  const span = centre(boxes[2]) - centre(boxes[0]);
  expect((centre(boxes[1]) - centre(boxes[0])) / span).toBeCloseTo(1 / 3, 6);
});
