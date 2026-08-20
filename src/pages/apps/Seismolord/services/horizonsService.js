// seismic_horizons persistence: metadata + provenance in the row (direct
// RLS insert, house pattern), the pick grid as a float32 blob in the
// seismic bucket under the volume's owner path.

import { supabase } from '@/lib/customSupabaseClient';
import { SEISMIC_BUCKET } from './seismicStorage';
import { horizonStats } from '../engine/horizonTrack';

const horizonBlobPath = (volumeStoragePath, horizonId) =>
  `${volumeStoragePath}/horizons/${horizonId}.f32`;

/** Companion confidence layer (W3.2 NCC tracking): {id}.conf.f32 beside
 *  the pick blob. Absent for snap-tracked and hand-edited horizons. */
export const confidenceBlobPath = (pickBlobPath) =>
  pickBlobPath.replace(/\.f32$/, '.conf.f32');

/** True when a confidence grid carries at least one live coefficient. */
const hasConfidence = (confidence) => {
  if (!confidence) return false;
  for (const v of confidence) if (Math.abs(v) < 1.0e29) return true;
  return false;
};

/** Attribution string for version rows (W4.3): the signed-in user's
 *  display name, falling back to their email. */
const interpreterName = (user) => user?.user_metadata?.full_name
  || user?.user_metadata?.name || user?.email || null;

/**
 * Save a tracked horizon: blob first, row second.
 *
 * @param {Object} p
 * @param {Object} p.volume seismic_volumes row
 * @param {string} p.name
 * @param {Float32Array} p.picks nIl x nXl sample indices (1e30 nulls)
 * @param {{ilIdx:number,xlIdx:number,sample:number}} p.seed
 * @param {Object} p.params tracker options used (mode, window, maxJump, …)
 * @param {number} p.dtUs volume sample interval, for TWT stats
 */
export async function saveHorizon({ volume, name, picks, seed, params, dtUs, confidence = null }) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save horizons.');

  const horizonId = crypto.randomUUID();
  // W4.1: on an org-shared volume that is not mine, my interpretation
  // blobs live under MY uid with the same volume id at path segment 2 —
  // storage writes stay owner-path-only, the org SELECT policy matches
  // on the volume id, so teammates still read them
  const blobDir = volume.user_id === user.id
    ? volume.storage_path : `${user.id}/${volume.id}`;
  const blobPath = horizonBlobPath(blobDir, horizonId);
  const s = horizonStats(picks);
  const dtMs = dtUs / 1000;
  const stats = {
    tracked: s.tracked,
    coverage: s.coverage,
    min_twt_ms: s.minSample != null ? s.minSample * dtMs : null,
    max_twt_ms: s.maxSample != null ? s.maxSample * dtMs : null,
    grid: { n_il_by_n_xl: picks.length },
  };

  const { error: uploadError } = await supabase.storage.from(SEISMIC_BUCKET)
    .upload(blobPath, new Blob([picks.buffer], { type: 'application/octet-stream' }),
      { contentType: 'application/octet-stream' });
  if (uploadError) throw new Error(`Could not store horizon picks: ${uploadError.message}`);

  if (hasConfidence(confidence)) {
    const { error: confError } = await supabase.storage.from(SEISMIC_BUCKET)
      .upload(confidenceBlobPath(blobPath),
        new Blob([confidence.buffer], { type: 'application/octet-stream' }),
        { contentType: 'application/octet-stream' });
    if (confError) {
      await supabase.storage.from(SEISMIC_BUCKET).remove([blobPath]);
      throw new Error(`Could not store tracking confidence: ${confError.message}`);
    }
  }

  const { data, error } = await supabase.from('seismic_horizons')
    .insert({
      id: horizonId,
      user_id: user.id,
      volume_id: volume.id,
      name,
      domain: 'twt_ms',
      snap_mode: params?.mode || 'peak',
      seed,
      params,
      stats,
      storage_path: blobPath,
      interpreter: interpreterName(user),
    })
    .select().single();
  if (error) {
    // don't leave an orphan blob behind a failed insert
    await supabase.storage.from(SEISMIC_BUCKET).remove([blobPath]);
    throw new Error(`Could not register horizon: ${error.message}`);
  }
  return data;
}

