// Suite Projects P1: database calls for clients and projects (P0 tables:
// suite_clients, suite_projects, suite_project_members, suite_user_state,
// suite_project_access_log; RPCs suite_project_bootstrap,
// suite_project_admin_open, suite_move_to_project). RLS decides who sees
// what; nothing here filters by user.

import { supabase } from '@/lib/customSupabaseClient';
import { mergeProjectSettings, settingsProblems } from '@/lib/projects/projectSettings';
import { setCurrentProjectSettings } from '@/lib/projects/projectScope';

/** True when the error means "the P0 migrations are not applied here". */
export function isProjectsMissingError(error) {
  if (!error) return false;
  const msg = String(error.message || '');
  return error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01' || error.code === 'PGRST205'
    || /suite_project|suite_client|schema cache|does not exist/i.test(msg);
}

const fail = (what, error) => { throw new Error(`${what}: ${error.message || error}`); };

/**
 * The caller's default and current project. Returns null when the database
 * has no projects (P0 not applied), so the Suite runs exactly as before.
 * @returns {Promise<?{defaultProjectId: string, currentProjectId: string, organizationId: ?string}>}
 */
export async function bootstrapProjects() {
  const { data, error } = await supabase.rpc('suite_project_bootstrap');
  if (error) {
    if (isProjectsMissingError(error)) return null;
    fail('Could not load your projects', error);
  }
  if (!data?.default_project_id) return null;
  return {
    defaultProjectId: data.default_project_id,
    currentProjectId: data.current_project_id || data.default_project_id,
    organizationId: data.organization_id || null,
  };
}

export async function listProjects() {
  const { data, error } = await supabase.from('suite_projects')
    .select('id, organization_id, owner_user_id, client_id, name, description, visibility, is_default, status, settings, created_at, updated_at')
    .order('is_default', { ascending: false }).order('name', { ascending: true });
  if (error) fail('Could not load projects', error);
  return data || [];
}

export async function listClients() {
  const { data, error } = await supabase.from('suite_clients')
    .select('id, organization_id, owner_user_id, name, logo_url, colour, notes, status, created_at')
    .order('name', { ascending: true });
  if (error) fail('Could not load clients', error);
  return data || [];
}

export async function listMyMemberships(userId) {
  if (!userId) return [];
  const { data, error } = await supabase.from('suite_project_members').select('project_id, role').eq('user_id', userId);
  if (error) fail('Could not load your project roles', error);
  return data || [];
}

const cleanName = (name, what) => {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!n) throw new Error(`Give the ${what} a name.`);
  if (n.length > 120) throw new Error(`Keep the ${what} name to 120 characters.`);
  return n;
};

const COLOUR = /^#[0-9A-Fa-f]{6}$/;

/** @param {{name: string, colour?: string, logoUrl?: string, notes?: string, organizationId: ?string, userId: string}} c */
export async function createClient(c) {
  const row = {
    organization_id: c.organizationId || null,
    owner_user_id: c.userId,
    name: cleanName(c.name, 'client'),
    colour: c.colour && COLOUR.test(c.colour) ? c.colour.toUpperCase() : null,
    logo_url: c.logoUrl ? String(c.logoUrl).trim() || null : null,
    notes: c.notes ? String(c.notes).trim() || null : null,
  };
  const { data, error } = await supabase.from('suite_clients').insert(row).select().single();
  if (error) {
    if (error.code === '23505') throw new Error(`There is already a client called "${row.name}".`);
    fail('Could not create the client', error);
  }
  return data;
}

export async function updateClient(id, patch) {
  const row = {};
  if (patch.name !== undefined) row.name = cleanName(patch.name, 'client');
  if (patch.colour !== undefined) row.colour = patch.colour && COLOUR.test(patch.colour) ? patch.colour.toUpperCase() : null;
  if (patch.logoUrl !== undefined) row.logo_url = patch.logoUrl ? String(patch.logoUrl).trim() || null : null;
  if (patch.notes !== undefined) row.notes = patch.notes ? String(patch.notes).trim() || null : null;
  if (patch.status !== undefined) row.status = patch.status === 'archived' ? 'archived' : 'active';
  const { data, error } = await supabase.from('suite_clients').update(row).eq('id', id).select().single();
  if (error) fail('Could not update the client', error);
  return data;
}

