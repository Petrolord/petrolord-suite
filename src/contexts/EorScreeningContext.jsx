// EOR Screening state and persistence (EOR-U1 of the Reservoir upgrade
// round, docs/upgrade/EorScreening-UPGRADE.md). Before this round the page
// held its inputs in component state only: nothing was saved, a reload lost
// the screening (gap matrix 4.11, RL12).
//
// Persistence: saved_eor_screening_projects (migration 20261004220000, NOT
// APPLIED until the owner applies it) through createSavedProjectsService,
// under the record-sharing rules: the picker lists my projects, then those
// colleagues shared with the organisation; a colleague's project opens to
// view, or to edit while I hold its check-out. Until the table exists a save
// says so plainly and the screening stays on screen.
//
// Payload { id, name, schema: 1, inputs, modified }: inputs only, in
// oilfield units always (the units the criteria are published in);
// results are recomputed on load by the engine (screenAllMethods), the one
// model of the screen and the report.
import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { useSharedSavedProjects } from '@/lib/recordSharing/useSharedSavedProjects';
import { setProvenanceField } from '@/lib/inputProvenance/model';
import { screenAllMethods, engineInputOf, sampleEorScreeningData } from '@/utils/eorScreeningCalculations';
import { eorUnits } from '@/utils/eor/units';
import { buildEorScreenRecord } from '@/lib/eorScreenSource';
import { eorMmpCheck } from '@/utils/eor/mmp';
import { remainingOilEstimate } from '@/utils/eor/remainingOil';

export const TABLE = 'saved_eor_screening_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save EOR Screening projects.',
});

