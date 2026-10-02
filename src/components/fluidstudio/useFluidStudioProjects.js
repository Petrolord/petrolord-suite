// Fluid Studio project lifecycle on the shared Studio-shell persistence
// convention (createSavedProjectsService + StudioProjectManager +
// StudioAutoSave), following the ScalStudioContext recipe. The page owns the
// single `inputs` state object, so this stays a hook rather than a context.
//
// Payload shape: { name, schema: 2, inputs, pvt, modified }. `inputs` holds
// the whole model (fluid inputs, identification, input sources, the unit
// system and the saved tuning record); `pvt` is the pvt-1 contract block of
// the fluid as last saved, which other apps read by project id
// (src/lib/pvtSource.js). Schema 1 rows (no `pvt`, no identification) and
// rows written by the pre-shell SaveProjectDialog (the raw inputs object as
// inputs_data) open unchanged: what they never had prints as n/a.
//
// Record sharing (docs/scope/OrgSharing-DESIGN-AND-STATUS.md, Reservoir
// tables since migration 20261002130000): when the page passes a sharing
// store, the picker lists the user's own projects and then those colleagues
// shared with the organisation; a project opens with its sharing state; a
// save goes through the store (the version the editor opened at, so a newer
// save by someone else is refused with the reason) and happens only while
// the user may write (the owner, or the colleague holding the check-out).
// Without a store the hook saves as it always did.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { useRecordSharing } from '@/lib/recordSharing/useRecordSharing';
import { copyName, isRecordConflict } from '@/lib/recordSharing/rules';

const TABLE = 'saved_fluid_studio_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save Fluid Studio projects.',
});