/**
 * Persist an edited pick grid over an existing horizon: overwrite the
 * blob in place (same path — RLS owner path is already established),
 * then refresh the row's stats/params.
 *
 * @param {Object} p
 * @param {Object} p.horizon seismic_horizons row
 * @param {Float32Array} p.picks edited grid (1e30 nulls)
 * @param {number} p.dtUs volume sample interval, for TWT stats
 * @param {Object} [p.params] merged into the stored params (e.g. edit
 *   provenance: snap mode, tools used)
 */
export async function updateHorizon({ horizon, picks, dtUs, params, confidence = null }) {
  const { error: uploadError } = await supabase.storage.from(SEISMIC_BUCKET)
    .upload(horizon.storage_path,
      new Blob([picks.buffer], { type: 'application/octet-stream' }),
      { contentType: 'application/octet-stream', upsert: true });
  if (uploadError) throw new Error(`Could not store edited picks: ${uploadError.message}`);

  // W3.2: a re-track passes a fresh confidence grid; hand edits pass
  // nothing and the stored layer (if any) is left as-is — per-cell
  // confidence for edited picks is undefined, not zero
  if (hasConfidence(confidence)) {
    const { error: confError } = await supabase.storage.from(SEISMIC_BUCKET)
      .upload(confidenceBlobPath(horizon.storage_path),
        new Blob([confidence.buffer], { type: 'application/octet-stream' }),
        { contentType: 'application/octet-stream', upsert: true });
    if (confError) throw new Error(`Could not store tracking confidence: ${confError.message}`);
  }

  const s = horizonStats(picks);
  const dtMs = dtUs / 1000;
  const stats = {
    tracked: s.tracked,
    coverage: s.coverage,
    min_twt_ms: s.minSample != null ? s.minSample * dtMs : null,
    max_twt_ms: s.maxSample != null ? s.maxSample * dtMs : null,
    grid: { n_il_by_n_xl: picks.length },
  };
  const nextParams = { ...(horizon.params || {}), ...(params || {}) };
  const { data, error } = await supabase.from('seismic_horizons')
    .update({
      stats,
      params: nextParams,
      snap_mode: nextParams.mode || horizon.snap_mode,
    })
    .eq('id', horizon.id)
    .select().single();
  if (error) throw new Error(`Could not update horizon: ${error.message}`);
  return data;
}

/**
 * Persist display settings (and optionally a rename) WITHOUT touching the
 * pick blob: params.display is merged non-destructively into the stored
 * params jsonb. Used by the horizon settings dialog — a settings save
 * must never re-upload (or risk clobbering) the picks.
 *
 * @param {Object} p
 * @param {Object} p.horizon seismic_horizons row
 * @param {Object} [p.display] display settings to store under params.display
 * @param {string} [p.name] new horizon name
 * @returns {Promise<Object>} the refreshed row
 */
export async function updateHorizonMeta({ horizon, display, name }) {
  const patch = {};
  if (display !== undefined) {
    patch.params = { ...(horizon.params || {}), display };
  }
  if (name !== undefined && name !== horizon.name) patch.name = name;
  if (!Object.keys(patch).length) return horizon;
  const { data, error } = await supabase.from('seismic_horizons')
    .update(patch)
    .eq('id', horizon.id)
    .select().single();
  if (error) throw new Error(`Could not save horizon settings: ${error.message}`);
  return data;
}

/**
 * W4.3 "New version": snapshot `grid` as the chain's new HEAD — a fresh
 * row (fresh id -> fresh blob, append-only storage), version + 1,
 * linked to its parent; the old head is soft-archived. History never
 * rewrites: restoring an old version calls this again with its grid.
 *
 * @param {Object} p
 * @param {Object} p.horizon the current HEAD row
 * @param {Object} p.volume seismic_volumes row
 * @param {Float32Array} p.picks the snapshot content
 * @param {number} p.dtUs
 * @param {Object} [p.params] provenance merged onto the head's params
 * @param {Float32Array} [p.confidence]
 * @returns {Promise<Object>} the NEW head row
 */
