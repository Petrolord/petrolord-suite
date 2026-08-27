// Perforation & Sand Control data service (D8/PS1): direct-RLS CRUD over
// wp_ps_cases / wp_ps_runs (20260828140000). Shared wellbore spine access
// re-exported from the D1 tdApi (single implementation); linked-case
// listings from the D6/D7 services.

import { supabase } from '@/lib/customSupabaseClient';

export { getDefinitiveTrajectory } from '../../TorqueDragStudio/services/tdApi';
export { listCtCases } from '../../CasingTubingDesignPro/services/ctApi';
export { listCdCases } from '../../CompletionDesignStudio/services/cdApi';

const one = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const many = ({ data, error }) => {
  if (error) throw error;
  return data || [];
};

export async function listPsCases(wellboreId) {
  return many(await supabase.from('wp_ps_cases').select('*')
    .eq('wellbore_id', wellboreId).order('created_at', { ascending: true }));
}

export async function savePsCase(caseRow, userId) {
  return one(await supabase.from('wp_ps_cases')
    .insert({ ...caseRow, user_id: userId }).select().single());
}

export async function updatePsCase(id, patch) {
  return one(await supabase.from('wp_ps_cases')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single());
}

export async function deletePsCase(id) {
  const { error } = await supabase.from('wp_ps_cases').delete().eq('id', id);
  if (error) throw error;
}

export async function listPsRuns(caseId) {
  return many(await supabase.from('wp_ps_runs').select('*')
    .eq('case_id', caseId).order('created_at', { ascending: false }));
}

export async function savePsRun(run, userId) {
  return one(await supabase.from('wp_ps_runs')
    .insert({ ...run, user_id: userId }).select().single());
}

export async function deletePsRun(id) {
  const { error } = await supabase.from('wp_ps_runs').delete().eq('id', id);
  if (error) throw error;
}