// A missing table means the migration hasn't been deployed yet. Match the
// precise undefined_table code (42P01) or a message naming THIS relation, so
// unrelated errors still surface their real cause.
export const friendlyError = (error) => {
  const msg = error?.message || '';
  const missingTable = error?.code === '42P01' || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist`, 'i').test(msg);
  if (missingTable) {
    return 'Saving isn\'t set up yet. Run the create_saved_fluid_studio_projects migration.';
  }
  return msg || 'Unexpected error.';
};

/** Restore inputs from a payload, accepting both shell and legacy rows. */
export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.inputs && typeof payload.inputs === 'object') return payload.inputs;
  // Legacy pre-shell row: inputs_data was the raw inputs object itself.
  return payload;
};

export const PROJECT_SCHEMA = 2;
export const FLUID_PROJECTS_TABLE = TABLE;

/**
 * @param {{inputs: object, setInputs: function, extra?: function(string, string): object,
 *   sharingStore?: ?object}} a
 *   `extra(projectId, projectName)` returns the payload keys saved beside the
 *   inputs (the pvt-1 block). `sharingStore` is a record sharing store
 *   (supabaseSharingStore() on the page; a memory store in tests); null keeps
 *   the plain owner-only saves.
 */
export function useFluidStudioProjects({ inputs, setInputs, extra, sharingStore = null }) {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [projectRow, setProjectRow] = useState(null); // the open record's row: owner and sharing state
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  const sharing = useRecordSharing({
    store: sharingStore,
    table: TABLE,
    record: projectRow,
    onChange: (next) => setProjectRow((prev) => (prev ? { ...prev, ...next } : prev)),
  });
  const userId = sharing.userId;
  const viewingShared = !!projectRow && !!userId && !!projectRow.user_id && projectRow.user_id !== userId;
  const ownProjects = useMemo(() => projects.filter((p) => !p.userId || !userId || p.userId === userId), [projects, userId]);
  const sharedProjects = useMemo(() => projects.filter((p) => p.userId && userId && p.userId !== userId), [projects, userId]);

  const extraRef = useRef(extra);
  extraRef.current = extra;
  const payloadFor = useCallback((id, name) => ({
    id,
    name,
    schema: PROJECT_SCHEMA,
    inputs,
    ...(extraRef.current ? extraRef.current(id, name) : {}),
    modified: new Date().toISOString(),
  }), [inputs]);
  const serialize = useCallback((name) => payloadFor(currentProjectId, name), [currentProjectId, payloadFor]);

  const listProjects = useCallback(() => (sharingStore && service.listRows ? service.listRows() : service.list()), [sharingStore]);

  useEffect(() => {
    (async () => {
      try {
        setProjects(await listProjects());
      } catch (e) {
        console.error(e);
        addNotification(friendlyError(e), 'error');
      }
    })();
  }, [addNotification, listProjects]);

  // the row beside the payload, for the sharing state (null without a store)
  const readRow = useCallback(async (id) => {
    if (!sharingStore || !service.loadRow) return null;
    const got = await service.loadRow(id).catch(() => null);
    if (got?.row) sharingStore.trackOpened(TABLE, got.row);
    return got?.row ?? null;
  }, [sharingStore]);

  const createProject = useCallback(async (name, payloadInputs = null) => {
    const id = uuidv4();
    try {
      const payload = payloadFor(id, name);
      await service.save(id, payloadInputs ? { ...payload, inputs: payloadInputs } : payload);
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
      addNotification(friendlyError(e), 'error');
      return null;
    }
  }, [payloadFor, addNotification, listProjects, readRow]);

  const openProject = useCallback(async (id) => {
    try {
      let payload;
      let row = null;
      if (sharingStore && service.loadRow) {
        const got = await service.loadRow(id);
        payload = got?.payload ?? null;
        row = got?.row ?? null;
        if (row) sharingStore.trackOpened(TABLE, row);
      } else {
        payload = await service.load(id);
      }
      const restored = inputsFromPayload(payload);
      if (!restored) {
        addNotification('Project not found', 'error');
        return;
      }
      setCurrentProjectId(id);
      setProjectName(payload.name || projects.find((p) => p.id === id)?.name || 'Untitled project');
      setProjectRow(row);
      setInputs(restored);
      setHydrated(true);
      setSaveError(null);
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [projects, setInputs, addNotification, sharingStore]);

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
      addNotification(friendlyError(e), 'error');
    }
  }, [currentProjectId, addNotification, listProjects]);

  // One write path for the manual save and the autosave. With a sharing store
  // and a known row the save carries the version the editor opened at; a
  // refusal (a newer save, a colleague editing, view only) comes back as the
  // sentence to show. Returns { ok, message }.
  const canWrite = sharing.canWrite;
  const writeProject = useCallback(async (payload) => {
    if (sharingStore && projectRow) {
      if (!canWrite) return { ok: false, readOnly: true, message: sharing.readOnlyReason || 'This project is open read-only.' };
      const { data, error } = await sharingStore.update(TABLE, currentProjectId, {
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
      const res = await writeProject(serialize(projectName));
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
  }, [currentProjectId, projectName, serialize, addNotification, writeProject]);

  // "Save a copy": the fluid on screen as the user's own new project
  const saveCopy = useCallback(async () => {
    const name = copyName(projectName || 'Fluid project', projects.map((p) => p.name));
    return createProject(name);
  }, [projectName, projects, createProject]);

  // Debounced autosave (10 s), only once a project is open and hydrated, and
  // never while the record is open read-only.
  const autosaveRef = useRef(null);
  autosaveRef.current = { payload: () => serialize(projectName), write: writeProject };
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
  }, [inputs, currentProjectId, hydrated, canWrite, addNotification]);

  return {
    projects: sharingStore ? ownProjects : projects,
    sharedProjects,
    currentProjectId,
    projectName,
    projectRow,
    sharing,
    viewingShared,
    createProject,
    openProject,
    deleteProject,
    manualSave,
    saveCopy,
    isSaving,
    saveError,
    lastSaveTime,
    notifications,
    addNotification,
    removeNotification,
  };
}
