// seismic_volumes CRUD — direct client calls under user-scoped RLS
// (house pattern). Storage cleanup pairs row deletion with the volume's
// owner-path objects so no orphan bricks accumulate.

import { supabase } from '@/lib/customSupabaseClient';
import { SEISMIC_BUCKET } from './ingestService';

export async function listVolumes() {
  const { data, error } = await supabase
    .from('seismic_volumes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load volumes: ${error.message}`);
  return data || [];
}

export async function getManifest(volume) {
  const { data, error } = await supabase.storage
    .from(SEISMIC_BUCKET)
    .download(`${volume.storage_path}/manifest.json`);
  if (error) throw new Error(`Could not load manifest: ${error.message}`);
  return JSON.parse(await data.text());
}

/**
 * Persist the volume's velocity model inside its manifest.json (owner
 * path, storage RLS — no schema change). Pass null to remove the model.
 *
 * `calibration` is the well-tie provenance stored alongside as
 * manifest.velocity_calibration; a manual editor save passes nothing,
 * which CLEARS it — a hand-typed model is no longer the calibrated one,
 * and depth exports must not claim wells they didn't use.
 * @returns {Promise<Object>} the merged manifest
 */
export async function saveManifestVelocity(volume, manifest, velocity, calibration = null) {
  const next = { ...manifest };
  if (velocity) next.velocity = velocity;
  else delete next.velocity;
  if (velocity && calibration) next.velocity_calibration = calibration;
  else delete next.velocity_calibration;
  const { error } = await supabase.storage.from(SEISMIC_BUCKET)
    .upload(`${volume.storage_path}/manifest.json`,
      new Blob([JSON.stringify(next)], { type: 'application/json' }),
      { contentType: 'application/json', upsert: true });
  if (error) throw new Error(`Could not save velocity model: ${error.message}`);
  return next;
}

/**
 * Persist the volume's named traverse lines inside its manifest.json —
 * the same owner-path upsert as the velocity model (storage RLS, no
 * schema change; a traverse is a few dozen bytes of polyline). Pass an
 * empty array to remove them all.
 * @returns {Promise<Object>} the merged manifest
 */
export async function saveManifestTraverses(volume, manifest, traverses) {
  const next = { ...manifest };
  if (traverses && traverses.length) next.traverses = traverses;
  else delete next.traverses;
  const { error } = await supabase.storage.from(SEISMIC_BUCKET)
    .upload(`${volume.storage_path}/manifest.json`,
      new Blob([JSON.stringify(next)], { type: 'application/json' }),
      { contentType: 'application/json', upsert: true });
  if (error) throw new Error(`Could not save traverse lines: ${error.message}`);
  return next;
}

export async function deleteVolume(volume) {
  // Storage first: list bricks + manifest under the owner path, remove in
  // batches (remove() caps around 1000 keys per call), then drop the row.
  const dir = volume.storage_path;
  const paths = [`${dir}/manifest.json`];
  for (const sub of ['bricks', 'horizons']) {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage.from(SEISMIC_BUCKET)
        .list(`${dir}/${sub}`, { limit: 1000, offset });
      if (error) break;                     // dir may simply not exist yet
      (data || []).forEach((o) => paths.push(`${dir}/${sub}/${o.name}`));
      if (!data || data.length < 1000) break;
      offset += data.length;
    }
  }
  for (let i = 0; i < paths.length; i += 1000) {
    const { error } = await supabase.storage.from(SEISMIC_BUCKET)
      .remove(paths.slice(i, i + 1000));
    if (error && !/not found/i.test(error.message)) {
      throw new Error(`Could not delete volume data: ${error.message}`);
    }
  }

  const { error } = await supabase.from('seismic_volumes').delete().eq('id', volume.id);
  if (error) throw new Error(`Could not delete volume record: ${error.message}`);
}
