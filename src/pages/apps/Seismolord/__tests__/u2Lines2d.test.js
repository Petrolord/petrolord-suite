/**
 * U2-005: 2D picks as gridding control, and 2D line markers on 3D sections.
 * Validation: a planar TWT horizon (TPS reproduces a plane exactly) picked
 * on an 11 x 11 3D survey and on a 2D line running 600 m to 1,100 m east
 * of it. Gridded with the line, the map covers the line with the plane's
 * value; without it (negative control) the nodes there stay null.
 */
import { gridHorizonSurface } from '../services/surfaceWorkflow';
import { linePicksToControl, controlToGridPoints, lineMarkersOnSection, mergeBounds } from '../lib/lines2dControl';
import { geomFromManifest } from '../engine/sliceAssembly';
import { surveyAffine } from '../engine/surveyGeometry';
import { lineToLattice } from '../engine/line2dIntegration';

jest.mock('@/pages/apps/Seismolord/services/horizonsService', () => ({
  loadHorizonGrid: jest.fn(async (h) => h.picks),
  listHorizons: jest.fn(async () => []),
}));
jest.mock('@/pages/apps/Seismolord/services/griddingWorkerFactory', () => ({
  newGriddingWorker: () => {
    const w = {
      onmessage: null, onerror: null, terminate: () => {},
      postMessage: ({ id, points, spec, opts }) => {
        setTimeout(() => {
          const r = jest.requireActual('@/lib/gridding/gridding').gridSurface(points, spec, { ...opts });
          w.onmessage({ data: { type: 'done', id, z: r.z.buffer, live: r.live, controlCount: r.controlCount, zMin: r.zMin, zMax: r.zMax } });
        }, 0);
      },
    };
    return w;
  },
}));

const NULL = Math.fround(1e30);
const MANIFEST = {
  manifest_version: 1,
  geometry: {
    il: { min: 1, max: 11, step: 1, count: 11 },
    xl: { min: 1, max: 11, step: 1, count: 11 },
    ns: 600,
    dt_us: 4000,
    affine: { origin: { x: 500000, y: 700000 }, il_vec: { x: 0, y: 25 }, xl_vec: { x: 25, y: 0 } },
  },
  brick: { size: 64, grid: [1, 1, 10] },
};
// TWT (ms) of the plane at world x, y
const plane = (x, y) => 1400 + 0.2 * (x - 500000) - 0.1 * (y - 700000);
const geom = geomFromManifest(MANIFEST);
const affine = surveyAffine(MANIFEST.geometry);
function picks3d() {
  const g = new Float32Array(geom.nIl * geom.nXl);
  for (let i = 0; i < geom.nIl; i++) {
    for (let j = 0; j < geom.nXl; j++) g[i * geom.nXl + j] = plane(500000 + j * 25, 700000 + i * 25) / 4;
  }
  return g;
}
// a 2D line with a 2 ms sample interval and a +8 ms applied static, east of the survey
function line2d() {
  const n = 81;
  const nav = { x: new Float64Array(n), y: new Float64Array(n) };
  const picks = new Float32Array(n);
  for (let t = 0; t < n; t++) {
    nav.x[t] = 500600 + t * 6.25;
    nav.y[t] = 700125;
    // stored raw: the display time is raw + the static
    picks[t] = (plane(nav.x[t], nav.y[t]) - 8) / 2;
  }
  picks[40] = NULL;
  return { nav, picks };
}

