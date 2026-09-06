import { arcLengths, pathSamples, nearestOnPath, projectWells, sectionScale, pointAt } from '../services/sectionPath';

const L = [[0, 0], [300, 400], [300, 900]]; // 500 + 500

test('arc lengths, samples and points along a bent line', () => {
  expect(Array.from(arcLengths(L))).toEqual([0, 500, 1000]);
  const p = pathSamples(L, 5);
  expect(p.total).toBe(1000);
  expect(Array.from(p.s)).toEqual([0, 250, 500, 750, 1000]);
  expect([p.x[2], p.y[2]]).toEqual([300, 400]);
  expect([p.x[4], p.y[4]]).toEqual([300, 900]);
  expect(pointAt(L, arcLengths(L), 750)).toEqual([300, 650]);
  expect(() => pathSamples([[0, 0]])).toThrow(/two vertices/);
  expect(() => pathSamples([[0, 0], [0, 0]])).toThrow(/no length/);
});

test('nearest point and well projection with an offset limit, sorted along the line', () => {
  const n = nearestOnPath(L, 400, 650);
  expect(n.s).toBeCloseTo(750, 9);
  expect(n.offset).toBeCloseTo(100, 9);
  const wells = [
    { name: 'far', surface_x: 1000, surface_y: 0 },
    { name: 'b', surface_x: 320, surface_y: 800 },
    { name: 'a', surface_x: 0, surface_y: 10 },
  ];
  const pr = projectWells(wells, L, 50);
  expect(pr.map((p) => p.well.name)).toEqual(['a', 'b']);
  expect(pr[1].s).toBeCloseTo(900, 9);
  expect(pr[1].offset).toBeCloseTo(20, 9);
});

test('sectionScale exaggerates the vertical against the horizontal and clamps the height', () => {
  const s1 = sectionScale({ total: 1000, zMin: 1000, zMax: 1200, plotW: 500, ve: 1 });
  expect(s1.hScale).toBe(0.5);
  expect(s1.plotH).toBe(200); // 200 m * 0.5 = 100 px, clamped up to minH 200
  const s5 = sectionScale({ total: 1000, zMin: 1000, zMax: 1200, plotW: 500, ve: 5 });
  expect(s5.plotH).toBe(500); // 200 m * 2.5 px/m
  expect(s5.exaggeration).toBeCloseTo(5, 9);
  const big = sectionScale({ total: 100, zMin: 0, zMax: 5000, plotW: 1000, ve: 10 });
  expect(big.plotH).toBe(2400);
});
