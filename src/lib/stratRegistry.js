// Stratigraphic units registry service (Stratigraphy Studio ST0, 2026-09-06).
//
// The one service that reads and writes geo_strat_units (the stratigraphic
// column: group > formation > member > bed with ages and colours). Every
// app goes through here, the same rule wellsRegistry.js holds for wells and
// tops (Stratigraphy-PLAN.md section 4). Rows are per user, org-shareable
// read-only through the geo_surfaces RLS pattern; writes are owner-only and
// a 0-row write surfaces as an owner-only error, never a silent no-op.
//
// Tops reference a unit through geo_wells_tops.unit_id; the typed-top
// fields themselves are written by wellsRegistry (saveTop / updateTop).

import { supabase } from '@/lib/customSupabaseClient';
import { registerStateKind, openStateRow, writeStamped } from '@/lib/stateVersion';
import { STRAT_PROJECT_KIND } from '@/lib/stratigraphy/stratProjectState';
import { ZoneSchemesUnavailable } from '@/lib/stratigraphy/zoneSchemesUnavailable';

export const STRAT_UNIT_KIND = 'strat-unit';
registerStateKind(STRAT_UNIT_KIND, { current: 1, label: 'stratigraphic unit' });

export const UNIT_COLUMNS = ['name', 'rank', 'parent_id', 'order_index', 'age_top_ma', 'age_base_ma', 'colour', 'lithology', 'notes', 'organization_id'];

const numOrNull = (v) => (v === '' || v === undefined || v === null ? null : Number(v));

/** Pick the writable columns of a unit and coerce numbers; unknown keys are dropped. */
export function unitRow(u) {
  const row = {};
  for (const k of UNIT_COLUMNS) if (u[k] !== undefined) row[k] = u[k];
  if ('order_index' in row) row.order_index = row.order_index == null || row.order_index === '' ? null : Math.trunc(Number(row.order_index));
  if ('age_top_ma' in row) row.age_top_ma = numOrNull(row.age_top_ma);
  if ('age_base_ma' in row) row.age_base_ma = numOrNull(row.age_base_ma);
  if ('parent_id' in row && !row.parent_id) row.parent_id = null;
  if ('name' in row) row.name = String(row.name || '').trim();
  return row;
}

/** Every unit visible to the caller (own plus org-shared), column order. */
export async function listUnits() {
  const { data, error } = await supabase.from('geo_strat_units')
    .select('*')
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });
  if (error) throw new Error(`Could not load the stratigraphic column: ${error.message}`);
  return (data || []).map((r) => openStateRow(STRAT_UNIT_KIND, r));
}

export async function saveUnit(unit) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to add stratigraphic units.');
  const row = unitRow(unit);
  if (!row.name) throw new Error('The unit needs a name.');
  const { data, error } = await writeStamped(STRAT_UNIT_KIND,
    { user_id: user.id, ...row },
    (r) => supabase.from('geo_strat_units').insert(r).select().single());
  if (error) throw new Error(`Could not add the unit: ${error.message}`);
  return data;
}

export async function updateUnit(unitId, patch) {
  const row = { ...unitRow(patch), updated_at: new Date().toISOString() };
  if ('name' in row && !row.name) throw new Error('The unit needs a name.');
  const { data, error } = await writeStamped(STRAT_UNIT_KIND, row,
    (r) => supabase.from('geo_strat_units').update(r).eq('id', unitId).select());
  if (error) throw new Error(`Could not update the unit: ${error.message}`);
  if (!data || !data.length) throw new Error('Only the owner can edit stratigraphic units (org sharing is read-only).');
  return data[0];
}

/** Deletes one unit. Children keep their rows with parent_id cleared
 *  (FK on delete set null); tops that named it lose the reference the
 *  same way. */
export async function deleteUnit(unit) {
  const { data, error } = await supabase.from('geo_strat_units')
    .delete().eq('id', unit.id).select('id');
  if (error) throw new Error(`Could not delete the unit: ${error.message}`);
  if (!data || !data.length) throw new Error('Only the owner can delete stratigraphic units (org sharing is read-only).');
}

/** Share or unshare every own unit with an organization (the column is
 *  shared as a whole; a half-shared column would read as gaps to a
 *  teammate). */
export async function shareColumn(organizationId) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to share the column.');
  const { error } = await supabase.from('geo_strat_units')
    .update({ organization_id: organizationId, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);
  if (error) throw new Error(`Could not ${organizationId ? 'share' : 'unshare'} the column: ${error.message}`);
}

