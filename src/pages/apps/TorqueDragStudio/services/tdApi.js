// Torque & Drag Studio data service (D1/TD1): direct-RLS CRUD over
// wp_wellbore_geometry / wp_td_cases / wp_td_runs (20260826120000), plus the
// definitive-trajectory lookup the wp family lacked. Modeled on
// well-planning/services/wpApi.js: plain async, throw on error, return rows.
// Units: SI metres in storage; UI converts at the boundary.

import { supabase } from '@/lib/customSupabaseClient';

const one = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const many = ({ data, error }) => {
  if (error) throw error;
  return data || [];
};

// ---- geometry (one row per wellbore, the module-wide spine) ---------------

export async function getGeometry(wellboreId) {
  return one(await supabase.from('wp_wellbore_geometry').select('*')
    .eq('wellbore_id', wellboreId).maybeSingle());
}

export async function saveGeometry(wellboreId, holeSections, userId) {
  return one(await supabase.from('wp_wellbore_geometry')
    .upsert(
      { wellbore_id: wellboreId, hole_sections: holeSections, user_id: userId, updated_at: new Date().toISOString() },
      { onConflict: 'wellbore_id' },
    )
    .select().single());
}

// ---- cases ----------------------------------------------------------------

export async function listCases(wellboreId) {
  return many(await supabase.from('wp_td_cases').select('*')
    .eq('wellbore_id', wellboreId).order('created_at', { ascending: true }));
}

export async function saveCase(caseRow, userId) {
  return one(await supabase.from('wp_td_cases')
    .insert({ ...caseRow, user_id: userId }).select().single());
}

export async function updateCase(id, patch) {
  return one(await supabase.from('wp_td_cases')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single());
}

export async function deleteCase(id) {
  const { error } = await supabase.from('wp_td_cases').delete().eq('id', id);
  if (error) throw error;
}

// ---- runs (immutable history) ---------------------------------------------

export async function listRuns(caseId) {
  return many(await supabase.from('wp_td_runs').select('*')
    .eq('case_id', caseId).order('created_at', { ascending: false }));
}

export async function saveRun(run, userId) {
  return one(await supabase.from('wp_td_runs')
    .insert({ ...run, user_id: userId }).select().single());
}

export async function deleteRun(id) {
  const { error } = await supabase.from('wp_td_runs').delete().eq('id', id);
  if (error) throw error;
}

// ---- trajectory -----------------------------------------------------------

// The definitive design's saved station cache (metres/grid) + wellbore row.
// Returns { wellbore, design, stations } — stations may be [] when the design
// was never saved with stations (the UI surfaces that as an actionable error).
export async function getDefinitiveTrajectory(wellboreId) {
  const wellbore = one(await supabase.from('wp_wellbores').select('*')
    .eq('id', wellboreId).single());
  const designs = many(await supabase.from('wp_designs').select('*')
    .eq('wellbore_id', wellboreId).eq('status', 'definitive'));
  const design = designs[0] || null;
  return {
    wellbore,
    design,
    stations: Array.isArray(design?.stations) ? design.stations : [],
  };
}
