// The app's real backend adapter (the Rock Physics Studio pair
// pattern): everything PPWorkstation touches goes through this one
// object so /dev/pore-pressure-studio can swap in inMemoryBackend and
// the WHOLE app runs without auth or DB.
//
// Reads go straight to the shared registry (src/lib/wellsRegistry.js:
// geo_wells, geo_wells_logs + f32 curve objects — RLS enforces
// ownership/org sharing server-side). The only write surface in P3 is
// pp_projects (owner-only, migration 20260714170000); publishing
// PP/FG/OBG curves to geo_wells_logs lands at P4 (plan Q4).

import { supabase } from '@/lib/customSupabaseClient';
import { listWells, listLogs, downloadCurve } from '@/lib/wellsRegistry';

// ---- pp_projects (app-private workspace state) -------------------------------
// v1: one implicit project per user, created on first save (the
// petro_projects convention).

async function loadProject() {
  const { data, error } = await supabase.from('pp_projects')
    .select('*').order('updated_at', { ascending: false }).limit(1);
  if (error) throw new Error(`Could not load the project: ${error.message}`);
  return data?.[0] || null;
}

async function saveProject(patch) {
  const existing = await loadProject();
  if (existing) {
    const { data, error } = await supabase.from('pp_projects')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', existing.id).select().single();
    if (error) throw new Error(`Could not save the project: ${error.message}`);
    return data;
  }
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save projects.');
  const { data, error } = await supabase.from('pp_projects')
    .insert({ user_id: user.id, name: 'Default project', ...patch })
    .select().single();
  if (error) throw new Error(`Could not save the project: ${error.message}`);
  return data;
}

export function makeRegistryBackend() {
  return {
    listWells,
    listLogs,
    downloadCurve,
    loadProject,
    saveProject,
  };
}
