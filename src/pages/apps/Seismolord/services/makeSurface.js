// Make a SURFACE straight from an interpreted horizon: grid the picks
// with Seismolord's fault-aware gridder (surfaceWorkflow.gridHorizonSurface)
// and save the result as a first-class surface in the shared geo_surfaces
// registry (surfacesService.saveHorizonAsSurface), the object Mapping &
// Surface Studio, Earth Modeling and ReservoirCalc Pro read. No file is
// written or re-imported on the way.
//
// The provenance matches what the Export dialog's "Save as surface"
// records, so a surface made either way reads the same downstream.

import { gridHorizonSurface } from './surfaceWorkflow';
import { saveHorizonAsSurface } from './surfacesService';
import { normalizeVelocity } from '../engine/velocityModel';
import { surveyAffine } from '../engine/surveyGeometry';

/** Where the Make surface dialog sends the user after a publish. */
export const MAPPING_STUDIO_PATH = '/dashboard/apps/geoscience/mapping-surface-studio';

/**
 * Grid a horizon and save it to the surface registry.
 *
 * @param {Object} p
 * @param {Object} p.volume seismic_volumes row
 * @param {Object} p.manifest volume manifest
 * @param {Object} p.horizon seismic_horizons row
 * @param {'depth'|'twt'} p.domain
 * @param {number} [p.velocityFtS] constant velocity when the volume has
 *   no velocity model (depth only)
 * @param {number} [p.cellM] output cell, 0 = the survey bin
 * @param {?Object[]} [p.faults] faults that block interpolation
 * @param {number} [p.maxExtrapolationM] 0 = 2 cells
 * @param {?AbortSignal} [p.signal]
 * @returns {Promise<{surface: Object, live: number, zMin: number,
 *   zMax: number, cellM: number, faultInfo: ?Object}>}
 */
export async function makeSurfaceFromHorizon({
  volume, manifest, horizon, domain, velocityFtS = 10000, cellM = 0, faults = null,
  maxExtrapolationM = 0, signal = null,
}) {
  if (!volume || !manifest) throw new Error('Open the horizon\'s volume first.');
  if (!horizon) throw new Error('Choose a horizon.');
  const affine = surveyAffine(manifest.geometry);
  if (!affine) throw new Error('The volume has no usable survey coordinates for gridding.');
  const model = normalizeVelocity(manifest.velocity);
  const {
    g, spec, gridded, faultInfo, maxExtrapolationM: usedExtrapolation,
  } = await gridHorizonSurface({
    manifest,
    horizon,
    domain,
    velocityFtS,
    cellM,
    faults: faults?.length ? faults : null,
    maxExtrapolationM,
    signal,
  });
  const params = {
    cell_m: spec.dx,
    velocity_model: domain === 'depth' && model ? model : null,
    velocity_ft_s: domain === 'depth' && !model ? velocityFtS : null,
    velocity_calibration: domain === 'depth' && model
      ? (manifest.velocity_calibration || null) : null,
    wells_used: domain === 'depth' && model
      ? (manifest.velocity_calibration?.wells ?? null) : null,
    survey_geometry: affine.legacyAxisAligned ? 'corners_axis_aligned' : 'measured_affine',
    fault_aware: Boolean(faultInfo),
    fault_blocks: faultInfo?.blocks ?? null,
    faults_used: faultInfo?.traces ?? null,
    faults_excluded: null,
    max_extrapolation_m: usedExtrapolation,
    control_points: gridded.controlCount,
    live_nodes: gridded.live,
    z_min: gridded.zMin,
    z_max: gridded.zMax,
    made_from: 'make_surface',
  };
  const surface = await saveHorizonAsSurface({
    volume, horizon, domain, g, spec, params,
  });
  return {
    surface,
    live: gridded.live,
    zMin: gridded.zMin,
    zMax: gridded.zMax,
    cellM: spec.dx,
    faultInfo,
  };
}
