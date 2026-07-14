// The real backend adapter (Earth Modeling G8.2/G8.3): everything
// EarthWorkstation touches goes through this one object, so the
// /dev/earth-modeling harness swaps in inMemoryBackend and the whole
// app runs without auth or DB (the house pattern).
//
// Reads: wells + tops + zones from the shared well registry, surfaces
// from geo_surfaces. Writes: geo_surfaces (the publish action — the
// ReservoirCalc Pro handoff) and em_models (app-private model
// definitions, owner-only RLS; named em_models because a legacy
// pre-G8 em_projects orphan exists in the live DB — see the
// 20260714130000 migration header).

import { supabase } from '@/lib/customSupabaseClient';
import { listWellsWithTops, listZones } from '@/lib/wellsRegistry';
import { listSurfaces, saveSurface, downloadSurfaceGrid } from '@/lib/surfacesRegistry';

async function listProjects() {
  const { data, error } = await supabase.from('em_models')
    .select('*').order('updated_at', { ascending: false });
  if (error) throw new Error(`Could not load models: ${error.message}`);
  return data || [];
}

async function saveProject({ name, definition }) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save models.');
  const { data, error } = await supabase.from('em_models')
    .insert({ user_id: user.id, name, definition })
    .select().single();
  if (error) throw new Error(`Could not save the model: ${error.message}`);
  return data;
}

async function updateProject(id, patch) {
  const { data, error } = await supabase.from('em_models')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw new Error(`Could not update the model: ${error.message}`);
  return data;
}

async function deleteProject(id) {
  const { error } = await supabase.from('em_models').delete().eq('id', id);
  if (error) throw new Error(`Could not delete the model: ${error.message}`);
}

export function makeRegistryBackend() {
  return {
    async listWells() {
      const wells = await listWellsWithTops();
      return Promise.all(wells.map(async (w) => ({
        ...w,
        zones: w.is_own || w.organization_id ? await listZones(w.id).catch(() => []) : [],
      })));
    },
    listSurfaces,
    downloadSurfaceGrid,
    saveSurface,
    listProjects,
    saveProject,
    updateProject,
    deleteProject,
  };
}
