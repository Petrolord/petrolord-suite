// Map (X, Y) units (MAP-U1-001, 2026-09-30). A surface's frame is in the
// units of its CRS: metres for UTM and Minna belts, international or US
// survey feet for state-plane grids. Areas, volumes, cell sizes and
// distances typed in metres must go through the frame's metres per
// unit, or a feet frame reads 10.76 times too much area.

import { crsUnit } from '@/lib/crs';
import { unitToMetres } from '../../../../../packages/engines/lib/crs/catalog';

export const XY_UNIT_LABEL = Object.freeze({ m: 'metres', ft: 'feet', ftUS: 'US survey feet', deg: 'degrees' });

/** The XY unit of a registry row or a preview: the stored column first, then its CRS. */
export function xyUnitOf(surface) {
  if (!surface) return null;
  if (surface.xy_unit) return surface.xy_unit;
  if (surface.xyUnit) return surface.xyUnit;
  return surface.crs ? crsUnit(surface.crs) : null;
}

/** Metres per map unit; NaN for a geographic frame (degrees have no metre scale). */
export function metresPerXy(unit) {
  if (unit == null || unit === '') return 1;
  try { return unitToMetres(unit); } catch { return NaN; }
}

/**
 * A distance typed in metres, in the frame's own units.
 * @throws when the frame is geographic
 */
export function metresToXy(valueM, unit) {
  const s = metresPerXy(unit);
  if (!Number.isFinite(s)) throw new Error('The wells or the surface are in a geographic CRS (degrees). Set a projected Project CRS to grid and measure in metres.');
  return valueM / s;
}

/**
 * MAP-U1-019: the frame of a top map's control points. Wells in two known
 * CRSs cannot be gridded in one set of raw coordinates (the map would
 * mix UTM metres with state-plane feet), so that is refused with the
 * CRSs named. The depth frame returns borehole offsets in METRES; on a
 * feet frame they are scaled into the wells' unit before being added to
 * the wellhead.
 * @param {Array<{x,y,well}>} points from topsToControlPoints (x = wellhead + offset in m)
 * @param {Array<{name, surface_x, surface_y, crs}>} wells
 * @returns {{points:Array, crs:?string, unit:?string}}
 */
export function controlPointsInWellFrame(points, wells, crsUnitOf) {
  const byName = new Map((wells || []).map((w) => [w.name, w]));
  const used = points.map((p) => byName.get(p.well)).filter(Boolean);
  const tags = [...new Set(used.map((w) => w.crs).filter(Boolean))];
  if (tags.length > 1) {
    throw new Error(`The wells carrying this top are in ${tags.length} coordinate systems (${tags.join(', ')}), so they cannot be gridded on one map. Reproject the project to one CRS in Well Data Manager, or grid the wells of one CRS.`);
  }
  const crs = tags[0] || null;
  const unit = crs ? crsUnitOf(crs) : null;
  const s = metresPerXy(unit);
  if (!Number.isFinite(s)) throw new Error('The wells are in a geographic CRS (degrees). Set a projected Project CRS to grid them.');
  if (s === 1) return { points, crs, unit };
  return {
    crs,
    unit,
    points: points.map((p) => {
      const w = byName.get(p.well);
      if (!w) return p;
      return { ...p, x: w.surface_x + (p.x - w.surface_x) / s, y: w.surface_y + (p.y - w.surface_y) / s };
    }),
  };
}
