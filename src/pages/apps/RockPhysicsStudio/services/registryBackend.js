// The app's real backend adapter (the Petrophysics Studio pair
// pattern): everything RockWorkstation touches goes through this one
// object so /dev/rock-physics-studio can swap in inMemoryBackend and
// the WHOLE app runs without auth or DB.
//
// Reads go straight to the shared registry (src/lib/wellsRegistry.js:
// geo_wells, geo_wells_logs + f32 curve objects, geo_wells_tops,
// geo_wells_zones — RLS enforces ownership/org sharing server-side).
// Writes: rp_projects (the owner's project, which the owner can share
// with the organisation) and, since RP1, the
// fluid-substituted curves published back to geo_wells_logs with the
// overwrite-own contract Pore Pressure Studio uses.

import { supabase } from '@/lib/customSupabaseClient';
import { registerStateKind, openStateRow, writeStamped } from '@/lib/stateVersion';
import {
  listWells, listLogs, downloadCurve, listTops, listZones, saveLogs, deleteLog,
} from '@/lib/wellsRegistry';
import { getDepthUnit } from '@/lib/crs/settingsService';
import { staleOwnCurves } from './publish';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { supabaseSharingStore } from '@/lib/recordSharing';

// U2-011: SCAL Studio's saved projects, read only (the saturation-height link)
const scalProjects = createSavedProjectsService('saved_scal_projects');

// ---- publish (RP1) -----------------------------------------------------------
// Overwrite-own: republish replaces only this engine's curves for the
// same well + mnemonic + project (the Petrophysics Studio contract).

async function publishCurves(wellId, preparedLogs, projectId) {
  const existing = await listLogs(wellId);
  for (const log of staleOwnCurves(existing, preparedLogs, projectId)) {
    await deleteLog(log);
  }
  return saveLogs(wellId, preparedLogs);
}

// ---- rp_projects (app-private workspace state) ------------------------------
// v1: one implicit project per user, created on first save (the
// petro_projects convention).

// PP0 state kind (docs/scope/ProjectPortability-PLAN.md §4.3): version 1 is
// the current row shape; a future shape change bumps `current` and adds
// migrations[n]. Rows open through openStateRow, writes go through writeStamped.
const RP_PROJECT_KIND = 'rp-project';
registerStateKind(RP_PROJECT_KIND, { current: 1, label: 'rock physics project' });

// Organisation sharing (migration 20261002100000): rp_projects rows now
// include the projects colleagues shared, so "my project" is asked for by
// owner, and the shared ones are listed apart. A save carries the version the
// project was opened at; before the migration it is the plain update.
async function currentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

async function loadProject() {
  const uid = await currentUserId();
  if (!uid) return null;
  const { data, error } = await supabase.from('rp_projects')
    .select('*').eq('user_id', uid).order('updated_at', { ascending: false }).limit(1);
  if (error) throw new Error(`Could not load the project: ${error.message}`);
  return openStateRow(RP_PROJECT_KIND, data?.[0] || null);
}

/** Projects colleagues shared with the organisation, newest first. */
async function listSharedProjects() {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await supabase.from('rp_projects')
    .select('*').neq('user_id', uid).order('updated_at', { ascending: false });
  if (error) throw new Error(`Could not load shared projects: ${error.message}`);
  return (data || []).map((row) => openStateRow(RP_PROJECT_KIND, row));
}

/**
 * Save the user's own project, or with `id` the shared project that is open
 * (allowed only while this user holds its check-out; the database decides).
 */
async function saveProject(patch, { id = null, note = 'Project saved' } = {}) {
  const existing = id ? { id } : await loadProject();
  if (existing) {
    const { data, error } = await writeStamped(RP_PROJECT_KIND,
      { ...patch, updated_at: new Date().toISOString() },
      (row) => supabaseSharingStore().update('rp_projects', existing.id, row, { note }));
    if (error) throw new Error(error.name === 'RecordConflict' ? error.message : `Could not save the project: ${error.message}`);
    return data;
  }
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save projects.');
  const { data, error } = await writeStamped(RP_PROJECT_KIND,
    { user_id: user.id, name: 'Default project', ...patch },
    (row) => supabase.from('rp_projects').insert(row).select().single());
  if (error) throw new Error(`Could not save the project: ${error.message}`);
  return data;
}

export function makeRegistryBackend() {
  return {
    listWells,
    listLogs,
    downloadCurve,
    listTops,
    listZones,
    getDepthUnit,
    publishCurves,
    loadProject,
    listSharedProjects,
    saveProject,
    sharing: supabaseSharingStore(),
    listScalProjects: () => scalProjects.list(),
    loadScalProject: (id) => scalProjects.load(id),
  };
}
