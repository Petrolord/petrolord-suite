// Torque & Drag Studio data service (D1/TD1): direct-RLS CRUD over
// wp_wellbore_geometry / wp_td_cases / wp_td_runs (20260826120000), plus the
// definitive-trajectory lookup the wp family lacked. Modeled on
// well-planning/services/wpApi.js: plain async, throw on error, return rows.
// Units: SI metres in storage; UI converts at the boundary.

import { supabase } from '@/lib/customSupabaseClient';
import { registerStateKind, openStateRow } from '@/lib/stateVersion';
import { resolveTrajectory } from '../../well-planning/services/trajectorySource';

// PP0: same kind as wpApi (idempotent registration) so reads here open identically
const WP_DESIGN_KIND = 'wp-design';
registerStateKind(WP_DESIGN_KIND, { current: 1, label: 'well design' });

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

// The wellbore's working trajectory (metres, grid azimuths) + wellbore row.
// Tester fix 2026-09-07: this used to read ONLY the definitive design, so a
// design saved but never promoted with Set definitive left every Drilling
// studio showing the well's name and nothing else. The resolver keeps the
// definitive design first and falls back to the actual survey composite,
// the latest saved draft, then the bridged registry survey, and says which
// in `source`, `label` and `note`. Returns { wellbore, design, stations,
// source, label, note }; stations is [] only when nothing usable exists.
export async function getDefinitiveTrajectory(wellboreId) {
  const wellbore = one(await supabase.from('wp_wellbores').select('*')
    .eq('id', wellboreId).single());
  const [designs, surveys] = await Promise.all([
    supabase.from('wp_designs').select('*').eq('wellbore_id', wellboreId)
      .then((r) => many(r).map((row) => openStateRow(WP_DESIGN_KIND, row))),
    supabase.from('wp_surveys').select('id, name, is_in_definitive, stations, computed').eq('wellbore_id', wellboreId)
      .then((r) => many(r)),
  ]);
  let geoWell = null;
  if (wellbore.geo_well_id && !designs.some((d) => Array.isArray(d.stations) && d.stations.length >= 2) && !surveys.some((s) => s.is_in_definitive)) {
    const { data } = await supabase.from('geo_wells').select('id, name, deviation').eq('id', wellbore.geo_well_id).maybeSingle();
    geoWell = data || null;
  }
  const resolved = resolveTrajectory({ wellbore, designs, surveys, geoWell });
  return { wellbore, ...resolved };
}
