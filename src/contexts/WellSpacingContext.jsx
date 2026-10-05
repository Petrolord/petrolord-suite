// Well Spacing Optimizer state and persistence (WS-U1 of the Reservoir
// upgrade round, docs/upgrade/WellSpacingOptimizer-UPGRADE.md). Before this
// round the page held its inputs in component state only: nothing was
// saved, a reload lost the study (gap matrix 4.13), and the results stayed
// on screen after an input changed until Calculate was pressed again.
//
// Persistence: saved_well_spacing_projects (migration 20261005010000, NOT
// APPLIED until the owner applies it) through createSavedProjectsService,
// under the record-sharing rules: the picker lists my projects, then those
// colleagues shared with the organisation; a colleague's project opens to
// view, or to edit while I hold its check-out. Until the table exists a save
// says so plainly and the study stays on screen.
//
// Results are one pure function of the inputs (runSpacingCases), recomputed
// on every edit: the screen, the report and the exports always describe the
// inputs on screen (RL8, RL12).
import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { useSharedSavedProjects } from '@/lib/recordSharing/useSharedSavedProjects';
import { setProvenanceField } from '@/lib/inputProvenance/model';
import { validateInputs, runSpacingCases } from '@/utils/wellSpacingCalculations';
import { wsUnits } from '@/utils/wellspacing/units';
import {
  defaultInputs, inputsFromPayload, projectPayload, blankForm, emptyIntakes, SAMPLE_FORM, SAMPLE_NOTE, CONTEXT_KEYS,
} from '@/utils/wellspacing/model';

export const TABLE = 'saved_well_spacing_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save Well Spacing projects.',
});

