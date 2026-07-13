// geo_wells registry persistence (Well Data Manager G1.2) — direct RLS
// calls (house pattern; the Seismolord wellsService idiom). Tables +
// policies: supabase/migrations/20260713100000_create_wells_registry.sql.
//
// Sharing model (locked in WellDataManager-PLAN.md): rows are private
// by default; shareWell stamps the owner's organization_id on the WELL
// row and children inherit visibility through it; org members read,
// only the owner ever writes. RLS enforces all of this server-side —
// nothing here filters by user id.
//
// Curve samples are little-endian float32 objects in the private
// `wells` bucket at {user_id}/{well_id}/logs/{log_id}.f32 — never large
// jsonb (the Seismolord brick rule). Log ids are generated client-side
// so the storage path can be written into the metadata row atomically.
//
// jsonb payload shapes (byte-compatible with seismic_wells):
//   deviation:  [{md, inc, azi}]        md ascending (validated at import)
//   checkshots: [{tvdss_m, twt_ms}]     strictly monotonic (validated)

import { supabase } from '@/lib/customSupabaseClient';

const BUCKET = 'wells';

async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('You must be signed in to use the well registry.');
  return user;
}

/** Storage object path for a log's samples — must match the bucket
 *  policies ({user_id}/{well_id}/logs/{log_id}.f32). */
export const curvePath = (userId, wellId, logId) => `${userId}/${wellId}/logs/${logId}.f32`;

// ---- wells ---------------------------------------------------------------

/**
 * @param {{name: string, uwi?: ?string, surfaceX: number, surfaceY: number,
 *   kbM?: number, tdMdM?: ?number, crsNote?: ?string, unitsNote?: ?string,
 *   deviation?: Array, checkshots?: Array}} w
 */
export async function saveWell(w) {
  const user = await requireUser();
  const { data, error } = await supabase.from('geo_wells')
    .insert({
      user_id: user.id,
      name: w.name,
      uwi: w.uwi || null,
      surface_x: w.surfaceX,
      surface_y: w.surfaceY,
      kb_m: w.kbM ?? 0,
      td_md_m: w.tdMdM ?? null,
      crs_note: w.crsNote || null,
      units_note: w.unitsNote || null,
      deviation: w.deviation || [],
      checkshots: w.checkshots || [],
    })
    .select().single();
  if (error) throw new Error(`Could not save well: ${error.message}`);
  return data;
}

/** Own wells + wells shared with the caller's organizations (RLS does
 *  the filtering; is_own is derived for the tree's badges). */
export async function listWells() {
  const [{ data, error }, { data: { user } }] = await Promise.all([
    supabase.from('geo_wells').select('*').order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ]);
  if (error) throw new Error(`Could not load wells: ${error.message}`);
  return (data || []).map((w) => ({ ...w, is_own: !!user && w.user_id === user.id }));
}

export async function getWell(wellId) {
  const { data, error } = await supabase.from('geo_wells')
    .select('*').eq('id', wellId).single();
  if (error) throw new Error(`Could not load well: ${error.message}`);
  return data;
}

/** Owner-only header/survey updates (RLS rejects everyone else). */
export async function updateWell(wellId, patch) {
  const { data, error } = await supabase.from('geo_wells')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', wellId).select().single();
  if (error) throw new Error(`Could not update well: ${error.message}`);
  return data;
}

/** Delete a well, its children (FK cascade) and its curve objects.
 *  Storage first: after the row is gone the path policies still allow
 *  the owner's delete, but a failed storage pass would otherwise leave
 *  orphans with no metadata pointing at them. */
export async function deleteWell(well) {
  const user = await requireUser();
  const prefix = `${user.id}/${well.id}/logs`;
  const { data: objects } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (objects && objects.length) {
    const { error: rmError } = await supabase.storage.from(BUCKET)
      .remove(objects.map((o) => `${prefix}/${o.name}`));
    if (rmError) throw new Error(`Could not delete the well's log data: ${rmError.message}`);
  }
  const { error } = await supabase.from('geo_wells').delete().eq('id', well.id);
  if (error) throw new Error(`Could not delete well: ${error.message}`);
}

// ---- org sharing ---------------------------------------------------------

/** Share a well (and everything under it) read-only with an
 *  organization the owner belongs to. RLS re-checks membership. */
