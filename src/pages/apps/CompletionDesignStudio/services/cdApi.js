// Completion Design Studio data service (D7/CD1): direct-RLS CRUD over
// wp_cd_cases / wp_cd_runs (20260828100000). Shared wellbore spine access
// re-exported from the D1 tdApi; the D6 casing program is read through the
// CTDP ctApi (single implementation each).

import { supabase } from '@/lib/customSupabaseClient';

export { getDefinitiveTrajectory } from '../../TorqueDragStudio/services/tdApi';
export { listCtCases } from '../../CasingTubingDesignPro/services/ctApi';

const one = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const many = ({ data, error }) => {
  if (error) throw error;
  return data || [];
};

export async function listCdCases(wellboreId) {
  return many(await supabase.from('wp_cd_cases').select('*')
    .eq('wellbore_id', wellboreId).order('created_at', { ascending: true }));
}

export async function saveCdCase(caseRow, userId) {
  return one(await supabase.from('wp_cd_cases')
    .insert({ ...caseRow, user_id: userId }).select().single());
}

export async function updateCdCase(id, patch) {
  return one(await supabase.from('wp_cd_cases')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single());
}

export async function deleteCdCase(id) {
  const { error } = await supabase.from('wp_cd_cases').delete().eq('id', id);
  if (error) throw error;
}

export async function listCdRuns(caseId) {
  return many(await supabase.from('wp_cd_runs').select('*')
    .eq('case_id', caseId).order('created_at', { ascending: false }));
}

export async function saveCdRun(run, userId) {
  return one(await supabase.from('wp_cd_runs')
    .insert({ ...run, user_id: userId }).select().single());
}

export async function deleteCdRun(id) {
  const { error } = await supabase.from('wp_cd_runs').delete().eq('id', id);
  if (error) throw error;
}
