// Stimulation Designer data service (D9/ST1): direct-RLS CRUD over
// wp_st_cases / wp_st_runs (20260828180000). Shared wellbore spine access
// re-exported from the D1 tdApi (single implementation); linked-case
// listing from the D8 service.

import { supabase } from '@/lib/customSupabaseClient';

export { getDefinitiveTrajectory } from '../../TorqueDragStudio/services/tdApi';
export { listPsCases } from '../../PerforationSandControl/services/psApi';

const one = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const many = ({ data, error }) => {
  if (error) throw error;
  return data || [];
};

export async function listStCases(wellboreId) {
  return many(await supabase.from('wp_st_cases').select('*')
    .eq('wellbore_id', wellboreId).order('created_at', { ascending: true }));
}

export async function saveStCase(caseRow, userId) {
  return one(await supabase.from('wp_st_cases')
    .insert({ ...caseRow, user_id: userId }).select().single());
}

export async function updateStCase(id, patch) {
  return one(await supabase.from('wp_st_cases')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single());
}

export async function deleteStCase(id) {
  const { error } = await supabase.from('wp_st_cases').delete().eq('id', id);
  if (error) throw error;
}

export async function listStRuns(caseId) {
  return many(await supabase.from('wp_st_runs').select('*')
    .eq('case_id', caseId).order('created_at', { ascending: false }));
}

export async function saveStRun(run, userId) {
  return one(await supabase.from('wp_st_runs')
    .insert({ ...run, user_id: userId }).select().single());
}

export async function deleteStRun(id) {
  const { error } = await supabase.from('wp_st_runs').delete().eq('id', id);
  if (error) throw error;
}