/** @param {{name: string, description?: string, clientId?: ?string, organizationId: ?string, userId: string}} p */
export async function createProject(p) {
  const row = {
    organization_id: p.organizationId || null,
    owner_user_id: p.userId,
    client_id: p.clientId || null,
    name: cleanName(p.name, 'project'),
    description: p.description ? String(p.description).trim() || null : null,
    // Local Workspace: where this project's seismic lives (asked at creation)
    ...(p.seismicStorage ? { settings: mergeProjectSettings({}, { seismic: { storage: p.seismicStorage } }) } : {}),
  };
  const { data, error } = await supabase.from('suite_projects').insert(row).select().single();
  if (error) fail('Could not create the project', error);
  return data;
}

export async function updateProject(id, patch) {
  const row = {};
  if (patch.name !== undefined) row.name = cleanName(patch.name, 'project');
  if (patch.description !== undefined) row.description = patch.description ? String(patch.description).trim() || null : null;
  if (patch.clientId !== undefined) row.client_id = patch.clientId || null;
  if (patch.visibility !== undefined) row.visibility = patch.visibility === 'members' ? 'members' : 'organisation';
  if (patch.status !== undefined) row.status = patch.status === 'archived' ? 'archived' : 'active';
  const { data, error } = await supabase.from('suite_projects').update(row).eq('id', id).select();
  if (error) fail('Could not update the project', error);
  if (!data || !data.length) throw new Error('Only the project owner or an organisation admin can change this project.');
  return data[0];
}

/**
 * P2: save project settings (units, crs, datum, timescale). Reads the stored
 * settings first and merges, so keys this build does not know survive. Only
 * the suite_projects row is written; no registry row is touched.
 * @returns {Promise<Object>} the stored settings after the save
 */
export async function saveProjectSettings(projectId, patch) {
  const problems = settingsProblems(patch);
  if (problems.length) throw new Error(problems[0]);
  const { data: row, error: readError } = await supabase.from('suite_projects').select('id, settings').eq('id', projectId).single();
  if (readError) fail('Could not read the project settings', readError);
  const settings = mergeProjectSettings(row?.settings, patch);
  const { data, error } = await supabase.from('suite_projects').update({ settings }).eq('id', projectId).select('id, settings');
  if (error) fail('Could not save the project settings', error);
  if (!data || !data.length) throw new Error('Only the project owner or an organisation admin can change project settings.');
  setCurrentProjectSettings(projectId, data[0].settings);
  return data[0].settings;
}

/** Remember the user's current project (the header switcher). */
export async function saveCurrentProject(userId, projectId) {
  const { error } = await supabase.from('suite_user_state')
    .upsert({ user_id: userId, current_project_id: projectId }, { onConflict: 'user_id' });
  if (error) fail('Could not remember the current project', error);
}

/** An org admin opening a members-only project they are not a member of (logged). */
export async function adminOpenProject(projectId) {
  const { error } = await supabase.rpc('suite_project_admin_open', { p: projectId });
  if (error) fail('Could not open the project', error);
}

/** The tables "Move to project" handles, with the words the UI uses. */
export const MOVABLE = [
  { table: 'geo_wells', label: 'Wells' },
  { table: 'geo_surfaces', label: 'Surfaces' },
  { table: 'geo_culture', label: 'Culture' },
  { table: 'seismic_volumes', label: 'Seismic volumes' },
  { table: 'seismic_lines', label: 'Seismic 2D lines' },
  { table: 'seismic_projects', label: 'Seismolord projects' },
  { table: 'geo_correlation_sections', label: 'Correlation sections' },
];


