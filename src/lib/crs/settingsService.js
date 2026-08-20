// Project CRS settings (Petrel model, per-user home — owner decision
// 2026-08-20): one geoscience_settings row per user holds the Project
// CRS every geoscience import converts into. Org members can read it;
// only the owner writes. Table + RLS:
// supabase/migrations/20260820120000_geoscience_crs.sql.
//
// The Petrel-style lock lives HERE, not in the database: the Project CRS
// changes freely until the first CRS-tagged row exists in any registry;
// after that setProjectCrs refuses with per-registry counts, and the
// Phase 7 bulk-reproject flow is the only way through.

import { supabase } from '@/lib/customSupabaseClient';
import { normalizeTag, UNKNOWN } from '@/lib/crs/tags';

async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('You must be signed in to use geoscience settings.');
  return user;
}

/** The caller's settings row, created empty on first touch. */
export async function getSettings() {
  const user = await requireUser();
  const { data, error } = await supabase.from('geoscience_settings')
    .select('*').eq('user_id', user.id).maybeSingle();
  if (error) throw new Error(`Could not load geoscience settings: ${error.message}`);
  if (data) return data;
  const { data: created, error: insertError } = await supabase.from('geoscience_settings')
    .insert({ user_id: user.id }).select().single();
  if (insertError) {
    // A concurrent first touch can win the unique(user_id) race; re-read.
    const { data: raced } = await supabase.from('geoscience_settings')
      .select('*').eq('user_id', user.id).maybeSingle();
    if (raced) return raced;
    throw new Error(`Could not create geoscience settings: ${insertError.message}`);
  }
  return created;
}

/** The caller's Project CRS tag, or UNKNOWN when not chosen yet. */
export async function getProjectCrs() {
  const s = await getSettings();
  return {
    tag: s.project_crs ? normalizeTag(s.project_crs) : UNKNOWN,
    name: s.project_crs_name || null,
    xyUnit: s.project_xy_unit || 'm',
    customDefs: s.custom_defs || {},
    setAt: s.crs_set_at || null,
  };
}

/**
 * Rows already tagged with a CRS, per registry — the Project CRS lock
 * evidence. Only the caller's own rows count: only those would need
 * reprojecting on a change.
 */
export async function countCrsTaggedData() {
  const user = await requireUser();
  const tables = ['geo_wells', 'geo_surfaces', 'seismic_volumes', 'em_models'];
  const counts = {};
  await Promise.all(tables.map(async (table) => {
    const { count, error } = await supabase.from(table)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('crs', 'is', null);
    counts[table] = error ? 0 : (count || 0);
  }));
  counts.total = tables.reduce((s, t) => s + counts[t], 0);
  return counts;
}

/**
 * Set the Project CRS. Refuses when CRS-tagged data exists (the lock);
 * pass allowWithData: true only from the Phase 7 reproject flow, which
 * converts the data as part of the same operation.
 *
 * @param {{tag: string, name?: ?string, xyUnit?: string,
 *   allowWithData?: boolean}} p
 */
export async function setProjectCrs({ tag, name = null, xyUnit = 'm', allowWithData = false }) {
  const user = await requireUser();
  const normalized = normalizeTag(tag);
  if (normalized === UNKNOWN) {
    throw new Error('The Project CRS must be a specific system. Pick a catalog entry, a custom definition, or LOCAL.');
  }
  if (!allowWithData) {
    const counts = await countCrsTaggedData();
    if (counts.total > 0) {
      const parts = ['geo_wells', 'geo_surfaces', 'seismic_volumes', 'em_models']
        .filter((t) => counts[t] > 0).map((t) => `${counts[t]} in ${t}`);
      const err = new Error(
        `The Project CRS is locked: ${counts.total} dataset(s) are already stored in it (${parts.join(', ')}). Use the reproject flow to change it.`,
      );
      err.code = 'PROJECT_CRS_LOCKED';
      err.counts = counts;
      throw err;
    }
  }
  await getSettings();
  const { data, error } = await supabase.from('geoscience_settings')
    .update({
      project_crs: normalized,
      project_crs_name: name,
      project_xy_unit: xyUnit,
      crs_set_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .select().single();
  if (error) throw new Error(`Could not set the Project CRS: ${error.message}`);
  return data;
}

/**
 * Store a custom CRS definition and return its 'CUSTOM:<uuid>' tag.
 * @param {{name: string, proj4: string, wkt?: ?string, unit?: string}} def
 */
export async function addCustomDef({ name, proj4: proj4Def, wkt = null, unit = 'm' }) {
  if (!name || !proj4Def) throw new Error('A custom CRS needs a name and a proj4 definition.');
  const user = await requireUser();
  const s = await getSettings();
  const id = crypto.randomUUID();
  const defs = { ...(s.custom_defs || {}), [id]: { name, proj4: proj4Def, wkt, unit } };
  const { error } = await supabase.from('geoscience_settings')
    .update({ custom_defs: defs, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);
  if (error) throw new Error(`Could not save the custom CRS: ${error.message}`);
  return `CUSTOM:${id}`;
}
