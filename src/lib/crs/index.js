// The Suite-side CRS engine binding: the engines package is pure math
// with proj4 injected, and THIS is the one place real proj4 gets bound.
// Every consumer (import doors, overlay guards, readouts) resolves tags
// through here; nothing else imports proj4 for geoscience work.
//
// Tags ('EPSG:<code>' | 'CUSTOM:<uuid>' | 'LOCAL' | 'UNKNOWN') are the
// only currency. LOCAL and UNKNOWN never transform — callers gate on
// isTransformableTag/compareTags (src/lib/crs/tags) before asking for a
// transformer, and get a descriptive throw if they forget.

import proj4 from 'proj4';
import {
  CRS_CATALOG, catalogGet, searchCatalog, unitToMetres, XY_UNITS,
} from '../../../packages/engines/lib/crs/catalog';
import { makeTransformer, makeProjector, convertUnit } from '../../../packages/engines/lib/crs/transform';
import {
  gridConvergenceDeg, gridAzFromTrueAz, trueAzFromGridAz,
} from '../../../packages/engines/lib/crs/convergence';
import { checkAreaOfUse } from '../../../packages/engines/lib/crs/sanity';
import {
  reprojectAffine, residualWarnThresholdM,
} from '../../../packages/engines/lib/crs/affineReproject';
import { reprojectGrid } from '../../../packages/engines/lib/crs/gridReproject';
import { normalizeTag, isEpsgTag, isCustomTag, isTransformableTag } from './tags';

export {
  CRS_CATALOG, catalogGet, searchCatalog, unitToMetres, XY_UNITS, convertUnit,
  gridAzFromTrueAz, trueAzFromGridAz, residualWarnThresholdM,
};

/**
 * proj4 definition string for a tag.
 * @param {string} tag
 * @param {Object} [customDefs] geoscience_settings.custom_defs
 */
export function resolveDef(tag, customDefs = {}) {
  const t = normalizeTag(tag);
  if (isEpsgTag(t)) {
    const entry = catalogGet(t);
    if (!entry) {
      throw new Error(`${t} is not in the CRS catalog. Add it as a custom CRS (proj4 or WKT definition).`);
    }
    return entry.proj4;
  }
  if (isCustomTag(t)) {
    const def = customDefs[t.slice(7)];
    if (!def?.proj4 && !def?.wkt) {
      throw new Error('This custom CRS has no stored definition. Re-add it under Project CRS settings.');
    }
    return def.proj4 || def.wkt;
  }
  throw new Error(t === 'LOCAL'
    ? 'A LOCAL grid has no geodetic definition and cannot be transformed.'
    : 'The CRS is unknown, so coordinates cannot be transformed. Assign a CRS first.');
}

/** Human name for a tag, for badges and readouts. */
export function crsDisplayName(tag, customDefs = {}) {
  const t = normalizeTag(tag);
  if (isEpsgTag(t)) return catalogGet(t)?.name || t;
  if (isCustomTag(t)) return customDefs[t.slice(7)]?.name || 'Custom CRS';
  return t === 'LOCAL' ? 'Local grid' : 'Unknown CRS';
}

/** XY unit of a tag ('m' | 'ft' | 'ftUS'; geographic CRSs report 'deg'). */
export function crsUnit(tag, customDefs = {}) {
  const t = normalizeTag(tag);
  if (isEpsgTag(t)) return catalogGet(t)?.unit || 'm';
  if (isCustomTag(t)) return customDefs[t.slice(7)]?.unit || 'm';
  return 'm';
}

/** Point transformer between two transformable tags. */
export function getTransformer(fromTag, toTag, customDefs = {}) {
  return makeTransformer(proj4, resolveDef(fromTag, customDefs), resolveDef(toTag, customDefs));
}

/** Projector between a transformable tag and geographic WGS 84. */
export function projectorFor(tag, customDefs = {}) {
  return makeProjector(proj4, resolveDef(tag, customDefs));
}

/** Grid azimuth of true north at (x, y) in the tag's CRS, degrees CW. */
export function convergenceAt(tag, x, y, customDefs = {}) {
  return gridConvergenceDeg(projectorFor(tag, customDefs), x, y);
}

/**
 * Area-of-use sanity check for sample coordinates against a tag.
 * Catalog entries check geodetically; custom/LOCAL/UNKNOWN tags have no
 * published area, so they soft-pass with verdict 'no-area-of-use'.
 */
export function sanityCheck(tag, samples, customDefs = {}) {
  const t = normalizeTag(tag);
  if (!isEpsgTag(t)) {
    return { ok: true, verdict: 'no-area-of-use', insideFraction: 1, suggestion: null };
  }
  const entry = catalogGet(t);
  if (!entry) return { ok: true, verdict: 'no-area-of-use', insideFraction: 1, suggestion: null };
  return checkAreaOfUse(projectorFor(t, customDefs), entry, samples);
}

/**
 * Validate a pasted custom definition (proj4 string or WKT) by
 * constructing it and round-tripping a point. Returns the definition
 * verbatim on success; throws with proj4's complaint on failure.
 */
export function validateCustomDefinition(defString) {
  const def = String(defString || '').trim();
  if (!def) throw new Error('Paste a proj4 definition string or WKT.');
  let conv;
  try {
    conv = proj4('+proj=longlat +datum=WGS84 +no_defs', def);
  } catch (e) {
    throw new Error(`The definition was not accepted: ${e.message || e}`);
  }
  const [x, y] = conv.forward([0, 0]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error('The definition parsed but produces non-finite coordinates.');
  }
  return def;
}

/**
 * Reproject a survey affine between tags (traces untouched — Petrel
 * rule). Returns the engines result plus the transformer used.
 */
export function reprojectSurveyAffine({ affine, nIl, nXl, fromTag, toTag, customDefs = {} }) {
  const transformer = getTransformer(fromTag, toTag, customDefs);
  const result = reprojectAffine(affine, nIl, nXl, transformer);
  if (!result) {
    throw new Error('The survey geometry could not be carried into the target CRS.');
  }
  return { ...result, transformer };
}

/** Reproject a surface grid between tags (inverse-mapping resample). */
export function reprojectSurfaceGrid({ spec, z, fromTag, toTag, customDefs = {}, opts = {} }) {
  const transformer = getTransformer(fromTag, toTag, customDefs);
  const result = reprojectGrid(spec, z, transformer, opts);
  if (!result) throw new Error('The surface grid could not be carried into the target CRS.');
  return result;
}

/** Transform a single point between tags. */
export function transformPoint(fromTag, toTag, x, y, customDefs = {}) {
  return getTransformer(fromTag, toTag, customDefs).forward(x, y);
}

/** Lon/lat (WGS 84) of a point in a transformable tag's CRS. */
export function toLonLat(tag, x, y, customDefs = {}) {
  return projectorFor(tag, customDefs).toLonLat(x, y);
}

export { isTransformableTag };