export async function saveHorizonVersion({
  horizon, volume, picks, dtUs, params = null, confidence = null,
}) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save versions.');

  const newId = crypto.randomUUID();
  const blobDir = volume.user_id === user.id
    ? volume.storage_path : `${user.id}/${volume.id}`;
  const blobPath = horizonBlobPath(blobDir, newId);
  const s = horizonStats(picks);
  const dtMs = dtUs / 1000;
  const stats = {
    tracked: s.tracked,
    coverage: s.coverage,
    min_twt_ms: s.minSample != null ? s.minSample * dtMs : null,
    max_twt_ms: s.maxSample != null ? s.maxSample * dtMs : null,
    grid: { n_il_by_n_xl: picks.length },
  };

  const { error: uploadError } = await supabase.storage.from(SEISMIC_BUCKET)
    .upload(blobPath, new Blob([picks.buffer], { type: 'application/octet-stream' }),
      { contentType: 'application/octet-stream' });
  if (uploadError) throw new Error(`Could not store the version: ${uploadError.message}`);
  if (hasConfidence(confidence)) {
    await supabase.storage.from(SEISMIC_BUCKET)
      .upload(confidenceBlobPath(blobPath),
        new Blob([confidence.buffer], { type: 'application/octet-stream' }),
        { contentType: 'application/octet-stream' });
  }

  const { data: head, error } = await supabase.from('seismic_horizons')
    .insert({
      id: newId,
      user_id: user.id,
      volume_id: volume.id,
      name: horizon.name,
      domain: horizon.domain,
      snap_mode: horizon.snap_mode,
      seed: horizon.seed,
      params: { ...(horizon.params || {}), ...(params || {}) },
      stats,
      storage_path: blobPath,
      version: (horizon.version || 1) + 1,
      parent_version_id: horizon.id,
      interpreter: interpreterName(user),
    })
    .select().single();
  if (error) {
    await supabase.storage.from(SEISMIC_BUCKET)
      .remove([blobPath, confidenceBlobPath(blobPath)]);
    throw new Error(`Could not register the version: ${error.message}`);
  }

  // archive the old head (own rows only — RLS enforces); a failure here
  // leaves two heads, which the explorer disambiguates by version
  const { error: archiveError } = await supabase.from('seismic_horizons')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', horizon.id);
  if (archiveError) {
    throw new Error(`Version created, but the old head could not be archived: ${archiveError.message}`);
  }
  return head;
}

export async function listHorizons(volumeId) {
  const [{ data, error }, { data: { user } }] = await Promise.all([
    supabase.from('seismic_horizons')
      .select('*')
      .eq('volume_id', volumeId)
      .order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ]);
  if (error) throw new Error(`Could not load horizons: ${error.message}`);
  // is_own drives read-only affordances on org-shared volumes (W4.1)
  return (data || []).map((h) => ({
    ...h, is_own: !!user && h.user_id === user.id,
  }));
}

/** @returns {Promise<Float32Array>} the pick grid */
export async function loadHorizonGrid(horizon) {
  const { data, error } = await supabase.storage.from(SEISMIC_BUCKET)
    .download(horizon.storage_path);
  if (error) throw new Error(`Could not load horizon picks: ${error.message}`);
  return new Float32Array(await data.arrayBuffer());
}

/** @returns {Promise<Float32Array|null>} the confidence companion grid,
 *  or null when the horizon has none (snap-tracked / hand-edited). */
export async function loadHorizonConfidence(horizon) {
  const { data, error } = await supabase.storage.from(SEISMIC_BUCKET)
    .download(confidenceBlobPath(horizon.storage_path));
  if (error || !data) return null;
  return new Float32Array(await data.arrayBuffer());
}

/**
 * Delete a horizon head AND its archived version chain (W4.3): blobs
 * first (a transient storage failure keeps the rows so the user just
 * retries — no unreachable orphan blobs, L1), then all rows.
 * @param {Object} horizon the head row
 * @param {Object[]} [versions] its archived ancestors (ViewerPanel's
 *   chain walk); [] for pre-versioning callers
 */
export async function deleteHorizon(horizon, versions = []) {
  const rows = [horizon, ...versions];
  const paths = rows.flatMap((h) => [h.storage_path, confidenceBlobPath(h.storage_path)]);
  const { error: removeError } = await supabase.storage.from(SEISMIC_BUCKET)
    .remove(paths);
  if (removeError) {
    throw new Error(
      `Could not delete stored picks (${removeError.message}) — nothing was deleted; try again.`);
  }
  const { error } = await supabase.from('seismic_horizons')
    .delete().in('id', rows.map((h) => h.id));
  if (error) throw new Error(`Could not delete horizon: ${error.message}`);
}
