// Well-door placement (CRS program, Phase 4): turn what the user
// DECLARED (projected XY in some CRS, or WGS 84 lat/lon, plus the
// azimuth reference of the deviation survey) into what the registry
// STORES (coordinates in the Project CRS, grid-north azimuths), with
// the declaration preserved in crs_provenance.
//
// Same semantics as the SEG-Y door (ingestCrs): the first placed well
// with no Project CRS set should define it — this module cannot write
// settings (it is pure), so it returns autoSetProject for the caller
// to act on. LOCAL and UNKNOWN store as declared, untransformed.

import { normalizeTag, isTransformableTag, LOCAL, UNKNOWN } from '@/lib/crs/tags';
import {
  getTransformer, projectorFor, convergenceAt, crsUnit, unitToMetres,
} from '@/lib/crs';
import { toGridAzimuths } from '../../../packages/engines/engines/seismolord/wellPath';

const WGS84 = 'EPSG:4326';

/**
 * Place a well's surface location.
 *
 * @param {Object} loc what the user entered:
 *   {mode: 'xy', crsTag, x, y, xyUnit} coordinates in the declared CRS
 *     (xyUnit is the unit the NUMBERS are in, converted to the declared
 *     CRS's native unit before transforming), or
 *   {mode: 'latlon', lat, lon} WGS 84 geographic
 * @param {{projectTag: ?string, customDefs?: Object}} [crsContext]
 * @returns {{surfaceX: number, surfaceY: number, crs: ?string,
 *   xyUnit: ?string, crsProvenance: Object, projectTag: string,
 *   autoSetProject: ?string}}
 *   surfaceX/surfaceY in the Project CRS's native units; crs is the
 *   stored tag (null = unknown); autoSetProject names the tag the
 *   caller should set as Project CRS (first placed import)
 */
export function placeWellLocation(loc, crsContext = {}) {
  const customDefs = crsContext.customDefs || {};
  const project = normalizeTag(crsContext.projectTag);
  const projectSet = isTransformableTag(project);

  if (loc.mode === 'latlon') {
    const lat = Number(loc.lat);
    const lon = Number(loc.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw new Error('Latitude must be in [-90, 90] and longitude in [-180, 180].');
    }
    if (!projectSet) {
      throw new Error('Latitude/longitude entry needs a Project CRS to convert into. Set the Project CRS first, or enter projected coordinates with their CRS.');
    }
    const p = projectorFor(project, customDefs).fromLonLat(lon, lat);
    return {
      surfaceX: p.x,
      surfaceY: p.y,
      crs: project,
      xyUnit: crsUnit(project, customDefs),
      projectTag: project,
      autoSetProject: null,
      crsProvenance: {
        declared_crs: WGS84, declared_lat: lat, declared_lon: lon, transform: 'proj4',
      },
    };
  }

  const declared = normalizeTag(loc.crsTag);
  const x = Number(loc.x);
  const y = Number(loc.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error('Surface X and Y must be numbers.');
  }
  const provenance = {
    declared_crs: declared,
    declared_x: x,
    declared_y: y,
    declared_unit: loc.xyUnit || null,
  };

  if (!isTransformableTag(declared)) {
    return {
      surfaceX: x,
      surfaceY: y,
      crs: declared === LOCAL ? LOCAL : null,
      xyUnit: loc.xyUnit || null,
      projectTag: project,
      autoSetProject: null,
      crsProvenance: { ...provenance, transform: 'none' },
    };
  }

  // Entered numbers -> the declared CRS's native unit.
  const nativeUnit = crsUnit(declared, customDefs);
  const enteredUnit = loc.xyUnit || nativeUnit;
  const scale = unitToMetres(enteredUnit) / unitToMetres(nativeUnit);
  const nx = x * scale;
  const ny = y * scale;

  if (!projectSet || declared === project) {
    return {
      surfaceX: nx,
      surfaceY: ny,
      crs: declared,
      xyUnit: nativeUnit,
      projectTag: projectSet ? project : declared,
      autoSetProject: projectSet ? null : declared,
      crsProvenance: { ...provenance, transform: 'none' },
    };
  }

  const t = getTransformer(declared, project, customDefs).forward(nx, ny);
  return {
    surfaceX: t.x,
    surfaceY: t.y,
    crs: project,
    xyUnit: crsUnit(project, customDefs),
    projectTag: project,
    autoSetProject: null,
    crsProvenance: { ...provenance, transform: 'proj4' },
  };
}

/**
 * Rotate a deviation survey's azimuths to grid north of the CRS the
 * well is stored in, using the wellhead convergence.
 *
 * @param {{md, inc, azi}[]} deviation
 * @param {{azimuthRef?: string, declinationDeg?: number}} az
 * @param {{crs: ?string, surfaceX: number, surfaceY: number}} placed
 *   placeWellLocation() result
 * @param {Object} [customDefs]
 * @returns {{deviation: Object[], azimuthProvenance: Object}}
 */
export function placeDeviation(deviation, az = {}, placed, customDefs = {}) {
  const ref = az.azimuthRef || 'grid';
  if (!deviation?.length || ref === 'grid') {
    return {
      deviation: deviation || [],
      azimuthProvenance: { azimuth_ref: ref, rotation_deg: 0 },
    };
  }
  const storedTag = normalizeTag(placed.crs);
  if (!isTransformableTag(storedTag)) {
    throw new Error('True-north or magnetic azimuths need a known CRS to compute grid convergence. Declare the CRS, or import the survey as grid azimuths.');
  }
  const convergenceDeg = convergenceAt(storedTag, placed.surfaceX, placed.surfaceY, customDefs);
  const declinationDeg = Number(az.declinationDeg) || 0;
  const rotated = toGridAzimuths(deviation, { azimuthRef: ref, convergenceDeg, declinationDeg });
  return {
    deviation: rotated,
    azimuthProvenance: {
      azimuth_ref: ref,
      convergence_deg: convergenceDeg,
      declination_deg: ref === 'magnetic' ? declinationDeg : undefined,
      rotation_deg: (ref === 'magnetic' ? declinationDeg : 0) + convergenceDeg,
    },
  };
}

export { UNKNOWN, LOCAL };
