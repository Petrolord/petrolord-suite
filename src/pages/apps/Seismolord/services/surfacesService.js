// Seismolord's view of the shared geo_surfaces registry
// (src/lib/surfacesRegistry.js, the cross-app surface home used by
// Mapping & Surface Studio and ReservoirCalc Pro). Converting a
// horizon INTERPRETATION (picks) into a SURFACE persists a first-class
// registry object with full provenance; the explorer's Surfaces
// section lists the ones derived from the active volume, and any of
// them re-exports to XYZ / CPS-3 / ZMAP+ / Irap classic without
// re-gridding.

import {
  listSurfaces, saveSurface, deleteSurface, downloadSurfaceGrid,
  shareSurface, unshareSurface,
} from '@/lib/surfacesRegistry';
import { resolveUserOrgId } from '@/lib/orgContext';
import { supabase } from '@/lib/customSupabaseClient';
import {
  writeXYZ, writeCPS3, writeZMAP, writeIrapClassic,
} from '@/lib/gridding/surfaceExport';
import { latticeSampleSurface, latticeValuesToSamples } from '../engine/surfaceOnLattice';
import { M_PER_FT } from '../engine/velocityModel';
import { crsUnit } from '@/lib/crs';
import { isTransformableTag, normalizeTag, LOCAL } from '@/lib/crs/tags';

export const SURFACE_APP = 'seismolord';

/** Structured CRS fields a surface inherits from its volume: exported
 *  grids live in the volume's stored frame (the Project CRS at the
 *  volume's import). Legacy volumes without a tag save an unknown
 *  placement, exactly as before the CRS program. Pure. */
export const volumeCrsFields = (volume) => {
  const tag = normalizeTag(volume?.crs);
  if (isTransformableTag(tag)) return { crs: tag, xyUnit: crsUnit(tag) };
  if (tag === LOCAL) return { crs: LOCAL, xyUnit: null };
  return {};
};

/** True when a geo_surfaces row was converted from a horizon of this
 *  volume (pure — unit tested). */
export const isVolumeSurface = (row, volumeId) => (
  row?.provenance?.app === SURFACE_APP
  && row?.provenance?.volume?.id === volumeId
);

/** Rows the explorer's Surfaces section lists: the caller's OWN
 *  surfaces derived from this volume, plus every surface a teammate
 *  shared with the organization (read-only, whatever app made it — an
 *  org surface displays wherever it overlaps the survey; one that
 *  doesn't fails the map load with a clear message). Pure — unit
 *  tested. */
export const isExplorerSurface = (row, volumeId) => (
  isVolumeSurface(row, volumeId) || row?.is_own === false
);

/** Registry surfaces for the explorer: own volume-derived first, then
 *  org-shared rows from teammates. */
export async function listVolumeSurfaces(volumeId) {
  const all = await listSurfaces();
  const mine = all.filter((s) => isVolumeSurface(s, volumeId));
  const shared = all.filter((s) => s.is_own === false);
  return [...mine, ...shared];
}

/** The caller's organization id, resolved once per session; null when
 *  they belong to no organization (the share action explains instead
 *  of failing). */
let orgIdPromise; // undefined = not yet requested
export function myOrgId() {
  if (orgIdPromise === undefined) {
    orgIdPromise = supabase.auth.getUser()
      .then(({ data: { user } }) => (user ? resolveUserOrgId(user.id) : null))
      .catch(() => null);
  }
  return orgIdPromise;
}

/** Share/unshare an OWN surface with the caller's organization
 *  (read-only for members, the geo_wells model). Returns the updated
 *  row. */
export async function setSurfaceShared(surface, shared) {
  if (!shared) return unshareSurface(surface.id);
  const org = await myOrgId();
  if (!org) throw new Error('You belong to no organization — nothing to share with.');
  return shareSurface(surface.id, org);
}

/**
 * Persist a gridded horizon as a first-class surface in the shared
 * registry (visible to Mapping & Surface Studio and any later
 * consumer; org-shareable there).
 *
 * @param {Object} p
 * @param {Object} p.volume seismic_volumes row
 * @param {Object} p.horizon seismic_horizons row
 * @param {'depth'|'twt'} p.domain
 * @param {{z: Float32Array}} p.g gridded surface (gridHorizonSurface)
 * @param {{x0,y0,dx,dy,nx,ny}} p.spec export grid spec
 * @param {Object} p.params gridding/export provenance (the same params
 *   object the RCP handoff records)
 */