// ---- interval logs (ST1) ------------------------------------------------------
//
// geo_wells_intervals: one row per "named thing between two depths" on a
// well, keyed by kind (lithology, core_description, facies, electrofacies,
// environment, motif, systems_tract, biozone_interval). Registry child of
// geo_wells: visibility follows the well, writes are owner-only through
// RLS, a 0-row write surfaces as an owner-only error.

export const INTERVAL_COLUMNS = ['kind', 'top_md_m', 'base_md_m', 'code', 'label', 'properties', 'source', 'interpreter'];

/** Pick the writable columns of an interval and coerce numbers. */
export function intervalRow(wellId, r) {
  const row = { well_id: wellId };
  for (const k of INTERVAL_COLUMNS) if (r[k] !== undefined) row[k] = r[k];
  if (r.topMdM !== undefined) row.top_md_m = r.topMdM;
  if (r.baseMdM !== undefined) row.base_md_m = r.baseMdM;
  if ('top_md_m' in row) row.top_md_m = Number(row.top_md_m);
  if ('base_md_m' in row) row.base_md_m = Number(row.base_md_m);
  if ('code' in row) row.code = String(row.code ?? '').trim();
  if ('label' in row && !row.label) row.label = null;
  if ('properties' in row && (row.properties == null || typeof row.properties !== 'object')) row.properties = {};
  if ('interpreter' in row && !row.interpreter) row.interpreter = null;
  return row;
}

/** Every interval of a well (all kinds, or one), shallow to deep. */
export async function listIntervals(wellId, kind = null) {
  let q = supabase.from('geo_wells_intervals').select('*').eq('well_id', wellId);
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q.order('top_md_m', { ascending: true });
  if (error) throw new Error(`Could not load intervals: ${error.message}`);
  return data || [];
}

/** Replace every interval of ONE kind on a well (imports and publishes are all-or-nothing per kind). */
export async function replaceIntervals(wellId, kind, rows) {
  const { error: delError } = await supabase.from('geo_wells_intervals').delete().eq('well_id', wellId).eq('kind', kind);
  if (delError) throw new Error(`Could not clear existing ${kind} intervals: ${delError.message}`);
  if (!rows.length) return [];
  const { data, error } = await supabase.from('geo_wells_intervals')
    .insert(rows.map((r) => intervalRow(wellId, { ...r, kind })))
    .select();
  if (error) throw new Error(`Could not save ${kind} intervals: ${error.message}`);
  return data;
}

export async function saveInterval(wellId, r) {
  const row = intervalRow(wellId, r);
  const { data, error } = await supabase.from('geo_wells_intervals').insert(row).select().single();
  if (error) throw new Error(`Could not add the interval: ${error.message}`);
  return data;
}

export async function updateInterval(intervalId, patch) {
  const row = { ...intervalRow('x', patch), updated_at: new Date().toISOString() };
  delete row.well_id;
  const { data, error } = await supabase.from('geo_wells_intervals').update(row).eq('id', intervalId).select();
  if (error) throw new Error(`Could not update the interval: ${error.message}`);
  if (!data || !data.length) throw new Error('Only the owner can edit intervals (org sharing is read-only).');
  return data[0];
}

export async function deleteInterval(interval) {
  const { data, error } = await supabase.from('geo_wells_intervals').delete().eq('id', interval.id).select('id');
  if (error) throw new Error(`Could not delete the interval: ${error.message}`);
  if (!data || !data.length) throw new Error('Only the owner can delete intervals (org sharing is read-only).');
}

// ---- core images (ST1) --------------------------------------------------------
//
// Depth-registered core photographs in the private `wells` bucket under
// the owner path {user_id}/{well_id}/core/{id}.{ext}; metadata rows in
// geo_wells_core_images. Caps (owner decision 2026-09-06): 5 MB per image
// (also a check constraint), 200 MB per well (enforced here).

export const CORE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CORE_IMAGES_MAX_BYTES_PER_WELL = 200 * 1024 * 1024;
const WELLS_BUCKET = 'wells';
const IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export const coreImagePath = (userId, wellId, imageId, ext) => `${userId}/${wellId}/core/${imageId}.${ext}`;

export async function listCoreImages(wellId) {
  const { data, error } = await supabase.from('geo_wells_core_images')
    .select('*').eq('well_id', wellId).order('top_md_m', { ascending: true });
  if (error) throw new Error(`Could not load core images: ${error.message}`);
  return data || [];
}