/** P4: app project tables that Move to project accepts (suite_move_to_project knows them). */
export const APP_MOVABLE = Object.freeze([
  { table: 'petro_projects', label: 'Petrophysics interpretations', nameColumn: 'name' },
  { table: 'pp_projects', label: 'Pore Pressure projects', nameColumn: 'name' },
  { table: 'rp_projects', label: 'Rock Physics projects', nameColumn: 'name' },
  { table: 'em_models', label: 'Earth models', nameColumn: 'name' },
  { table: 'bf_wells', label: 'Basin models', nameColumn: 'name' },
  { table: 'rcp_prospects', label: 'ReservoirCalc Pro prospects', nameColumn: 'name' },
  { table: 'rrv_valuations', label: 'Risked reserves valuations', nameColumn: 'name' },
  { table: 'saved_allocation_projects', label: 'Saved allocation projects', nameColumn: 'project_name' },
  { table: 'saved_blend_optimizer_projects', label: 'Saved blend optimizer projects', nameColumn: 'project_name' },
  { table: 'saved_breakeven_projects', label: 'Saved breakeven projects', nameColumn: 'project_name' },
  { table: 'saved_carbon_projects', label: 'Saved carbon projects', nameColumn: 'project_name' },
  { table: 'saved_casing_design_projects', label: 'Saved casing design projects', nameColumn: 'project_name' },
  { table: 'saved_choke_projects', label: 'Saved choke projects', nameColumn: 'project_name' },
  { table: 'saved_compressor_projects', label: 'Saved compressor projects', nameColumn: 'project_name' },
  { table: 'saved_compressor_pump_projects', label: 'Saved compressor pump projects', nameColumn: 'project_name' },
  { table: 'saved_corrosion_projects', label: 'Saved corrosion projects', nameColumn: 'project_name' },
  { table: 'saved_crude_assay_projects', label: 'Saved crude assay projects', nameColumn: 'project_name' },
  { table: 'saved_dca_projects', label: 'Saved dca projects', nameColumn: 'project_name' },
  { table: 'saved_decision_tree_projects', label: 'Saved decision tree projects', nameColumn: 'project_name' },
  { table: 'saved_drilling_fluids_projects', label: 'Saved drilling fluids projects', nameColumn: 'project_name' },
  { table: 'saved_energy_efficiency_projects', label: 'Saved energy efficiency projects', nameColumn: 'project_name' },
  { table: 'saved_eor_screening_projects', label: 'Saved eor screening projects', nameColumn: 'project_name' },
  { table: 'saved_esp_projects', label: 'Saved esp projects', nameColumn: 'project_name' },
  { table: 'saved_fdp_projects', label: 'Saved fdp projects', nameColumn: 'project_name' },
  { table: 'saved_flare_projects', label: 'Saved flare projects', nameColumn: 'project_name' },
  { table: 'saved_flowassurance_projects', label: 'Saved flowassurance projects', nameColumn: 'project_name' },
  { table: 'saved_fluid_studio_projects', label: 'Saved fluid studio projects', nameColumn: 'project_name' },
  { table: 'saved_fuel_pricing_projects', label: 'Saved fuel pricing projects', nameColumn: 'project_name' },
  { table: 'saved_gaslift_projects', label: 'Saved gaslift projects', nameColumn: 'project_name' },
  { table: 'saved_gasprocessing_projects', label: 'Saved gasprocessing projects', nameColumn: 'project_name' },
  { table: 'saved_gaswell_projects', label: 'Saved gaswell projects', nameColumn: 'project_name' },
  { table: 'saved_heat_exchanger_projects', label: 'Saved heat exchanger projects', nameColumn: 'project_name' },
  { table: 'saved_intervention_projects', label: 'Saved intervention projects', nameColumn: 'project_name' },
  { table: 'saved_liftadvisor_projects', label: 'Saved liftadvisor projects', nameColumn: 'project_name' },
  { table: 'saved_linesizing_projects', label: 'Saved linesizing projects', nameColumn: 'project_name' },
  { table: 'saved_lpg_cng_projects', label: 'Saved lpg cng projects', nameColumn: 'project_name' },
  { table: 'saved_mbal_projects', label: 'Saved mbal projects', nameColumn: 'project_name' },
  { table: 'saved_meter_projects', label: 'Saved meter projects', nameColumn: 'project_name' },
  { table: 'saved_modular_refinery_projects', label: 'Saved modular refinery projects', nameColumn: 'project_name' },
  { table: 'saved_network_projects', label: 'Saved network projects', nameColumn: 'project_name' },
  { table: 'saved_nodal_analysis_projects', label: 'Saved nodal analysis projects', nameColumn: 'project_name' },
  { table: 'saved_npv_projects', label: 'Saved npv projects', nameColumn: 'project_name' },
  { table: 'saved_petrophysics_projects', label: 'Saved petrophysics projects', nameColumn: 'project_name' },
  { table: 'saved_pipeline_sizer_projects', label: 'Saved pipeline sizer projects', nameColumn: 'project_name' },
  { table: 'saved_pump_projects', label: 'Saved pump projects', nameColumn: 'project_name' },
  { table: 'saved_pvt_projects', label: 'Saved pvt projects', nameColumn: 'project_name' },
  { table: 'saved_pwt_projects', label: 'Saved pwt projects', nameColumn: 'project_name' },
  { table: 'saved_qi_studio_projects', label: 'QI Studio projects', nameColumn: 'project_name' },
  { table: 'saved_quickvol_projects', label: 'ReservoirCalc Pro projects', nameColumn: 'project_name' },
  { table: 'saved_refinery_plan_projects', label: 'Saved refinery plan projects', nameColumn: 'project_name' },
  { table: 'saved_relief_projects', label: 'Saved relief projects', nameColumn: 'project_name' },
  { table: 'saved_report_autopilot_projects', label: 'Saved report autopilot projects', nameColumn: 'project_name' },
  { table: 'saved_reservoir_balance_projects', label: 'Saved reservoir balance projects', nameColumn: 'project_name' },
  { table: 'saved_rf_projects', label: 'Saved rf projects', nameColumn: 'project_name' },
  { table: 'saved_rodpump_projects', label: 'Saved rodpump projects', nameColumn: 'project_name' },
  { table: 'saved_scal_projects', label: 'Saved scal projects', nameColumn: 'project_name' },
  { table: 'saved_scenario_hub_projects', label: 'Saved scenario hub projects', nameColumn: 'project_name' },
  { table: 'saved_separator_projects', label: 'Saved separator projects', nameColumn: 'project_name' },
  { table: 'saved_surveillance_projects', label: 'Saved surveillance projects', nameColumn: 'project_name' },
  { table: 'saved_tank_projects', label: 'Saved tank projects', nameColumn: 'project_name' },
  { table: 'saved_terminal_projects', label: 'Saved terminal projects', nameColumn: 'project_name' },
  { table: 'saved_valve_projects', label: 'Saved valve projects', nameColumn: 'project_name' },
  { table: 'saved_voi_projects', label: 'Saved voi projects', nameColumn: 'project_name' },
  { table: 'saved_vrr_projects', label: 'Saved vrr projects', nameColumn: 'project_name' },
  { table: 'saved_waterflood_design_projects', label: 'Saved waterflood design projects', nameColumn: 'project_name' },
  { table: 'saved_well_cost_iq_projects', label: 'Saved well cost iq projects', nameColumn: 'project_name' },
  { table: 'saved_well_cost_projects', label: 'Saved well cost projects', nameColumn: 'project_name' },
  { table: 'saved_well_spacing_projects', label: 'Saved well spacing projects', nameColumn: 'project_name' },
  { table: 'saved_well_test_projects', label: 'Saved well test projects', nameColumn: 'project_name' },
  { table: 'scm_marine_projects', label: 'Saved marine projects', nameColumn: 'project_name' },
  { table: 'scm_materials_projects', label: 'Saved materials projects', nameColumn: 'project_name' },
  { table: 'wp_sites', label: 'Well Design sites', nameColumn: 'name' },
  { table: 'epe_cases', label: 'Economics cases', nameColumn: 'case_name' },
  { table: 'epe_assumption_sets', label: 'Economics assumption sets', nameColumn: 'name' },
  { table: 'po_fields', label: 'Production fields', nameColumn: 'name' },
  { table: 'rb_cases', label: 'Material Balance cases', nameColumn: 'name' },
  { table: 'sim_cases', label: 'Simulation cases', nameColumn: 'name' },
]);

