/**
 * Pure parts of the Seismolord surfaces service: provenance filtering
 * (which registry rows belong to a volume's Surfaces section) and the
 * registry-row -> writers-grid reconstruction. Network paths (list /
 * save / download) are the surfacesRegistry house pattern and are
 * exercised in staging.
 */
import {
  isVolumeSurface, surfaceToGrid, exportStoredSurface, SURFACE_EXPORT_FORMATS,
} from '@/pages/apps/Seismolord/services/surfacesService';

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
