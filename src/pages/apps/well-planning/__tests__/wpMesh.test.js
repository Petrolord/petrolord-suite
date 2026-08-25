// WD5 3D scene builder: frame normalization, well/EOU/target/top
// geometry and label anchors. The heavy math (paths, covariance) is
// engine-gated; these tests pin the display-geometry contract the
// renderer consumes.

import { buildScene } from '../services/wpMesh';
import { computeErrorModel } from '../engine/errorModel';

const MAG = { bTotalNT: 50000, dipDeg: 72, declinationDeg: -4, convergenceDeg: 0, aziReference: 'grid' };

function jWell(azi = 90, n = 30, step = 100) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const md = i * step;
    out.push({ md, inc: Math.min(45, Math.max(0, (md - 500) / 40)), azi });
  }
  return out;
}

const stations = jWell();
const { totalCov } = computeErrorModel(stations, MAG);

const WELLS = [
  {
    id: 'plan', label: 'HAR-1 (plan)', color: '#166534', kind: 'plan',
    stations, headX: 500000, headY: 6800000, kbElevM: 30, cov: totalCov,
  },
  {
    id: 'off', label: 'HAR-2', color: '#1d4ed8', kind: 'offset',
    stations: jWell(180), headX: 500100, headY: 6800050, kbElevM: 25,
  },
];
const TARGETS = [
  {
    id: 't1', name: 'Amber', kind: 'circle', center_x: 500800, center_y: 6801000,
    tvdss_m: 2000, geometry: { radius_m: 120 }, color: '#d97706',
  },
  { id: 't2', name: 'Spot', kind: 'point', center_x: 500900, center_y: 6800900, tvdss_m: 2100 },
];
const TOPS = [{ wellId: 'plan', name: 'Top Amber', mdM: 1500 }];

describe('buildScene', () => {
  const scene = buildScene({ wells: WELLS, targets: TARGETS, tops: TOPS }, { vexag: 1 });

  test('normalizes the frame: horizontal extent <= 1, everything inside the box', () => {
    expect(Math.max(scene.ext.X, scene.ext.Z)).toBeLessThanOrEqual(1 + 1e-9);
    expect(scene.ext.D).toBeGreaterThan(0);
    const checkInside = (arr) => {
      for (let i = 0; i < arr.length; i += 3) {
        expect(arr[i]).toBeGreaterThanOrEqual(-1e-9);
        expect(arr[i]).toBeLessThanOrEqual(scene.ext.X + 1e-9);
        expect(arr[i + 1]).toBeLessThanOrEqual(1e-9);
        expect(arr[i + 1]).toBeGreaterThanOrEqual(-scene.ext.D - 1e-9);
        expect(arr[i + 2]).toBeGreaterThanOrEqual(-1e-9);
        expect(arr[i + 2]).toBeLessThanOrEqual(scene.ext.Z + 1e-9);
      }
    };
    for (const w of scene.wells) checkInside(w.positions);
    for (const t of scene.targets) checkInside(t.positions);
  });

  test('renders both wells as segment soups with labels', () => {
    expect(scene.wells).toHaveLength(2);
    // n stations -> n-1 segments -> (n-1)*2 vertices * 3 floats
    expect(scene.wells[0].positions.length).toBe((stations.length - 1) * 6);
    const kinds = scene.labels.map((l) => l.kind);
    expect(kinds.filter((k) => k === 'wellhead')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'td')).toHaveLength(2);
  });

  test('EOU rings only where covariance is supplied, closed rings', () => {
    expect(scene.eouRings).toHaveLength(1);
    expect(scene.eouRings[0].wellId).toBe('plan');
    // each ring is 36 segments; count must be a multiple of a ring
    expect(scene.eouRings[0].positions.length % (36 * 6)).toBe(0);
    expect(scene.eouRings[0].positions.length).toBeGreaterThan(0);
  });

  test('vexag scales only the vertical', () => {
    const deep = buildScene({ wells: WELLS, targets: TARGETS, tops: TOPS }, { vexag: 3 });
    expect(deep.ext.X).toBeCloseTo(scene.ext.X, 12);
    expect(deep.ext.Z).toBeCloseTo(scene.ext.Z, 12);
    expect(deep.ext.D).toBeCloseTo(scene.ext.D * 3, 9);
  });

  test('circle target ring lies at its depth with the right radius', () => {
    const circle = scene.targets.find((t) => t.id === 't1');
    const pos = circle.positions;
    const yExpect = -((2000 - scene.world.minT) / scene.world.scale);
    const rExpect = 120 / scene.world.scale;
    const cx = (500800 - scene.world.minE) / scene.world.scale;
    const cz = (6801000 - scene.world.minN) / scene.world.scale;
    // positions are Float32Array — assert at f32 precision
    for (let i = 0; i < pos.length; i += 3) {
      expect(pos[i + 1]).toBeCloseTo(yExpect, 6);
      const r = Math.hypot(pos[i] - cx, pos[i + 2] - cz);
      expect(r).toBeCloseTo(rExpect, 5);
    }
  });

  test('tops project onto the well path with a label anchor', () => {
    expect(scene.tops).toHaveLength(1);
    expect(scene.tops[0].name).toBe('Top Amber');
    expect(scene.labels.some((l) => l.kind === 'top' && l.text === 'Top Amber')).toBe(true);
  });

  test('axes carry ticks for all three axes and the north arrow points +z', () => {
    const axes = new Set(scene.axes.ticks.map((t) => t.axis));
    expect(axes).toEqual(new Set(['E', 'N', 'TVDSS']));
    expect(scene.axes.edges.length).toBe(12 * 6);
    const na = scene.northArrow.positions;
    // shaft: first segment increases z, x constant
    expect(na[5]).toBeGreaterThan(na[2]);
    expect(na[3]).toBeCloseTo(na[0], 12);
  });

  test('empty input returns null instead of a degenerate box', () => {
    expect(buildScene({ wells: [], targets: [], tops: [] })).toBeNull();
  });
});
