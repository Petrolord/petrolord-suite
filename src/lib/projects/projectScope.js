// Suite Projects P1: the current project, as plain module state the
// registries read (they are not React code). The ProjectProvider
// (src/contexts/ProjectContext.jsx) is the only writer.
//
// Design: docs/scope/SuiteProject-DESIGN.md. Database: P0 migrations
// 20261015100000..100200 (suite_projects, suite_project_id on the
// geoscience registries, RLS, backfill).
//
// Safety rules
// - Until the provider has confirmed the database has projects (the
//   suite_project_bootstrap RPC answered), the scope is DISABLED: no filter,
//   no stamp, every registry behaves exactly as before P1. That covers the
//   time before the owner applies P0, signed-out pages, impersonation, the
//   /dev harnesses and every jest test that does not opt in.
// - A write that names suite_project_id and is refused for an unknown column
//   is retried without it, and the scope switches itself off for the session.
// - Reads wait (briefly) for the provider's first answer so an app that loads
//   at once never lists every project's rows before the scope is known.

const COLUMN = 'suite_project_id';

let state = { enabled: false, projectId: null, defaultProjectId: null, settings: {} };
const listeners = new Set();
let pending = null;      // { promise, resolve } while the provider is loading
const READY_TIMEOUT_MS = 6000;

export function getProjectScope() { return state; }

/** The current project's stored settings ({} when projects are off). */
export function currentProjectSettings() { return state.enabled ? state.settings || {} : {}; }

/** True when the current project is a project other than the Default one. */
export function inNonDefaultProject() {
  return state.enabled && !!state.projectId && state.projectId !== state.defaultProjectId;
}

/** Replace the current project's settings in the scope after a save. */
export function setCurrentProjectSettings(projectId, settings) {
  if (!state.enabled || state.projectId !== projectId) return;
  setProjectScope({ ...state, settings });
}

/** The project new rows go to, or null when projects are off. */
export function currentProjectId() { return state.enabled ? state.projectId : null; }

export function setProjectScope(next) {
  state = {
    enabled: !!next?.enabled && !!next?.projectId,
    projectId: next?.projectId || null,
    defaultProjectId: next?.defaultProjectId || null,
    // P2: the current project's settings (raw jsonb; read through projectSettings.js)
    settings: next?.settings && typeof next.settings === 'object' ? next.settings : {},
  };
  for (const fn of listeners) { try { fn(state); } catch { /* listener errors never break the scope */ } }
}

export function subscribeProjectScope(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The provider calls this when it starts loading for a signed-in user. */
export function beginProjectScopeLoad() {
  if (pending) return;
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  pending = { promise, resolve };
}

/** The provider calls this when it knows the scope (or that there is none). */
export function endProjectScopeLoad() {
  if (!pending) return;
  const p = pending; pending = null;
  p.resolve();
}

/** Resolves at once unless the provider is still loading (then at most READY_TIMEOUT_MS). */
export function whenProjectScopeReady() {
  if (!pending) return Promise.resolve();
  return Promise.race([pending.promise, new Promise((r) => setTimeout(r, READY_TIMEOUT_MS))]);
}

/**
 * Narrow a PostgREST select to the current project. The default project
 * also takes rows with no project (none exist after the P0 backfill and the
 * insert stamp, but a row the stamp could not place must never vanish).
 * @param {Object} query a supabase-js filter builder
 * @param {{column?: string, allProjects?: boolean}} [opts]
 */
export function scopeToProject(query, { column = COLUMN, allProjects = false } = {}) {
  if (allProjects || !state.enabled || !state.projectId) return query;
  if (state.projectId === state.defaultProjectId) {
    return query.or(`${column}.eq.${state.projectId},${column}.is.null`);
  }
  return query.eq(column, state.projectId);
}

/** In-memory version of scopeToProject for rows already fetched. */
export function rowInScope(row, { column = COLUMN } = {}) {
  if (!state.enabled || !state.projectId || !row) return true;
  const v = row[column];
  if (v === state.projectId) return true;
  return (v === null || v === undefined) && state.projectId === state.defaultProjectId;
}

/** Add the current project to a row (or rows) about to be inserted. A row
 *  that already names a project keeps it. */
export function stampProject(payload) {
  const id = currentProjectId();
  if (!id) return payload;
  const add = (r) => (r && r[COLUMN] === undefined ? { ...r, [COLUMN]: id } : r);
  return Array.isArray(payload) ? payload.map(add) : add(payload);
}

/** True for PostgREST / Postgres "no such column suite_project_id". */
export function isProjectColumnError(error) {
  if (!error) return false;
  const msg = String(error.message || '');
  return msg.includes(COLUMN) && (error.code === 'PGRST204' || error.code === '42703' || /schema cache|does not exist/i.test(msg));
}

/**
 * Run an insert with the stamp; if the database has no project column, run
 * it once more without and switch projects off for this session.
 * @param {Object|Object[]} payload
 * @param {(p: Object|Object[]) => Promise<{data?: any, error?: any}>} run
 */
export async function insertWithProject(payload, run) {
  const stamped = stampProject(payload);
  if (stamped === payload) return run(payload);
  const first = await run(stamped);
  if (!first?.error || !isProjectColumnError(first.error)) return first;
  setProjectScope({ enabled: false });
  return run(payload);
}

/** Test hook. */
export function _resetProjectScope() {
  state = { enabled: false, projectId: null, defaultProjectId: null, settings: {} };
  listeners.clear();
  pending = null;
}
