// Drilling Fluids & Hydraulics Studio data service (D2/H1): direct-RLS CRUD
// over wp_hyd_cases / wp_hyd_runs (20260826170000). The shared wellbore
// lookups (definitive trajectory, hole/casing geometry) live in the D1
// tdApi — re-exported here so there is exactly ONE implementation of the
// wp data-spine access across the drilling apps.

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

export async function listHydCases(wellboreId) {
  return many(await supabase.from('wp_hyd_cases').select('*')
    .eq('wellbore_id', wellboreId).order('created_at', { ascending: true }));
}

export async function saveHydCase(caseRow, userId) {
  return one(await supabase.from('wp_hyd_cases')
    .insert({ ...caseRow, user_id: userId }).select().single());
}

export async function updateHydCase(id, patch) {
  return one(await supabase.from('wp_hyd_cases')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single());
}

export async function deleteHydCase(id) {
  const { error } = await supabase.from('wp_hyd_cases').delete().eq('id', id);
  if (error) throw error;
}

export async function listHydRuns(caseId) {
  return many(await supabase.from('wp_hyd_runs').select('*')
    .eq('case_id', caseId).order('created_at', { ascending: false }));
}

export async function saveHydRun(run, userId) {
  return one(await supabase.from('wp_hyd_runs')
    .insert({ ...run, user_id: userId }).select().single());
}

export async function deleteHydRun(id) {
  const { error } = await supabase.from('wp_hyd_runs').delete().eq('id', id);
  if (error) throw error;
}
