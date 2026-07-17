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
import { createSavedProjectsService, exportProjectAsJSON, importProjectFromJSON } from '@/utils/savedProjects';
import { get as idbGet, del as idbDel } from 'idb-keyval';

const LEGACY_INDEX_KEY = 'dca_projects';
const LEGACY_PREFIX = 'dca_project_';

// The shared saved_<app>_projects service (src/utils/savedProjects.js) is the
// single implementation of this convention; DCA delegates to it.
const service = createSavedProjectsService('saved_dca_projects', {
  signInMessage: 'Sign in to save DCA projects.',
});

/** List the caller's projects, most recently touched first. */
export const listProjects = () => service.list();

/** Upsert the full project payload under its stable project id. */
export const saveProject = (projectId, projectData) => service.save(projectId, projectData);

/** Load one project's payload (null when it does not exist). */
export const loadProject = (projectId) => service.load(projectId);

/** Delete one project. */
export const deleteProject = (projectId) => service.remove(projectId);

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

// JSON import/export moved to the shared module; re-exported so existing
// DCA import sites keep working unchanged.
export { exportProjectAsJSON, importProjectFromJSON };
