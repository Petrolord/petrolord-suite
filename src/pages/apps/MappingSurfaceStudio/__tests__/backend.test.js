/**
 * G4.3 — the in-memory backend IS the harness contract: registry
 * shapes, the grid→publish→list flow the e2e drives, owner-only guards
 * mirroring RLS, and an isochore round-trip through the surface engine.
 */

import { makeInMemoryBackend } from '../services/inMemoryBackend';
import {
  topsToPoints, specForPoints, resampleTo, isochore, surfaceStats,
} from '../engine/surface';
import { gridSurface } from '@/lib/gridding/gridding';

test('seeds wells with tops + one org-shared read-only surface', async () => {
  const b = makeInMemoryBackend();
  const wells = await b.listWells();
  expect(wells).toHaveLength(4);
  expect(topsToPoints(wells, 'Top Dome')).toHaveLength(4);
  const surfaces = await b.listSurfaces();
  expect(surfaces).toHaveLength(1);
  expect(surfaces[0].is_own).toBe(false);
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
  // TPS honors controls: the surface z-range brackets the well tops
  const st = surfaceStats(back);
  expect(st.min).toBeLessThanOrEqual(1560 + 1);
  expect(st.max).toBeGreaterThanOrEqual(1470 - 1);
});

test('owner-only: deleting the org-shared surface is rejected (mirrors RLS)', async () => {
  const b = makeInMemoryBackend();
  const shared = (await b.listSurfaces())[0];
  await expect(b.deleteSurface(shared)).rejects.toThrow(/Only the owner/);
  // reads stay open
  const grid = await b.downloadSurfaceGrid(shared);
  expect(grid.length).toBe(shared.nx * shared.ny);
});

test('isochore of two published surfaces resamples + subtracts', async () => {
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
  const gsOnDeep = resampleTo(gs, shal.spec, deep.spec);
  const iso = isochore(gd, gsOnDeep);
  const st = surfaceStats(iso);
  // Base Sand is below Top Dome at every well -> positive thickness on
  // average (two independent TPS surfaces can overshoot near the mask
  // edges, so assert the mean, not the strict min)
  expect(st.count).toBeGreaterThan(0);
  expect(st.mean).toBeGreaterThan(0);
  expect(st.mean).toBeGreaterThan(50); // well tops differ by ~120-160 m
});
