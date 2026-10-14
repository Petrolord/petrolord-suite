// Suite Projects P1: useProject(), the current client > project for the
// whole Suite (docs/scope/SuiteProject-DESIGN.md sections 7 and 12).
//
// - Loads the caller's default and current project (suite_project_bootstrap),
//   their projects and clients. If the database has no projects yet (P0 not
//   applied) or the session is an impersonation, projects stay OFF and the
//   Suite behaves exactly as before.
// - Deep links carry ?project=<id>. A link without it opens in the current
//   project. The parameter is written only for a project other than the
//   default, so a user who never creates a project sees the same URLs.
// - Switching project remounts the routed pages (epoch key), so every app
//   reloads its registries in the new scope.
// - Writes the scope the registries read (src/lib/projects/projectScope.js).

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  beginProjectScopeLoad, endProjectScopeLoad, setProjectScope,
} from '@/lib/projects/projectScope';
import * as svc from '@/lib/projects/projectsService';
import { groupProjectsByClient, projectLabel } from '@/lib/projects/projectGrouping';

const ProjectContext = createContext(null);

const OFF = Object.freeze({
  available: false, loading: false, error: null,
  projects: [], clients: [], memberships: [],
  current: null, currentClient: null, defaultProjectId: null, organizationId: null,
  epoch: 0, showSwitcher: false, label: '',
  groups: [],
  switchProject: async () => {}, refresh: async () => {},
  createClient: async () => { throw new Error('Projects are not available yet.'); },
  updateClient: async () => { throw new Error('Projects are not available yet.'); },
  createProject: async () => { throw new Error('Projects are not available yet.'); },
  updateProject: async () => { throw new Error('Projects are not available yet.'); },
  canManage: () => false,
});

export const PROJECT_PARAM = 'project';

