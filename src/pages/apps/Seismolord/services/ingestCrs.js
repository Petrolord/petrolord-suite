// CRS decision + application for SEG-Y ingest (Petrel model):
//  - the user DECLARES the file's native CRS in the import panel
//  - storage is always in the Project CRS; a differing native CRS is
//    converted at commit by refitting the survey affine (traces are
//    never resampled)
//  - the first transformable import with no Project CRS set defines it,
//    exactly like the first dataset in a fresh Petrel project
//  - LOCAL and UNKNOWN store as declared, untransformed, and the
//    volume's crs column stays null for UNKNOWN so legacy and
//    declared-unknown read the same way (badge, never block)
//
// planCrs is pure; applyCrsToScan touches only scan.affine/corners and
// returns the survey_meta/manifest crs block.

import { normalizeTag, isTransformableTag, LOCAL, UNKNOWN } from '@/lib/crs/tags';
import { reprojectSurveyAffine, getTransformer, crsUnit } from '@/lib/crs';
import { affineToManifest } from '../engine/surveyGeometry';

/**
 * Decide what happens at commit.
 *
 * @param {?string} nativeTag what the user declared for the file
 * @param {?string} projectTag current Project CRS (UNKNOWN if unset)
 * @returns {{nativeTag: string, projectTag: string, storeTag: ?string,
 *   needsTransform: boolean, autoSetProject: boolean}}
 *   storeTag is the seismic_volumes.crs column value (null = unknown)
 */
export function planCrs(nativeTag, projectTag) {
  const native = normalizeTag(nativeTag);
  const project = normalizeTag(projectTag);

  if (!isTransformableTag(native)) {
    return {
      nativeTag: native,
      projectTag: project,
      storeTag: native === LOCAL ? LOCAL : null,
      needsTransform: false,
      autoSetProject: false,
    };
  }
  if (!isTransformableTag(project)) {
    // First placed dataset defines the Project CRS (Petrel behavior).
    return {
      nativeTag: native,
      projectTag: native,
      storeTag: native,
      needsTransform: false,
      autoSetProject: true,
    };
  }
  return {
    nativeTag: native,
    projectTag: project,
    storeTag: project,
    needsTransform: native !== project,
    autoSetProject: false,
  };
}

/**
 * Rebuild the plan an interrupted import started with, from its
 * survey_meta.ingest.crs record. A resume must finish under the
 * ORIGINAL declaration; the user's Project CRS may have moved on, and
 * re-planning against it would place the volume differently than the
 * bricks already uploaded. Records from before the CRS program have no
 * crs entry and resume as UNKNOWN, exactly what they ran as.
 */
export function planFromRecord(rec) {
  const native = normalizeTag(rec?.crs?.native);
  const project = normalizeTag(rec?.crs?.project);
  let storeTag;
  if (!isTransformableTag(native)) storeTag = native === LOCAL ? LOCAL : null;
  else if (!isTransformableTag(project)) storeTag = native;
  else storeTag = project;
  return {
    nativeTag: native,
    projectTag: isTransformableTag(project) ? project : native,
    storeTag,
    needsTransform: isTransformableTag(native) && isTransformableTag(project) && native !== project,
    autoSetProject: false,
  };
}

/**
 * Apply a plan to a completed scan. Returns the (possibly reprojected)
 * scan and the crs block for survey_meta / manifest.geometry.crs.
 *
 * @param {Object} scan scanGeometry() result (mutated copy returned)
 * @param {ReturnType<typeof planCrs>} plan
 * @param {Object} customDefs geoscience_settings.custom_defs
 */
export function applyCrsToScan(scan, plan, customDefs = {}) {
  const base = {
    project: plan.projectTag,
    native: plan.nativeTag,
    native_xy_unit: isTransformableTag(plan.nativeTag) ? crsUnit(plan.nativeTag, customDefs) : null,
  };

  if (!plan.needsTransform) {
    return {
      scan,
      crsBlock: plan.nativeTag === UNKNOWN
        ? { project: UNKNOWN, native: UNKNOWN, native_xy_unit: null }
        : { ...base, transform: 'none', max_residual_m: 0 },
    };
  }

  const out = { ...scan, corners: { ...scan.corners } };
  let transformer = null;
  let maxResidualM = 0;
  let nativeAffine = null;

  if (scan.affine) {
    const r = reprojectSurveyAffine({
      affine: scan.affine,
      nIl: scan.il.count,
      nXl: scan.xl.count,
      fromTag: plan.nativeTag,
      toTag: plan.projectTag,
      customDefs,
    });
    nativeAffine = affineToManifest(scan.affine);
    out.affine = { ...r.affine, fit: scan.affine.fit };
    transformer = r.transformer;
    maxResidualM = r.maxResidualM;
  }
  if (!transformer) {
    // Degenerate geometry (no measured affine): corners still move.
    transformer = getTransformer(plan.nativeTag, plan.projectTag, customDefs);
  }
  for (const key of ['first', 'last']) {
    const c = scan.corners?.[key];
    if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) {
      const t = transformer.forward(c.x, c.y);
      out.corners[key] = { x: t.x, y: t.y };
    }
  }

  return {
    scan: out,
    crsBlock: {
      ...base,
      transform: 'proj4',
      max_residual_m: maxResidualM,
      ...(nativeAffine ? { native_affine: nativeAffine } : {}),
      native_corners: scan.corners,
    },
  };
}
