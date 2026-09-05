/**
 * G4.3 — the in-memory backend IS the harness contract: registry
 * shapes, the grid→publish→list flow the e2e drives, owner-only guards
 * mirroring RLS, and an isochore round-trip through the surface engine.
 */

import { makeInMemoryBackend } from '../services/inMemoryBackend';
import {
  topsToPoints, specForPoints, resampleTo, thickness, surfaceStats,
} from '../engine/surface';
import { gridSurface } from '@/lib/gridding/gridding';

test('seeds wells with tops (two deviated) + one org-shared read-only elevation surface', async () => {
  const b = makeInMemoryBackend();
  const wells = await b.listWells();
  expect(wells).toHaveLength(5);
  expect(wells.filter((w) => w.deviation.length > 1).map((w) => w.name)).toEqual(['KETA-2', 'KETA-5']);
  expect(wells.every((w) => w.kb_m === 30 && w.zones[0].name === 'Top Dome')).toBe(true);
  const pts = topsToPoints(wells, 'Top Dome');
  expect(pts).toHaveLength(5);
  expect(pts.every((p) => p.z < 0)).toBe(true); // elevation
  const surfaces = await b.listSurfaces();
  expect(surfaces).toHaveLength(2); // the org-shared regional top and the seeded TWT dome (MS3)
  const shared = surfaces.find((s) => !s.is_own);
  expect(shared.name).toBe('Regional Top (org shared)');
  expect((await b.downloadSurfaceGrid(shared))[0]).toBe(-1550);
});

test('grid a top → publish → appears in the registry, grid re-downloads', async () => {
  const b = makeInMemoryBackend();
  const wells = await b.listWells();
  const pts = topsToPoints(wells, 'Top Dome');
  const spec = specForPoints(pts, 150, 2);
  const g = gridSurface(pts, spec);
  const saved = await b.saveSurface({ name: 'Top Dome structure', kind: 'structure', spec, grid: g.z });
  expect(saved.is_own).toBe(true);
  expect(saved.nx).toBe(spec.nx);

  const surfaces = await b.listSurfaces();
  expect(surfaces.find((s) => s.id === saved.id)).toBeTruthy();
  const back = await b.downloadSurfaceGrid(saved);
  expect(back.length).toBe(spec.nx * spec.ny);
  // TPS honors controls: the surface z-range (elevation) spans the
  // well tops, -(tvdss): about -1520 (KETA-1, KETA-4 vertical with
  // KB 30) to about -1436 (KETA-5, deviated); grid nodes sit beside
  // the wells, so the bracket is loose
  const st = surfaceStats(back);
  expect(st.min).toBeLessThanOrEqual(-1500);
  expect(st.max).toBeGreaterThanOrEqual(-1460);
  expect(st.max).toBeLessThan(0);
});

test('owner-only: deleting the org-shared surface is rejected (mirrors RLS)', async () => {
  const b = makeInMemoryBackend();
  const shared = (await b.listSurfaces()).find((s) => !s.is_own);
  await expect(b.deleteSurface(shared)).rejects.toThrow(/Only the owner/);
  // reads stay open
  const grid = await b.downloadSurfaceGrid(shared);
  expect(grid.length).toBe(shared.nx * shared.ny);
});

test('share toggle: own surfaces share/unshare; teammate rows are owner-only (mirrors RLS)', async () => {
  const b = makeInMemoryBackend();
  const wells = await b.listWells();
  const pts = topsToPoints(wells, 'Top Dome');
  const spec = specForPoints(pts, 150, 2);
  const saved = await b.saveSurface({ name: 'Top Dome structure', spec, grid: gridSurface(pts, spec).z });
  expect(saved.organization_id).toBeNull();

  const shared = await b.setSurfaceShared(saved, true);
  expect(shared.organization_id).toBeTruthy();
  expect((await b.listSurfaces()).find((s) => s.id === saved.id).organization_id).toBeTruthy();

  const unshared = await b.setSurfaceShared(saved, false);
  expect(unshared.organization_id).toBeNull();

  const teammate = (await b.listSurfaces()).find((s) => !s.is_own);
  await expect(b.setSurfaceShared(teammate, false)).rejects.toThrow(/Only the owner/);
});

