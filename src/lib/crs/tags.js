// CRS tag vocabulary — the one place the sentinel strings live. A tag is
// what every `crs` column and survey_meta.crs field stores:
//   'EPSG:<code>'   resolvable in the curated catalog
//   'CUSTOM:<uuid>' user-defined; definition in geoscience_settings.custom_defs
//   'LOCAL'         deliberate engineering grid; never transforms
//   'UNKNOWN'       explicit don't-know; a NULL column means the same
//
// Pure string logic only (no proj4, no catalog) so badges and guards can
// import it without pulling the transform engine into their bundle.

export const LOCAL = 'LOCAL';
export const UNKNOWN = 'UNKNOWN';

/** Normalize a stored tag: null/empty/unrecognized collapse to UNKNOWN. */
export function normalizeTag(tag) {
  const t = String(tag || '').trim();
  if (!t) return UNKNOWN;
  if (t === LOCAL || t === UNKNOWN) return t;
  if (/^EPSG:\d{4,6}$/i.test(t)) return `EPSG:${t.slice(5)}`;
  if (/^CUSTOM:[0-9a-f-]{36}$/i.test(t)) return `CUSTOM:${t.slice(7).toLowerCase()}`;
  return UNKNOWN;
}

export function isEpsgTag(tag) {
  return /^EPSG:\d{4,6}$/.test(normalizeTag(tag));
}

export function isCustomTag(tag) {
  return normalizeTag(tag).startsWith('CUSTOM:');
}

/** Tags that can participate in a coordinate transform. */
export function isTransformableTag(tag) {
  const t = normalizeTag(tag);
  return t !== LOCAL && t !== UNKNOWN;
}

/**
 * Relationship between two datasets' tags, for overlay guards:
 *   'same'            identical known tags, or both the same LOCAL grid
 *   'transformable'   different tags, both resolvable — convert
 *   'unknown'         at least one side is UNKNOWN — placement unverified
 *   'local-mismatch'  a LOCAL grid against anything else — never overlay
 */
export function compareTags(a, b) {
  const ta = normalizeTag(a);
  const tb = normalizeTag(b);
  if (ta === UNKNOWN || tb === UNKNOWN) return 'unknown';
  if (ta === LOCAL || tb === LOCAL) return ta === tb ? 'same' : 'local-mismatch';
  if (ta === tb) return 'same';
  return 'transformable';
}
