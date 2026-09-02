// seismic_volumes CRUD — direct client calls under user-scoped RLS
// (house pattern). Storage cleanup pairs row deletion with the volume's
// owner-path objects so no orphan bricks accumulate.

import { supabase } from '@/lib/customSupabaseClient';
import { registerStateKind, openStateRow, writeStamped } from '@/lib/stateVersion';
import { SEISMIC_BUCKET } from './seismicStorage';
import { gateManifest } from './manifestGate';
import { myOrgId } from './surfacesService';

export { gateManifest };

/** Own volumes plus org-shared ones (W4.1). is_own drives the UI's
 *  read-only affordances; RLS enforces the writes regardless. */
export async function listVolumes() {
  const [{ data, error }, { data: { user } }] = await Promise.all([
    supabase.from('seismic_volumes')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ]);
  if (error) throw new Error(`Could not load volumes: ${error.message}`);
  return (data || []).map((v) => ({
    ...v, is_own: !!user && v.user_id === user.id,
  }));
}

/** Share/unshare an OWN volume with the caller's organization —
 *  read-only for members (bricks, manifest, everyone's horizons and
 *  faults on it). The geo_surfaces model; RLS re-checks membership. */
export async function setVolumeShared(volume, shared) {
  let organizationId = null;
  if (shared) {
    organizationId = await myOrgId();
    if (!organizationId) throw new Error('You belong to no organization — nothing to share with.');
  }
  const { data, error } = await supabase.from('seismic_volumes')
    .update({ organization_id: organizationId })
    .eq('id', volume.id)
    .select().single();
  if (error) throw new Error(`Could not update sharing: ${error.message}`);
  return data;
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

// ---- W4.2 projects (explorer grouping) -----------------------------------

// PP0 state kind for seismic_projects only (docs/scope/ProjectPortability-PLAN.md
// §4.3); the registry tables in this file (seismic_volumes etc.) are HELD.
const SEISMIC_PROJECT_KIND = 'seismic-project';
registerStateKind(SEISMIC_PROJECT_KIND, { current: 1, label: 'seismic project' });

export async function listProjects() {
  const { data, error } = await supabase.from('seismic_projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load projects: ${error.message}`);
  return (data || []).map((row) => openStateRow(SEISMIC_PROJECT_KIND, row));
}

export async function createProject(name, description = null) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to create projects.');
  const { data, error } = await writeStamped(SEISMIC_PROJECT_KIND,
    { user_id: user.id, name, description },
    (row) => supabase.from('seismic_projects').insert(row).select().single());
  if (error) throw new Error(`Could not create project: ${error.message}`);
  return data;
}

export async function renameProject(project, name) {
  const { data, error } = await writeStamped(SEISMIC_PROJECT_KIND,
    { name, updated_at: new Date().toISOString() },
    (row) => supabase.from('seismic_projects').update(row).eq('id', project.id).select().single());
  if (error) throw new Error(`Could not rename project: ${error.message}`);
  return data;
}

/** Deleting a project UNFILES its volumes (FK SET NULL) — data is never
 *  touched. */
export async function deleteProject(project) {
  const { error } = await supabase.from('seismic_projects')
    .delete().eq('id', project.id);
  if (error) throw new Error(`Could not delete project: ${error.message}`);
}

/** File a volume under a project (null = back to the flat list). */
export async function assignVolumeProject(volume, projectId) {
  const { data, error } = await supabase.from('seismic_volumes')
    .update({ project_id: projectId })
    .eq('id', volume.id)
    .select().single();
  if (error) throw new Error(`Could not move the volume: ${error.message}`);
  return data;
}