export async function saveHorizonAsSurface({ volume, horizon, domain, g, spec, params }) {
  return saveSurface({
    name: `${horizon.name} (${domain === 'depth' ? 'depth ft' : 'TWT ms'})`,
    kind: 'structure',
    spec,
    zDomain: domain === 'depth' ? 'depth' : 'time',
    zUnit: domain === 'depth' ? 'ft' : 'ms',
    ...volumeCrsFields(volume),
    crsNote: 'Survey world XY from the volume; Z negative-down (Petrolord convention)',
    grid: g.z,
    provenance: {
      app: SURFACE_APP,
      volume: { id: volume.id, name: volume.name },
      horizon: { id: horizon.id, name: horizon.name },
      domain: domain === 'depth' ? 'depth_ft' : 'twt_ms',
      params,
      converted_at: new Date().toISOString(),
    },
  });
}

/**
 * Persist a gridded horizon AMPLITUDE map as a first-class attribute
 * surface. Values are seismic amplitudes (unitless, sign-preserved,
 * NOT negative-down depth) — kind/z_domain 'attribute' keeps every
 * consumer honest: the map draws it without the depth sign flip and
 * the section overlay skips it (an amplitude is not a time or depth).
 *
 * @param {Object} p
 * @param {Object} p.volume seismic_volumes row
 * @param {Object} p.horizon seismic_horizons row
 * @param {string} p.mode attribute key (engine AMP_MODES)
 * @param {string} p.modeLabel display label for the mode
 * @param {{z: Float32Array}} p.g gridded attribute (gridHorizonAmplitude)
 * @param {{x0,y0,dx,dy,nx,ny}} p.spec export grid spec
 * @param {Object} p.params extraction/resample provenance
 */
export async function saveAmplitudeAsSurface({
  volume, horizon, mode, modeLabel, g, spec, params,
}) {
  return saveSurface({
    name: `${horizon.name} (${modeLabel})`,
    kind: 'attribute',
    spec,
    zDomain: 'attribute',
    zUnit: 'amp',
    ...volumeCrsFields(volume),
    crsNote: 'Survey world XY from the volume; seismic amplitude values (unitless, sign preserved)',
    grid: g.z,
    provenance: {
      app: SURFACE_APP,
      volume: { id: volume.id, name: volume.name },
      horizon: { id: horizon.id, name: horizon.name },
      attribute: mode,
      params,
      converted_at: new Date().toISOString(),
    },
  });
}

/**
 * Persist an imported surface file as a first-class registry surface
 * tied to the active volume. The grid arrives normalised by the
 * parsers (row-major south-first, 1e30 nulls) and sign-fixed by the
 * dialog (negative-down, the suite convention).
 *
 * @param {Object} p
 * @param {Object} p.volume seismic_volumes row
 * @param {string} p.name
 * @param {{nx, ny, x0, y0, dx, dy, z: Float32Array}} p.g
 * @param {'twt'|'depth'} p.domain
 * @param {string} p.fileName source file name (provenance)
 * @param {string} p.format detected dialect (provenance)
 * @param {{live, zMin, zMax}} p.stats pre-sign-fix stats (provenance)
 */
export async function saveImportedSurface({
  volume, name, g, domain, fileName, format, stats, declaredCrs, reprojected,
}) {
  return saveSurface({
    name,
    kind: 'structure',
    spec: { x0: g.x0, y0: g.y0, dx: g.dx, dy: g.dy, nx: g.nx, ny: g.ny },
    zDomain: domain === 'depth' ? 'depth' : 'time',
    zUnit: domain === 'depth' ? 'ft' : 'ms',
    ...volumeCrsFields(volume),
    ...(declaredCrs ? {
      crsProvenance: {
        declared_crs: declaredCrs,
        ...(reprojected ? { transform: 'proj4', coverage: reprojected.coverage } : { transform: 'none' }),
      },
    } : {}),
    crsNote: declaredCrs
      ? `Imported file declared ${declaredCrs}; Z negative-down (Petrolord convention)`
      : 'Imported file; volume frame assumed; Z negative-down (Petrolord convention)',
    grid: g.z,
    provenance: {
      app: SURFACE_APP,
      volume: { id: volume.id, name: volume.name },
      imported_from: { file_name: fileName, format },
      domain: domain === 'depth' ? 'depth_ft' : 'twt_ms',
      stats: { live_nodes: stats.live, z_min: stats.zMin, z_max: stats.zMax },
      imported_at: new Date().toISOString(),
    },
  });
}

export const SURFACE_EXPORT_FORMATS = [
  { key: 'xyz', label: 'XYZ points (.xyz)', ext: 'xyz' },
  { key: 'cps3', label: 'CPS-3 grid (.dat)', ext: 'cps3.dat' },
  { key: 'zmap', label: 'ZMAP+ grid (.dat)', ext: 'zmap.dat' },
  { key: 'irap', label: 'Irap classic grid (.dat)', ext: 'irap.dat' },
];

