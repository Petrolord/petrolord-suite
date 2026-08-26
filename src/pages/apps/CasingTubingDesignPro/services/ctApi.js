// Casing & Tubing Design Studio data service (D6/U1): direct-RLS CRUD over
// wp_ct_cases / wp_ct_runs (20260827080000). Shared wellbore spine access
// re-exported from the D1 tdApi (single implementation).

import { supabase } from '@/lib/customSupabaseClient';

export { getDefinitiveTrajectory } from '../../TorqueDragStudio/services/tdApi';

const one = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const many = ({ data, error }) => {
  if (error) throw error;
  return data || [];
};

export async function listCtCases(wellboreId) {
  return many(await supabase.from('wp_ct_cases').select('*')
    .eq('wellbore_id', wellboreId).order('created_at', { ascending: true }));
}

export async function saveCtCase(caseRow, userId) {
  return one(await supabase.from('wp_ct_cases')
    .insert({ ...caseRow, user_id: userId }).select().single());
}

export async function updateCtCase(id, patch) {
  return one(await supabase.from('wp_ct_cases')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single());
}

export async function deleteCtCase(id) {
  const { error } = await supabase.from('wp_ct_cases').delete().eq('id', id);
  if (error) throw error;
}

export async function listCtRuns(caseId) {
  return many(await supabase.from('wp_ct_runs').select('*')
    .eq('case_id', caseId).order('created_at', { ascending: false }));
}

export async function saveCtRun(run, userId) {
  return one(await supabase.from('wp_ct_runs')
    .insert({ ...run, user_id: userId }).select().single());
}

export async function deleteCtRun(id) {
  const { error } = await supabase.from('wp_ct_runs').delete().eq('id', id);
  if (error) throw error;
}
