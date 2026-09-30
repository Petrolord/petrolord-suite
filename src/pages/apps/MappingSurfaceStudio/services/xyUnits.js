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