/** Rows of one movable table in one project (own rows only: only the owner moves). */
export async function listMovable(table, projectId, { isDefault = false, userId } = {}) {
  const app = APP_MOVABLE.find((m) => m.table === table);
  if (!app && !MOVABLE.some((m) => m.table === table)) throw new Error('This kind of record cannot be moved.');
  const nameColumn = app ? app.nameColumn : 'name';
  let q = supabase.from(table).select(`id, name:${nameColumn}, suite_project_id, user_id, created_at`).order(nameColumn, { ascending: true });
  q = isDefault ? q.or(`suite_project_id.eq.${projectId},suite_project_id.is.null`) : q.eq('suite_project_id', projectId);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) fail('Could not load the records', error);
  return data || [];
}

/** Move rows (owned by the caller) into another project. Returns how many moved. */
export async function moveToProject(table, ids, targetProjectId) {
  if (!ids?.length) return 0;
  const { data, error } = await supabase.rpc('suite_move_to_project', { p_table: table, p_ids: ids, p_target: targetProjectId });
  if (error?.code === '23505') {
    throw new Error('The target project already has a record with one of these names. Rename it in one of the projects, then move it.');
  }
  if (error) fail('Could not move the records', error);
  return Number(data) || 0;
}

// ---- P3: membership, roles and the access log ---------------------------

