// seismic_volumes CRUD — direct client calls under user-scoped RLS
// (house pattern). Storage cleanup pairs row deletion with the volume's
// owner-path objects so no orphan bricks accumulate.

import { supabase } from '@/lib/customSupabaseClient';
import { SEISMIC_BUCKET } from './seismicStorage';
import { gateManifest } from './manifestGate';

export { gateManifest };

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
  return gateManifest(JSON.parse(await data.text()));
}

// W0.2: manifest.json is immutable-after-ingest. The old
// saveManifestVelocity / saveManifestTraverses writers are gone; mutable
// interpretation state saves through services/interpState.js into
// seismic_volumes columns under a compare-and-set revision.

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
