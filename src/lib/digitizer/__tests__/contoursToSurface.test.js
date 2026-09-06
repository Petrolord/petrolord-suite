import { contourControlPoints, planDigitizedSurface, digitizedSurfacePayload } from '../contoursToSurface';
import { isNull, sampleAtXY } from '@/lib/gridding/gridmath';

const p2w = (px, py) => [1000 + px * 10, 5000 - py * 10]; // north-up image
const layers = {
  contours: [
    { id: 'a', value: 2000, points: [[0, 0], [10, 0], [20, 0]] },
    { id: 'b', value: 2100, points: [[0, 10], [10, 10], [20, 10]] },
    { id: 'c', value: null, points: [[5, 5]] },
    { id: 'd', value: 2200, points: [[0, 20], [10, 20], [20, 20]] },
  ],
  faults: [],
};

test('control points go through the georeference and depth values become negative elevation', () => {
  const { points, lines, skipped } = contourControlPoints(layers, p2w, { valuesAre: 'depth' });
  expect(lines).toBe(3);
  expect(skipped).toBe(1);
  expect(points).toHaveLength(9);
  expect(points[0]).toEqual({ x: 1000, y: 5000, z: -2000 });
  const elev = contourControlPoints(layers, p2w, { valuesAre: 'elevation' }).points[0].z;
  expect(elev).toBe(2000);
});

test('without a georeference the planner refuses with the reason', () => {
  expect(() => contourControlPoints(layers, null)).toThrow(/georeference/);
  expect(() => planDigitizedSurface({ contours: [layers.contours[0]] }, p2w)).toThrow(/two contour lines/);
});

test('the grid reproduces the linear contour field between the lines', () => {
  const plan = planDigitizedSurface(layers, p2w, { valuesAre: 'depth', cellSize: 20 });
  expect(plan.lines).toBe(3);
  expect(plan.controlCount).toBe(9);
  expect(plan.stats.count).toBeGreaterThan(0);
  // halfway between the 2000 and 2100 contours (y = 4950) the surface is -2050
  const v = sampleAtXY(plan.grid, plan.spec, 1100, 4950);
  expect(isNull(v)).toBe(false);
  expect(Math.abs(v + 2050)).toBeLessThan(1);
});

test('the payload carries the registry convention and provenance', () => {
  const plan = planDigitizedSurface(layers, p2w, { cellSize: 20 });
  const payload = digitizedSurfacePayload(plan, { name: ' Top Scan ', zUnit: 'ft', imageName: 'map.png' });
  expect(payload.name).toBe('Top Scan');
  expect(payload.zUnit).toBe('ft');
  expect(payload.zDomain).toBe('depth');
  expect(payload.provenance.app).toBe('contour-map-digitizer');
  expect(payload.provenance.z_convention).toBe('elevation');
  expect(payload.provenance.contour_lines).toBe(3);
  expect(() => digitizedSurfacePayload(plan, { name: '' })).toThrow(/name/);
  expect(() => digitizedSurfacePayload(plan, { name: 'x', zUnit: 'yd' })).toThrow(/unit/);
});
