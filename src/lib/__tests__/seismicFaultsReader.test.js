// Seismolord U2-003 (EM-T1-010): the read-only fault contract Earth
// Modeling imports, on the Earth Modeling fixture frame.
import {
  faultToModelObjects, hangingWallBlock, blockPolygonFromTrace, listSeismicFaultsForModel, volumeFrame, bufferPolyline,
} from '@/lib/seismicFaultsReader';
import { SEISMIC_FIXTURE, makeInMemoryBackend } from '@/pages/apps/EarthModeling/services/inMemoryBackend';
import { labelBlocks, blockCensus } from '@/pages/apps/EarthModeling/engine/blocks';
import { MODEL_SPEC } from '@/pages/apps/EarthModeling/services/fixture';

const RECT = {
  x0: MODEL_SPEC.x0, y0: MODEL_SPEC.y0, x1: MODEL_SPEC.x0 + (MODEL_SPEC.nx - 1) * MODEL_SPEC.dx, y1: MODEL_SPEC.y0 + (MODEL_SPEC.ny - 1) * MODEL_SPEC.dy,
};
const { volume, fault } = SEISMIC_FIXTURE;
const westDipping = {
  ...fault, id: 'sf-west', name: 'F-West', sticks: fault.sticks.map((st) => ({ points: st.points.map((q) => ({ ...q, xl: 24 - q.xl })) })),
};

describe('faultToModelObjects', () => {
  test('sticks and surface in world XY with TWT and depth through the linear model', () => {
    const o = faultToModelObjects(fault, volume);
    expect(o.source).toBe('seismolord');
    expect(o.sticks).toHaveLength(3);
    // il 2, xl 10, s 200: x = 1000 + 10*50, y = 2000 + 2*50, 800 ms, 800 m at 2000 m/s
    expect(o.sticks[0][0]).toEqual({ x: 1500, y: 2100, twtMs: 800, depthM: 800 });
    expect(o.twtRangeMs).toEqual([800, 1600]);
    expect(o.levelMs).toBe(1200);
    expect(o.surface.length).toBeGreaterThan(1);
    for (const p of o.trace) expect(p.x).toBeCloseTo(1600, 6);
    expect(o.trace.map((p) => p.y)).toEqual([2100, 2500, 2900]);
    expect(o.notes).toEqual([]);
  });

  test('time only without a velocity model, and a layer cake is not guessed', () => {
    expect(faultToModelObjects(fault, { ...volume, velocity_model: null }).notes).toContain('no velocity model on the volume: time only');
    const cake = faultToModelObjects(fault, { ...volume, velocity_model: { kind: 'layercake', layers: [{ v0: 2000, k: 0 }, { v0: 2500, k: 0 }] } });
    expect(cake.sticks[0][0].depthM).toBeNull();
    expect(cake.notes[0]).toMatch(/layer-cake model needs its horizon grids/);
  });

  test('hostile rows are named (PL2)', () => {
    expect(faultToModelObjects({ ...fault, sticks: [] }, volume).error).toMatch(/no sticks/);
    expect(faultToModelObjects(fault, { ...volume, survey_meta: {} }).error).toMatch(/no stored geometry/);
    const one = faultToModelObjects({ ...fault, sticks: [fault.sticks[0]] }, volume);
    expect(one.trace).toBeNull();
    const high = faultToModelObjects(fault, volume, { levelMs: 3000 });
    expect(high.trace).toBeNull();
    expect(high.notes[0]).toMatch(/does not reach 3000 ms/);
    expect(volumeFrame({ survey_meta: { il: {}, xl: {}, dt_us: 4000 } }).error).toMatch(/ground coordinates/);
  });

  test('a CRS transform is applied to every point', () => {
    const o = faultToModelObjects(fault, volume, { transform: { forward: (x, y) => ({ x: x + 10, y: y - 5 }) }, crsStatus: 'converted' });
    expect(o.sticks[0][0]).toMatchObject({ x: 1510, y: 2095 });
    expect(o.crsStatus).toBe('converted');
  });
});

