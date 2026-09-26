// Mapping T1 batch B: map extent past the wells (MAP-T1-007) and depth
// conversion tied to the wells with residuals (MAP-T1-009, E5).
import { extentMask, distanceToHull, hullRing } from '../services/extent';
import { convertWithWellVelocity, correctToWells, wellDepthsForTop } from '../services/wellTieDepth';
import { isNull } from '@/lib/gridding/gridmath';

describe('extentMask keeps the hull and a band of the stated width outside it', () => {
  const pts = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }];
  const spec = { x0: -600, y0: -600, dx: 100, dy: 100, nx: 23, ny: 23 };
  const z = new Float32Array(spec.nx * spec.ny).fill(-1500);
  test('nodes inside stay, nodes within 300 m stay and are counted, farther ones go', () => {
    const { z: out, extrapolatedNodes, ring } = extentMask(z, spec, pts, 300);
    expect(ring).toHaveLength(3);
    const at = (x, y) => out[((y - spec.y0) / 100) * spec.nx + (x - spec.x0) / 100];
    expect(at(100, 100)).toBe(-1500);          // inside
    expect(at(-200, 500)).toBe(-1500);         // 200 m west of the hull
    expect(isNull(at(-500, 500))).toBe(true);  // 500 m west
    expect(extrapolatedNodes).toBeGreaterThan(0);
    expect(() => extentMask(z, spec, pts, 0)).toThrow(/how far past the wells/);
  });
  test('distance to the hull is zero inside and the segment distance outside', () => {
    const ring = hullRing(pts);
    expect(distanceToHull(ring, 100, 100)).toBe(0);
    expect(distanceToHull(ring, -250, 400)).toBeCloseTo(250, 9);
  });
});

describe('average velocity from the wells honours every well', () => {
  // linear V(z) = 1800 + 0.6 z world; TWT from closed form over a dipping depth
  const V0 = 1800; const K = 0.6;
  const tOne = (z) => Math.log(1 + (K * z) / V0) / K;
  const depth = (x, y) => 2200 + 0.02 * x - 0.01 * y;
  const spec = { x0: 0, y0: 0, dx: 100, dy: 100, nx: 21, ny: 17 };
  const twt = new Float32Array(spec.nx * spec.ny);
  for (let r = 0; r < spec.ny; r++) for (let c = 0; c < spec.nx; c++) twt[r * spec.nx + c] = 2000 * tOne(depth(c * 100, r * 100));
  const wells = [[300, 200], [1700, 300], [1000, 800], [400, 1400], [1600, 1500]].map(([x, y], i) => ({ well: `W${i}`, x, y, depthM: depth(x, y) }));

  test('residuals are zero at the wells and depth is close to the truth between them', () => {
    const r = convertWithWellVelocity({ twtMs: twt, spec, wells });
    expect(r.ties).toHaveLength(5);
    expect(r.stats.maxAbs).toBeLessThan(0.05); // f32 TWT sampling
    const i = 8 * spec.nx + 10; // (1000, 800)
    expect(Math.abs(-r.zM[i] - depth(1000, 800))).toBeLessThan(0.05);
    const mid = 12 * spec.nx + 6; // (600, 1200), between wells
    expect(Math.abs(-r.zM[mid] - depth(600, 1200))).toBeLessThan(5);
  });

  test('fewer than 3 wells inside the time surface is refused plainly', () => {
    expect(() => convertWithWellVelocity({ twtMs: twt, spec, wells: wells.slice(0, 2) })).toThrow(/at least 3 wells/);
  });

  test('correcting a biased map to the wells shrinks the mis-tie', () => {
    const biased = new Float64Array(spec.nx * spec.ny);
    for (let r = 0; r < spec.ny; r++) for (let c = 0; c < spec.nx; c++) biased[r * spec.nx + c] = -depth(c * 100, r * 100) + 12;
    const r = correctToWells({ zM: biased, spec, wells });
    expect(r.before.rms).toBeCloseTo(12, 3);
    expect(r.after.rms).toBeLessThan(0.5);
  });
});

test('wellDepthsForTop turns registry tops into depths below datum at the borehole', () => {
  const wells = [{ name: 'A', surface_x: 10, surface_y: 20, kb_m: 30, td_md_m: 3000, deviation: [], tops: [{ name: 'T', md_m: 2030 }] }];
  const { wells: out } = wellDepthsForTop(wells, 'T');
  expect(out).toEqual([{ well: 'A', x: 10, y: 20, depthM: 2000 }]);
});
