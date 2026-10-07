// QI Studio state and persistence (QI programme Q1 / A4, 2026-10-06), on the
// Well Spacing Optimizer pattern: saved_qi_studio_projects (migration
// 20261006140000, NOT APPLIED until the owner applies it) through
// createSavedProjectsService under the record-sharing rules. Until the table
// exists a save says so plainly and the study stays on screen. The registry
// data (wells, curves, zones, volumes) is read fresh on every open; the
// usability matrix and suggestions are recomputed from it, never saved.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { useSharedSavedProjects } from '@/lib/recordSharing/useSharedSavedProjects';
import { blankProject, projectFromPayload, projectPayload, issueRegister, upsertIssue } from './services/model';
import { usabilityMatrix, suggestedIssues } from './services/usability';
import { suggestInventory, inventoryRows } from './services/inventory';

export const TABLE = 'saved_qi_studio_projects';
export const service = createSavedProjectsService(TABLE, { signInMessage: 'Sign in to save QI Studio projects.' });

export const isMissingTable = (error) => {
  const msg = error?.message || '';
  return error?.code === '42P01' || error?.code === 'PGRST205'
    || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist|Could not find the table[^\\n]*${TABLE}`, 'i').test(msg);
};
export const NOT_SWITCHED_ON = 'Saving is not switched on yet for QI Studio on this database (the table is waiting to be applied). The audit stays on this page; download the report to keep a copy.';
const friendlyError = (e) => (isMissingTable(e) ? NOT_SWITCHED_ON : (e?.message || 'Unexpected error.'));

const QIStudioContext = createContext(null);
export const useQIStudio = () => {
  const ctx = useContext(QIStudioContext);
  if (!ctx) throw new Error('useQIStudio must be used within a QIStudioProvider');
  return ctx;
};

export function QIStudioProvider({ children, backend, sharingStore = null }) {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();
  const [project, setProject] = useState(blankProject);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [saving, setSavingAvailable] = useState({ available: true, reason: null });
  const shared = useSharedSavedProjects({ table: TABLE, service, sharingStore });
  const [projectRows, setProjectRows] = useState([]);
  const canWrite = shared.canWrite;

  // --- registry data: the well list and volumes once; each chosen well loaded once
  const [wells, setWells] = useState(null);
  const [volumes, setVolumes] = useState([]);
  const [surfaceCount, setSurfaceCount] = useState(0);
  const [loaded, setLoaded] = useState({}); // well id -> {well, logs, zones, tops} | {error}
  const inFlight = useRef(new Set());
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [w, v, s] = await Promise.all([backend.listWells(), backend.listVolumes().catch(() => []), backend.countSurfaces().catch(() => 0)]);
        if (live) { setWells(w); setVolumes(v); setSurfaceCount(s); }
      } catch (e) {
        if (live) { setWells([]); addNotification(e.message, 'error'); }
      }
    })();
    return () => { live = false; };
  }, [backend]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!wells) return;
    for (const id of project.wellIds) {
      if (loaded[id] || inFlight.current.has(id)) continue;
      const well = wells.find((w) => w.id === id);
      if (!well) continue;
      inFlight.current.add(id);
      backend.loadWell(well)
        .then((r) => setLoaded((m) => ({ ...m, [id]: r })))
        .catch((e) => setLoaded((m) => ({ ...m, [id]: { well, error: e.message } })))
        .finally(() => inFlight.current.delete(id));
    }
  }, [wells, project.wellIds, loaded, backend]);

  const ready = useMemo(() => project.wellIds.map((id) => loaded[id]).filter((r) => r && !r.error), [project.wellIds, loaded]);
  const loading = project.wellIds.some((id) => !loaded[id]);

  // --- derived: one pure function of the registry and the project
  const matrix = useMemo(() => usabilityMatrix(ready, project.targets, project.dates), [ready, project.targets, project.dates]);
  const chosenVolumes = useMemo(() => volumes.filter((v) => project.volumeIds.includes(v.id)), [volumes, project.volumeIds]);
  const suggestions = useMemo(() => suggestInventory({ wells: ready, volumes: chosenVolumes, horizons: surfaceCount }), [ready, chosenVolumes, surfaceCount]);
  const inventory = useMemo(() => inventoryRows(project.inventory, suggestions), [project.inventory, suggestions]);
  const issues = useMemo(() => issueRegister(project.issues, suggestedIssues(matrix)), [project.issues, matrix]);
  const targetChoices = useMemo(() => {
    const names = new Set();
    for (const r of ready) for (const z of r.zones || []) names.add(z.name);
    return [...names].sort();
  }, [ready]);

  // --- edits
  const edit = useCallback((fn) => setProject((p) => fn(p)), []);
  const toggleWell = useCallback((id) => edit((p) => ({ ...p, wellIds: p.wellIds.includes(id) ? p.wellIds.filter((x) => x !== id) : [...p.wellIds, id] })), [edit]);
  const toggleVolume = useCallback((id) => edit((p) => ({ ...p, volumeIds: p.volumeIds.includes(id) ? p.volumeIds.filter((x) => x !== id) : [...p.volumeIds, id] })), [edit]);
  const toggleTarget = useCallback((name) => edit((p) => ({ ...p, targets: p.targets.includes(name) ? p.targets.filter((x) => x !== name) : [...p.targets, name] })), [edit]);
  const setSeismicAcquired = useCallback((d) => edit((p) => ({ ...p, dates: { ...p.dates, seismicAcquired: d } })), [edit]);
  const setFirstProduction = useCallback((wellId, d) => edit((p) => ({ ...p, dates: { ...p.dates, firstProduction: { ...p.dates.firstProduction, [wellId]: d } } })), [edit]);
  const setInventory = useCallback((key, patch) => edit((p) => {
    const row = inventory.find((r) => r.key === key);
    const cur = p.inventory[key] || { state: row?.state || 'requested', date: '', note: '' };
    return { ...p, inventory: { ...p.inventory, [key]: { ...cur, ...patch } } };
  }), [edit, inventory]);
  const saveIssue = useCallback((issue) => edit((p) => ({ ...p, issues: upsertIssue(p.issues, issue) })), [edit]);
  const setFeasibility = useCallback((target, patch) => edit((p) => ({ ...p, feasibility: { ...p.feasibility, [target]: { ...(p.feasibility[target] || {}), ...patch } } })), [edit]);
  const setQcResult = useCallback((volumeId, record) => edit((p) => ({ ...p, qc: { ...p.qc, [volumeId]: record } })), [edit]);
  const setProperty = useCallback((aiVolumeId, patch) => edit((p) => ({ ...p, properties: { ...p.properties, [aiVolumeId]: { ...(p.properties?.[aiVolumeId] || {}), ...(typeof patch === 'function' ? patch(p.properties?.[aiVolumeId] || {}) : patch) } } })), [edit]);
  const setInversion = useCallback((volumeId, patch) => edit((p) => ({ ...p, inversion: { ...p.inversion, [volumeId]: { ...(p.inversion?.[volumeId] || {}), ...(typeof patch === 'function' ? patch(p.inversion?.[volumeId] || {}) : patch) } } })), [edit]);

  // --- project lifecycle with record sharing (the Well Spacing pattern)
  const refresh = useCallback(async () => {
    const list = await shared.refreshList();
    setProjectRows(list);
    return list;
  }, [shared]);
  useEffect(() => {
    (async () => {
      try { await refresh(); setSavingAvailable({ available: true, reason: null }); } catch (e) {
        if (isMissingTable(e)) setSavingAvailable({ available: false, reason: NOT_SWITCHED_ON });
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const myId = shared.sharing.userId;
  const projects = useMemo(() => projectRows.filter((p) => !sharingStore || !myId || !p.userId || p.userId === myId), [projectRows, sharingStore, myId]);
  const sharedProjects = useMemo(() => (sharingStore && myId ? projectRows.filter((p) => p.userId && p.userId !== myId) : []), [projectRows, sharingStore, myId]);

  const createProject = useCallback(async (name) => {
    const id = uuidv4();
    try {
      await service.save(id, projectPayload(project, { id, name }));
      await shared.adoptRow(id);
      setCurrentProjectId(id); setProjectName(name); setHydrated(true); setLastSaveTime(new Date()); setSaveError(null);
      await refresh();
      addNotification(`Project "${name}" created`, 'success');
    } catch (e) {
      if (isMissingTable(e)) setSavingAvailable({ available: false, reason: NOT_SWITCHED_ON });
      addNotification(friendlyError(e), 'error');
    }
  }, [project, shared, refresh, addNotification]);
  const openProject = useCallback(async (id) => {
    try {
      const payload = await shared.loadForOpen(id);
      if (!payload) { addNotification('Project not found', 'error'); return; }
      setCurrentProjectId(id);
      setProjectName(payload.name || projectRows.find((p) => p.id === id)?.name || 'Untitled project');
      setProject(projectFromPayload(payload));
      setHydrated(true); setSaveError(null);
    } catch (e) { addNotification(friendlyError(e), 'error'); }
  }, [shared, projectRows, addNotification]);
  const deleteProject = useCallback(async (id) => {
    try {
      await service.remove(id);
      if (id === currentProjectId) { setCurrentProjectId(null); setProjectName(''); setHydrated(false); setLastSaveTime(null); shared.close(); }
      await refresh();
      addNotification('Project deleted', 'info');
    } catch (e) { addNotification(friendlyError(e), 'error'); }
  }, [currentProjectId, shared, refresh, addNotification]);
  const writeNow = useCallback(async () => {
    const res = await shared.write(currentProjectId, projectPayload(project, { id: currentProjectId, name: projectName }));
    if (res.ok) { setLastSaveTime(new Date()); setSaveError(null); } else if (!res.readOnly) { setSaveError('Save failed'); addNotification(res.message || 'Save failed', 'error'); }
    return res;
  }, [shared, currentProjectId, project, projectName, addNotification]);
  const manualSave = useCallback(async () => {
    if (!currentProjectId) { addNotification(saving.available ? 'Create or open a project first' : NOT_SWITCHED_ON, 'info'); return false; }
    if (!canWrite) { addNotification(shared.sharing.readOnlyReason || 'This project is open read-only.', 'info'); return false; }
    setIsSaving(true);
    try { const res = await writeNow(); return !!res.ok; } catch (e) { setSaveError('Save failed'); addNotification(friendlyError(e), 'error'); return false; } finally { setIsSaving(false); }
  }, [currentProjectId, canWrite, shared, writeNow, addNotification, saving.available]);
  const saveCopy = useCallback(async () => {
    const name = shared.copyNameFor(projectName || 'QI study');
    const id = uuidv4();
    try {
      await service.save(id, projectPayload(project, { id, name }));
      await refresh(); await openProject(id);
      addNotification(`Saved a copy as "${name}"`, 'success');
      return id;
    } catch (e) { addNotification(`Could not save a copy: ${friendlyError(e)}`, 'error'); return null; }
  }, [shared, projectName, project, refresh, openProject, addNotification]);
  const autosaveRef = useRef(null);
  autosaveRef.current = writeNow;
  useEffect(() => {
    if (!currentProjectId || !hydrated || !canWrite) return undefined;
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try { await autosaveRef.current(); } catch { setSaveError('Auto-save failed'); } finally { setIsSaving(false); }
    }, 10000);
    return () => clearTimeout(timer);
  }, [project, currentProjectId, hydrated, canWrite]);

  const value = {
    project, wells, volumes, chosenVolumes, loaded, ready, loading, matrix, inventory, issues, targetChoices,
    toggleWell, toggleVolume, toggleTarget, setSeismicAcquired, setFirstProduction, setInventory, saveIssue, setFeasibility, setQcResult, setInversion, setProperty,
    jobs: backend.jobs || null, backend,
    projects, sharedProjects, currentProjectId, projectName, projectRow: shared.projectRow, sharing: shared.sharing,
    viewingShared: shared.viewingShared, canWrite, savingAvailable: saving.available, savingReason: saving.reason,
    createProject, openProject, deleteProject, manualSave, saveCopy, isSaving, saveError, lastSaveTime,
    notifications, addNotification, removeNotification,
  };
  return <QIStudioContext.Provider value={value}>{children}</QIStudioContext.Provider>;
}