describe('linePicksToControl', () => {
  test('mistie static and sample interval applied, nulls dropped, step thins', () => {
    const { nav, picks } = line2d();
    const r = linePicksToControl({ picks, nav, dtMs2d: 2, dtMs3d: 4, shiftMs: 8 });
    expect(r.live).toBe(80);
    expect(r.points).toHaveLength(80);
    const p0 = r.points[0];
    expect(p0.sample * 4).toBeCloseTo(plane(p0.x, p0.y), 3);   // display time in 3D samples
    expect(linePicksToControl({ picks, nav, dtMs2d: 2, dtMs3d: 4, shiftMs: 8, step: 4 }).points).toHaveLength(20);
    // negative control: without the static the control is 8 ms early
    const raw = linePicksToControl({ picks, nav, dtMs2d: 2, dtMs3d: 4 });
    expect(raw.points[0].sample * 4 - plane(p0.x, p0.y)).toBeCloseTo(-8, 3);
  });

  test('a layer-cake depth needs a lattice column: points off the survey are skipped and counted', () => {
    const ctl = [{ x: 500100, y: 700100, sample: 350 }, { x: 509000, y: 700100, sample: 350 }];
    const r = controlToGridPoints(ctl, affine, geom, (s) => -s, { columnDependent: true });
    expect(r.points).toHaveLength(1);
    expect(r.skipped).toBe(1);
    expect(controlToGridPoints(ctl, affine, geom, (s) => -s).points.map((q) => q.inside)).toEqual([true, false]);
    expect(mergeBounds({ x0: 0, x1: 1, y0: 0, y1: 1 }, [{ x: 5, y: -2 }])).toEqual({ x0: 0, x1: 5, y0: -2, y1: 1 });
  });
});

describe('gridHorizonSurface with 2D line control', () => {
  const horizon = { id: 'h1', name: 'Top Dome', volume_id: 'v1', picks: picks3d() };
  const { nav, picks } = line2d();
  const control = linePicksToControl({ picks, nav, dtMs2d: 2, dtMs3d: 4, shiftMs: 8 }).points;

  const at = (out, x, y) => {
    const c = Math.round((x - out.spec.x0) / out.spec.dx);
    const r = Math.round((y - out.spec.y0) / out.spec.dy);
    return out.g.z[r * out.spec.nx + c];
  };

  test('the map grows over the line and holds the plane there', async () => {
    const out = await gridHorizonSurface({
      manifest: MANIFEST, horizon, domain: 'twt', cellM: 25, lineControl: control, maxExtrapolationM: 60,
    });
    expect(out.lineInfo).toEqual({ used: 80, skipped: 0, outside: 80 });
    expect(out.spec.x0 + (out.spec.nx - 1) * out.spec.dx).toBeGreaterThanOrEqual(501100);
    const z = at(out, 500900, 700125);
    expect(z).toBeCloseTo(-plane(500900, 700125), 1);     // file sign: negative TWT
  });

  test('negative control: without the line those nodes are empty', async () => {
    const out = await gridHorizonSurface({
      manifest: MANIFEST, horizon, domain: 'twt', cellM: 25, maxExtrapolationM: 60,
    });
    expect(out.lineInfo).toBeNull();
    expect(out.spec.x0 + (out.spec.nx - 1) * out.spec.dx).toBeLessThan(500600);
  });
});

describe('lineMarkersOnSection', () => {
  test('a diagonal line crosses inline 5 at the exact crossline', () => {
    const n = 21;
    const nav = { x: new Float64Array(n), y: new Float64Array(n) };
    for (let t = 0; t < n; t++) { nav.x[t] = 500000 + t * 12.5; nav.y[t] = 700000 + t * 12.5; }
    const { positions } = lineToLattice(nav, affine, geom);
    const m = lineMarkersOnSection([{ id: 'l1', name: 'L-101', positions }], 'inline', 5);
    expect(m).toHaveLength(1);
    expect(m[0].trace).toBeCloseTo(5, 9);
    expect(m[0].lineTrace).toBeCloseTo(10, 9);
    expect(lineMarkersOnSection([{ id: 'l1', name: 'L-101', positions }], 'xline', 3)[0].trace).toBeCloseTo(3, 9);
  });

  test('a line along the section or off the survey gives no marker; time slices none', () => {
    const along = Array.from({ length: 10 }, (_, k) => ({ il: 5, xl: k }));
    expect(lineMarkersOnSection([{ id: 'a', name: 'A', positions: along }], 'inline', 5)).toEqual([]);
    expect(lineMarkersOnSection([{ id: 'b', name: 'B', positions: [null, null] }], 'inline', 5)).toEqual([]);
    expect(lineMarkersOnSection([{ id: 'c', name: 'C', positions: along }], 'time', 5)).toEqual([]);
  });
});
