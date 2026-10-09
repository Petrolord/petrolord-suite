// SCAL Studio project lifecycle on the shared Studio-shell persistence
// convention, with record sharing (SCAL-U1, PL5 and RL12). The hook of
// Fluid Systems Studio (useFluidStudioProjects) taken over for a studio
// whose state is several objects: the provider hands in `serialize(id,
// name)` (the whole payload, kr-1 block included) and `hydrate(payload)`.
//
// Record sharing (docs/scope/OrgSharing-DESIGN-AND-STATUS.md;
// saved_scal_projects is under the rules since migration 20261002130000):
// with a sharing store the picker lists the user's own projects and then
// those colleagues shared with the organisation; a project opens with its
// sharing state; a save goes through the store with the version the editor
// opened at (a newer save by someone else is refused with the reason), and
// only while the user may write (the owner, or the colleague holding the
// check-out). Without a store the hook saves as it always did.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useRecordSharing } from '@/lib/recordSharing/useRecordSharing';
import { copyName, isRecordConflict } from '@/lib/recordSharing/rules';

export const SCAL_TABLE = 'saved_scal_projects';

/** What a save would write, without the fields that change on every call (the
 *  modified stamp and the derived kr-1 contract block): equal prints mean
 *  nothing is waiting to be saved. */
export const payloadPrint = (p) => {
  if (!p || typeof p !== 'object') return '';
  const { modified: _m, ...rest } = p;
  for (const k of Object.keys(rest)) if (/contract/i.test(k) && rest[k] && typeof rest[k] === 'object') delete rest[k];
  return JSON.stringify(rest);
};

export const service = createSavedProjectsService(SCAL_TABLE, {
  signInMessage: 'Sign in to save SCAL projects.',
});

/**
 * @param {{serialize: function(?string, string): object, hydrate: function(object): void,
 *   changeKey: any, addNotification: function, sharingStore?: ?object}} a
 */
