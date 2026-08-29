// Saved-project lifecycle for Studio-shell apps (Economics E2).
//
// `createSavedProjectsService` (src/utils/savedProjects.js) already owns the
// TRANSPORT half of the studio-kit persistence convention. The other half -
// the list/create/open/delete/save/autosave state machine around it - had
// been hand-copied into roughly twenty app contexts, identically each time,
// down to the ten second autosave and the "Auto-save failed" string. E2
// needed it three more times, so it lives here now.
//
// The app supplies only the two things that are genuinely its own: how to
// serialize its inputs, and how to restore them.
import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

/**
 * Turn a Postgres "relation does not exist" into a sentence that tells the
 * user what to do about it, rather than showing them the raw error.
 *
 * A missing table is the ONE persistence failure that is not the user's
 * fault and not transient: the migration has not been applied yet.
 */
export const missingTableMessage = (error, tableName, migrationName) => {
  const msg = error?.message || '';
  const missing = error?.code === '42P01'
    || new RegExp(`relation[^\\n]*${tableName}[^\\n]*does not exist`, 'i').test(msg);
  if (missing) return `Saving isn't set up yet. Run the ${migrationName} migration.`;
  return msg || 'Unexpected error.';
};

/**
 * @param {object} p
 * @param {object} p.service a createSavedProjectsService instance
 * @param {(name: string) => object} p.serialize build the payload to store
 * @param {(payload: object) => boolean} p.restore apply a loaded payload;
 *   return false when the payload cannot be read, so the caller is told
 *   rather than silently left on the old state
 * @param {(msg: string, kind?: string) => void} p.addNotification
 * @param {(error: Error) => string} [p.describeError] map an error to a message
 * @param {unknown} p.watch the input state; a change to it arms the autosave
 * @param {string} [p.noun] what one saved item is called, for the messages
 * @param {number} [p.autosaveMs]
 */
export function useSavedProjects({
  service,
  serialize,
  restore,
  addNotification,
  describeError = (e) => e?.message || 'Unexpected error.',
  watch,
  noun = 'Project',
  autosaveMs = 10000,
}) {
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  const lower = noun.toLowerCase();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await service.list();
        if (!cancelled) setProjects(list);
      } catch (e) {
        // A signed-out visitor hits this on every mount. It is a fact about
        // the session, not a fault, so it is not shouted about.
        if (!cancelled) setProjects([]);
      }
    })();
    return () => { cancelled = true; };
  }, [service]);

  const refresh = useCallback(async () => {
    try {
      setProjects(await service.list());
    } catch (e) {
      addNotification(describeError(e), 'error');
    }
  }, [service, addNotification, describeError]);

  const createProject = useCallback(async (name) => {
    const id = uuidv4();
    try {
      await service.save(id, { ...serialize(name), id });
      setCurrentProjectId(id);
      setProjectName(name);
      setHydrated(true);
      setLastSaveTime(new Date());
      setSaveError(null);
      await refresh();
      addNotification(`${noun} "${name}" created`, 'success');
    } catch (e) {
      addNotification(describeError(e), 'error');
    }
  }, [service, serialize, refresh, addNotification, describeError, noun]);

  const openProject = useCallback(async (id) => {
    try {
      const payload = await service.load(id);
      if (restore(payload) === false) {
        addNotification(`${noun} could not be read`, 'error');
        return;
      }
      setCurrentProjectId(id);
      setProjectName(payload?.name || 'Untitled');
      setHydrated(true);
      setSaveError(null);
    } catch (e) {
      addNotification(describeError(e), 'error');
    }
  }, [service, restore, addNotification, describeError, noun]);

  const deleteProject = useCallback(async (id) => {
    try {
      await service.remove(id);
      if (id === currentProjectId) {
        setCurrentProjectId(null);
        setProjectName('');
        setHydrated(false);
        setLastSaveTime(null);
      }
      await refresh();
      addNotification(`${noun} deleted`, 'info');
    } catch (e) {
      addNotification(describeError(e), 'error');
    }
  }, [service, currentProjectId, refresh, addNotification, describeError, noun]);

  const manualSave = useCallback(async () => {
    if (!currentProjectId) {
      addNotification(`Create or open a ${lower} first`, 'info');
      return;
    }
    setIsSaving(true);
    try {
      await service.save(currentProjectId, serialize(projectName));
      setLastSaveTime(new Date());
      setSaveError(null);
    } catch (e) {
      setSaveError('Save failed');
      addNotification(describeError(e), 'error');
    } finally {
      setIsSaving(false);
    }
  }, [service, currentProjectId, projectName, serialize, addNotification, describeError, lower]);

  // The autosave reads the LATEST serializer through a ref, so a change to
  // the inputs restarts the timer without also restarting it on every
  // re-render that merely re-creates the closure.
  const payloadRef = useRef(null);
  payloadRef.current = () => serialize(projectName);
  useEffect(() => {
    if (!currentProjectId || !hydrated) return undefined;
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await service.save(currentProjectId, payloadRef.current());
        setLastSaveTime(new Date());
        setSaveError(null);
      } catch (e) {
        setSaveError('Auto-save failed');
      } finally {
        setIsSaving(false);
      }
    }, autosaveMs);
    return () => clearTimeout(timer);
  }, [watch, currentProjectId, hydrated, service, autosaveMs]);

  return {
    projects,
    currentProjectId,
    projectName,
    hydrated,
    isSaving,
    saveError,
    lastSaveTime,
    createProject,
    openProject,
    deleteProject,
    manualSave,
  };
}
