// geo_wells registry persistence (Well Data Manager G1.2) — direct RLS
// calls (house pattern). Tables + policies:
// supabase/migrations/20260713100000_create_wells_registry.sql.
//
// SHARED service (moved out of the Well Data Manager app at the second
// consumer, G1.4): Seismolord's wellsService adapts these functions to
// its legacy shapes; every future geoscience app (G2 petrophysics, G3
// correlation, G4 mapping) reads the registry through here too.
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
import { wellNameKey, wellNameClashMessage } from '@/lib/wellNames';

export { wellNameKey, wellNameClashMessage };

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

// The pure name rule lives in src/lib/wellNames.js (no I/O) so the harness
// backends and the .pld importer share it; re-exported below for callers.

/** Server-backed check used by saveWell and updateWell: reads the wells
 *  the caller can see (RLS: own + org-shared) and applies the rule. */
export async function assertWellNameFree(name, { exceptId = null, userId = null } = {}) {
  const { data, error } = await supabase.from('geo_wells').select('id, name, user_id');
  if (error) throw new Error(`Could not check well names: ${error.message}`);
  const msg = wellNameClashMessage(name, data || [], { exceptId, userId });
  if (msg) throw new Error(msg);
}

/**
 * @param {{name: string, uwi?: ?string, surfaceX: number, surfaceY: number,
 *   kbM?: number, tdMdM?: ?number, crs?: ?string, xyUnit?: ?string,
 *   crsProvenance?: ?Object, crsNote?: ?string, unitsNote?: ?string,
 *   deviation?: Array, checkshots?: Array}} w
 *   crs is the structured tag the coordinates are stored IN (CRS
 *   program): 'EPSG:<code>' | 'CUSTOM:<uuid>' | 'LOCAL'; null/absent =
 *   unknown placement (legacy behavior, badge in the UI). crs_note
 *   stays free-text context.
 */
const isMissingColumn = (error) => error && (error.code === 'PGRST204' || /column .* does not exist|schema cache/i.test(error.message || ''));

export async function saveWell(w) {
  const user = await requireUser();
  await assertWellNameFree(w.name, { userId: user.id });
  const row = {
    user_id: user.id,
    name: String(w.name).trim(),
    uwi: w.uwi || null,
    surface_x: w.surfaceX,
    surface_y: w.surfaceY,
    kb_m: w.kbM ?? 0,
    td_md_m: w.tdMdM ?? null,
    crs: w.crs || null,
    xy_unit: w.xyUnit || null,
    crs_provenance: w.crsProvenance || null,
    crs_note: w.crsNote || null,
    units_note: w.unitsNote || null,
    deviation: w.deviation || [],
    checkshots: w.checkshots || [],
  };
  // PT1: how the checkshots were entered (convention, KB and survey used).
  // The column arrives with migration 20260904090000; until it is applied
  // the insert retries without it so well creation never breaks.
  if (w.checkshotsProvenance) row.checkshots_provenance = w.checkshotsProvenance;
  let { data, error } = await supabase.from('geo_wells').insert(row).select().single();
  if (error && row.checkshots_provenance && isMissingColumn(error)) {
    delete row.checkshots_provenance;
    ({ data, error } = await supabase.from('geo_wells').insert(row).select().single());
  }
  if (error) throw new Error(`Could not save well: ${error.message}`);
  return data;
}

/**
 * Owner edit of the well's own data after creation (PT1): the surface
 * location, KB, TD, the deviation survey and the checkshot table,
 * validated BEFORE the patch (the registry's only guard, since
 * updateWell is a raw patch). Callers convert typed checkshots through
 * the welldata engine first and pass the stored rows plus their
 * provenance.
 *
 * PT8 (2026-09-05): surfaceX / surfaceY join the editable set. They are
 * world coordinates already expressed in the well's own CRS, so nothing
 * is transformed here — the guard is only that a value is a finite
 * number; null clears the coordinate.
 */
