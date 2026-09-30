/**
 * SEIS-U1 (practitioner lens PL3, PL9): the surface chain from Seismolord
 * into the shared registry and out to Well Correlation and Mapping, with
 * the real gridder and the real readers.
 *
 * SEIS-U1-008: Seismolord published TWT surfaces NEGATIVE (its export-file
 * sign) while the registry rule (owner MS0, 2026-09-05) and every reader
 * expect positive TWT. Negative control on origin/main bf9cc1ebc: the
 * saved grid held -1400 ms; Well Correlation's horizonAtWell answered
 * "outside the checkshots" at every well; Mapping's time-to-depth put the
 * horizon 1,300 m ABOVE sea level (mirrored).
 * SEIS-U1-009: a depth surface in metres imported as "Depth (ft)" only.
 * SEIS-U1-010: horizon picks in seconds landed at the top of the volume.
 */
import { saveSurface } from '@/lib/surfacesRegistry';
import { gridHorizonSurface } from '../services/surfaceWorkflow';
import {
  saveHorizonAsSurface, saveImportedSurface, loadSurfaceMapLayer,
} from '../services/surfacesService';
import { landHorizons } from '../services/interpretationImport';
import { detectTimeUnit, TIME_SCALE } from '../lib/importZUnits';
import { horizonAtWell } from '@/components/wells/section/horizons';
import { gridInUnit } from '@/pages/apps/MappingSurfaceStudio/services/surfaceExport';
import { twtGridToElevation } from '@/pages/apps/MappingSurfaceStudio/services/timeDepth';
import { geomFromManifest } from '../engine/sliceAssembly';
import { surveyAffine } from '../engine/surveyGeometry';

jest.mock('@/lib/surfacesRegistry', () => ({
  listSurfaces: jest.fn(), deleteSurface: jest.fn(), shareSurface: jest.fn(), unshareSurface: jest.fn(),
  saveSurface: jest.fn(async (s) => ({ id: 'surf-1', ...s })),
  downloadSurfaceGrid: jest.fn(),
}));
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

const MANIFEST = {
  manifest_version: 1,
  geometry: {
    il: { min: 1000, max: 1010, step: 1, count: 11 },
    xl: { min: 2000, max: 2010, step: 1, count: 11 },
    ns: 500,
    dt_us: 4000,
    affine: { origin: { x: 500000, y: 700000 }, il_vec: { x: 0, y: 25 }, xl_vec: { x: 25, y: 0 } },
  },
  brick: { size: 64, grid: [1, 1, 8] },
};
const VOLUME = { id: 'vol-1', name: 'Hostile survey', crs: 'EPSG:32632' };
const FLAT_SAMPLE = 350;                  // 1400 ms at 4 ms
const horizonPicks = () => {
  const g = geomFromManifest(MANIFEST);
  return new Float32Array(g.nIl * g.nXl).fill(FLAT_SAMPLE);
};
// a vertical well in the middle of the survey whose checkshots span the horizon
const WELL = {
  name: 'KETA-9', surface_x: 500125, surface_y: 700125, crs: 'EPSG:32632', xy_unit: 'm', kb_m: 25,
  frame: null,
  checkshots: [{ tvdss_m: 0, twt_ms: 0 }, { tvdss_m: 1000, twt_ms: 1100 }, { tvdss_m: 1500, twt_ms: 1500 }],
};

/** The registry row saveSurface would insert, from the service's arguments. */
const rowOf = (s) => ({
  id: 'surf-1', name: s.name, kind: s.kind, z_domain: s.zDomain, z_unit: s.zUnit,
  origin_x: s.spec.x0, origin_y: s.spec.y0, nx: s.spec.nx, ny: s.spec.ny, dx: s.spec.dx, dy: s.spec.dy,
  crs: 'EPSG:32632', xy_unit: 'm', provenance: s.provenance,
});

beforeEach(() => { saveSurface.mockClear(); });

