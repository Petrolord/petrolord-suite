// Geomechanics Studio data service (D5/G1): direct-RLS CRUD over
// wp_gm_cases / wp_gm_runs (20260827050000). Shared wellbore spine access
// re-exported from the D1 tdApi (single implementation).

import { supabase } from '@/lib/customSupabaseClient';

export {
  getDefinitiveTrajectory, getGeometry, saveGeometry,
} from '../../TorqueDragStudio/services/tdApi';

const one = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const many = ({ data, error }) => {
  if (error) throw error;
  return data || [];
};

export async function listGmCases(wellboreId) {
  return many(await supabase.from('wp_gm_cases').select('*')
    .eq('wellbore_id', wellboreId).order('created_at', { ascending: true }));
}

export async function saveGmCase(caseRow, userId) {
  return one(await supabase.from('wp_gm_cases')
    .insert({ ...caseRow, user_id: userId }).select().single());
}

export async function updateGmCase(id, patch) {
  return one(await supabase.from('wp_gm_cases')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single());
}

export async function deleteGmCase(id) {
  const { error } = await supabase.from('wp_gm_cases').delete().eq('id', id);
  if (error) throw error;
}

export async function listGmRuns(caseId) {
  return many(await supabase.from('wp_gm_runs').select('*')
    .eq('case_id', caseId).order('created_at', { ascending: false }));
}

export async function saveGmRun(run, userId) {
  return one(await supabase.from('wp_gm_runs')
    .insert({ ...run, user_id: userId }).select().single());
}

export async function deleteGmRun(id) {
  const { error } = await supabase.from('wp_gm_runs').delete().eq('id', id);
  if (error) throw error;
}
