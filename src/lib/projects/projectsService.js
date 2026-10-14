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

/** Rows of one movable table in one project (own rows only: only the owner moves). */
export async function listMovable(table, projectId, { isDefault = false, userId } = {}) {
  if (!MOVABLE.some((m) => m.table === table)) throw new Error('This kind of record cannot be moved.');
  let q = supabase.from(table).select('id, name, suite_project_id, user_id, created_at').order('name', { ascending: true });
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