describe('SEIS-U1-008 a TWT horizon published by Seismolord reads right downstream', () => {
  async function publishTwt() {
    const horizon = { id: 'h1', name: 'Top Dome', volume_id: VOLUME.id, picks: horizonPicks() };
    const { g, spec } = await gridHorizonSurface({ manifest: MANIFEST, horizon, domain: 'twt', cellM: 25 });
    // the gridder returns the export-file sign (negative TWT): unchanged
    const live = Array.from(g.z).filter((v) => Math.abs(v) < 1e29);
    expect(Math.max(...live)).toBeCloseTo(-1400, 3);
    await saveHorizonAsSurface({
      volume: VOLUME, horizon, domain: 'twt', g, spec, params: {},
    });
    const saved = saveSurface.mock.calls[0][0];
    return { row: rowOf(saved), grid: saved.grid, saved };
  }

  test('the registry row holds positive TWT ms and says so', async () => {
    const { saved, grid } = await publishTwt();
    expect(saved.zDomain).toBe('time');
    expect(saved.zUnit).toBe('ms');
    expect(saved.provenance.z_sign).toBe('positive_twt');
    const live = Array.from(grid).filter((v) => Math.abs(v) < 1e29);
    expect(Math.min(...live)).toBeCloseTo(1400, 3);
    expect(Math.max(...live)).toBeCloseTo(1400, 3);
  });

  test('Well Correlation places it at the well through the checkshots (was "outside the checkshots")', async () => {
    const { row, grid } = await publishTwt();
    const hit = horizonAtWell(row, grid, WELL);
    expect(hit.problem).toBeUndefined();
    expect(hit.twt).toBeCloseTo(1400, 3);
    expect(hit.tvdss).toBeCloseTo(1375, 3);          // 1100 -> 1000 m, 1500 -> 1500 m
    expect(hit.md).toBeCloseTo(1400, 3);             // + KB 25 m
  });

  test('a row published before the fix (negative TWT) reads the same everywhere', async () => {
    const { row, grid } = await publishTwt();
    const legacy = Float32Array.from(grid, (v) => (Math.abs(v) < 1e29 ? -v : v));
    expect(horizonAtWell(row, legacy, WELL).twt).toBeCloseTo(1400, 3);
    expect(Array.from(gridInUnit(row, legacy, 'm')).find((v) => Math.abs(v) < 1e29)).toBeCloseTo(1400, 3);
  });

  test('Mapping converts it to depth below sea level (was mirrored above)', async () => {
    const { row, grid } = await publishTwt();
    const twt = gridInUnit(row, grid, 'm');
    const z = twtGridToElevation(twt, { v0: 1800, k: 0.5 }, { unit: 'm' });
    const live = Array.from(z).filter((v) => Math.abs(v) < 1e29);
    expect(Math.max(...live)).toBeLessThan(-1000);
  });

  test('Seismolord\'s own map layer reads both signs as positive TWT', async () => {
    const { row, grid } = await publishTwt();
    const { downloadSurfaceGrid } = jest.requireMock('@/lib/surfacesRegistry');
    const geom = geomFromManifest(MANIFEST);
    const affine = surveyAffine(MANIFEST.geometry);
    expect(affine).toBeTruthy();
    for (const g of [grid, Float32Array.from(grid, (v) => (Math.abs(v) < 1e29 ? -v : v))]) {
      downloadSurfaceGrid.mockResolvedValueOnce(g);
      // eslint-disable-next-line no-await-in-loop
      const layer = await loadSurfaceMapLayer({ ...row, crs: VOLUME.crs }, affine, geom, VOLUME);
      const v = Array.from(layer.values).find((x) => Math.abs(x) < 1e29);
      expect(v).toBeCloseTo(1400, 3);
    }
  });
});

describe('SEIS-U1-009 a depth surface keeps the unit declared at the door', () => {
  const g = {
    x0: 500000, y0: 700000, dx: 25, dy: 25, nx: 2, ny: 2, z: new Float32Array([-2000, -2010, -2020, -2030]),
  };
  const stats = { live: 4, zMin: -2030, zMax: -2000 };

  test('metres stay metres (was always stored as feet)', async () => {
    await saveImportedSurface({
      volume: VOLUME, name: 'Top Reservoir (m)', g, domain: 'depth', zUnit: 'm', fileName: 'top.zmap', format: 'zmap', stats,
    });
    const s = saveSurface.mock.calls[0][0];
    expect(s.zDomain).toBe('depth');
    expect(s.zUnit).toBe('m');
    expect(s.provenance.domain).toBe('depth_m');
    expect(Array.from(s.grid)).toEqual([-2000, -2010, -2020, -2030]);
  });

  test('feet stay feet; time is stored positive whatever the file sign', async () => {
    await saveImportedSurface({
      volume: VOLUME, name: 'ft', g, domain: 'depth', zUnit: 'ft', fileName: 'a', format: 'zmap', stats,
    });
    expect(saveSurface.mock.calls[0][0].zUnit).toBe('ft');
    await saveImportedSurface({
      volume: VOLUME, name: 'twt', g: { ...g, z: new Float32Array([-1400, -1410, 1e30, -1430]) }, domain: 'twt', fileName: 'b', format: 'zmap', stats,
    });
    const t = saveSurface.mock.calls[1][0];
    expect(t.zUnit).toBe('ms');
    expect(Array.from(t.grid)).toEqual([1400, 1410, Math.fround(1e30), 1430]);
  });
});

describe('SEIS-U1-010 horizon picks in seconds land at their time', () => {
  const parsed = {
    kind: 'points',
    format: 'ilxlxyz',
    horizons: [{
      name: 'Top Dome (OpendTect, s)',
      rows: [{ il: 1003, xl: 2004, z: 1.4 }, { il: 1004, xl: 2004, z: 1.404 }, { il: 1005, xl: 2004, z: 1.408 }],
    }],
    rows: 3,
  };

  test('seconds are detected and scaled; milliseconds are left alone', () => {
    expect(detectTimeUnit([1.4, 1.404, 1.408])).toBe('s');
    expect(detectTimeUnit([1400, 1404])).toBe('ms');
    expect(detectTimeUnit([1e30, 2.1])).toBe('s');
    expect(detectTimeUnit([])).toBe('ms');
  });

  test('negative control: read as ms the horizon sat at sample 0.35 (the top of the volume)', () => {
    const { landed } = landHorizons({ parsed, manifest: MANIFEST, sign: 1 });
    const live = Array.from(landed[0].picks).filter((v) => Math.abs(v) < 1e29);
    expect(Math.max(...live)).toBeLessThan(1);
  });

  test('with the seconds scale it lands at 1,400 ms (sample 350)', () => {
    const { landed } = landHorizons({
      parsed, manifest: MANIFEST, sign: 1, zScale: TIME_SCALE.s,
    });
    const live = Array.from(landed[0].picks).filter((v) => Math.abs(v) < 1e29);
    expect(live).toHaveLength(3);
    expect(Math.min(...live)).toBeCloseTo(350, 3);
    expect(Math.max(...live)).toBeCloseTo(352, 3);
  });
});