export async function updateWellData(wellId, {
  surfaceX, surfaceY, kbM, tdMdM, deviation, checkshots, checkshotsProvenance,
} = {}) {
  const patch = {};
  for (const [name, value, col] of [['Surface X', surfaceX, 'surface_x'], ['Surface Y', surfaceY, 'surface_y']]) {
    if (value === undefined) continue;
    if (value === null) { patch[col] = null; continue; }
    const v = Number(value);
    if (!Number.isFinite(v)) throw new Error(`${name} must be a number in the well's CRS.`);
    patch[col] = v;
  }
  if (kbM !== undefined) {
    const v = Number(kbM);
    if (!Number.isFinite(v)) throw new Error('KB must be a number (metres above datum).');
    patch.kb_m = v;
  }
  if (tdMdM !== undefined) {
    if (tdMdM === null) patch.td_md_m = null;
    else {
      const v = Number(tdMdM);
      if (!(v > 0)) throw new Error('TD must be a positive number (m MD).');
      patch.td_md_m = v;
    }
  }
  if (deviation !== undefined) {
    const stations = (deviation || []).map((d) => ({ md: Number(d.md), inc: Number(d.inc), azi: Number(d.azi) }));
    if (stations.length === 1) throw new Error('A deviation survey needs at least 2 stations (or none for a vertical well).');
    for (let i = 0; i < stations.length; i++) {
      const st = stations[i];
      if (![st.md, st.inc, st.azi].every(Number.isFinite)) throw new Error(`Station ${i + 1}: MD, inclination and azimuth must be numbers.`);
      if (st.inc < 0 || st.inc > 180) throw new Error(`Station ${i + 1}: inclination ${st.inc}° is outside 0–180°.`);
      if (i && !(st.md > stations[i - 1].md)) throw new Error(`Station ${i + 1}: MD ${st.md} does not increase (previous station is at ${stations[i - 1].md}).`);
    }
    patch.deviation = stations;
  }
  if (checkshots !== undefined) {
    const rows = validateStoredCheckshotsShape(checkshots);
    patch.checkshots = rows;
  }
  if (checkshotsProvenance !== undefined) patch.checkshots_provenance = checkshotsProvenance;
  if (!Object.keys(patch).length) throw new Error('Nothing to update.');
  let { data, error } = await supabase.from('geo_wells')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', wellId).select().single();
  if (error && 'checkshots_provenance' in patch && isMissingColumn(error)) {
    delete patch.checkshots_provenance;
    ({ data, error } = await supabase.from('geo_wells')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', wellId).select().single());
  }
  if (error) throw new Error(`Could not update well data: ${error.message}`);
  return data;
}

/** Stored-core shape check shared with the harness backend (the full
 *  conversion lives in the welldata checkshots engine). */
export function validateStoredCheckshotsShape(rows) {
  if (!Array.isArray(rows)) throw new Error('Checkshots must be a list of rows.');
  if (rows.length === 1) throw new Error('A checkshot table needs at least 2 rows (or none).');
  const out = rows.map((r, i) => {
    const tvdss = Number(r?.tvdss_m);
    const twt = Number(r?.twt_ms);
    if (!Number.isFinite(tvdss) || !Number.isFinite(twt)) throw new Error(`Row ${i + 1}: checkshot depth and time must be numbers.`);
    const o = { tvdss_m: tvdss, twt_ms: twt };
    if (r.md_m !== undefined && r.md_m !== null && Number.isFinite(Number(r.md_m))) o.md_m = Number(r.md_m);
    return o;
  });
  for (let i = 1; i < out.length; i++) {
    if (!(out[i].tvdss_m > out[i - 1].tvdss_m) || !(out[i].twt_ms > out[i - 1].twt_ms)) {
      throw new Error(`Row ${i + 1}: checkshots must strictly increase in depth and time. Fix the table rather than let the app re-sort it.`);
    }
  }
  return out;
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

/** listWells + each well's tops embedded in one query (Seismolord's
 *  viewers consume wells with tops attached). Tops come back in the
 *  registry row shape ({name, md_m, ...}), MD-ascending. */
export async function listWellsWithTops() {
  const [{ data, error }, { data: { user } }] = await Promise.all([
    supabase.from('geo_wells')
      .select('*, geo_wells_tops(id, name, md_m, interpreter)')
      .order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ]);
  if (error) throw new Error(`Could not load wells: ${error.message}`);
  return (data || []).map(({ geo_wells_tops: tops, ...w }) => ({
    ...w,
    is_own: !!user && w.user_id === user.id,
    tops: (tops || []).slice().sort((a, b) => a.md_m - b.md_m),
  }));
}

export async function getWell(wellId) {
  const { data, error } = await supabase.from('geo_wells')
    .select('*').eq('id', wellId).single();
  if (error) throw new Error(`Could not load well: ${error.message}`);
  return data;
}

/** Owner-only header/survey updates (RLS rejects everyone else). */
export async function updateWell(wellId, patch) {
  if (patch && patch.name !== undefined) {
    const user = await requireUser();
    await assertWellNameFree(patch.name, { exceptId: wellId, userId: user.id });
    patch = { ...patch, name: String(patch.name).trim() };
  }
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
  // .select() so an RLS-filtered delete (not the owner: org-shared
  // read-only rows) surfaces as an error instead of a silent no-op
  const { data, error } = await supabase.from('geo_wells')
    .delete().eq('id', well.id).select('id');
  if (error) throw new Error(`Could not delete well: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can delete this well (org sharing is read-only).');
  }
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

// ---- zones (normalized, Petrophysics Studio G2.2) -------------------------
// geo_wells_zones: visibility inherits the well row; writes owner-only
// (RLS). `properties` is the PUBLISHED petrophysical summary jsonb —
// written only by an explicit publish action, never by recompute.

export async function listZones(wellId) {
  const { data, error } = await supabase.from('geo_wells_zones')
    .select('*').eq('well_id', wellId).order('top_md_m', { ascending: true });
  if (error) throw new Error(`Could not load zones: ${error.message}`);
  return data || [];
}

/** @param {{name: string, topMdM: number, baseMdM: number}} z */
export async function saveZone(wellId, z) {
  // PT8: `fromTops` records which tops drew the edges, so a later top move
  // re-cuts exactly this zone. It rides in properties, which the publish
  // path merges rather than replaces.
  const properties = z.fromTops ? { from_tops: z.fromTops } : {};
  const { data, error } = await supabase.from('geo_wells_zones')
    .insert({ well_id: wellId, name: z.name, top_md_m: z.topMdM, base_md_m: z.baseMdM, properties })
    .select().single();
  if (error) throw new Error(`Could not save zone: ${error.message}`);
  return data;
}

export async function updateZone(zoneId, patch) {
  const { data, error } = await supabase.from('geo_wells_zones')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', zoneId).select();
  if (error) throw new Error(`Could not update zone: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can edit zones (org sharing is read-only).');
  }
  return data[0];
}

export async function deleteZone(zone) {
  const { data, error } = await supabase.from('geo_wells_zones')
    .delete().eq('id', zone.id).select('id');
  if (error) throw new Error(`Could not delete zone: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can delete zones (org sharing is read-only).');
  }
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

// Per-top CRUD (Well Correlation G3) — the correlation UI picks and
// drag-edits individual tops rather than replacing the whole set. All
// owner-only via the existing geo_wells_tops RLS (no policy change); a
// 0-row write surfaces as an owner-only error instead of a silent
// no-op, exactly like deleteWell.

/** @param {{name: string, mdM: number, interpreter?: ?string}} top */
export async function saveTop(wellId, top) {
  const { data, error } = await supabase.from('geo_wells_tops')
    .insert({ well_id: wellId, name: top.name, md_m: top.mdM, interpreter: top.interpreter || null })
    .select().single();
  if (error) throw new Error(`Could not add top: ${error.message}`);
  return data;
}

export async function updateTop(topId, patch) {
  const row = { ...patch, updated_at: new Date().toISOString() };
  if (patch.mdM !== undefined) { row.md_m = patch.mdM; delete row.mdM; }
  const { data, error } = await supabase.from('geo_wells_tops')
    .update(row).eq('id', topId).select();
  if (error) throw new Error(`Could not update top: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can edit tops (org sharing is read-only).');
  }
  return data[0];
}

export async function deleteTop(top) {
  const { data, error } = await supabase.from('geo_wells_tops')
    .delete().eq('id', top.id).select('id');
  if (error) throw new Error(`Could not delete top: ${error.message}`);
  if (!data || !data.length) {
    throw new Error('Only the owner can delete tops (org sharing is read-only).');
  }
}

/**
 * Propagate a named top to several owned wells at a given MD (v1
 * correlation: seed the same top across the section, user drags to
 * correct — no auto-correlation). Skips a well that already has the
 * top (idempotent re-propagate); RLS drops silently-unowned wells, and
 * the caller learns which succeeded from the returned rows.
 * @param {string} name @param {Array<{wellId: string, mdM: number}>} targets
 */
export async function propagateTop(name, targets) {
  if (!targets.length) return [];
  const created = [];
  for (const t of targets) {
    const existing = await listTops(t.wellId);
    if (existing.some((x) => x.name === name)) continue;
    // per-well so one RLS-blocked well doesn't fail the whole batch
    const { data, error } = await supabase.from('geo_wells_tops')
      .insert({ well_id: t.wellId, name, md_m: t.mdM })
      .select();
    if (error) throw new Error(`Could not propagate "${name}": ${error.message}`);
    if (data && data.length) created.push(data[0]);
  }
  return created;
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