export const PROJECT_ROLES = Object.freeze(['owner', 'editor', 'viewer']);

/** Members of a project (RLS: whoever may see the project). */
export async function listProjectMembers(projectId) {
  const { data, error } = await supabase.from('suite_project_members')
    .select('project_id, user_id, role, added_by, added_at').eq('project_id', projectId).order('added_at', { ascending: true });
  if (error) fail('Could not load the project members', error);
  return data || [];
}

/** Colleagues in the organisation, for names and the add-member picker. */
export async function listOrgColleagues(organizationId) {
  if (!organizationId) return [];
  const { data, error } = await supabase.from('organization_members')
    .select('user_id, full_name, email, role, status').eq('organization_id', organizationId);
  if (error) fail('Could not load your colleagues', error);
  return (data || []).filter((m) => m.user_id && String(m.status || 'active').toLowerCase() === 'active');
}

const roleOk = (role) => {
  if (!PROJECT_ROLES.includes(role)) throw new Error('A member is an owner, an editor or a viewer.');
  return role;
};

export async function addProjectMember(projectId, userId, role = 'editor') {
  const { error } = await supabase.from('suite_project_members').insert({ project_id: projectId, user_id: userId, role: roleOk(role) });
  if (error?.code === '23505') throw new Error('That colleague is already a member.');
  if (error) fail('Could not add the member', error);
}

export async function setProjectMemberRole(projectId, userId, role) {
  const { data, error } = await supabase.from('suite_project_members').update({ role: roleOk(role) })
    .eq('project_id', projectId).eq('user_id', userId).select('user_id');
  if (error) fail('Could not change the role', error);
  if (!data || !data.length) throw new Error('Only the project owner or an organisation admin can change roles.');
}

export async function removeProjectMember(projectId, userId) {
  const { data, error } = await supabase.from('suite_project_members').delete()
    .eq('project_id', projectId).eq('user_id', userId).select('user_id');
  if (error) fail('Could not remove the member', error);
  if (!data || !data.length) throw new Error('Only the project owner or an organisation admin can remove members.');
}

/** The project's log (admin opens, visibility, members, archive, moves), newest first. */
export async function listAccessLog(projectId, limit = 50) {
  const { data, error } = await supabase.from('suite_project_access_log')
    .select('id, project_id, actor_id, event, detail, created_at').eq('project_id', projectId)
    .order('created_at', { ascending: false }).limit(limit);
  if (error) fail('Could not load the project log', error);
  return data || [];
}