/** A missing table means the migration has not been applied on this database yet. */
export const isMissingTable = (error) => {
  const msg = error?.message || '';
  return error?.code === '42P01' || error?.code === 'PGRST205'
    || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist|Could not find the table[^\\n]*${TABLE}`, 'i').test(msg);
};
export const NOT_SWITCHED_ON = 'Saving is not switched on yet for EOR Screening on this database (the table is waiting to be applied). The screening stays on this page; export the report to keep a copy.';
export const friendlyError = (error) => (isMissingTable(error) ? NOT_SWITCHED_ON : (error?.message || 'Unexpected error.'));

/** The screening inputs, in oilfield units, as strings (blank: not given). */
export const FORM_KEYS = Object.freeze(['gravityApi', 'viscosityCp', 'oilSatPct', 'formation', 'netThicknessFt', 'permeabilityMd', 'depthFt', 'temperatureF']);
/** Context values: printed, never screened by Taber 1997. */
export const CONTEXT_KEYS = Object.freeze(['reservoirPressurePsia', 'saturationPressurePsia', 'ooipStb', 'volatilesMolPct', 'intermediatesMolPct', 'swiPct']);

export const SAMPLE_NOTE = 'Sample inputs: an illustrative West-Texas-style carbonate CO2 candidate built into the app. It is not a real field; replace every value before you rely on the screening.';

const asStrings = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, v == null ? '' : String(v)]));
const blankForm = () => Object.fromEntries(FORM_KEYS.map((k) => [k, '']));

export const defaultInputs = (unitSystem = 'oilfield', { sample = true } = {}) => ({
  form: sample ? { ...blankForm(), ...asStrings(sampleEorScreeningData()) } : blankForm(),
  context: Object.fromEntries(CONTEXT_KEYS.map((k) => [k, ''])),
  unitSystem: unitSystem === 'si' ? 'si' : 'oilfield',
  depthReference: '',
  identification: {},
  inputMeta: {},
  intakes: { pvt: null, wta: null, mbal: null },
  sampleNote: sample ? SAMPLE_NOTE : null,
});

/** Restore inputs from a payload, tolerating missing keys. */
export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  const base = defaultInputs('oilfield', { sample: false });
  return {
    ...base,
    form: { ...base.form, ...asStrings(raw.form) },
    context: { ...base.context, ...asStrings(raw.context) },
    unitSystem: raw.unitSystem === 'si' ? 'si' : 'oilfield',
    depthReference: typeof raw.depthReference === 'string' ? raw.depthReference : '',
    identification: raw.identification && typeof raw.identification === 'object' ? raw.identification : {},
    inputMeta: raw.inputMeta && typeof raw.inputMeta === 'object' ? raw.inputMeta : {},
    intakes: { ...base.intakes, ...(raw.intakes && typeof raw.intakes === 'object' ? raw.intakes : {}) },
    sampleNote: raw.sampleNote || null,
  };
};

export const projectPayload = ({ id, name, inputs }) => ({ id, name, schema: 1, inputs, modified: new Date().toISOString() });

const EorScreeningContext = createContext(null);

export const useEorScreening = () => {
  const ctx = useContext(EorScreeningContext);
  if (!ctx) throw new Error('useEorScreening must be used within an EorScreeningProvider');
  return ctx;
};

/**
 * @param {{children: any, sharingStore?: ?object, profileSystem?: ?('oilfield'|'si'), organizationName?: ?string, initialInputs?: ?object}} props
 */
export const EorScreeningProvider = ({ children, sharingStore = null, profileSystem = null, organizationName = null, initialInputs = null }) => {
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
  const engineInput = useMemo(() => engineInputOf(inputs.form), [inputs.form]);
  const results = useMemo(() => screenAllMethods(engineInput), [engineInput]);
  const u = useMemo(() => eorUnits(inputs.unitSystem), [inputs.unitSystem]);
  // EOR-U2-001: the CO2 MMP check against the reservoir pressure (beside the Taber verdicts, never changing them)
  const mmp = useMemo(() => eorMmpCheck(inputs), [inputs]);
  // EOR-U2-005: remaining oil saturation from the mbal-1 and pvt-1 intakes and a stated Swi
  const remainingOil = useMemo(() => remainingOilEstimate(inputs), [inputs]);
  // EOR-U2-003: the eor-screen-1 record a reader would build from these inputs (same engine, same fingerprint)
  const screenRecord = useMemo(() => buildEorScreenRecord({ inputs, projectId: currentProjectId, projectName, now: '' }), [inputs, currentProjectId, projectName]);

  // --- input actions ---
  const setUnitSystem = useCallback((system) => edit((prev) => ({ ...prev, unitSystem: system === 'si' ? 'si' : 'oilfield' })), [edit]);
  /** A screening input, stored in oilfield units. A typed value ends the sample label. */
  const setFormField = useCallback((key, value) => edit((prev) => ({ ...prev, form: { ...prev.form, [key]: value } })), [edit]);
  const setContextField = useCallback((key, value) => edit((prev) => ({ ...prev, context: { ...prev.context, [key]: value } })), [edit]);
  const setInputMetaField = useCallback((key, field, value) => edit((prev) => ({ ...prev, inputMeta: setProvenanceField(prev.inputMeta || {}, key, field, value) })), [edit]);
  const setIdentificationField = useCallback((key, value) => edit((prev) => ({ ...prev, identification: { ...(prev.identification || {}), [key]: value } })), [edit]);
  const setDepthReference = useCallback((value) => edit((prev) => ({ ...prev, depthReference: value })), [edit]);

  const loadSample = useCallback(() => {
    edit((prev) => ({ ...prev, form: { ...blankForm(), ...asStrings(sampleEorScreeningData()) }, intakes: { pvt: null, wta: null, mbal: null }, sampleNote: SAMPLE_NOTE }));
    addNotification('Sample loaded: an illustrative carbonate CO2 candidate (not a real field).', 'success');
  }, [edit, addNotification]);
  const clearInputs = useCallback(() => {
    edit((prev) => ({ ...prev, form: blankForm(), context: Object.fromEntries(CONTEXT_KEYS.map((k) => [k, ''])), intakes: { pvt: null, wta: null, mbal: null }, sampleNote: null }));
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
        const fields = (it.fields || []).filter((f) => !keys.has(f));
        intakes[k] = fields.length ? { ...it, fields, values: Object.fromEntries(Object.entries(it.values || {}).filter(([f]) => !keys.has(f))) } : null;
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
  /** EOR-U2-005: put the material balance estimate in the oil saturation, with its method as the source. */
  const useRemainingOil = useCallback(() => {
    const r = remainingOilEstimate(inputs);
    if (!r.ok) return false;
    edit((prev) => ({
      ...prev,
      form: { ...prev.form, oilSatPct: String(parseFloat(r.soPct.toPrecision(4))) },
      inputMeta: { ...(prev.inputMeta || {}), oilSatPct: { source: 'correlation', correlation: r.method } },
    }));
    return true;
  }, [inputs, edit]);
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
    const name = shared.copyNameFor(projectName || 'EOR screening');
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
    engineInput,
    results,
    screenRecord,
    mmp,
    remainingOil,
    useRemainingOil,
    u,
    organizationName,
    setUnitSystem,
    setFormField,
    setContextField,
    setInputMetaField,
    setIdentificationField,
    setDepthReference,
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
  return <EorScreeningContext.Provider value={value}>{children}</EorScreeningContext.Provider>;
};
