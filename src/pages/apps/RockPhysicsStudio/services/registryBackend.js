// The app's real backend adapter (the Petrophysics Studio pair
// pattern): everything RockWorkstation touches goes through this one
// object so /dev/rock-physics-studio can swap in inMemoryBackend and
// the WHOLE app runs without auth or DB.
//
// Reads go straight to the shared registry (src/lib/wellsRegistry.js:
// geo_wells, geo_wells_logs + f32 curve objects, geo_wells_tops,
// geo_wells_zones — RLS enforces ownership/org sharing server-side).
// The ONLY write surface is rp_projects (plan decision 4: app-private,
// owner-only, no publish-back in v1).

import { supabase } from '@/lib/customSupabaseClient';
import { registerStateKind, openStateRow, writeStamped } from '@/lib/stateVersion';
import {
  listWells, listLogs, downloadCurve, listTops, listZones,
} from '@/lib/wellsRegistry';

// ---- rp_projects (app-private workspace state) ------------------------------
// v1: one implicit project per user, created on first save (the
// petro_projects convention).

// PP0 state kind (docs/scope/ProjectPortability-PLAN.md §4.3): version 1 is
// the current row shape; a future shape change bumps `current` and adds
// migrations[n]. Rows open through openStateRow, writes go through writeStamped.
const RP_PROJECT_KIND = 'rp-project';
registerStateKind(RP_PROJECT_KIND, { current: 1, label: 'rock physics project' });

async function loadProject() {
  const { data, error } = await supabase.from('rp_projects')
    .select('*').order('updated_at', { ascending: false }).limit(1);
  if (error) throw new Error(`Could not load the project: ${error.message}`);
  return openStateRow(RP_PROJECT_KIND, data?.[0] || null);
}

async function saveProject(patch) {
  const existing = await loadProject();
  if (existing) {
    const { data, error } = await writeStamped(RP_PROJECT_KIND,
      { ...patch, updated_at: new Date().toISOString() },
      (row) => supabase.from('rp_projects').update(row).eq('id', existing.id).select().single());
    if (error) throw new Error(`Could not save the project: ${error.message}`);
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
    loadProject,
    saveProject,
  };
}
