// Well Control Studio data service (D3/W1): direct-RLS CRUD over
// wp_wc_cases / wp_wc_runs (20260826210000). Shared wellbore spine access
// re-exported from the D1 tdApi (single implementation).

import { supabase } from '@/lib/customSupabaseClient';

export {
  getDefinitiveTrajectory, getGeometry, saveGeometry,
} from '../../TorqueDragStudio/services/tdApi';
export { listCases as listTdCases } from '../../TorqueDragStudio/services/tdApi';

const one = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const many = ({ data, error }) => {
  if (error) throw error;
  return data || [];
};

export async function listWcCases(wellboreId) {
  return many(await supabase.from('wp_wc_cases').select('*')
    .eq('wellbore_id', wellboreId).order('created_at', { ascending: true }));
}

export async function saveWcCase(caseRow, userId) {
  return one(await supabase.from('wp_wc_cases')
    .insert({ ...caseRow, user_id: userId }).select().single());
}

export async function updateWcCase(id, patch) {
  return one(await supabase.from('wp_wc_cases')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single());
}

export async function deleteWcCase(id) {
  const { error } = await supabase.from('wp_wc_cases').delete().eq('id', id);
  if (error) throw error;
}

export async function listWcRuns(caseId) {
  return many(await supabase.from('wp_wc_runs').select('*')
    .eq('case_id', caseId).order('created_at', { ascending: false }));
}

export async function saveWcRun(run, userId) {
  return one(await supabase.from('wp_wc_runs')
    .insert({ ...run, user_id: userId }).select().single());
}

export async function deleteWcRun(id) {
  const { error } = await supabase.from('wp_wc_runs').delete().eq('id', id);
  if (error) throw error;
}
