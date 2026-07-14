/**
 * G8.1 malformed-input fuzz (wellImportFuzz style): every engine
 * rejects garbage with a specific error or a documented fallback —
 * never a silent NaN grid.
 */

import { NULL_VALUE } from '@/lib/gridding/numeric';
import { resampleStack, clampStack, buildFramework, isNull } from '../engine/framework';
import { validatePolygon, labelBlocks } from '../engine/blocks';
import { minCurvature, positionAtMd } from '../engine/wellties';
import { weightedMean, planeFit, simpleKrige, populateZoneProperty } from '../engine/properties';
import { zoneVolumes } from '../engine/volumes';

const SPEC = { x0: 0, y0: 0, dx: 10, dy: 10, nx: 4, ny: 3 };
const FLAT = (v) => Float64Array.from({ length: 12 }, () => v);

describe('framework guards', () => {
  test('rejects empty stacks and bad specs', () => {
    expect(() => resampleStack([], SPEC)).toThrow(/at least one surface/);
    expect(() => resampleStack([{ z: FLAT(1), spec: SPEC }], { ...SPEC, nx: 1 }))
      .toThrow(/Invalid model grid spec/);
    expect(() => resampleStack([{ z: FLAT(1), spec: SPEC }], { ...SPEC, dx: 0 }))
      .toThrow(/Invalid model grid spec/);
  });

  test('rejects mismatched frames in the clamp', () => {
    expect(() => clampStack([FLAT(1), new Float64Array(5)]))
      .toThrow(/share the model frame/);
  });

  test('all-null surfaces stay null with zero clamps', () => {
    const { clamped, counts } = clampStack([FLAT(NULL_VALUE), FLAT(NULL_VALUE)]);
    expect(counts).toEqual([0, 0]);
    expect(clamped.every((g) => Array.from(g).every(isNull))).toBe(true);
  });

  test('null nodes do not advance the running max', () => {
    const top = Float64Array.from([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
    const mid = FLAT(NULL_VALUE);
    const base = FLAT(50); // crosses top, must clamp to 100 despite the null layer between
    const { clamped, counts } = clampStack([top, mid, base]);
    expect(counts).toEqual([0, 0, 12]);
    expect(clamped[2][0]).toBe(100);
    expect(isNull(clamped[1][0])).toBe(true);
  });

  test('crossing surfaces produce non-negative thickness after the clamp', () => {
    const src = (v) => ({ z: FLAT(v), spec: SPEC });
    const { thickness } = buildFramework([src(100), src(80)], SPEC);
    expect(Array.from(thickness[0]).every((t) => t >= 0)).toBe(true);
  });
});

describe('fault polygon guards', () => {
  test('rejects short, non-finite, degenerate and self-intersecting polygons', () => {
    expect(() => validatePolygon([[0, 0], [1, 1]])).toThrow(/at least 3 vertices/);
    expect(() => validatePolygon([[0, 0], [1, NaN], [1, 1]])).toThrow(/finite/);
    expect(() => validatePolygon([[0, 0], [1, 1], [2, 2]])).toThrow(/degenerate/);
    // asymmetric bowtie (nonzero signed area, so it reaches the crossing check)
    expect(() => validatePolygon([[0, 0], [10, 10], [14, 0], [0, 12]]))
      .toThrow(/self-intersect/);
  });

  test('accepts {x, y} vertex objects and concave rings', () => {
    const L = [{ x: -5, y: -5 }, { x: 25, y: -5 }, { x: 25, y: 12 },
      { x: 8, y: 12 }, { x: 8, y: 25 }, { x: -5, y: 25 }];
    const labels = labelBlocks(SPEC, [L]);
    expect(Math.max(...labels)).toBe(1);
    expect(Math.min(...labels)).toBe(0);
  });
});

describe('well path guards', () => {
  test('empty deviation gives a vertical wellhead-only trajectory', () => {
    const traj = minCurvature([], 25, 100, 200);
    expect(traj).toEqual([{ md: 0, x: 100, y: 200, tvd: 0, tvdss: -25 }]);
  });

  test('non-increasing and malformed stations are skipped', () => {
    const traj = minCurvature(
      [{ md: 500, inc: 0, azi: 0 }, { md: 400, inc: 90, azi: 0 }, { md: 'x' }],
      0, 0, 0,
    );
    expect(traj.length).toBe(2);
    expect(traj[1].tvd).toBe(500);
  });

  test('positions clamp beyond the surveyed range', () => {
    const traj = minCurvature([{ md: 1000, inc: 0, azi: 0 }], 0, 0, 0);
    expect(positionAtMd(traj, 5000).tvd).toBe(1000);
    expect(positionAtMd(traj, -10).tvd).toBe(0);
  });
});

describe('population guards and the fallback ladder', () => {
  const P = (x, y, v) => ({ x, y, v, w: 1 });

  test('rejects empty and zero-weight inputs', () => {
    expect(() => weightedMean([], [])).toThrow(/No control values/);
    expect(() => weightedMean([1, 2], [0, 0])).toThrow(/Non-positive total weight/);
  });

  test('trend rejects < 3 wells and collinear wells', () => {
    expect(() => planeFit([P(0, 0, 1), P(1, 1, 2)])).toThrow(/at least 3 wells/);
    expect(() => planeFit([P(0, 0, 1), P(1, 1, 2), P(2, 2, 3)])).toThrow(/Singular/);
  });

  test('kriging rejects unphysical variogram parameters', () => {
    const pts = [P(0, 0, 1)];
    expect(() => simpleKrige(pts, null, { model: 'spherical', range: 0, sill: 1, nugget: 0 }, [[1, 1]]))
      .toThrow(/range > 0/);
    expect(() => simpleKrige(pts, null, { model: 'spherical', range: 10, sill: 1, nugget: 1 }, [[1, 1]]))
      .toThrow(/nugget < sill/);
    expect(() => simpleKrige(pts, null, { model: 'gaussianish', range: 10, sill: 1, nugget: 0 }, [[1, 1]]))
      .toThrow(/Unknown variogram model/);
    expect(() => simpleKrige([], null, { model: 'spherical', range: 10, sill: 1, nugget: 0 }, [[1, 1]]))
      .toThrow(/at least one well/);
  });

  test('the ladder falls back trend -> constant on 2 wells and records it', () => {
    const pts = [P(0, 0, 0.2), P(30, 0, 0.4)];
    const { z, provenance } = populateZoneProperty(SPEC, null, { 0: pts }, pts, 'trend');
    expect(provenance).toEqual([{ block: 0, methodUsed: 'constant', wells: 2, fellBack: true }]);
    expect(z[0]).toBeCloseTo(0.3, 12);
  });

  test('duplicate wells collapse krige -> trend -> constant, never NaN', () => {
    const pts = [P(5, 5, 0.3), P(5, 5, 0.3), P(5, 5, 0.3)];
    const { z, provenance } = populateZoneProperty(
      SPEC, null, { 0: pts }, pts, 'krige',
      { model: 'spherical', range: 100, sill: 1, nugget: 0 },
    );
    expect(provenance[0].methodUsed).toBe('constant');
    expect(provenance[0].fellBack).toBe(true);
    expect(Array.from(z).every(Number.isFinite)).toBe(true);
  });

  test('a well-less block borrows the all-well constant and says so', () => {
    const labels = new Int32Array(12).fill(0);
    labels[0] = 1;
    const pts = [P(0, 0, 0.2), P(10, 0, 0.4)];
    const { z, provenance } = populateZoneProperty(SPEC, labels, { 0: pts }, pts, 'constant');
    const blk1 = provenance.find((p) => p.block === 1);
    expect(blk1.fellBack).toBe(true);
    expect(z[0]).toBeCloseTo(0.3, 12);
  });

  test('no wells anywhere gives a null grid, not zeros', () => {
    const { z, provenance } = populateZoneProperty(SPEC, null, {}, [], 'constant');
    expect(provenance).toEqual([{ block: 0, methodUsed: 'none', wells: 0, fellBack: true }]);
    expect(Array.from(z).every(isNull)).toBe(true);
  });
});

describe('volume guards', () => {
  test('rejects mismatched property frames and skips null nodes', () => {
    expect(() => zoneVolumes(SPEC, FLAT(10), null, { phi: new Float64Array(5) }))
      .toThrow(/share the zone thickness frame/);
    const t = FLAT(10);
    t[0] = NULL_VALUE;
    const vols = zoneVolumes(SPEC, t, null, {});
    expect(vols.total.cells).toBe(11);
    expect(vols.total.bulk_m3).toBeCloseTo(11 * 10 * 100, 9);
  });

  test('a null property node excludes the cell from all sums', () => {
    const phi = FLAT(0.25);
    phi[3] = NULL_VALUE;
    const vols = zoneVolumes(SPEC, FLAT(10), null, { ntg: FLAT(0.8), phi, sw: FLAT(0.3) });
    expect(vols.total.cells).toBe(11);
    expect(vols.total.hcpv_m3).toBeCloseTo(11 * 10 * 100 * 0.8 * 0.25 * 0.7, 6);
  });
});
