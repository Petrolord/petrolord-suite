// DCA project persistence — Supabase-backed (R1, Reservoir-ROADMAP.md).
// Projects live in `saved_dca_projects` (owner-scoped RLS, the
// saved_<app>_projects convention): the full project payload (wells,
// stream state, scenarios, type curves, groups, fit window) is stored
// as inputs_data; results are a pure function of inputs and are not
// duplicated server-side.
//
// The pre-R1 implementation kept a project index in localStorage
// ('dca_projects') and payloads in IndexedDB. migrateLegacyLocalProjects()
// lifts any such projects into Supabase once, then clears the local
// copies, so nobody loses work they saved before the fix.
import { supabase } from '@/lib/customSupabaseClient';
import { get as idbGet, del as idbDel } from 'idb-keyval';

const TABLE = 'saved_dca_projects';
const LEGACY_INDEX_KEY = 'dca_projects';
const LEGACY_PREFIX = 'dca_project_';

const currentUserId = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error('Sign in to save DCA projects.');
  return data.user.id;
};

/** List the caller's projects, most recently touched first. */
export const listProjects = async () => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, project_name, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    name: r.project_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
};

/** Upsert the full project payload under its stable project id. */
export const saveProject = async (projectId, projectData) => {
  const userId = await currentUserId();
  const { error } = await supabase.from(TABLE).upsert({
    id: projectId,
    user_id: userId,
    project_name: projectData?.name || 'Untitled project',
    inputs_data: projectData,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return { success: true };
};

/** Load one project's payload (null when it does not exist). */
export const loadProject = async (projectId) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('inputs_data')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw error;
  return data?.inputs_data ?? null;
};

/** Delete one project. */
export const deleteProject = async (projectId) => {
  const { error } = await supabase.from(TABLE).delete().eq('id', projectId);
  if (error) throw error;
  return { success: true };
};

/**
 * One-time lift of pre-R1 local projects (localStorage index +
 * IndexedDB/localStorage payloads) into Supabase. Best-effort: a
 * project only leaves local storage after its upsert succeeded.
 * @returns {Promise<number>} how many projects were migrated
 */
export const migrateLegacyLocalProjects = async () => {
  let index;
  try {
    index = JSON.parse(localStorage.getItem(LEGACY_INDEX_KEY) || 'null');
  } catch {
    index = null;
  }
  if (!Array.isArray(index) || index.length === 0) return 0;

  let migrated = 0;
  const remaining = [];
  for (const entry of index) {
    try {
      let payload = await idbGet(entry.id);
      if (!payload) {
        const raw = localStorage.getItem(`${LEGACY_PREFIX}${entry.id}`);
        payload = raw ? JSON.parse(raw) : null;
      }
      if (!payload) continue; // index entry with no payload: drop it
      await saveProject(entry.id, { ...payload, name: payload.name || entry.name });
      await idbDel(entry.id).catch(() => {});
      localStorage.removeItem(`${LEGACY_PREFIX}${entry.id}`);
      migrated += 1;
    } catch (e) {
      console.warn('DCA legacy migration failed for project', entry.id, e);
      remaining.push(entry);
    }
  }
  if (remaining.length === 0) {
    localStorage.removeItem(LEGACY_INDEX_KEY);
    localStorage.removeItem('dca_projects_metadata');
  } else {
    localStorage.setItem(LEGACY_INDEX_KEY, JSON.stringify(remaining));
  }
  return migrated;
};

export const exportProjectAsJSON = (projectData) => {
  try {
    const json = JSON.stringify(projectData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectData.name || 'project'}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

export const importProjectFromJSON = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.id || !data.name) throw new Error('Invalid project structure');
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
};
