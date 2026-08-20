// geo_culture registry persistence (W1.3) — the surfacesRegistry house
// pattern: metadata row under user/org RLS, feature geometry as a JSON
// blob in the private `culture` bucket at
// {user_id}/{culture_id}/features.json (never large jsonb). Features
// are stored ALREADY CONVERTED to the importer's Project CRS and the
// row carries the structured tag of that frame.

import { supabase } from '@/lib/customSupabaseClient';
import { resolveUserOrgId } from '@/lib/orgContext';

const BUCKET = 'culture';

async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('You must be signed in to use culture layers.');
  return user;
}

/** Own layers + layers shared with the caller's org (RLS filters). */
export async function listCulture() {
  const [{ data, error }, { data: { user } }] = await Promise.all([
    supabase.from('geo_culture').select('*').order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ]);
  if (error) throw new Error(`Could not load culture layers: ${error.message}`);
  return (data || []).map((c) => ({ ...c, is_own: !!user && c.user_id === user.id }));
}

/**
 * Persist an imported layer: upload the features blob, then insert the
 * metadata row; a failed insert removes the fresh object.
 * @param {{name, kind, geometryType, features, style?, crs?, xyUnit?,
 *   crsProvenance?, crsNote?, bbox?, provenance?}} c
 */
export async function saveCulture(c) {
  const user = await requireUser();
  const id = crypto.randomUUID();
  const path = `${user.id}/${id}/features.json`;
  const body = JSON.stringify({ v: 1, features: c.features });

  const { error: upError } = await supabase.storage.from(BUCKET)
    .upload(path, new Blob([body], { type: 'application/json' }), {
      contentType: 'application/json', upsert: false,
    });
  if (upError) throw new Error(`Could not upload culture features: ${upError.message}`);

  const { data, error } = await supabase.from('geo_culture')
    .insert({
      id,
      user_id: user.id,
      name: c.name,
      kind: c.kind || 'other',
      geometry_type: c.geometryType || 'mixed',
      feature_count: c.features.length,
      style: c.style || {},
      crs: c.crs || null,
      xy_unit: c.xyUnit || null,
      crs_provenance: c.crsProvenance || null,
      crs_note: c.crsNote || null,
      bbox: c.bbox || null,
      provenance: c.provenance || {},
      storage_path: path,
    })
    .select().single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw new Error(`Could not save culture layer ${c.name}: ${error.message}`);
  }
  return data;
}

/** Fetch a layer's normalized features (org-shared reads included). */
export async function downloadCultureFeatures(row) {
  const { data, error } = await supabase.storage.from(BUCKET).download(row.storage_path);
  if (error) throw new Error(`Could not download culture layer ${row.name}: ${error.message}`);
  const doc = JSON.parse(await data.text());
  if (!doc || !Array.isArray(doc.features)) {
    throw new Error(`Culture layer ${row.name}: stored object is not a feature set.`);
  }
  return doc.features;
}

/** Owner-only metadata update (RLS re-checks). */
export async function updateCulture(cultureId, patch) {
  const { data, error } = await supabase.from('geo_culture')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', cultureId).select().single();
  if (error) throw new Error(`Could not update culture layer: ${error.message}`);
  return data;
}

/** Org sharing, the geo_wells model: read-only for members. */
export async function shareCulture(cultureId, organizationId) {
  if (!organizationId) throw new Error('Pick the organization to share with.');
  return updateCulture(cultureId, { organization_id: organizationId });
}

export async function unshareCulture(cultureId) {
  return updateCulture(cultureId, { organization_id: null });
}

/** Toggle-style share: resolves the caller's org (the setSurfaceShared
 *  pattern) so explorer toggles need no org plumbing. */
export async function setCultureShared(row, shared) {
  if (!shared) return unshareCulture(row.id);
  const user = await requireUser();
  const orgId = await resolveUserOrgId(user.id);
  if (!orgId) throw new Error('You are not a member of an organization.');
  return shareCulture(row.id, orgId);
}

export async function deleteCulture(row) {
  const user = await requireUser();
  if (row.storage_path?.startsWith(`${user.id}/`)) {
    const { error: rmError } = await supabase.storage.from(BUCKET).remove([row.storage_path]);
    if (rmError) throw new Error(`Could not delete the culture features: ${rmError.message}`);
  }
  const { data, error } = await supabase.from('geo_culture')
    .delete().eq('id', row.id).select('id');
  if (error) throw new Error(`Could not delete culture layer: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can delete this layer (org sharing is read-only).');
  }
}
