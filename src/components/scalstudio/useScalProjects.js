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
    const id = uuidv4();
    try {
      await service.save(id, serializeRef.current(id, name));
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
      const res = await writeProject(serializeRef.current(currentProjectId, projectName));
      if (!res.ok) {
        setSaveError(res.readOnly ? 'Read-only' : 'Save failed');
        addNotification(res.message, res.readOnly ? 'info' : 'error');
        return false;
      }
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

  // Debounced autosave (10 s), only once a project is open and hydrated, and
  // never while the record is open read-only.
  const autosaveRef = useRef(null);
  autosaveRef.current = { payload: () => serializeRef.current(currentProjectId, projectName), write: writeProject };
  useEffect(() => {
    if (!currentProjectId || !hydrated || !canWrite) return undefined;
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        const res = await autosaveRef.current.write(autosaveRef.current.payload());
        if (res.ok) {
          setLastSaveTime(new Date());
          setSaveError(null);
        } else if (!res.readOnly) {
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
  }, [changeKey, currentProjectId, hydrated, canWrite, addNotification]);

  return {
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
