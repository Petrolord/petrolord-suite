import { distanceToPath, nearestContour, translatePath, guidesFromPath, contourEditPlan } from '../services/contourEdit';
import { contourPaths } from '@/components/maps/mapPainter';
import { gridSurface } from '@/lib/gridding/gridding';

const contours = {
  levels: [-100, -200],
  paths: [
    [new Float64Array([0, 0, 100, 0])],                 // y = 0 line at -100
    [new Float64Array([0, 50, 100, 50, 100, 150])],     // an L at -200
  ],
};

test('distanceToPath is the perpendicular distance to the nearest segment', () => {
  expect(distanceToPath(contours.paths[0][0], 50, 10)).toBeCloseTo(10, 9);
  expect(distanceToPath(contours.paths[0][0], 150, 0)).toBeCloseTo(50, 9);
  expect(distanceToPath(contours.paths[1][0], 120, 100)).toBeCloseTo(20, 9);
});

test('nearestContour picks the closest line within tolerance and reports its level', () => {
  const hit = nearestContour(contours, 50, 40);
  expect(hit.level).toBe(-200);
  expect(hit.dist).toBeCloseTo(10, 9);
  expect(nearestContour(contours, 50, 20).level).toBe(-100);
  expect(nearestContour(contours, 50, 1000, 100)).toBeNull();
});

test('guidesFromPath resamples by arc length and keeps both ends', () => {
  const g = guidesFromPath(new Float64Array([0, 0, 100, 0]), -100, 25, 'C1');
  expect(g.map((p) => p.x)).toEqual([0, 25, 50, 75, 100]);
  expect(g.every((p) => p.z === -100)).toBe(true);
  expect(g[0].label).toBe('C1.1');
  const l = guidesFromPath(contours.paths[1][0], -200, 50);
  expect(l.map((p) => [p.x, p.y])).toEqual([[0, 50], [50, 50], [100, 50], [100, 100], [100, 150]]);
  // a closed ring drops its duplicate end
  const ring = guidesFromPath(new Float64Array([0, 0, 100, 0, 100, 100, 0, 100, 0, 0]), 5, 50);
  expect(ring).toHaveLength(8);
});

test('contourEditPlan shifts the picked contour by the drag and makes guides at its level', () => {
  const plan = contourEditPlan(contours, { x: 50, y: 5 }, { x: 60, y: 35 }, { tolerance: 20, spacing: 50 });
  expect(plan.level).toBe(-100);
  expect(plan.shift).toEqual({ dx: 10, dy: 30 });
  expect(Array.from(plan.moved)).toEqual([10, 30, 110, 30]);
  expect(plan.guides.map((g) => [g.x, g.y, g.z])).toEqual([[10, 30, -100], [60, 30, -100], [110, 30, -100]]);
  expect(() => contourEditPlan(contours, { x: 50, y: 500 }, { x: 0, y: 0 }, { tolerance: 20, spacing: 50 })).toThrow(/No contour within reach/);
});

test('re-gridding through the moved contour bends the surface toward it', () => {
  // a plane dipping north; move the -150 contour 200 m north and the
  // re-gridded surface at the old contour position is now shallower
  const pts = [];
  for (let x = 0; x <= 1000; x += 250) for (let y = 0; y <= 1000; y += 250) pts.push({ x, y, z: -100 - 0.1 * y });
  const spec = { x0: 0, y0: 0, dx: 50, dy: 50, nx: 21, ny: 21 };
  const g0 = gridSurface(pts, spec, { maxExtrapolation: 1e9 });
  const contours = contourPaths(g0.z, spec, { step: 50 });
  const plan = contourEditPlan(contours, { x: 500, y: 500 }, { x: 500, y: 700 }, { tolerance: 30, spacing: 100 });
  expect(plan.level).toBe(-150);
  const g1 = gridSurface([...pts, ...plan.guides], spec, { maxExtrapolation: 1e9 });
  const at = (g, x, y) => g.z[(y / 50) * spec.nx + x / 50];
  expect(at(g0, 500, 700)).toBeCloseTo(-170, 0);
  expect(at(g1, 500, 700)).toBeGreaterThan(at(g0, 500, 700) + 10); // pulled up toward -150
});
