// The cloud side of local volumes (migration 20261016100000, owner applies):
// the device record, one replica row per copy on a computer, the volume's
// location fields and copy requests. The bytes stay on the computer; these
// rows are what colleagues in the same Suite Project see ("Lives on Ayo's
// PC"), under the same RLS and Suite Projects rules as every seismic row.
//
// Before the migration is applied the columns and tables are missing; the
// capability probe then answers false and the Suite keeps every volume in
// the cloud exactly as before.

const MISSING_CODES = new Set(['42703', '42P01', 'PGRST204', 'PGRST205', 'PGRST202']);

/** True for "column/table/function does not exist" errors. */
export function isSchemaMissing(error) {
  if (!error) return false;
  if (MISSING_CODES.has(String(error.code))) return true;
  return /does not exist|could not find .*(column|table|function)|schema cache/i.test(error.message || '');
}

let probe = null;
/**
 * Is the local workspace schema applied on this database? Cached for the
 * session once true; retried after a minute when false.
 * @param {Object} supabase
 */
export async function localSchemaReady(supabase, { force = false } = {}) {
  const now = Date.now();
  if (!force && probe && (probe.ok || now - probe.at < 60000)) return probe.ok;
  let ok = false;
  try {
    const { error } = await supabase.from('seismic_volumes').select('id, storage_location, content_id, brick_root, device_id, previews').limit(1);
    if (!error) {
      const r = await supabase.from('seismic_volume_replicas').select('volume_id').limit(1);
      ok = !r.error;
    }
  } catch { ok = false; }
  probe = { ok, at: now };
  return ok;
}
/** Tests. */
export function resetLocalSchemaProbe(v = null) { probe = v == null ? null : { ok: v, at: Date.now() }; }

/** Create (or refresh) this computer's device row; returns its id. */
export async function registerDevice(supabase, { deviceId = null, label, kind }) {
  const row = { label: String(label).slice(0, 80), kind, last_seen_at: new Date().toISOString() };
  if (deviceId) {
    const { data, error } = await supabase.from('seismic_devices').update(row).eq('id', deviceId).select('id').maybeSingle();
    if (!error && data) return data.id;
  }
  const { data, error } = await supabase.from('seismic_devices').insert(row).select('id').single();
  if (error) throw new Error(`Could not register this computer: ${error.message}`);
  return data.id;
}

/** Keep the device's last-seen time current (colleagues see "last seen 2 h ago"). */
export async function touchDevice(supabase, deviceId) {
  if (!deviceId) return;
  const now = new Date().toISOString();
  await supabase.from('seismic_devices').update({ last_seen_at: now }).eq('id', deviceId);
  await supabase.from('seismic_volume_replicas').update({ last_seen_at: now }).eq('device_id', deviceId);
}

/** Record (or update) the copy of a volume on this computer. */
export async function upsertReplica(supabase, { volumeId, deviceId, deviceLabel, state, bytes = 0, verified = false }) {
  const row = {
    volume_id: volumeId,
    device_id: deviceId,
    device_label: String(deviceLabel).slice(0, 80),
    state,
    bytes: Math.max(0, Math.round(bytes)),
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...(verified ? { verified_at: new Date().toISOString() } : {}),
  };
  const { error } = await supabase.from('seismic_volume_replicas').upsert(row, { onConflict: 'volume_id,device_id' });
  if (error) throw new Error(`Could not record the local copy: ${error.message}`);
}

/** The location fields on a volume row. */
export async function setVolumeLocation(supabase, volumeId, { storageLocation, deviceId, contentId, brickRoot, previews } = {}) {
  const patch = {};
  if (storageLocation) patch.storage_location = storageLocation;
  if (deviceId !== undefined) patch.device_id = deviceId;
  if (contentId !== undefined) patch.content_id = contentId;
  if (brickRoot !== undefined) patch.brick_root = brickRoot;
  if (previews !== undefined) patch.previews = previews;
  if (!Object.keys(patch).length) return;
  const { error } = await supabase.from('seismic_volumes').update(patch).eq('id', volumeId);
  if (error) throw new Error(`Could not record where the volume lives: ${error.message}`);
}

/**
 * Location and replicas of volumes, for the lists (Seismic Explorer, QI
 * Data). Returns Map id -> {storage_location, device_id, previews, replicas: [...]}
 */
export async function volumeLocations(supabase, ids) {
  const out = new Map();
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return out;
  for (let i = 0; i < list.length; i += 200) {
    const chunk = list.slice(i, i + 200);
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase.from('seismic_volumes')
      .select('id, user_id, storage_location, device_id, previews, content_id, brick_root, seismic_volume_replicas(device_id, device_label, state, bytes, last_seen_at, verified_at, user_id)')
      .in('id', chunk);
    if (error) {
      if (isSchemaMissing(error)) return out;
      throw new Error(`Could not read where the volumes live: ${error.message}`);
    }
    for (const r of data || []) out.set(r.id, { ...r, replicas: r.seismic_volume_replicas || [] });
  }
  return out;
}

/** Ask a volume's owner for a cloud copy. */
export async function requestCloudCopy(supabase, { volumeId, ownerId, what = 'display', note = null }) {
  const { data, error } = await supabase.from('seismic_copy_requests')
    .insert({ volume_id: volumeId, owner_id: ownerId, what, note: note ? String(note).slice(0, 500) : null })
    .select('id').single();
  if (error) throw new Error(`Could not send the request: ${error.message}`);
  return data.id;
}

/** Open copy requests sent to me (owner) and by me (requester). */
export async function listCopyRequests(supabase, userId) {
  const { data, error } = await supabase.from('seismic_copy_requests')
    .select('id, volume_id, requester_id, owner_id, what, status, note, created_at')
    .or(`owner_id.eq.${userId},requester_id.eq.${userId}`)
    .order('created_at', { ascending: false }).limit(100);
  if (error) {
    if (isSchemaMissing(error)) return [];
    throw new Error(`Could not read copy requests: ${error.message}`);
  }
  return data || [];
}

export async function setCopyRequestStatus(supabase, id, status) {
  const { error } = await supabase.from('seismic_copy_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(`Could not update the request: ${error.message}`);
}
