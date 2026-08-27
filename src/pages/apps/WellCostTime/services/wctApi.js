// Well Cost & Time data service (D11/WC2): direct-RLS CRUD over
// wp_wct_cases / wp_wct_runs (20260829010000). Shared wellbore spine
// access re-exported from the D1 tdApi (single implementation);
// linked-case listing from the D6 service; hole sections from the
// module-wide geometry spine.

import { supabase } from '@/lib/customSupabaseClient';

export { getDefinitiveTrajectory, getGeometry } from '../../TorqueDragStudio/services/tdApi';
export { listCtCases } from '../../CasingTubingDesignPro/services/ctApi';

const one = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const many = ({ data, error }) => {
  if (error) throw error;
  return data || [];
};

export async function listWctCases(wellboreId) {
  return many(await supabase.from('wp_wct_cases').select('*')
    .eq('wellbore_id', wellboreId).order('created_at', { ascending: true }));
}

export async function saveWctCase(caseRow, userId) {
  return one(await supabase.from('wp_wct_cases')
    .insert({ ...caseRow, user_id: userId }).select().single());
}

export async function updateWctCase(id, patch) {
  return one(await supabase.from('wp_wct_cases')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single());
}

export async function deleteWctCase(id) {
  const { error } = await supabase.from('wp_wct_cases').delete().eq('id', id);
  if (error) throw error;
}

export async function listWctRuns(caseId) {
  return many(await supabase.from('wp_wct_runs').select('*')
    .eq('case_id', caseId).order('created_at', { ascending: false }));
}

export async function saveWctRun(run, userId) {
  return one(await supabase.from('wp_wct_runs')
    .insert({ ...run, user_id: userId }).select().single());
}

export async function deleteWctRun(id) {
  const { error } = await supabase.from('wp_wct_runs').delete().eq('id', id);
  if (error) throw error;
}