export function useScalProjects({ serialize, hydrate, changeKey, addNotification, sharingStore = null }) {
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [projectRow, setProjectRow] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  // SCAL-T1: edits made after the last save. The autosave fires 10 s after the
  // last edit; leaving the page sooner used to cancel it and lose the edits
  // while the header said "Saved". Now pending edits are written on the way
  // out, and the header says "Unsaved changes" until they are.
  const [dirty, setDirty] = useState(false);
  const savedPrintRef = useRef('');
  const baselinePendingRef = useRef(false);
  const flushRef = useRef(null); // set below, once writePending exists

  const sharing = useRecordSharing({
    store: sharingStore,
    table: SCAL_TABLE,
    record: projectRow,
    onChange: (next) => setProjectRow((prev) => (prev ? { ...prev, ...next } : prev)),
  });
  const userId = sharing.userId;
  const viewingShared = !!projectRow && !!userId && !!projectRow.user_id && projectRow.user_id !== userId;
  const ownProjects = useMemo(() => projects.filter((p) => !p.userId || !userId || p.userId === userId), [projects, userId]);
  const sharedProjects = useMemo(() => projects.filter((p) => p.userId && userId && p.userId !== userId), [projects, userId]);

  const serializeRef = useRef(serialize);
  serializeRef.current = serialize;
  const listProjects = useCallback(() => (sharingStore && service.listRows ? service.listRows() : service.list()), [sharingStore]);

  useEffect(() => {
    (async () => {
      try {
        setProjects(await listProjects());
      } catch (e) {
        console.error(e);
        addNotification('Could not load saved projects', 'error');
      }
    })();
  }, [addNotification, listProjects]);

  const readRow = useCallback(async (id) => {
    if (!sharingStore || !service.loadRow) return null;
    const got = await service.loadRow(id).catch(() => null);
    if (got?.row) sharingStore.trackOpened(SCAL_TABLE, got.row);
    return got?.row ?? null;
  }, [sharingStore]);

  const createProject = useCallback(async (name) => {
    await flushRef.current?.();
    const id = uuidv4();
    try {
      const first = serializeRef.current(id, name);
      await service.save(id, first);
      savedPrintRef.current = payloadPrint(first);
      setDirty(false);
      setCurrentProjectId(id);
      setProjectName(name);
      setProjectRow(await readRow(id));
      setHydrated(true);
      setLastSaveTime(new Date());
      setSaveError(null);
      setProjects(await listProjects());
      addNotification(`Project "${name}" created`, 'success');
      return id;
    } catch (e) {
      console.error(e);
      addNotification(e.message || 'Could not create project', 'error');
      return null;
    }
  }, [addNotification, listProjects, readRow]);

  const openProject = useCallback(async (id) => {
    await flushRef.current?.();
    try {
      let payload;
      let row = null;
      if (sharingStore && service.loadRow) {
        const got = await service.loadRow(id);
        payload = got?.payload ?? null;
        row = got?.row ?? null;
        if (row) sharingStore.trackOpened(SCAL_TABLE, row);
      } else {
        payload = await service.load(id);
      }
      if (!payload) {
        addNotification('Project not found', 'error');
        return false;
      }
      setCurrentProjectId(id);
      setProjectName(payload.name || projects.find((p) => p.id === id)?.name || 'Untitled project');
      setProjectRow(row);
      // the hydrated state is the saved state: take its print on the next render
      baselinePendingRef.current = true;
      setDirty(false);
      hydrate(payload);
      setHydrated(true);
      setSaveError(null);
      return true;
    } catch (e) {
      console.error(e);
      addNotification('Could not open project', 'error');
      return false;
    }
  }, [projects, hydrate, addNotification, sharingStore]);

  const deleteProject = useCallback(async (id) => {
    try {
      await service.remove(id);
      if (id === currentProjectId) {
        setCurrentProjectId(null);
        setProjectName('');
        setProjectRow(null);
        setHydrated(false);
        setLastSaveTime(null);
      }
      setProjects(await listProjects());
      addNotification('Project deleted', 'info');
    } catch (e) {
      console.error(e);
      addNotification('Could not delete project', 'error');
    }
  }, [currentProjectId, addNotification, listProjects]);

  const canWrite = sharing.canWrite;
  const writeProject = useCallback(async (payload) => {
    if (sharingStore && projectRow) {
      if (!canWrite) return { ok: false, readOnly: true, message: sharing.readOnlyReason || 'This project is open read-only.' };
      const { data, error } = await sharingStore.update(SCAL_TABLE, currentProjectId, {
        project_name: payload.name || 'Untitled project',
        inputs_data: payload,
        updated_at: new Date().toISOString(),
      });
      if (error) return { ok: false, conflict: isRecordConflict(error), message: error.message || 'Save failed' };
      if (data) {
        const { inputs_data: _payload, ...row } = data;
        setProjectRow((prev) => ({ ...(prev || {}), ...row }));
      }
      return { ok: true };
    }
    await service.save(currentProjectId, payload);
    return { ok: true };
  }, [sharingStore, projectRow, canWrite, sharing.readOnlyReason, currentProjectId]);

  const manualSave = useCallback(async () => {
    if (!currentProjectId) {
      addNotification('Create or open a project first', 'info');
      return false;
    }
    setIsSaving(true);
    try {
      const sent = serializeRef.current(currentProjectId, projectName);
      const res = await writeProject(sent);
      if (!res.ok) {
        setSaveError(res.readOnly ? 'Read-only' : 'Save failed');
        addNotification(res.message, res.readOnly ? 'info' : 'error');
        return false;
      }
      savedPrintRef.current = payloadPrint(sent);
      setDirty(false);
      setLastSaveTime(new Date());
      setSaveError(null);
      return true;
    } catch (e) {
      console.error(e);
      setSaveError('Save failed');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [currentProjectId, projectName, addNotification, writeProject]);

  const saveCopy = useCallback(async () => {
    const name = copyName(projectName || 'SCAL project', projects.map((p) => p.name));
    return createProject(name);
  }, [projectName, projects, createProject]);

  // Debounced autosave (10 s), only once a project is open and hydrated, only
  // when something changed since the last save, and never while the record is
  // open read-only.
  const autosaveRef = useRef(null);
  autosaveRef.current = { payload: () => serializeRef.current(currentProjectId, projectName), write: writeProject };
  const writePending = useCallback(async () => {
    const sent = autosaveRef.current.payload();
    const res = await autosaveRef.current.write(sent);
    if (res.ok) {
      savedPrintRef.current = payloadPrint(sent);
      setDirty(false);
      setLastSaveTime(new Date());
      setSaveError(null);
    }
    return res;
  }, []);
  useEffect(() => {
    if (!currentProjectId || !hydrated) return undefined;
    const print = payloadPrint(autosaveRef.current.payload());
    if (baselinePendingRef.current) {
      baselinePendingRef.current = false;
      savedPrintRef.current = print;
      setDirty(false);
      return undefined;
    }
    const changed = print !== savedPrintRef.current;
    setDirty(changed);
    if (!changed || !canWrite) return undefined;
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        const res = await writePending();
        if (!res.ok && !res.readOnly) {
          setSaveError('Auto-save failed');
          addNotification(res.message, 'error');
        }
      } catch (e) {
        console.error(e);
        setSaveError('Auto-save failed');
      } finally {
        setIsSaving(false);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [changeKey, currentProjectId, hydrated, canWrite, addNotification, writePending]);

  // Write pending edits now: before opening or creating another project, when
  // the page is hidden, and when SCAL Studio unmounts (navigating elsewhere in
  // the Suite keeps the page alive, so the request completes).
  const pendingRef = useRef(false);
  pendingRef.current = dirty && canWrite && !!currentProjectId && hydrated;
  flushRef.current = async () => {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    try { await writePending(); } catch (e) { console.error(e); }
  };
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushRef.current?.(); };
    // closing or reloading the tab cannot wait for a save: start it and ask the
    // browser to confirm leaving
    const onUnload = (e) => {
      if (!pendingRef.current) return undefined;
      flushRef.current?.();
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
      flushRef.current?.();
    };
  }, []);

  return {
    dirty,
    projects: sharingStore ? ownProjects : projects,
    sharedProjects,
    currentProjectId,
    projectName,
    projectRow,
    sharing,
    viewingShared,
    canWrite: !projectRow || canWrite,
    createProject,
    openProject,
    deleteProject,
    manualSave,
    saveCopy,
    isSaving,
    saveError,
    lastSaveTime,
  };
}
