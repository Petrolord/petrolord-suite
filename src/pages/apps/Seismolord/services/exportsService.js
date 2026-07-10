// seismic_exported_surfaces: the Seismolord -> suite handoff registry.
// XYZ text goes to {user_id}/exports/{id}.xyz (outside volume dirs so a
// volume deletion never orphans a handed-off surface); the row carries
// permanent provenance. ReservoirCalc Pro's import dialog consumes these.

import { supabase } from '@/lib/customSupabaseClient';

const SEISMIC_BUCKET = 'seismic';
export const HANDOFF_APP_VERSION = 'seismolord-phase5';

/**
 * @param {Object} p
 * @param {string} p.name
 * @param {string} p.xyzText XYZ file content (z negative-down, 1e30 nulls)
 * @param {'depth_ft'|'twt_ms'} p.domain
 * @param {Object} p.volume seismic_volumes row
 * @param {Object} p.horizon seismic_horizons row
 * @param {Object} p.params gridding/export parameters + stats
 */
export async function publishSurface({ name, xyzText, domain, volume, horizon, params }) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to publish surfaces.');

  const id = crypto.randomUUID();
  const storagePath = `${user.id}/exports/${id}.xyz`;
  const provenance = {
    app: 'seismolord',
    app_version: HANDOFF_APP_VERSION,
    volume: { id: volume.id, name: volume.name },
    horizon: { id: horizon.id, name: horizon.name },
    domain,
    params,
    exported_at: new Date().toISOString(),
  };

  const { error: uploadError } = await supabase.storage.from(SEISMIC_BUCKET)
    .upload(storagePath, new Blob([xyzText], { type: 'text/plain' }),
      { contentType: 'text/plain' });
  if (uploadError) throw new Error(`Could not store surface: ${uploadError.message}`);

  const { data, error } = await supabase.from('seismic_exported_surfaces')
    .insert({
      id,
      user_id: user.id,
      volume_id: volume.id,
      horizon_id: horizon.id,
      name,
      format: 'xyz',
      domain,
      storage_path: storagePath,
      provenance,
    })
    .select().single();
  if (error) {
    await supabase.storage.from(SEISMIC_BUCKET).remove([storagePath]);
    throw new Error(`Could not register surface: ${error.message}`);
  }
  return data;
}

export async function listExportedSurfaces() {
  const { data, error } = await supabase.from('seismic_exported_surfaces')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load exported surfaces: ${error.message}`);
  return data || [];
}

/** @returns {Promise<string>} the XYZ text */
export async function downloadExportedSurface(row) {
  const { data, error } = await supabase.storage.from(SEISMIC_BUCKET)
    .download(row.storage_path);
  if (error) throw new Error(`Could not download surface: ${error.message}`);
  return data.text();
}

export async function deleteExportedSurface(row) {
  await supabase.storage.from(SEISMIC_BUCKET).remove([row.storage_path]);
  const { error } = await supabase.from('seismic_exported_surfaces')
    .delete().eq('id', row.id);
  if (error) throw new Error(`Could not delete surface: ${error.message}`);
}