export function ProjectProvider({ children }) {
  const { user, organization, role, isImpersonating, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [st, setSt] = useState({ ...OFF });
  const stRef = useRef(st);
  stRef.current = st;
  const userId = user?.id || null;

  const applyScope = useCallback((projectId, defaultProjectId) => {
    setProjectScope({ enabled: !!projectId, projectId, defaultProjectId });
  }, []);

  const loadLists = useCallback(async () => {
    const [projects, clients, memberships] = await Promise.all([
      svc.listProjects(), svc.listClients(), svc.listMyMemberships(userId),
    ]);
    return { projects, clients, memberships };
  }, [userId]);

  // the project as the user may open it: members-only projects of an org
  // the caller administers (without membership) are opened through the
  // logged admin RPC first
  const ensureOpenable = useCallback(async (project, memberships) => {
    if (!project || project.visibility !== 'members') return;
    if (project.owner_user_id === userId) return;
    if ((memberships || []).some((m) => m.project_id === project.id)) return;
    await svc.adminOpenProject(project.id);
  }, [userId]);

  // first load for a signed-in user
  useEffect(() => {
    let cancelled = false;
    if (authLoading) return undefined;
    if (!userId || isImpersonating) {
      setProjectScope({ enabled: false });
      endProjectScopeLoad();
      setSt({ ...OFF });
      return undefined;
    }
    beginProjectScopeLoad();
    setSt((s) => ({ ...s, loading: true }));
    (async () => {
      try {
        const boot = await svc.bootstrapProjects();
        if (cancelled) return;
        if (!boot) {
          setProjectScope({ enabled: false });
          setSt({ ...OFF });
          return;
        }
        const lists = await loadLists();
        if (cancelled) return;
        const wanted = new URLSearchParams(window.location.search).get(PROJECT_PARAM);
        const visible = (id) => lists.projects.find((p) => p.id === id && p.status === 'active');
        let current = (wanted && visible(wanted)) || visible(boot.currentProjectId) || visible(boot.defaultProjectId)
          || lists.projects.find((p) => p.id === boot.defaultProjectId) || null;
        try { await ensureOpenable(current, lists.memberships); } catch { current = visible(boot.defaultProjectId) || null; }
        if (cancelled) return;
        applyScope(current?.id || null, boot.defaultProjectId);
        // a deep link chose another project: remember it, so rows the server
        // stamps (older builds, edge functions) land in the same project
        if (current && current.id !== boot.currentProjectId) svc.saveCurrentProject(userId, current.id).catch(() => {});
        setSt({
          ...OFF, available: true, loading: false,
          ...lists, defaultProjectId: boot.defaultProjectId, organizationId: boot.organizationId,
          current, epoch: 0,
        });
      } catch (e) {
        if (cancelled) return;
        // a failure here must never block the Suite: run without projects
        setProjectScope({ enabled: false });
        setSt({ ...OFF, error: e.message });
      } finally {
        if (!cancelled) endProjectScopeLoad();
      }
    })();
    return () => { cancelled = true; };
  }, [userId, isImpersonating, authLoading, loadLists, applyScope, ensureOpenable]);

  const refresh = useCallback(async () => {
    if (!stRef.current.available) return;
    const lists = await loadLists();
    setSt((s) => ({
      ...s, ...lists,
      current: lists.projects.find((p) => p.id === s.current?.id) || s.current,
    }));
  }, [loadLists]);

  const writeParam = useCallback((projectId, defaultProjectId) => {
    const params = new URLSearchParams(window.location.search);
    const had = params.get(PROJECT_PARAM);
    if (projectId && projectId !== defaultProjectId) params.set(PROJECT_PARAM, projectId);
    else params.delete(PROJECT_PARAM);
    if ((params.get(PROJECT_PARAM) || null) === (had || null)) return;
    const search = params.toString();
    navigate({ pathname: window.location.pathname, search: search ? `?${search}` : '', hash: window.location.hash }, { replace: true });
  }, [navigate]);

  const switchProject = useCallback(async (projectId, { remount = true } = {}) => {
    const s = stRef.current;
    if (!s.available) return;
    const target = s.projects.find((p) => p.id === projectId);
    if (!target) throw new Error('That project is not available to you.');
    if (target.status !== 'active') throw new Error('That project is archived. Restore it first.');
    await ensureOpenable(target, s.memberships);
    applyScope(target.id, s.defaultProjectId);
    try { await svc.saveCurrentProject(userId, target.id); } catch { /* the scope still switches for this tab */ }
    setSt((prev) => ({ ...prev, current: target, epoch: remount && prev.current?.id !== target.id ? prev.epoch + 1 : prev.epoch }));
    writeParam(target.id, s.defaultProjectId);
  }, [applyScope, ensureOpenable, userId, writeParam]);

  // a deep link followed inside the app (?project= changed in the URL)
  useEffect(() => {
    const s = stRef.current;
    if (!s.available) return;
    const wanted = new URLSearchParams(location.search).get(PROJECT_PARAM);
    if (!wanted || wanted === s.current?.id) return;
    if (!s.projects.some((p) => p.id === wanted && p.status === 'active')) return;
    switchProject(wanted).catch(() => {});
  }, [location.search, switchProject]);

  // keep ?project= on in-app navigation for a non-default project, so a
  // copied link opens the same project
  useEffect(() => {
    const s = stRef.current;
    if (!s.available || !s.current) return;
    if (s.current.id === s.defaultProjectId) return;
    const params = new URLSearchParams(location.search);
    if (!params.get(PROJECT_PARAM)) writeParam(s.current.id, s.defaultProjectId);
  }, [location.pathname, location.search, writeParam]);

  const isOrgAdmin = ['owner', 'admin', 'org_admin', 'super_admin'].includes(String(role || '').toLowerCase());
  const canManage = useCallback((project) => {
    if (!project) return false;
    if (project.owner_user_id === userId) return true;
    if ((stRef.current.memberships || []).some((m) => m.project_id === project.id && m.role === 'owner')) return true;
    return !!project.organization_id && isOrgAdmin;
  }, [userId, isOrgAdmin]);

  const createClient = useCallback(async (c) => {
    const row = await svc.createClient({ ...c, organizationId: stRef.current.organizationId ?? organization?.id ?? null, userId });
    await refresh();
    return row;
  }, [organization?.id, userId, refresh]);

  const updateClient = useCallback(async (id, patch) => {
    const row = await svc.updateClient(id, patch);
    await refresh();
    return row;
  }, [refresh]);

  const createProject = useCallback(async (p) => {
    const row = await svc.createProject({ ...p, organizationId: stRef.current.organizationId ?? organization?.id ?? null, userId });
    await refresh();
    return row;
  }, [organization?.id, userId, refresh]);

  const updateProject = useCallback(async (id, patch) => {
    const s = stRef.current;
    if (patch.status === 'archived' && id === s.current?.id) {
      throw new Error('Switch to another project before archiving this one.');
    }
    const row = await svc.updateProject(id, patch);
    await refresh();
    return row;
  }, [refresh]);

  const value = useMemo(() => {
    if (!st.available) return { ...OFF, loading: st.loading, error: st.error };
    const active = st.projects.filter((p) => p.status === 'active');
    const activeClients = st.clients.filter((c) => c.status === 'active');
    const currentClient = st.current?.client_id ? st.clients.find((c) => c.id === st.current.client_id) || null : null;
    return {
      ...st,
      currentClient,
      groups: groupProjectsByClient(active, activeClients),
      // only users who have created something see the switcher; a user with
      // just the Default project and no clients sees no change
      showSwitcher: active.length > 1 || activeClients.length > 0,
      label: projectLabel(st.current, currentClient),
      switchProject, refresh, createClient, updateClient, createProject, updateProject, canManage,
    };
  }, [st, switchProject, refresh, createClient, updateClient, createProject, updateProject, canManage]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

/** The current project. Outside a ProjectProvider (harnesses, tests) projects are off. */
export function useProject() {
  return useContext(ProjectContext) || OFF;
}

/** Remounts its children when the user switches project, so pages reload in the new scope. */
export function ProjectScopeBoundary({ children }) {
  const { epoch } = useProject();
  return <React.Fragment key={epoch}>{children}</React.Fragment>;
}
