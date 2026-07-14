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
import {
  listWells, listLogs, downloadCurve, listTops, listZones,
} from '@/lib/wellsRegistry';

// ---- rp_projects (app-private workspace state) ------------------------------
// v1: one implicit project per user, created on first save (the
// petro_projects convention).

async function loadProject() {
  const { data, error } = await supabase.from('rp_projects')
    .select('*').order('updated_at', { ascending: false }).limit(1);
  if (error) throw new Error(`Could not load the project: ${error.message}`);
  return data?.[0] || null;
}

async function saveProject(patch) {
  const existing = await loadProject();
  if (existing) {
    const { data, error } = await supabase.from('rp_projects')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', existing.id).select().single();
    if (error) throw new Error(`Could not save the project: ${error.message}`);
    return data;
  }
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save projects.');
  const { data, error } = await supabase.from('rp_projects')
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
    listTops,
    listZones,
    loadProject,
    saveProject,
  };
}