describe('the hanging-wall block Earth Modeling takes', () => {
  test('an east-dipping fault gives the eastern block; a west-dipping one the western (negative control)', () => {
    const east = hangingWallBlock(faultToModelObjects(fault, volume), RECT);
    const west = hangingWallBlock(faultToModelObjects(westDipping, volume), RECT);
    const count = (poly) => blockCensus(labelBlocks(MODEL_SPEC, [poly]));
    // nodes east of x = 1600: columns 13..24 of 25, 20 rows (the column on the trace is shared)
    const e = count(east.polygon);
    const w = count(west.polygon);
    expect(e[1]).toBeGreaterThanOrEqual(12 * 20);
    expect(e[1]).toBeLessThanOrEqual(13 * 20);
    const inside = (poly, x, y) => labelBlocks({ x0: x, y0: y, dx: 1, dy: 1, nx: 1, ny: 1 }, [poly])[0] === 1;
    expect(inside(east.polygon, 2000, 2500)).toBe(true);
    expect(inside(east.polygon, 1200, 2500)).toBe(false);
    expect(inside(west.polygon, 1200, 2500)).toBe(true);
    expect(inside(west.polygon, 2000, 2500)).toBe(false);
    // the west-dipping copy is mirrored about crossline 12: its trace sits at x = 1600 too, dipping west
    expect(w[1]).toBeGreaterThan(0);
  });

  test('a trace that misses the frame is refused with the reason', () => {
    expect(blockPolygonFromTrace([{ x: 0, y: 0 }, { x: 1, y: 1 }], RECT, { x: 0, y: 0 }).error).toMatch(/does not cross the model frame/);
    expect(hangingWallBlock({ trace: null, notes: ['x'] }, RECT).error).toBe('x');
  });

  test('bufferPolyline: a closed strip of the given half width', () => {
    const p = bufferPolyline([{ x: 0, y: 0 }, { x: 0, y: 10 }], 2);
    expect(p).toEqual([[-2, 0], [-2, 10], [2, 10], [2, 0]]);
  });

  test('the Earth Modeling in-memory backend serves it through the contract', async () => {
    const sf = await makeInMemoryBackend().listSeismicFaults();
    // Earth Modeling U2-001 adds a depth-railed fault and a time-only one beside it
    expect(sf.faults.map((f) => f.name)).toEqual(['F-East (Seismolord)', 'F-East 60 (Seismolord)', 'F-Time (Seismolord)']);
  });
});

describe('listSeismicFaultsForModel (registry read)', () => {
  const fake = (faults, vols) => {
    const calls = [];
    const q = (rows) => {
      const b = {
        select: () => b, is: (c, v) => { calls.push(['is', c, v]); return b; }, order: () => Promise.resolve({ data: rows, error: null }),
        in: (c, ids) => Promise.resolve({ data: rows.filter((r) => ids.includes(r.id)), error: null }),
      };
      return b;
    };
    return { calls, from: (t) => (t === 'seismic_faults' ? q(faults) : q(vols)) };
  };

  test('current heads only, other frames converted or named', async () => {
    const sb = fake([
      { ...fault, archived_at: null },
      { ...fault, id: 'x2', name: 'On a grid', volume_id: 'vol-local' },
      { ...fault, id: 'x3', name: 'Orphan', volume_id: 'gone' },
      { ...fault, id: 'x4', name: 'Moved', volume_id: 'vol-utm' },
    ], [
      { ...volume, crs: 'EPSG:32631' },
      { ...volume, id: 'vol-local', crs: 'LOCAL' },
      { ...volume, id: 'vol-utm', crs: 'EPSG:32632' },
    ]);
    const r = await listSeismicFaultsForModel({
      supabase: sb, hostCrs: 'EPSG:32631', getTransformer: () => ({ forward: (x, y) => ({ x: x + 1, y }) }),
    });
    expect(sb.calls).toContainEqual(['is', 'archived_at', null]);
    expect(r.faults.map((f) => [f.name, f.crsStatus])).toEqual([['F-East (Seismolord)', 'same'], ['Moved', 'converted']]);
    expect(r.faults[1].sticks[0][0].x).toBe(1501);
    expect(Object.fromEntries(r.skipped.map((s) => [s.name, s.reason]))).toEqual({
      'On a grid': 'local grid data cannot be placed in this frame',
      Orphan: 'its volume is not readable',
    });
  });
});
