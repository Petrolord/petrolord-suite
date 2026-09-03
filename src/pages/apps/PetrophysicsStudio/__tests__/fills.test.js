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

// ---- PT6: ramp fills ----------------------------------------------------------
describe('makeRamp / rampStrips', () => {
  const { makeRamp, rampStrips } = require('../viewer/fills');
  test('endpoints return the stop colours exactly; a 2-stop midpoint is the RGB mean; values outside clamp; descending stops normalise', () => {
    const r = makeRamp([{ value: 150, color: '#5c3a1e' }, { value: 15, color: '#f5e6a8' }]);
    expect(r.lo).toBe(15); expect(r.hi).toBe(150);
    expect(r(15)).toBe('rgb(245,230,168)');
    expect(r(150)).toBe('rgb(92,58,30)');
    expect(r(82.5)).toBe(`rgb(${Math.round((245 + 92) / 2)},${Math.round((230 + 58) / 2)},${Math.round((168 + 30) / 2)})`);
    expect(r(-100)).toBe(r(15));
    expect(r(9999)).toBe(r(150));
    expect(r(NaN)).toBeNull();
    expect(makeRamp([{ value: 1, color: '#000' }])).toBeNull();
  });
  test('rampStrips: one strip per interval when sparse; per row when dense; NaN rows skipped; xCurve honours fillTo', () => {
    const x = Float64Array.from([10, 20, NaN, 40]);
    const y = Float64Array.from([0, 10, 20, 30]);
    const v = Float64Array.from([1, 2, 3, 4]);
    const sparse = rampStrips(x, y, 0, 3, 200, v, 'left');
    expect(sparse).toEqual([{ y0: 0, y1: 10, xCurve: 10, v: 1 }, { y0: 10, y1: 20, xCurve: 20, v: 2 }]);
    // dense: 8 samples over 2 px rows
    const xd = Float64Array.from([10, 30, 12, 28, 50, 60, 55, 65]);
    const yd = Float64Array.from([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]);
    const vd = Float64Array.from([1, 3, 1, 3, 10, 20, 10, 20]);
    const dense = rampStrips(xd, yd, 0, 7, 2, vd, 'left');
    expect(dense).toHaveLength(2);
    expect(dense[0].v).toBeCloseTo(2, 9);
    expect(dense[0].xCurve).toBe(30);      // left fill takes the row's max x
    const denseR = rampStrips(xd, yd, 0, 7, 2, vd, 'right');
    expect(denseR[1].xCurve).toBe(50);     // right fill takes the row's min x
  });
});

test('density-neutron semantics: neutron projected right of density lands in pos (gas), left in neg (shale)', () => {
  const { crossoverPolys: xo } = require('../viewer/fills');
  const y = Float64Array.from([0, 10, 20]);
  const nphi = Float64Array.from([60, 60, 60]);
  const rhob = Float64Array.from([40, 40, 40]);
  const gas = xo(nphi, rhob, y);
  expect(gas.pos).toHaveLength(1); expect(gas.neg).toHaveLength(0);
  const shale = xo(rhob, nphi, y);
  expect(shale.pos).toHaveLength(0); expect(shale.neg).toHaveLength(1);
});