/** A missing table means the migration has not been applied on this database yet. */
export const isMissingTable = (error) => {
  const msg = error?.message || '';
  return error?.code === '42P01' || error?.code === 'PGRST205'
    || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist|Could not find the table[^\\n]*${TABLE}`, 'i').test(msg);
};
export const NOT_SWITCHED_ON = 'Saving is not switched on yet for the Well Spacing Optimizer on this database (the table is waiting to be applied). The study stays on this page; export the report or the CSV to keep a copy.';
export const friendlyError = (error) => (isMissingTable(error) ? NOT_SWITCHED_ON : (error?.message || 'Unexpected error.'));

/** Validation and the sweep of the inputs on screen; never throws. */
export function computeResults(form) {
  const v = validateInputs(form);
  if (!v.ok) return { results: null, errors: v.errors };
  try {
    return { results: runSpacingCases(form), errors: [] };
  } catch (e) {
    return { results: null, errors: [e?.message || 'The spacing cases could not be evaluated.'] };
  }
}

const WellSpacingContext = createContext(null);

export const useWellSpacing = () => {
  const ctx = useContext(WellSpacingContext);
  if (!ctx) throw new Error('useWellSpacing must be used within a WellSpacingProvider');
  return ctx;
};

/**
 * @param {{children: any, sharingStore?: ?object, profileSystem?: ?('oilfield'|'si'), organizationName?: ?string, initialInputs?: ?object}} props
 */
export const WellSpacingProvider = ({ children, sharingStore = null, profileSystem = null, organizationName = null, initialInputs = null }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();
  const [inputs, setInputs] = useState(() => initialInputs || defaultInputs(profileSystem));
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSavingAvailable] = useState({ available: true, reason: null });
  const shared = useSharedSavedProjects({ table: TABLE, service, sharingStore });
  const [projectRows, setProjectRows] = useState([]);
  const canWrite = shared.canWrite;

  // a new workspace follows the profile once it is known (a saved project keeps its own)
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current && !currentProjectId && profileSystem) setInputs((prev) => ({ ...prev, unitSystem: profileSystem === 'si' ? 'si' : 'oilfield' }));
  }, [profileSystem, currentProjectId]);
  const edit = useCallback((fn) => { touched.current = true; setInputs(fn); }, []);

  // --- derived: one pure function of the inputs ---
  const { results, errors } = useMemo(() => computeResults(inputs.form), [inputs.form]);
  const u = useMemo(() => wsUnits(inputs.unitSystem), [inputs.unitSystem]);

  // --- input actions ---
  const setUnitSystem = useCallback((system) => edit((prev) => ({ ...prev, unitSystem: system === 'si' ? 'si' : 'oilfield' })), [edit]);
  /** A form input, stored in oilfield units as a string. */
  const setFormField = useCallback((key, value) => edit((prev) => ({ ...prev, form: { ...prev.form, [key]: value } })), [edit]);
  const setFormFields = useCallback((patch) => edit((prev) => ({ ...prev, form: { ...prev.form, ...patch } })), [edit]);
  const setInputMetaField = useCallback((key, field, value) => edit((prev) => ({ ...prev, inputMeta: setProvenanceField(prev.inputMeta || {}, key, field, value) })), [edit]);
  // WS-U2-004: the case the ws-case-1 sender sends ({ spacing, start }), saved with the project
  const setSenderField = useCallback((key, value) => edit((prev) => ({ ...prev, sender: { ...(prev.sender || {}), [key]: value } })), [edit]);
  const setIdentificationField = useCallback((key, value) => edit((prev) => ({ ...prev, identification: { ...(prev.identification || {}), [key]: value } })), [edit]);

  const loadSample = useCallback(() => {
    edit((prev) => ({ ...prev, form: { ...blankForm(), ...SAMPLE_FORM }, context: Object.fromEntries(CONTEXT_KEYS.map((k) => [k, ''])), intakes: emptyIntakes(), sampleNote: SAMPLE_NOTE }));
    addNotification('Sample loaded: an illustrative example field (not a real field).', 'success');
  }, [edit, addNotification]);
  const clearInputs = useCallback(() => {
    edit((prev) => ({ ...prev, form: blankForm(), context: Object.fromEntries(CONTEXT_KEYS.map((k) => [k, ''])), intakes: emptyIntakes(), sampleNote: null }));
  }, [edit]);

  /**
   * Take an intake: the values it carries land in the form or the context,
   * the record is kept with the project, and a key another intake had given
   * moves to this one (the last intake taken is the source of a value).
   */
  const takeIntake = useCallback((kind, res) => {
    edit((prev) => {
      const keys = new Set(res.intake.fields);
      const intakes = {};
      for (const [k, it] of Object.entries(prev.intakes || {})) {
        if (k === kind || !it) { intakes[k] = it || null; continue; }
        if (!it.fields) { intakes[k] = it; continue; }
        const fields = it.fields.filter((f) => !keys.has(f));
        intakes[k] = fields.length || k === 'wells' ? { ...it, fields, values: Object.fromEntries(Object.entries(it.values || {}).filter(([f]) => !keys.has(f))) } : null;
      }
      intakes[kind] = res.intake;
      return {
        ...prev,
        form: { ...prev.form, ...(res.patch || {}) },
        context: { ...prev.context, ...(res.context || {}) },
        intakes,
        sampleNote: prev.sampleNote ? `${SAMPLE_NOTE} Some values have since been taken from other apps.` : null,
      };
    });
  }, [edit]);
  const clearIntake = useCallback((kind) => edit((prev) => ({ ...prev, intakes: { ...prev.intakes, [kind]: null } })), [edit]);

  // --- project lifecycle, with record sharing ---
  const serialize = useCallback((name, id = currentProjectId) => projectPayload({ id, name, inputs }), [currentProjectId, inputs]);

  const refresh = useCallback(async () => {
    const list = await shared.refreshList();
    setProjectRows(list);
    return list;
  }, [shared]);

  useEffect(() => {
    (async () => {
      try {
        await refresh();
        setSavingAvailable({ available: true, reason: null });
      } catch (e) {
        if (isMissingTable(e)) setSavingAvailable({ available: false, reason: NOT_SWITCHED_ON });
        else if (!/sign in/i.test(e?.message || '')) console.error(e);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const myId = shared.sharing.userId;
  const projects = useMemo(() => projectRows.filter((p) => !sharingStore || !myId || !p.userId || p.userId === myId), [projectRows, sharingStore, myId]);
  const sharedProjects = useMemo(() => (sharingStore && myId ? projectRows.filter((p) => p.userId && p.userId !== myId) : []), [projectRows, sharingStore, myId]);

  const createProject = useCallback(async (name) => {
    const id = uuidv4();
    try {
      await service.save(id, projectPayload({ id, name, inputs }));
      await shared.adoptRow(id);
      setCurrentProjectId(id);
      setProjectName(name);
      setHydrated(true);
      setLastSaveTime(new Date());
      setSaveError(null);
      await refresh();
      addNotification(`Project "${name}" created`, 'success');
    } catch (e) {
      if (isMissingTable(e)) setSavingAvailable({ available: false, reason: NOT_SWITCHED_ON });
      addNotification(friendlyError(e), 'error');
    }
  }, [inputs, shared, refresh, addNotification]);

  const openProject = useCallback(async (id) => {
    try {
      const payload = await shared.loadForOpen(id);
      const restored = inputsFromPayload(payload);
      if (!restored) {
        addNotification('Project not found', 'error');
        return;
      }
      touched.current = true;
      setCurrentProjectId(id);
      setProjectName(payload.name || projectRows.find((p) => p.id === id)?.name || 'Untitled project');
      setInputs(restored);
      setHydrated(true);
      setSaveError(null);
    } catch (e) {
      addNotification(friendlyError(e), 'error');
    }
  }, [shared, projectRows, addNotification]);

  const deleteProject = useCallback(async (id) => {
    try {
      await service.remove(id);
      if (id === currentProjectId) {
        setCurrentProjectId(null);
        setProjectName('');
        setHydrated(false);
        setLastSaveTime(null);
        shared.close();
      }
      await refresh();
      addNotification('Project deleted', 'info');
    } catch (e) {
      addNotification(friendlyError(e), 'error');
    }
  }, [currentProjectId, shared, refresh, addNotification]);

  const writeNow = useCallback(async () => {
    const res = await shared.write(currentProjectId, serialize(projectName));
    if (res.ok) { setLastSaveTime(new Date()); setSaveError(null); } else if (!res.readOnly) { setSaveError('Save failed'); addNotification(res.message || 'Save failed', 'error'); }
    return res;
  }, [shared, currentProjectId, serialize, projectName, addNotification]);

  /** Save now. @returns {Promise<boolean>} whether the project was written */
  const manualSave = useCallback(async () => {
    if (!currentProjectId) {
      addNotification(saving.available ? 'Create or open a project first' : NOT_SWITCHED_ON, 'info');
      return false;
    }
    if (!canWrite) {
      addNotification(shared.sharing.readOnlyReason || 'This project is open read-only.', 'info');
      return false;
    }
    setIsSaving(true);
    try {
      const res = await writeNow();
      return !!res.ok;
    } catch (e) {
      setSaveError('Save failed');
      addNotification(friendlyError(e), 'error');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [currentProjectId, canWrite, shared, writeNow, addNotification, saving.available]);

  /** "Save a copy": the project on screen as my own new project. */
  const saveCopy = useCallback(async () => {
    const name = shared.copyNameFor(projectName || 'Well spacing study');
    const id = uuidv4();
    try {
      await service.save(id, projectPayload({ id, name, inputs }));
      await refresh();
      await openProject(id);
      addNotification(`Saved a copy as "${name}"`, 'success');
      return id;
    } catch (e) {
      addNotification(`Could not save a copy: ${friendlyError(e)}`, 'error');
      return null;
    }
  }, [shared, projectName, inputs, refresh, openProject, addNotification]);

  // debounced autosave (10 s), only once a project is open and hydrated, never read-only
  const autosaveRef = useRef(null);
  autosaveRef.current = writeNow;
  useEffect(() => {
    if (!currentProjectId || !hydrated || !canWrite) return undefined;
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await autosaveRef.current();
      } catch (e) {
        setSaveError('Auto-save failed');
      } finally {
        setIsSaving(false);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [inputs, currentProjectId, hydrated, canWrite]);

  const value = {
    inputs,
    results,
    errors,
    u,
    organizationName,
    setUnitSystem,
    setFormField,
    setFormFields,
    setInputMetaField,
    setIdentificationField,
    setSenderField,
    loadSample,
    clearInputs,
    takeIntake,
    clearIntake,
    projects,
    sharedProjects,
    currentProjectId,
    projectName,
    projectRow: shared.projectRow,
    sharing: shared.sharing,
    viewingShared: shared.viewingShared,
    canWrite,
    savingAvailable: saving.available,
    savingReason: saving.reason,
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
  return <WellSpacingContext.Provider value={value}>{children}</WellSpacingContext.Provider>;
};
