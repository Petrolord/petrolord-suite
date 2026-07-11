// seismic_horizons persistence: metadata + provenance in the row (direct
// RLS insert, house pattern), the pick grid as a float32 blob in the
// seismic bucket under the volume's owner path.

import { supabase } from '@/lib/customSupabaseClient';
import { SEISMIC_BUCKET } from './ingestService';
import { horizonStats } from '../engine/horizonTrack';

const horizonBlobPath = (volumeStoragePath, horizonId) =>
  `${volumeStoragePath}/horizons/${horizonId}.f32`;

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
export async function saveHorizon({ volume, name, picks, seed, params, dtUs }) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save horizons.');

  const horizonId = crypto.randomUUID();
  const blobPath = horizonBlobPath(volume.storage_path, horizonId);
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
export async function updateHorizon({ horizon, picks, dtUs, params }) {
  const { error: uploadError } = await supabase.storage.from(SEISMIC_BUCKET)
    .upload(horizon.storage_path,
      new Blob([picks.buffer], { type: 'application/octet-stream' }),
      { contentType: 'application/octet-stream', upsert: true });
  if (uploadError) throw new Error(`Could not store edited picks: ${uploadError.message}`);

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

export async function listHorizons(volumeId) {
  const { data, error } = await supabase.from('seismic_horizons')
    .select('*')
    .eq('volume_id', volumeId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load horizons: ${error.message}`);
  return data || [];
}

/** @returns {Promise<Float32Array>} the pick grid */
export async function loadHorizonGrid(horizon) {
  const { data, error } = await supabase.storage.from(SEISMIC_BUCKET)
    .download(horizon.storage_path);
  if (error) throw new Error(`Could not load horizon picks: ${error.message}`);
  return new Float32Array(await data.arrayBuffer());
}

export async function deleteHorizon(horizon) {
  await supabase.storage.from(SEISMIC_BUCKET).remove([horizon.storage_path]);
  const { error } = await supabase.from('seismic_horizons')
    .delete().eq('id', horizon.id);
  if (error) throw new Error(`Could not delete horizon: ${error.message}`);
}
