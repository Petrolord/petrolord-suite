/**
 * G4.4 — the cross-app handoff Mapping Studio -> ReservoirCalc Pro,
 * in code: a geo_surfaces grid bridges to XYZ via the byte-golden
 * writeXYZ and RCP's own SurfaceParser reads it back to points. This is
 * the "horizon -> mapped surface -> GRV without the filesystem" path.
 */

import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { topsToPoints, specForPoints } from '../engine/surface';
import { gridSurface } from '@/lib/gridding/gridding';
import { surfaceToXyzText } from '@/lib/surfacesRegistry';
import { SurfaceParser } from '@/pages/apps/ReservoirCalcPro/services/SurfaceParser';

test('grid a top -> surfaceToXyzText -> RCP SurfaceParser yields the live points', async () => {
  const backend = makeInMemoryBackend();
  const wells = await backend.listWells();
  const pts = topsToPoints(wells, 'Top Dome');
  const spec = specForPoints(pts, 150, 2);
  const g = gridSurface(pts, spec);

  // publish, then bridge exactly as RCP's dialog does
  const saved = await backend.saveSurface({ name: 'Top Dome structure', kind: 'structure', spec, grid: g.z });
  const grid = await backend.downloadSurfaceGrid(saved);
  const xyz = surfaceToXyzText(saved, grid);

  // XYZ has one line per grid node (nulls included as the 1e30 sentinel)
  const lines = xyz.trim().split('\n');
  expect(lines.length).toBe(spec.nx * spec.ny);

  const file = new File([xyz], 'top-dome.xyz', { type: 'text/plain' });
  const parsed = await SurfaceParser.parse(file);
  // RCP drops the null-Z sentinel nodes -> only the live gridded area
  const liveNodes = Array.from(grid).filter((v) => Number.isFinite(v) && Math.abs(v) < 1e29).length;
  expect(parsed.points.length).toBe(liveNodes);
  expect(parsed.points.length).toBeGreaterThan(0);
  // z values land in the well-top range
  const zs = parsed.points.map((p) => p.z);
  expect(Math.min(...zs)).toBeGreaterThan(1400);
  expect(Math.max(...zs)).toBeLessThan(1700);
});
