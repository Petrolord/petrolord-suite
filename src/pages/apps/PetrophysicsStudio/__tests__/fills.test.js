// PS1: track fill geometry — crossover splitting exactness, NaN gap
// behaviour, threshold sides. Pure device-space math, no canvas.

import { crossoverPolys, thresholdPolys } from '../viewer/fills';

const flatArea = (poly) => {
  // shoelace, absolute
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i++) {
    s += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return Math.abs(s) / 2;
};

describe('crossoverPolys', () => {
  test('no crossing: one polygon on the correct side', () => {
    const xA = [10, 12, 11];
    const xB = [5, 6, 5];
    const y = [0, 10, 20];
    const { pos, neg } = crossoverPolys(xA, xB, y);
    expect(pos).toHaveLength(1);
    expect(neg).toHaveLength(0);
    // forward A then reversed B: 6 vertices
    expect(pos[0]).toHaveLength(6);
    expect(pos[0][0]).toEqual([10, 0]);
    expect(pos[0][5]).toEqual([5, 0]);
  });

  test('single crossing splits at the exact interpolated intersection', () => {
    // A: 0 -> 10, B: 10 -> 0 over y 0 -> 10; they cross at (5, 5)
    const xA = [0, 10];
    const xB = [10, 0];
    const y = [0, 10];
    const { pos, neg } = crossoverPolys(xA, xB, y);
    expect(neg).toHaveLength(1); // A starts left of B
    expect(pos).toHaveLength(1);
    // crossing vertex present in both polygons
    const hasCross = (poly) => poly.some(([x, yy]) => Math.abs(x - 5) < 1e-12 && Math.abs(yy - 5) < 1e-12);
    expect(hasCross(neg[0])).toBe(true);
    expect(hasCross(pos[0])).toBe(true);
    // the two triangles have equal area: base 10, height 5 -> 25 each
    expect(flatArea(neg[0])).toBeCloseTo(25, 12);
    expect(flatArea(pos[0])).toBeCloseTo(25, 12);
  });

  test('sawtooth: alternating polygons, every crossing exact', () => {
    // A alternates around constant B=0: +1, -1, +1, -1 at y = 0..3
    const xA = [1, -1, 1, -1];
    const xB = [0, 0, 0, 0];
    const y = [0, 1, 2, 3];
    const { pos, neg } = crossoverPolys(xA, xB, y);
    expect(pos).toHaveLength(2);
    expect(neg).toHaveLength(2);
    // crossings at y = 0.5, 1.5, 2.5
    expect(pos[0].some(([, yy]) => Math.abs(yy - 0.5) < 1e-12)).toBe(true);
    expect(neg[0].some(([, yy]) => Math.abs(yy - 1.5) < 1e-12)).toBe(true);
  });

  test('NaN lifts the pen: gap splits the polygon, never bridges', () => {
    const xA = [10, 10, NaN, 10, 10];
    const xB = [5, 5, 5, 5, 5];
    const y = [0, 1, 2, 3, 4];
    const { pos, neg } = crossoverPolys(xA, xB, y);
    expect(pos).toHaveLength(2);
    expect(neg).toHaveLength(0);
    // neither polygon spans the gap sample at y=2
    for (const poly of pos) {
      const ys = poly.map(([, yy]) => yy);
      expect(Math.min(...ys) === 0 ? Math.max(...ys) <= 1 : Math.min(...ys) >= 3).toBe(true);
    }
  });

  test('equal-valued leading samples adopt the first real side', () => {
    const xA = [5, 5, 8];
    const xB = [5, 5, 5];
    const y = [0, 1, 2];
    const { pos, neg } = crossoverPolys(xA, xB, y);
    expect(pos).toHaveLength(1);
    expect(neg).toHaveLength(0);
  });

  test('fully equal curves produce no polygons', () => {
    const xA = [5, 5, 5];
    const { pos, neg } = crossoverPolys(xA, xA, [0, 1, 2]);
    expect(pos).toHaveLength(0);
    expect(neg).toHaveLength(0);
  });

  test('index window restricts the fill', () => {
    const xA = [10, 10, 10, 10];
    const xB = [5, 5, 5, 5];
    const y = [0, 1, 2, 3];
    const { pos } = crossoverPolys(xA, xB, y, 1, 2);
    expect(pos).toHaveLength(1);
    const ys = pos[0].map(([, yy]) => yy);
    expect(Math.min(...ys)).toBe(1);
    expect(Math.max(...ys)).toBe(2);
  });
});

describe('thresholdPolys', () => {
  test('above keeps only right-of-threshold spans', () => {
    const x = [1, 3, 1];
    const y = [0, 1, 2];
    const above = thresholdPolys(x, 2, y, 'above');
    const below = thresholdPolys(x, 2, y, 'below');
    expect(above).toHaveLength(1);
    expect(below).toHaveLength(2);
    // crossing at y = 0.5 and 1.5 (x goes 1->3->1 across thr 2)
    expect(above[0].some(([, yy]) => Math.abs(yy - 0.5) < 1e-12)).toBe(true);
    expect(above[0].some(([, yy]) => Math.abs(yy - 1.5) < 1e-12)).toBe(true);
  });

  test('non-finite threshold yields nothing', () => {
    expect(thresholdPolys([1, 2], NaN, [0, 1], 'above')).toHaveLength(0);
  });
});
