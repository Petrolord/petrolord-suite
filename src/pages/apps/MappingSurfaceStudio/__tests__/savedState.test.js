// PL5 (MAP-U1): geo_surfaces rows saved by every earlier release open and
// export on this build. Fixtures: e2e/fixtures/map/saved/surfaces.json.
import fs from 'fs';
import path from 'path';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { exportSurfaceText, controlPointsCsv, describeSurface, gridInUnit, specOfSurface, EXPORT_FORMATS } from '../services/surfaceExport';
import { mapCaption } from '../services/mapReport';
import { quickGrv } from '../services/quickGrv';
import { xyUnitOf, metresPerXy } from '../services/xyUnits';

const fx = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'e2e/fixtures/map/saved/surfaces.json'), 'utf8'));

describe('every saved release opens, describes itself and exports', () => {
  const backend = makeInMemoryBackend({ seed: fx });
  test.each(fx.surfaces.map((s) => [s.release, s.row.id]))('%s', async (_, id) => {
    const row = (await backend.listSurfaces()).find((s) => s.id === id);
    const gridM = gridInUnit(row, await backend.downloadSurfaceGrid(row), 'm');
    expect(gridM.length).toBe(row.nx * row.ny);
    expect(describeSurface(row)).toBeTruthy();
    const cap = mapCaption({ surface: row, depthUnit: 'ft' });
    expect(cap.caption).toHaveLength(3);
    for (const f of EXPORT_FORMATS) {
      if (row.rotation_deg && f.key !== 'irap') expect(() => exportSurfaceText(row, gridM, f.key, { unit: 'ft' })).toThrow();
      else expect(exportSurfaceText(row, await backend.downloadSurfaceGrid(row), f.key, { unit: 'ft' }).text.length).toBeGreaterThan(50);
    }
    if (row.provenance?.points) expect(controlPointsCsv(row, { unit: 'ft' }).text).toContain('KETA-1');
    else expect(() => controlPointsCsv(row)).toThrow(/no control points recorded/);
  });

  test('the metre and the US-feet rows of one dome give one GRV (MAP-U1-001 on saved data)', async () => {
    const rows = await backend.listSurfaces();
    const grv = async (id) => {
      const row = rows.find((s) => s.id === id);
      const g = gridInUnit(row, await backend.downloadSurfaceGrid(row), 'm');
      return quickGrv({ spec: specOfSurface(row), gridM: g, contactM: -1540, xyToM: metresPerXy(xyUnitOf(row)) }).grvM3;
    };
    const m = await grv('saved-t1');
    expect(m).toBeGreaterThan(0);
    expect((await grv('saved-u1-ftus')) / m).toBeCloseTo(1, 3);
  });

  test('a kept previous grid that did not travel says so', async () => {
    await expect(backend.downloadArchivedGrid('user-dev/saved-t1/grid.prev-1.f32', { nx: 6, ny: 5 })).rejects.toThrow(/previous grid/);
  });
});