export async function shareWell(wellId, organizationId) {
  if (!organizationId) throw new Error('Pick the organization to share with.');
  return updateWell(wellId, { organization_id: organizationId });
}

/** Back to private. Org members lose read access immediately. */
export async function unshareWell(wellId) {
  return updateWell(wellId, { organization_id: null });
}

// ---- tops (normalized) ---------------------------------------------------

export async function listTops(wellId) {
  const { data, error } = await supabase.from('geo_wells_tops')
    .select('*').eq('well_id', wellId).order('md_m', { ascending: true });
  if (error) throw new Error(`Could not load tops: ${error.message}`);
  return data || [];
}

/** Replace a well's tops wholesale — imports are all-or-nothing, same
 *  as the Seismolord import dialogs. */
export async function replaceTops(wellId, tops) {
  const { error: delError } = await supabase.from('geo_wells_tops')
    .delete().eq('well_id', wellId);
  if (delError) throw new Error(`Could not clear existing tops: ${delError.message}`);
  if (!tops.length) return [];
  const { data, error } = await supabase.from('geo_wells_tops')
    .insert(tops.map((t) => ({
      well_id: wellId,
      name: t.name,
      md_m: t.md ?? t.md_m,
      interpreter: t.interpreter || null,
    })))
    .select();
  if (error) throw new Error(`Could not save tops: ${error.message}`);
  return data;
}

// ---- logs (metadata rows + f32 curve objects) ------------------------------

export async function listLogs(wellId) {
  const { data, error } = await supabase.from('geo_wells_logs')
    .select('*').eq('well_id', wellId).order('created_at', { ascending: true });
  if (error) throw new Error(`Could not load logs: ${error.message}`);
  return data || [];
}

/**
 * Persist one prepared log (engine/lasImport.js prepareLogs shape):
 * upload the f32 samples, then insert the metadata row pointing at
 * them; a failed insert removes the fresh object so nothing orphans.
 */
export async function saveLog(wellId, log) {
  const user = await requireUser();
  const logId = crypto.randomUUID();
  const path = curvePath(user.id, wellId, logId);

  const { error: upError } = await supabase.storage.from(BUCKET)
    .upload(path, new Blob([log.data.buffer], { type: 'application/octet-stream' }), {
      contentType: 'application/octet-stream',
      upsert: false,
    });
  if (upError) throw new Error(`Could not upload curve ${log.mnemonic}: ${upError.message}`);

  const { data, error } = await supabase.from('geo_wells_logs')
    .insert({
      id: logId,
      well_id: wellId,
      mnemonic: log.mnemonic,
      description: log.description || null,
      unit: log.unit || null,
      start_md_m: log.startMdM,
      stop_md_m: log.stopMdM,
      step_m: log.stepM,
      n_samples: log.nSamples,
      null_count: log.nullCount,
      source_file: log.provenance?.source_file || null,
      provenance: log.provenance || {},
      storage_path: path,
    })
    .select().single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw new Error(`Could not save log ${log.mnemonic}: ${error.message}`);
  }
  return data;
}

/** All prepared logs of one LAS import, sequentially — clear first
 *  failure beats a shotgun of half-written curves. */
export async function saveLogs(wellId, logs) {
  const saved = [];
  for (const log of logs) saved.push(await saveLog(wellId, log));
  return saved;
}

export async function deleteLog(log) {
  const { error: rmError } = await supabase.storage.from(BUCKET).remove([log.storage_path]);
  if (rmError) throw new Error(`Could not delete curve data: ${rmError.message}`);
  const { error } = await supabase.from('geo_wells_logs').delete().eq('id', log.id);
  if (error) throw new Error(`Could not delete log: ${error.message}`);
}

/** Fetch one curve's samples. Works for org-shared wells too — the
 *  storage read policy resolves the owning well from the path. */
export async function downloadCurve(log) {
  const { data, error } = await supabase.storage.from(BUCKET).download(log.storage_path);
  if (error) throw new Error(`Could not download curve ${log.mnemonic}: ${error.message}`);
  const buf = await data.arrayBuffer();
  if (buf.byteLength !== log.n_samples * 4) {
    throw new Error(`Curve ${log.mnemonic}: object is ${buf.byteLength} bytes but the `
      + `metadata says ${log.n_samples} float32 samples — re-import the log.`);
  }
  return new Float32Array(buf);
}
