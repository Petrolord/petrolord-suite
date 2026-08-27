// Well Integrity & P&A data service (D10/WI1): direct-RLS CRUD over
// wp_wi_cases / wp_wi_runs (20260828220000). Shared wellbore spine access
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

export async function listWiCases(wellboreId) {
  return many(await supabase.from('wp_wi_cases').select('*')
    .eq('wellbore_id', wellboreId).order('created_at', { ascending: true }));
}

export async function saveWiCase(caseRow, userId) {
  return one(await supabase.from('wp_wi_cases')
    .insert({ ...caseRow, user_id: userId }).select().single());
}

export async function updateWiCase(id, patch) {
  return one(await supabase.from('wp_wi_cases')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single());
}

export async function deleteWiCase(id) {
  const { error } = await supabase.from('wp_wi_cases').delete().eq('id', id);
  if (error) throw error;
}

export async function listWiRuns(caseId) {
  return many(await supabase.from('wp_wi_runs').select('*')
    .eq('case_id', caseId).order('created_at', { ascending: false }));
}

export async function saveWiRun(run, userId) {
  return one(await supabase.from('wp_wi_runs')
    .insert({ ...run, user_id: userId }).select().single());
}

export async function deleteWiRun(id) {
  const { error } = await supabase.from('wp_wi_runs').delete().eq('id', id);
  if (error) throw error;
}
