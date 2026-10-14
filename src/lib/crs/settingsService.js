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
import { inNonDefaultProject, currentProjectSettings, getProjectScope } from '@/lib/projects/projectScope';
import { normalizeProjectSettings } from '@/lib/projects/projectSettings';
import { saveProjectSettings } from '@/lib/projects/projectsService';

// Suite Projects P2 (docs/scope/SuiteProject-DESIGN.md section 14): in a
// project other than the Default one, the Project CRS is the PROJECT's
// (suite_projects.settings.crs), so two clients' projects can live in two
// systems. The lock counts that project's data only. The Default project
// keeps each user's own Project CRS in geoscience_settings, exactly as before.
// Custom CRS definitions stay the user's library (an organisation-wide
// reference, design decision 4).
const projectCrsSlot = () => (inNonDefaultProject() ? getProjectScope() : null);

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
  if (projectCrsSlot()) {
    const crs = normalizeProjectSettings(currentProjectSettings()).crs;
    return {
      tag: crs ? crs.tag : UNKNOWN,
      name: crs?.name || null,
      xyUnit: crs?.xyUnit || 'm',
      customDefs: s.custom_defs || {},
      setAt: crs?.setAt || null,
      scope: 'project',
    };
  }
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
  const slot = projectCrsSlot();
  // a project's lock counts its own registry rows (em_models join projects in P4)
  const tables = slot ? ['geo_wells', 'geo_surfaces', 'seismic_volumes'] : ['geo_wells', 'geo_surfaces', 'seismic_volumes', 'em_models'];
  const counts = { em_models: 0 };
  await Promise.all(tables.map(async (table) => {
    let q = supabase.from(table)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('crs', 'is', null);
    if (slot) q = q.eq('suite_project_id', slot.projectId);
    const { count, error } = await q;
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
  const slot = projectCrsSlot();
  if (slot) {
    // the project's own CRS; writing it never touches stored data
    const stored = await saveProjectSettings(slot.projectId, {
      crs: { tag: normalized, name, xyUnit, setAt: new Date().toISOString() },
    });
    return { project_crs: normalizeProjectSettings(stored).crs?.tag || normalized, project_crs_name: name, project_xy_unit: xyUnit, scope: 'project' };
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

// ---- depth display unit (Mapping MS5, 2026-09-06) ----------------------
// Column geoscience_settings.depth_unit (migration 20260906120000). Until
// it is applied the getter returns null and the setter reports the
// absence in plain words; Mapping keeps its localStorage fallback.

export const DEPTH_UNITS = Object.freeze(['m', 'ft']);

/** The caller's saved depth unit, or null when unset or not yet supported. */
export async function getDepthUnit() {
  const row = await getSettings();
  const u = row?.depth_unit;
  return DEPTH_UNITS.includes(u) ? u : null;
}

/** Save the depth unit for the caller. */
export async function setDepthUnit(unit) {
  if (!DEPTH_UNITS.includes(unit)) throw new Error(`Depth unit must be m or ft, got "${unit}".`);
  const user = await requireUser();
  await getSettings(); // make sure the row exists
  const { error } = await supabase.from('geoscience_settings')
    .update({ depth_unit: unit, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);
  if (error) {
    if (/depth_unit/.test(error.message)) throw new Error('The depth unit setting is not available on this database yet; the choice stays in this browser.');
    throw new Error(`Could not save the depth unit: ${error.message}`);
  }
  return unit;
}
