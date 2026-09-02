// The app's real backend adapter: everything PetroWorkstation touches
// goes through this one object, so the /dev harness can swap in
// inMemoryBackend and the WHOLE app runs without auth or DB (the
// harness philosophy, same as Well Data Manager's pair).
//
// Reads/writes go straight to the shared G1/G2 registry
// (src/lib/wellsRegistry.js): geo_wells, geo_wells_logs (+ f32 curve
// objects), geo_wells_tops, geo_wells_zones — RLS enforces ownership
// and org read-only sharing server-side.

import { supabase } from '@/lib/customSupabaseClient';
import {
  listWells, listLogs, downloadCurve, listTops,
  listZones, saveZone, updateZone, deleteZone,
  saveLogs, deleteLog,
} from '@/lib/wellsRegistry';

/** The overwrite-own-output rule (plan decision 1): a publish replaces
 *  ONLY curves this app previously published for the same well +
 *  mnemonic + project — imported LAS curves and other projects'
 *  results are untouchable. */
async function publishCurves(wellId, preparedLogs, projectId) {
  const existing = await listLogs(wellId);
  const mnemonics = new Set(preparedLogs.map((l) => l.mnemonic));
  const stale = existing.filter((l) => l.provenance?.computed
    && l.provenance?.engine === 'petrophysics-studio'
    && l.provenance?.project_id === projectId
    && mnemonics.has(l.mnemonic));
  for (const log of stale) await deleteLog(log);
  return saveLogs(wellId, preparedLogs);
}

async function publishZone(zone, properties) {
  return updateZone(zone.id, { properties });
}

/** Persist one digitized curve (engine/digitizer.js payload) as a
 *  registry log — utility-grade, flagged {digitized:true}. Uses the
 *  same owner-only saveLogs path as any other curve. */
async function saveDigitizedCurve(wellId, log) {
  const [saved] = await saveLogs(wellId, [log]);
  return saved;
}

// ---- petro_projects (named interpretations, PS3) ---------------------------
// Multi-row per user: each row is one named interpretation (params,
// per-zone overrides, facies, layouts). loadProject() still opens the
// most recent, so upgrade day changes nothing for existing users.

async function loadProject() {
  const { data, error } = await supabase.from('petro_projects')
    .select('*').order('updated_at', { ascending: false }).limit(1);
  if (error) throw new Error(`Could not load the project: ${error.message}`);
  return data?.[0] || null;
}

async function listProjects() {
  const { data, error } = await supabase.from('petro_projects')
    .select('id, name, description, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Could not list interpretations: ${error.message}`);
  return data || [];
}

async function openProject(id) {
  const { data, error } = await supabase.from('petro_projects')
    .select('*').eq('id', id).single();
  if (error) throw new Error(`Could not open the interpretation: ${error.message}`);
  return data;
}

async function currentUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('You must be signed in to save interpretations.');
  return user.id;
}

/** Update the OPEN interpretation (by id); first save creates it. */
async function saveProject(patch, projectId = null) {
  if (projectId) {
    const { data, error } = await supabase.from('petro_projects')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', projectId).select().single();
    if (error) throw new Error(`Could not save the interpretation: ${error.message}`);
    return data;
  }
  const userId = await currentUserId();
  const { data, error } = await supabase.from('petro_projects')
    .insert({ user_id: userId, name: 'Default interpretation', ...patch })
    .select().single();
  if (error) throw new Error(`Could not save the interpretation: ${error.message}`);
  return data;
}

/** Save-as: a NEW named interpretation from the current workspace state. */
async function saveProjectAs(name, state) {
  const userId = await currentUserId();
  const { data, error } = await supabase.from('petro_projects')
    .insert({ user_id: userId, name, ...state })
    .select().single();
  if (error) throw new Error(`Could not create the interpretation: ${error.message}`);
  return data;
}

async function renameProject(id, name) {
  const { data, error } = await supabase.from('petro_projects')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw new Error(`Could not rename the interpretation: ${error.message}`);
  return data;
}

async function deleteProject(id) {
  const { error } = await supabase.from('petro_projects').delete().eq('id', id);
  if (error) throw new Error(`Could not delete the interpretation: ${error.message}`);
}

export function makeRegistryBackend() {
  return {
    listWells,
    listLogs,
    downloadCurve,
    listTops,
    listZones,
    saveZone,
    updateZone,
    deleteZone,
    publishCurves,
    publishZone,
    saveDigitizedCurve,
    loadProject,
    listProjects,
    openProject,
    saveProject,
    saveProjectAs,
    renameProject,
    deleteProject,
  };
}
