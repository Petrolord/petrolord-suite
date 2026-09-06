// Contour Map Digitizer to the surface registry (Mapping MS5,
// 2026-09-06). The digitizer's output is contour polylines in image
// pixels with a value each; this module turns them into control points
// in the map's world frame and grids them with the shared engine, so a
// scanned map lands in geo_surfaces under the registry convention
// (elevation, negative below datum, unit per row). Pure planning, no I/O.

import { gridSurface } from '@/lib/gridding/gridding';
import { specForPoints } from '@/pages/apps/MappingSurfaceStudio/engine/surface';
import { surfaceStats } from '@/lib/gridding/gridmath';

export const VALUE_CONVENTIONS = Object.freeze([
  { id: 'depth', label: 'Depth below datum (positive down)' },
  { id: 'elevation', label: 'Elevation (negative below datum)' },
]);
export const Z_UNITS = Object.freeze(['m', 'ft']);

/**
 * Control points from the digitized contour lines.
 * @param {{contours: Array<{points: number[][], value: number|null}>}} layers
 * @param {(px:number, py:number) => [number, number]} pixelToWorld
 * @param {{valuesAre?: 'depth'|'elevation'}} opts
 * @returns {{points: Array<{x,y,z}>, lines: number, skipped: number}}
 */
export function contourControlPoints(layers, pixelToWorld, { valuesAre = 'depth' } = {}) {
  if (typeof pixelToWorld !== 'function') throw new Error('Set the georeference first (three control points), so the contours have world coordinates.');
  if (!['depth', 'elevation'].includes(valuesAre)) throw new Error(`Unknown value convention "${valuesAre}".`);
  const sign = valuesAre === 'depth' ? -1 : 1;
  const points = [];
  let lines = 0; let skipped = 0;
  for (const line of layers?.contours || []) {
    const v = Number(line.value);
    if (line.value === null || line.value === '' || !Number.isFinite(v) || !line.points?.length) { skipped += 1; continue; }
    lines += 1;
    for (const [px, py] of line.points) {
      const [x, y] = pixelToWorld(px, py);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      points.push({ x, y, z: sign * v });
    }
  }
  return { points, lines, skipped };
}

/**
 * Grid the control points with the shared thin-plate spline on a frame
 * padded two cells around them.
 * @returns {{spec, grid: Float32Array, stats, controlCount, lines}}
 */
export function planDigitizedSurface(layers, pixelToWorld, { valuesAre = 'depth', cellSize = 50 } = {}) {
  const { points, lines, skipped } = contourControlPoints(layers, pixelToWorld, { valuesAre });
  if (lines < 2) throw new Error('Give at least two contour lines a value before gridding.');
  if (!(cellSize > 0)) throw new Error('Cell size must be a positive number in map units.');
  const spec = specForPoints(points, cellSize);
  if (spec.nx * spec.ny > 4_000_000) throw new Error('That cell size makes more than four million nodes. Use a larger cell.');
  const result = gridSurface(points, spec, { maxExtrapolation: 2 * cellSize });
  return {
    spec, grid: result.z, stats: surfaceStats(result.z),
    controlCount: result.controlCount, dropped: result.dropped, lines, skipped,
  };
}

/** The saveSurface payload for a digitized grid. */
export function digitizedSurfacePayload(plan, { name, zUnit = 'm', valuesAre = 'depth', imageName = null, crs = null }) {
  if (!Z_UNITS.includes(zUnit)) throw new Error(`Unknown depth unit "${zUnit}".`);
  const clean = String(name || '').trim();
  if (!clean) throw new Error('Give the surface a name.');
  return {
    name: clean,
    kind: 'structure',
    spec: plan.spec,
    grid: plan.grid,
    zDomain: 'depth',
    zUnit,
    crs,
    xyUnit: null,
    provenance: {
      app: 'contour-map-digitizer',
      source: 'digitized contours',
      image: imageName,
      contour_lines: plan.lines,
      control_points: plan.controlCount,
      values_entered_as: valuesAre,
      z_convention: 'elevation',
      cell: plan.spec.dx,
      created_at: new Date().toISOString(),
    },
  };
}
