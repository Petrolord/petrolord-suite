// Consumption guards (CRS program, Phase 6): every overlay compares
// CRS tags BEFORE geometry math. Known-but-different tags convert on
// the fly (never silently misregister); unknown tags render with an
// unverified status the UI badges; a LOCAL grid never co-renders with
// anything but the same LOCAL grid.

import { compareTags, normalizeTag } from './tags';
import { getTransformer, crsDisplayName } from './index';

// Transformer cache: overlay paths run per render, proj4 construction
// does not need to.
const cache = new Map();

/** Cached point transformer between two transformable tags. */
export function cachedTransformer(fromTag, toTag, customDefs = {}) {
  const key = `${normalizeTag(fromTag)}->${normalizeTag(toTag)}`;
  if (!cache.has(key)) cache.set(key, getTransformer(fromTag, toTag, customDefs));
  return cache.get(key);
}

/**
 * Prepare wells for display against a volume (or any host frame).
 *
 * @param {Array<{crs?: ?string, surfaceX: number, surfaceY: number,
 *   path?: ?Array<{x, y}>}>} wells
 * @param {?string} hostTag the frame's tag (volume.crs)
 * @param {Object} [customDefs]
 * @returns {{wells: Array, skipped: {name: string, reason: string}[],
 *   unverified: number, converted: number}}
 *   each returned well carries crsStatus: 'same'|'converted'|'unverified'
 */
export function placeWellsForHost(wells, hostTag, customDefs = {}) {
  const out = [];
  const skipped = [];
  let unverified = 0;
  let converted = 0;
  for (const w of wells || []) {
    const rel = compareTags(w.crs, hostTag);
    if (rel === 'same') {
      out.push({ ...w, crsStatus: 'same' });
    } else if (rel === 'transformable') {
      try {
        const t = cachedTransformer(w.crs, hostTag, customDefs);
        const s = t.forward(w.surfaceX, w.surfaceY);
        out.push({
          ...w,
          surfaceX: s.x,
          surfaceY: s.y,
          path: w.path ? w.path.map((p) => (Number.isFinite(p.x) && Number.isFinite(p.y)
            ? { ...p, ...t.forward(p.x, p.y) } : p)) : w.path,
          crsStatus: 'converted',
        });
        converted += 1;
      } catch {
        skipped.push({ name: w.name, reason: `cannot transform ${normalizeTag(w.crs)}` });
      }
    } else if (rel === 'unknown') {
      out.push({ ...w, crsStatus: 'unverified' });
      unverified += 1;
    } else {
      skipped.push({
        name: w.name,
        reason: 'local grid data cannot be placed on this frame',
      });
    }
  }
  return { wells: out, skipped, unverified, converted };
}

/**
 * Failure text for a surface that landed with no live nodes: when the
 * tags differ or are unknown, the CRS is the likely cause and the
 * message says so instead of only "does not overlap".
 */
export function explainOverlapFailure(name, surfaceTag, hostTag, customDefs = {}) {
  const rel = compareTags(surfaceTag, hostTag);
  const base = `"${name}" does not overlap this volume's survey area.`;
  if (rel === 'unknown') {
    return `${base} The ${normalizeTag(surfaceTag) === 'UNKNOWN' ? 'surface' : 'volume'} has no recorded CRS, so a coordinate-system mismatch is a likely cause. Assign the missing CRS and retry.`;
  }
  if (rel === 'local-mismatch') {
    return `${base} One side is a local grid and the other is georeferenced; they cannot share a frame.`;
  }
  if (rel === 'transformable') {
    return `${base} The surface is in ${crsDisplayName(surfaceTag, customDefs)} and the volume in ${crsDisplayName(hostTag, customDefs)}; the conversion ran but the data still does not cover the survey.`;
  }
  return base;
}
