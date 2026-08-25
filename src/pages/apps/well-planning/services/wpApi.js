// Well Design Studio data service (WD1): direct-RLS CRUD over the
// wp_* family (20260825220000). Modeled on src/lib/wellsRegistry.js:
// plain async functions, throw on error, return rows. Sharing is
// site-level and read-only for org members; every write is owner-only
// and RLS enforces it server-side — the client just surfaces errors.
//
// Units: wp_* stores metres (registry convention). Depth-unit
// conversion for ft wellbores happens in the UI at the boundary.

import { supabase } from '@/lib/customSupabaseClient';

const one = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const many = ({ data, error }) => {
  if (error) throw error;
  return data || [];
};

// ---- sites ----------------------------------------------------------------

export async function listSites() {
  return many(await supabase.from('wp_sites').select('*').order('created_at', { ascending: false }));
}

export async function saveSite(site, userId) {
  return one(await supabase.from('wp_sites').insert({ ...site, user_id: userId }).select().single());
}

export async function updateSite(id, patch) {
  return one(await supabase.from('wp_sites')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single());
}

export async function deleteSite(id) {
  const { error } = await supabase.from('wp_sites').delete().eq('id', id);
  if (error) throw error;
}

export async function shareSite(id, organizationId) {
  return updateSite(id, { organization_id: organizationId });
}

export async function unshareSite(id) {
  return updateSite(id, { organization_id: null });
}

// ---- wellbores ------------------------------------------------------------

export async function listWellbores(siteId) {
  return many(await supabase.from('wp_wellbores').select('*')
    .eq('site_id', siteId).order('created_at', { ascending: true }));
}

export async function saveWellbore(wellbore, userId) {
  return one(await supabase.from('wp_wellbores').insert({ ...wellbore, user_id: userId }).select().single());
}

export async function updateWellbore(id, patch) {
  return one(await supabase.from('wp_wellbores')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single());
}

export async function deleteWellbore(id) {
  const { error } = await supabase.from('wp_wellbores').delete().eq('id', id);
  if (error) throw error;
}

// ---- designs --------------------------------------------------------------

export async function listDesigns(wellboreId) {
  return many(await supabase.from('wp_designs').select('*')
    .eq('wellbore_id', wellboreId).order('revision', { ascending: true }));
}

export async function saveDesign(design, userId) {
  return one(await supabase.from('wp_designs').insert({ ...design, user_id: userId }).select().single());
}

export async function updateDesign(id, patch) {
  return one(await supabase.from('wp_designs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single());
}

export async function deleteDesign(id) {
  const { error } = await supabase.from('wp_designs').delete().eq('id', id);
  if (error) throw error;
}

/** Save-as-revision: clone a design's current payload as a new draft row
 *  with revision = max(revision)+1 for the wellbore. */
export async function saveDesignRevision(design, userId) {
  const existing = await listDesigns(design.wellbore_id);
  const nextRev = existing.reduce((m, d) => Math.max(m, d.revision), 0) + 1;
  const {
    id, created_at, updated_at, revision, status, published_geo_well_id,
    published_at, user_id, ...payload
  } = design;
  return saveDesign({
    ...payload, revision: nextRev, status: 'draft',
  }, userId);
}

/** Set a design definitive. The partial unique index enforces one
 *  definitive per wellbore; any current definitive is archived first. */
export async function setDefinitiveDesign(designId, wellboreId) {
  const { error: demoteError } = await supabase.from('wp_designs')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('wellbore_id', wellboreId).eq('status', 'definitive');
  if (demoteError) throw demoteError;
  return one(await supabase.from('wp_designs')
    .update({ status: 'definitive', updated_at: new Date().toISOString() })
    .eq('id', designId).select().single());
}

// ---- targets --------------------------------------------------------------

export async function listTargets(siteId) {
  return many(await supabase.from('wp_targets').select('*')
    .eq('site_id', siteId).order('created_at', { ascending: true }));
}

export async function saveTarget(target, userId) {
  return one(await supabase.from('wp_targets').insert({ ...target, user_id: userId }).select().single());
}

export async function updateTarget(id, patch) {
  return one(await supabase.from('wp_targets')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single());
}

export async function deleteTarget(id) {
  const { error } = await supabase.from('wp_targets').delete().eq('id', id);
  if (error) throw error;
}

// ---- surveys (WD3 consumers; CRUD ready from WD1) -------------------------

export async function listSurveys(wellboreId) {
  return many(await supabase.from('wp_surveys').select('*')
    .eq('wellbore_id', wellboreId).order('created_at', { ascending: true }));
}

export async function saveSurvey(survey, userId) {
  return one(await supabase.from('wp_surveys').insert({ ...survey, user_id: userId }).select().single());
}

export async function updateSurvey(id, patch) {
  return one(await supabase.from('wp_surveys')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single());
}

export async function deleteSurvey(id) {
  const { error } = await supabase.from('wp_surveys').delete().eq('id', id);
  if (error) throw error;
}

// ---- survey programs (one per design; WD4) --------------------------------

export async function getSurveyProgram(designId) {
  const { data, error } = await supabase.from('wp_survey_programs')
    .select('*').eq('design_id', designId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertSurveyProgram(designId, intervals, userId) {
  return one(await supabase.from('wp_survey_programs')
    .upsert({
      design_id: designId, intervals, user_id: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'design_id' })
    .select().single());
}

// ---- anti-collision runs (immutable history; WD4) -------------------------

export async function listAcRuns(designId) {
  return many(await supabase.from('wp_ac_runs').select('*')
    .eq('design_id', designId).order('created_at', { ascending: false }));
}

export async function saveAcRun(run, userId) {
  return one(await supabase.from('wp_ac_runs').insert({ ...run, user_id: userId }).select().single());
}

export async function deleteAcRun(id) {
  const { error } = await supabase.from('wp_ac_runs').delete().eq('id', id);
  if (error) throw error;
}
