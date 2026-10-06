// The storage footprint and the seismic_volumes survey_meta of a derived
// (attribute) volume. Pure, no React or Supabase imports: the browser
// attribute job (attributeJobService.js) and the seismic worker's
// attribute_volume job both use it, so a server-computed attribute volume
// is registered exactly as a browser-computed one. The attribute rules a job
// checks before starting live here too.
import { ATTRIBUTE_DEFS } from '../engine/attributes';
import { DISCONTINUITY_DEFS } from '../engine/discontinuity';
import { mapGradientTransform } from '../engine/structureAttributes';
import { surveyAffine } from '../engine/surveyGeometry';

/** Every computable derived-volume attribute: per-trace + neighborhood. */
export const ALL_ATTRIBUTE_DEFS = { ...ATTRIBUTE_DEFS, ...DISCONTINUITY_DEFS };

/**
 * Why an attribute cannot be computed on this parent, or null. Today only
 * map-frame attributes (needsAffine: Dip azimuth, grid north) have a
 * precondition: the survey's measured orientation.
 */
export function attributePrecheck(attributeName, parentManifest) {
  const def = Object.prototype.hasOwnProperty.call(ALL_ATTRIBUTE_DEFS, attributeName)
    ? ALL_ATTRIBUTE_DEFS[attributeName] : null;
  if (!def?.needsAffine) return null;
  try {
    mapGradientTransform(surveyAffine(parentManifest?.geometry));
    return null;
  } catch (e) {
    return e.message;
  }
}

/** W4.4: attribute math needs full-precision input — surface the engine
 *  rule as friendly copy before any work starts. */
export function assertFloat32Parent(parentManifest) {
  const dtype = parentManifest?.brick?.dtype ?? 'float32le';
  if (dtype !== 'float32le') {
    throw new Error('Attribute volumes need a float32 parent. This volume was imported with 16-bit storage. Re-import it without compression to compute attributes.');
  }
}


/** Brick-store footprint of a volume on the parent's lattice. */
export function derivedStorageBytes(parentManifest) {
  const b = parentManifest?.brick;
  if (!b?.count || !b?.size) throw new Error('Parent manifest has no brick block.');
  // derived volumes always write float32 bricks on the parent's PADDED grid
  return b.count * b.size ** 3 * 4;
}

/** survey_meta for a derived volume's row once it is ready. */
export function derivedSurveyMeta(manifest, parentVolumeId) {
  return {
    il: manifest.geometry.il,
    xl: manifest.geometry.xl,
    ns: manifest.geometry.ns,
    dt_us: manifest.geometry.dt_us,
    corners: manifest.geometry.corners,
    ...(manifest.geometry.affine ? { affine: manifest.geometry.affine } : {}),
    ...(manifest.geometry.coord_scalar != null
      ? { coord_scalar: manifest.geometry.coord_scalar } : {}),
    ...(manifest.geometry.crs ? { crs: manifest.geometry.crs } : {}),
    brick: manifest.brick.grid,
    brick_size: manifest.brick.size,
    stats: manifest.stats,
    storage_bytes: derivedStorageBytes(manifest),
    attribute: manifest.attribute,
    parent_volume_id: parentVolumeId,
  };
}