/** Refuse before touching storage: type, size, and the per-well cap. */
export function checkCoreImage(file, existing = []) {
  if (!file) throw new Error('Choose an image first.');
  if (!IMAGE_EXT[file.type]) throw new Error(`"${file.name}" is ${file.type || 'of unknown type'}; core photos must be JPEG, PNG or WebP.`);
  if (file.size > CORE_IMAGE_MAX_BYTES) throw new Error(`"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB; the limit is 5 MB per image.`);
  const used = existing.reduce((s, r) => s + (r.bytes || 0), 0);
  if (used + file.size > CORE_IMAGES_MAX_BYTES_PER_WELL) {
    throw new Error(`This well already holds ${(used / 1048576).toFixed(1)} MB of core photos; the limit is 200 MB per well.`);
  }
  return IMAGE_EXT[file.type];
}

/**
 * Upload one core photo and insert its row. `meta` = {top_md_m, base_md_m,
 * caption, width, height}. The storage object is removed again if the
 * row insert fails, so a refused row never leaves an orphan object.
 */
export async function uploadCoreImage(wellId, file, meta) {
  const existing = await listCoreImages(wellId);
  const ext = checkCoreImage(file, existing);
  const top = Number(meta.top_md_m); const base = Number(meta.base_md_m);
  if (!Number.isFinite(top) || !Number.isFinite(base) || !(base > top)) throw new Error('Give the photo a top and a base depth, base below top.');
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to upload core photos.');
  const id = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const path = coreImagePath(user.id, wellId, id, ext);
  const { error: upError } = await supabase.storage.from(WELLS_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (upError) throw new Error(`Could not upload "${file.name}": ${upError.message}`);
  const { data, error } = await supabase.from('geo_wells_core_images').insert({
    id, well_id: wellId, top_md_m: top, base_md_m: base, storage_path: path, content_type: file.type,
    caption: meta.caption || null, width: meta.width || null, height: meta.height || null, bytes: file.size,
  }).select().single();
  if (error) {
    await supabase.storage.from(WELLS_BUCKET).remove([path]).catch(() => {});
    throw new Error(`Could not save the core photo: ${error.message}`);
  }
  return data;
}

export async function updateCoreImage(imageId, patch) {
  const row = { updated_at: new Date().toISOString() };
  for (const k of ['top_md_m', 'base_md_m', 'caption']) if (patch[k] !== undefined) row[k] = k === 'caption' ? (patch[k] || null) : Number(patch[k]);
  const { data, error } = await supabase.from('geo_wells_core_images').update(row).eq('id', imageId).select();
  if (error) throw new Error(`Could not update the core photo: ${error.message}`);
  if (!data || !data.length) throw new Error('Only the owner can edit core photos (org sharing is read-only).');
  return data[0];
}

export async function deleteCoreImage(image) {
  const { error: rmError } = await supabase.storage.from(WELLS_BUCKET).remove([image.storage_path]);
  if (rmError) throw new Error(`Could not remove the photo object: ${rmError.message}`);
  const { data, error } = await supabase.from('geo_wells_core_images').delete().eq('id', image.id).select('id');
  if (error) throw new Error(`Could not delete the core photo: ${error.message}`);
  if (!data || !data.length) throw new Error('Only the owner can delete core photos (org sharing is read-only).');
}

/** A short-lived URL to display a photo (the bucket is private; the read policy resolves the owning well from the path). */
export async function coreImageUrl(image, expiresSeconds = 3600) {
  const { data, error } = await supabase.storage.from(WELLS_BUCKET).createSignedUrl(image.storage_path, expiresSeconds);
  if (error) throw new Error(`Could not open the core photo: ${error.message}`);
  return data.signedUrl;
}

// ---- Stratigraphy Studio view state (ST2) --------------------------------------
//
// strat_projects: app-private, owner-only (the geo_correlation_sections
// pattern): the open shared section, the terminology scheme, the
// stratigraphic flattening and the Wheeler settings. One row per user is
// enough for v1 (the latest is the project); interpretation products are
// registry rows, never here.

// the kind lives beside the harness backend's copy of the door (STRAT-U1-011)
export { STRAT_PROJECT_KIND };

export async function loadStratProject() {
  const { data, error } = await supabase.from('strat_projects')
    .select('*').order('updated_at', { ascending: false }).limit(1);
  if (error) throw new Error(`Could not load the stratigraphy project: ${error.message}`);
  return openStateRow(STRAT_PROJECT_KIND, data?.[0] || null);
}

export async function saveStratProject(patch) {
  const existing = await loadStratProject();
  if (existing) {
    const { data, error } = await writeStamped(STRAT_PROJECT_KIND,
      { ...patch, updated_at: new Date().toISOString() },
      (row) => supabase.from('strat_projects').update(row).eq('id', existing.id).select().single());
    if (error) throw new Error(`Could not save the stratigraphy project: ${error.message}`);
    return data;
  }
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save.');
  const { data, error } = await writeStamped(STRAT_PROJECT_KIND,
    { user_id: user.id, name: 'Default', ...patch },
    (row) => supabase.from('strat_projects').insert(row).select().single());
  if (error) throw new Error(`Could not save the stratigraphy project: ${error.message}`);
  return data;
}

// ---- organisation zone schemes (AppUpgrade STRAT-U2-008) --------------------
//
// strat_zone_schemes (migration 20260930180000, applied 2026-09-30): one row
// per scheme per organisation, zones as [{zone, top_ma, base_ma}], the
// calibration source, the ICS chart edition. Members read, any member adds
// (stamped as the creator), the creator or an organisation admin changes or
// deletes (RLS). On a database without the table the studio keeps working on
// browser storage: the functions below throw ZoneSchemesUnavailable, which the
// panel reads as "organisation sharing arrives once the table exists".

export { ZoneSchemesUnavailable };
const missingTable = (error) => !!error && (['42P01', 'PGRST205'].includes(String(error.code)) || /relation .*strat_zone_schemes.* does not exist|Could not find the table .*strat_zone_schemes/i.test(String(error.message || '')));
const ZONE_SCHEME_COLUMNS = 'id, organization_id, name, source, chart_version, zones, notes, created_by, app_build, created_at, updated_at';

/** The signed-in user and their organisation membership ({userId, email, orgId, role}); orgId null outside an organisation. */
export async function zoneSchemeContext() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { userId: null, email: null, orgId: null, role: null };
  const { getUserOrgRow } = await import('@/lib/orgContext');
  const row = await getUserOrgRow(user.id);
  return { userId: user.id, email: user.email || null, orgId: row?.organization_id || null, role: row?.role || null };
}