test('isochore of two published elevation surfaces resamples + subtracts top minus base', async () => {
  const b = makeInMemoryBackend();
  const wells = await b.listWells();
  const mk = async (topName) => {
    const pts = topsToPoints(wells, topName);
    const spec = specForPoints(pts, 150, 2);
    const g = gridSurface(pts, spec);
    const s = await b.saveSurface({ name: `${topName} structure`, spec, grid: g.z });
    return { s, spec };
  };
  const deep = await mk('Base Sand');
  const shal = await mk('Top Dome');
  const gd = await b.downloadSurfaceGrid(deep.s);
  const gs = await b.downloadSurfaceGrid(shal.s);
  const gdOnTop = resampleTo(gd, deep.spec, shal.spec);
  const iso = thickness(gs, gdOnTop);
  const st = surfaceStats(iso);
  // Base Sand is below Top Dome at every well -> positive thickness on
  // average (two independent TPS surfaces can overshoot near the mask
  // edges, so assert the mean, not the strict min)
  expect(st.count).toBeGreaterThan(0);
  expect(st.mean).toBeGreaterThan(0);
  expect(st.mean).toBeGreaterThan(50); // well tops differ by ~120-160 m
});

test('MS2: rename and re-grid in place keep the id; teammate rows are refused', async () => {
  const b = makeInMemoryBackend();
  const wells = await b.listWells();
  const pts = topsToPoints(wells, 'Top Dome');
  const spec = specForPoints(pts, 150, 2);
  const saved = await b.saveSurface({ name: 'Top Dome structure', spec, grid: gridSurface(pts, spec).z, provenance: { cell_m: 150 } });
  const renamed = await b.updateSurface(saved.id, { name: 'Top Dome (v2)' });
  expect(renamed.id).toBe(saved.id);
  expect((await b.listSurfaces()).find((s) => s.id === saved.id).name).toBe('Top Dome (v2)');
  const spec2 = specForPoints(pts, 100, 2);
  const replaced = await b.replaceSurfaceGrid(saved, { spec: spec2, grid: gridSurface(pts, spec2).z, provenance: { cell_m: 100, history: [{ previous: { nx: spec.nx } }] } });
  expect(replaced.id).toBe(saved.id);
  expect(replaced.nx).toBe(spec2.nx);
  expect(replaced.provenance.history).toHaveLength(1);
  expect((await b.downloadSurfaceGrid(replaced)).length).toBe(spec2.nx * spec2.ny);
  const teammate = (await b.listSurfaces()).find((s) => !s.is_own);
  await expect(b.updateSurface(teammate.id, { name: 'x' })).rejects.toThrow(/Only the owner/);
  await expect(b.replaceSurfaceGrid(teammate, { spec: spec2, grid: new Float32Array(spec2.nx * spec2.ny) })).rejects.toThrow(/Only the owner/);
});

test('MS3: drawn polygons save to the culture store, velocity models list, a TWT surface is seeded', async () => {
  const b = makeInMemoryBackend();
  const twt = (await b.listSurfaces()).find((s) => s.z_domain === 'time');
  expect(twt.name).toBe('Dome TWT');
  const g = await b.downloadSurfaceGrid(twt);
  expect(Math.min(...g)).toBeGreaterThanOrEqual(1400);
  const row = await b.saveCulture({ name: 'Block A', kind: 'fault_polygon', geometryType: 'polygon', features: [{ type: 'polygon', rings: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }], style: {} });
  expect((await b.listCulture()).map((c) => c.name)).toEqual(['Demo license block', 'Block A']);
  expect((await b.downloadCultureFeatures(row))[0].rings[0]).toHaveLength(4);
  await b.deleteCulture(row);
  expect((await b.listCulture())).toHaveLength(1);
  const models = await b.listVelocityModels();
  expect(models.map((m) => m.kind)).toEqual(['linear', 'layercake']);
});
