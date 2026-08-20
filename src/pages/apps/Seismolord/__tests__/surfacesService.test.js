/**
 * Pure parts of the Seismolord surfaces service: provenance filtering
 * (which registry rows belong to a volume's Surfaces section) and the
 * registry-row -> writers-grid reconstruction. Network paths (list /
 * save / download) are the surfacesRegistry house pattern and are
 * exercised in staging.
 */
import {
  isVolumeSurface, isExplorerSurface, surfaceToGrid, exportStoredSurface,
  SURFACE_EXPORT_FORMATS, surfaceSectionGrid, volumeCrsFields,
} from '@/pages/apps/Seismolord/services/surfacesService';
import { makeTvdssToTwt } from '@/pages/apps/Seismolord/engine/wellSection';

const NULL_F32 = Math.fround(1.0e30);

describe('isVolumeSurface', () => {
  const row = (prov) => ({ provenance: prov });

  test('matches only seismolord rows converted from the given volume', () => {
    expect(isVolumeSurface(
      row({ app: 'seismolord', volume: { id: 'v1' } }), 'v1')).toBe(true);
    expect(isVolumeSurface(
      row({ app: 'seismolord', volume: { id: 'v2' } }), 'v1')).toBe(false);
    expect(isVolumeSurface(
      row({ app: 'mapping-studio', volume: { id: 'v1' } }), 'v1')).toBe(false);
  });

  test('tolerates rows with missing/foreign provenance', () => {
    expect(isVolumeSurface(row(undefined), 'v1')).toBe(false);
    expect(isVolumeSurface(row({}), 'v1')).toBe(false);
    expect(isVolumeSurface(null, 'v1')).toBeFalsy();
  });
});

describe('isExplorerSurface (org-shared rows)', () => {
  test('own volume-derived rows and ANY teammate-shared row list; own foreign-volume rows do not', () => {
    const mine = { is_own: true, provenance: { app: 'seismolord', volume: { id: 'v1' } } };
    const mineOtherVol = { is_own: true, provenance: { app: 'seismolord', volume: { id: 'v2' } } };
    const teammates = { is_own: false, organization_id: 'org1', provenance: { app: 'mapping-studio' } };
    expect(isExplorerSurface(mine, 'v1')).toBe(true);
    expect(isExplorerSurface(mineOtherVol, 'v1')).toBe(false);
    expect(isExplorerSurface(teammates, 'v1')).toBe(true);
  });
});

describe('surfaceToGrid', () => {
  test('reconstructs axes from origin + cell on the registry row', () => {
    const surface = { nx: 3, ny: 2, dx: 25, dy: 50, origin_x: 1000, origin_y: 2000 };
    const grid = new Float32Array([1, 2, 3, 4, 5, 6]);
    const g = surfaceToGrid(surface, grid);
    expect(g.x).toEqual([1000, 1025, 1050]);
    expect(g.y).toEqual([2000, 2050]);
    expect(g.z).toBe(grid);
    expect(g.nx).toBe(3);
    expect(g.dy).toBe(50);
  });
});

describe('surfaceSectionGrid (surfaces on section windows)', () => {
  const geom = { nIl: 1, nXl: 3, ns: 64 };
  const dtMs = 4;

  test('time surface: ms values become fractional sample indices', () => {
    const layer = { values: Float32Array.from([80, NULL_F32, 300]), unit: 'ms' };
    const grid = surfaceSectionGrid({ z_domain: 'time' }, layer, geom, dtMs, null);
    expect(grid[0]).toBeCloseTo(20, 6);
    expect(grid[1]).toBe(NULL_F32);
    expect(grid[2]).toBe(NULL_F32);           // beyond (ns-1)*dt = 252 ms
  });

  test('depth surface without a velocity model stays map-only (null)', () => {
    const layer = { values: Float32Array.from([5000]), unit: 'ft' };
    expect(surfaceSectionGrid({ z_domain: 'depth' }, layer, geom, dtMs, null)).toBeNull();
  });

  test('depth-ft surface converts through the inverse model', () => {
    const timeConv = makeTvdssToTwt({
      checkshots: null,
      velocity: { v0: 2000, k: 0 },           // depth m = twtMs at 2000 m/s
      boundaries: null,
      dtUs: dtMs * 1000,
      maxTwtMs: (geom.ns - 1) * dtMs,
    });
    const layer = { values: Float32Array.from([100 / 0.3048, NULL_F32, NULL_F32]), unit: 'ft' };
    const grid = surfaceSectionGrid({ z_domain: 'depth' }, layer, geom, dtMs, timeConv);
    expect(grid[0]).toBeCloseTo(100 / dtMs, 5);
    expect(grid[1]).toBe(NULL_F32);
  });

  test('a fully out-of-window surface returns null, not an empty grid', () => {
    const layer = { values: Float32Array.from([9000, 9000, 9000]), unit: 'ms' };
    expect(surfaceSectionGrid({ z_domain: 'time' }, layer, geom, dtMs, null)).toBeNull();
  });
});

describe('exportStoredSurface', () => {
  test('offers the four Petrel-compatible formats', () => {
    expect(SURFACE_EXPORT_FORMATS.map((f) => f.key))
      .toEqual(['xyz', 'cps3', 'zmap', 'irap']);
  });

  test('rejects an unknown format before touching storage', async () => {
    await expect(exportStoredSurface({ name: 's' }, 'nope'))
      .rejects.toThrow(/Unknown surface export format/);
  });
});

describe('volumeCrsFields (surfaces inherit the volume frame, Phase 5)', () => {
  test('tagged volumes stamp their tag and unit; legacy volumes stamp nothing', () => {
    expect(volumeCrsFields({ crs: 'EPSG:32631' })).toEqual({ crs: 'EPSG:32631', xyUnit: 'm' });
    expect(volumeCrsFields({ crs: 'LOCAL' })).toEqual({ crs: 'LOCAL', xyUnit: null });
    expect(volumeCrsFields({ crs: null })).toEqual({});
    expect(volumeCrsFields(null)).toEqual({});
  });
});
