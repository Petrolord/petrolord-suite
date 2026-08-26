// Cementing Studio data service (D4/C1): direct-RLS CRUD over
// wp_cmt_cases / wp_cmt_runs (20260827010000). Shared wellbore spine access
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

export async function listCmtCases(wellboreId) {
  return many(await supabase.from('wp_cmt_cases').select('*')
    .eq('wellbore_id', wellboreId).order('created_at', { ascending: true }));
}

export async function saveCmtCase(caseRow, userId) {
  return one(await supabase.from('wp_cmt_cases')
    .insert({ ...caseRow, user_id: userId }).select().single());
}

export async function updateCmtCase(id, patch) {
  return one(await supabase.from('wp_cmt_cases')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single());
}

export async function deleteCmtCase(id) {
  const { error } = await supabase.from('wp_cmt_cases').delete().eq('id', id);
  if (error) throw error;
}

export async function listCmtRuns(caseId) {
  return many(await supabase.from('wp_cmt_runs').select('*')
    .eq('case_id', caseId).order('created_at', { ascending: false }));
}

export async function saveCmtRun(run, userId) {
  return one(await supabase.from('wp_cmt_runs')
    .insert({ ...run, user_id: userId }).select().single());
}

export async function deleteCmtRun(id) {
  const { error } = await supabase.from('wp_cmt_runs').delete().eq('id', id);
  if (error) throw error;
}
