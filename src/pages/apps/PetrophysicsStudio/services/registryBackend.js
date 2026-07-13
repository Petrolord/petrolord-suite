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

// ---- petro_projects (app-private workspace state) --------------------------
// v1: one implicit project per user, created on first save.

async function loadProject() {
  const { data, error } = await supabase.from('petro_projects')
    .select('*').order('updated_at', { ascending: false }).limit(1);
  if (error) throw new Error(`Could not load the project: ${error.message}`);
  return data?.[0] || null;
}

async function saveProject(patch) {
  const existing = await loadProject();
  if (existing) {
    const { data, error } = await supabase.from('petro_projects')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', existing.id).select().single();
    if (error) throw new Error(`Could not save the project: ${error.message}`);
    return data;
  }
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save projects.');
  const { data, error } = await supabase.from('petro_projects')
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
    saveZone,
    updateZone,
    deleteZone,
    publishCurves,
    publishZone,
    saveDigitizedCurve,
    loadProject,
    saveProject,
  };
}
