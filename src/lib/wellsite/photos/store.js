// Photos in the local store (WS4): the metadata row (the ws_photos shape
// plus a local upload_state) and its blob variants land in one
// transaction with the outbox entries the sync engine (WS6) drains:
// metadata first, then thumb, working and, when kept, the original.
// Display is by object URL from the local blob; nothing is fetched.

import { newId, deviceId } from '../ids';
import { depthColumns } from '../records';
import { nowStamp } from '../time';
import { PLATFORM_BUILD } from '@/lib/platformBuild';

export const VARIANTS = Object.freeze(['thumb', 'working', 'original']);
export const blobKey = (photoId, variant) => `${photoId}:${variant}`;

/**
 * Build the photo row and blob rows from derived variants.
 * @param {Object} p { wellId, organizationId, sampleId, recordId, holeSection, depth (entered) , ctx, caption, tags, capturedAt, offsetMin, userId, derived }
 */
export function buildPhotoRows(p) {
  const id = p.id || newId();
  const t = nowStamp(p.offsetMin, p.nowMs);
  const capturedAt = p.capturedAt || t.occurred_at;
  const variants = {
    thumb: { bytes: p.derived.thumb.bytes, w: p.derived.thumb.width, h: p.derived.thumb.height },
    working: { bytes: p.derived.working.bytes, w: p.derived.working.width, h: p.derived.working.height },
    original: p.derived.original ? { bytes: p.derived.original.bytes, w: p.derived.original.width, h: p.derived.original.height, contentType: p.derived.original.contentType } : null,
  };
  const row = {
    id, well_id: p.wellId, sample_id: p.sampleId || null, record_id: p.recordId || null, hole_section: p.holeSection || null,
    storage_prefix: `${p.organizationId || 'org'}/${p.wellId}/photos/${id}`,
    variants, original_sha256: p.derived.sha256, content_type: 'image/webp', caption: p.caption || null, tags: p.tags || [],
    captured_at: capturedAt, local_offset_min: p.offsetMin,
    created_by: p.userId, client_created_at: t.occurred_at, device_id: deviceId(), schema_version: 1, app_build: PLATFORM_BUILD.sha,
    sync_state: 'pending', upload_state: 'local',
  };
  const warnings = [];
  if (p.depth) {
    const d = depthColumns(p.depth, p.ctx, { atUtc: capturedAt });
    Object.assign(row, d.columns);
    warnings.push(...d.warnings);
  }
  const blobs = [
    { key: blobKey(id, 'thumb'), photo_id: id, variant: 'thumb', blob: p.derived.thumb.blob, bytes: p.derived.thumb.bytes },
    { key: blobKey(id, 'working'), photo_id: id, variant: 'working', blob: p.derived.working.blob, bytes: p.derived.working.bytes },
  ];
  if (p.derived.original) blobs.push({ key: blobKey(id, 'original'), photo_id: id, variant: 'original', blob: p.derived.original.blob, bytes: p.derived.original.bytes });
  return { row, blobs, warnings };
}

/** Bytes held locally for a well's photos. */
export async function photoBytes(db, wellId) {
  const photos = await db.photos.where('[well_id+captured_at]').between([wellId, ''], [wellId, '￿']).toArray();
  let bytes = 0;
  for (const p of photos) for (const v of Object.values(p.variants || {})) if (v) bytes += v.bytes || 0;
  return { count: photos.length, bytes };
}

const urlCache = new Map();
/** An object URL for a local blob variant (cached; null when the blob is not held locally). */
export async function localPhotoUrl(db, photoId, variant = 'thumb') {
  const key = blobKey(photoId, variant);
  if (urlCache.has(key)) return urlCache.get(key);
  const b = await db.blobs.get(key);
  if (!b || !b.blob) return null;
  const url = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(b.blob) : null;
  if (url) urlCache.set(key, url);
  return url;
}
export function releasePhotoUrls() {
  for (const url of urlCache.values()) { try { URL.revokeObjectURL(url); } catch { /* already gone */ } }
  urlCache.clear();
}