/** Rebuild the writers' grid shape from a registry row + its blob. */
export function surfaceToGrid(surface, grid) {
  return {
    z: grid,
    nx: surface.nx,
    ny: surface.ny,
    dx: surface.dx,
    dy: surface.dy,
    x: Array.from({ length: surface.nx }, (_, c) => surface.origin_x + c * surface.dx),
    y: Array.from({ length: surface.ny }, (_, r) => surface.origin_y + r * surface.dy),
  };
}

/**
 * Download a stored surface's grid and render it in the requested
 * format. @returns {Promise<{text: string, fileName: string}>}
 */
export async function exportStoredSurface(surface, formatKey) {
  const fmt = SURFACE_EXPORT_FORMATS.find((f) => f.key === formatKey);
  if (!fmt) throw new Error(`Unknown surface export format: ${formatKey}`);
  const grid = await downloadSurfaceGrid(surface);
  const g = surfaceToGrid(surface, grid);
  const safeName = surface.name.replace(/[^\w-]+/g, '_').toLowerCase();
  let text;
  if (formatKey === 'xyz') text = writeXYZ(g);
  else if (formatKey === 'cps3') text = writeCPS3(g);
  else if (formatKey === 'zmap') text = writeZMAP({ ...g, name: safeName });
  else text = writeIrapClassic(g);
  return { text, fileName: `${safeName}.${fmt.ext}` };
}

/**
 * Download a stored surface and resample it onto the volume lattice
 * for the Map window. Structure z is stored negative-down (suite
 * convention) and the map reads positive-down values in the surface's
 * own unit, so live values flip sign; ATTRIBUTE surfaces carry raw
 * amplitudes whose sign is physical and stay untouched. Nulls stay
 * the 1e30 sentinel either way.
 * @returns {Promise<{values: Float32Array, unit: string, live: number}>}
 */
export async function loadSurfaceMapLayer(surface, affine, geom) {
  const grid = await downloadSurfaceGrid(surface);
  const { values, live } = latticeSampleSurface({
    nx: surface.nx,
    ny: surface.ny,
    x0: surface.origin_x,
    y0: surface.origin_y,
    dx: surface.dx,
    dy: surface.dy,
    z: grid,
  }, affine, geom);
  if (!live) {
    throw new Error(`"${surface.name}" does not overlap this volume's survey area.`);
  }
  const isAttribute = surface.z_domain === 'attribute';
  if (!isAttribute) {
    for (let i = 0; i < values.length; i++) {
      if (Math.abs(values[i]) < 1e29) values[i] = -values[i];
    }
  }
  const unit = surface.z_unit
    || (surface.z_domain === 'time' ? 'ms' : isAttribute ? 'amp' : 'ft');
  // unitAssumed: the row records no z unit, so the label is a guess —
  // consumers surface that instead of printing the guess as fact
  // (Mapping publishes 'm', Seismolord 'ft'; only legacy rows are null).
  return { values, unit, unitAssumed: !surface.z_unit && !isAttribute, live };
}

/**
 * Convert a loaded map layer to the SECTION overlay contract: a
 * fractional sample-index lattice grid (1e30 nulls), drawable by
 * SliceView exactly like a horizon pick grid. Time surfaces divide by
 * the sample rate; depth surfaces need the volume's velocity model
 * inverted (makeTvdssToTwt) — without one they stay map-only and this
 * returns null. Cells outside the volume time window go null.
 *
 * @param {Object} surface geo_surfaces row (z_domain decides the path)
 * @param {{values: Float32Array, unit: string}} layer loadSurfaceMapLayer
 * @param {{nIl, nXl, ns}} geom
 * @param {number} dtMs
 * @param {?{toTwtMs: Function}} timeConv makeTvdssToTwt result
 * @returns {?Float32Array} sample-index grid, or null (depth surface
 *   with no velocity model, or nothing inside the time window)
 */
export function surfaceSectionGrid(surface, layer, geom, dtMs, timeConv) {
  // attribute surfaces (amplitude maps) are map-only: their values are
  // not a time or depth, so no sample-index conversion exists
  if (surface.z_domain === 'attribute') return null;
  let r;
  if (surface.z_domain === 'time') {
    r = latticeValuesToSamples(layer.values, geom, { dtMs });
  } else {
    if (!timeConv) return null;
    r = latticeValuesToSamples(layer.values, geom, {
      dtMs, timeConv, mPerUnit: layer.unit === 'ft' ? M_PER_FT : 1,
    });
  }
  return r.live ? r.grid : null;
}

export { deleteSurface };
