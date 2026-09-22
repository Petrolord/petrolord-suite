// A site's datum transformation choice (WD tester feedback 2026-09-22).
//
// wp_sites.crs holds the CRS tag; a site on a datum with several published
// EPSG transformations to WGS 84 (Minna) may choose one other than the
// catalog default. The choice lives in wp_sites.crs_provenance
// (jsonb) as `datum_transform: 'EPSG:<code>'`; absent or null means the
// catalog default. Every place the site CRS becomes lon/lat (bottom-hole
// lat/lon, magnetics, convergence) passes siteCrsOpts(site) so the choice
// is the one actually used.

import { datumTransformInfo } from '@/lib/crs';

/** The site's chosen transformation code when it applies to its CRS, else null. */
export function siteDatumTransform(site) {
  const code = site?.crs_provenance?.datum_transform || null;
  if (!code) return null;
  const info = datumTransformInfo(site?.crs, code);
  return info && !info.overrideIgnored ? code : null;
}

/** opts for toLonLat / convergenceAt / projectorFor from a site row. */
export function siteCrsOpts(site) {
  const code = siteDatumTransform(site);
  return code ? { datumTransform: code } : {};
}

/**
 * crs_provenance to save with a site: the existing object with
 * datum_transform set to the choice, or removed when the default applies.
 */
export function withDatumTransform(crsProvenance, code) {
  const next = { ...(crsProvenance || {}) };
  if (code) next.datum_transform = code;
  else delete next.datum_transform;
  return next;
}