/** Every zone scheme of the user's organisation, newest first. */
export async function listOrgZoneSchemes() {
  const { data, error } = await supabase.from('strat_zone_schemes').select(ZONE_SCHEME_COLUMNS).order('updated_at', { ascending: false });
  if (missingTable(error)) throw new ZoneSchemesUnavailable();
  if (error) throw new Error(`Could not list the organisation zone schemes: ${error.message}`);
  return data || [];
}

/**
 * Share a scheme with the organisation: a new row, or the same-named row
 * updated (only its creator or an admin can; RLS refuses the rest).
 * @param {{name, source, chart_version?, zones: Array<{zone, top_ma, base_ma}>, notes?}} scheme
 */
export async function saveOrgZoneScheme(scheme, { organizationId, appBuild = null } = {}) {
  if (!organizationId) throw new Error('You are not in an organisation, so the scheme cannot be shared; it stays in this browser.');
  const row = { name: String(scheme.name || '').trim(), source: String(scheme.source || '').trim(), chart_version: scheme.chart_version || null, zones: scheme.zones || [], notes: scheme.notes || null, app_build: appBuild };
  if (!row.name) throw new Error('The scheme needs a name.');
  if (!row.source) throw new Error(`The ${row.name} scheme needs a source (the calibration it follows) before it is shared.`);
  const { data: existing, error: e1 } = await supabase.from('strat_zone_schemes').select('id').eq('organization_id', organizationId).ilike('name', row.name).limit(1);
  if (missingTable(e1)) throw new ZoneSchemesUnavailable();
  if (e1) throw new Error(`Could not share the scheme: ${e1.message}`);
  if (existing?.length) {
    const { data, error } = await supabase.from('strat_zone_schemes').update(row).eq('id', existing[0].id).select(ZONE_SCHEME_COLUMNS);
    if (error) throw new Error(`Could not update the shared ${row.name} scheme: ${error.message}`);
    if (!data?.length) throw new Error(`The organisation already has a ${row.name} scheme shared by someone else; only its creator or an organisation admin can replace it. Rename yours to share it beside it.`);
    return { row: data[0], replaced: true };
  }
  const { data, error } = await supabase.from('strat_zone_schemes').insert({ ...row, organization_id: organizationId }).select(ZONE_SCHEME_COLUMNS).single();
  if (missingTable(error)) throw new ZoneSchemesUnavailable();
  if (error) throw new Error(`Could not share the scheme: ${error.message}`);
  return { row: data, replaced: false };
}

/** Delete a shared scheme (its creator or an organisation admin). */
export async function deleteOrgZoneScheme(id) {
  const { data, error } = await supabase.from('strat_zone_schemes').delete().eq('id', id).select('id');
  if (missingTable(error)) throw new ZoneSchemesUnavailable();
  if (error) throw new Error(`Could not delete the scheme: ${error.message}`);
  if (!data?.length) throw new Error('Only the scheme\'s creator or an organisation admin can delete it.');
}
