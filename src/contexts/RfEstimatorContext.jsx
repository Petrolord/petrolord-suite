// Recovery Factor Estimator state + persistence on the shared Studio-shell
// convention (docs/scope/RecoveryFactorEstimator-STATUS.md):
// createSavedProjectsService + hydrated guard + 10 s debounced autosave.
// Results are a pure function of inputs (src/utils/rfestimator/workspace.js
// deriveRf) and are recomputed on load, never stored.
//
// RF-U1: payload version 2 (src/utils/rfestimator/model.js) with the report
// identification, input sources, the display unit system, the pvt-1 intake
// and the in-place intake; record sharing (saved_rf_projects is under the
// sharing rules of 20261002130000): own projects, then those shared with me,
// view only or edit with the check-out.
import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { useSharedSavedProjects } from '@/lib/recordSharing/useSharedSavedProjects';
import { setProvenanceField, serializeProvenance, deserializeProvenance } from '@/lib/inputProvenance';
import {
  RF_PAYLOAD_VERSION, RF_PROJECTS_TABLE, DEFAULT_DRIVE, DEFAULT_IDENTIFICATION,
  defaultInputs as modelDefaultInputs, inputsFromPayload as modelInputsFromPayload, migrateRfPayload, sampleInputs, zKeptNote,
} from '@/utils/rfestimator/model';
import { deriveRf } from '@/utils/rfestimator/workspace';
import { rfUnits } from '@/utils/rfestimator/units';
import { rfRecordOf } from '@/utils/rfestimator/rfRecord';
import { drawSeed } from '@/utils/rfestimator/uncertainty';

const TABLE = RF_PROJECTS_TABLE;

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save Recovery Factor projects.',
});

// A missing table means the migration has not been deployed yet. Match the
// undefined_table code (42P01) or a message naming THIS relation, so
// unrelated errors still surface their real cause.
export const friendlyError = (error) => {
  const msg = error?.message || '';
  const missingTable = error?.code === '42P01' || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist`, 'i').test(msg);
  if (missingTable) {
    return "Saving isn't set up yet. Run the create_saved_rf_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = modelDefaultInputs;
export const inputsFromPayload = modelInputsFromPayload;

const RfEstimatorContext = createContext();

export const useRfEstimator = () => {
  const context = useContext(RfEstimatorContext);
  if (!context) throw new Error('useRfEstimator must be used within an RfEstimatorProvider');
  return context;
};

export const RfEstimatorProvider = ({ children, sharingStore = null, profileSystem = null, build = null }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  const shared = useSharedSavedProjects({ table: TABLE, service, sharingStore });
  const canWrite = shared.canWrite;

  const [inputs, setInputs] = useState(defaultInputs);
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [identification, setIdentification] = useState(DEFAULT_IDENTIFICATION);
  const [inputMeta, setInputMeta] = useState({});
  const [unitSystemSaved, setUnitSystemSaved] = useState(null); // null: follows the Suite unit profile
  const unitSystem = unitSystemSaved === 'si' || unitSystemSaved === 'oilfield' ? unitSystemSaved : (profileSystem === 'si' ? 'si' : 'oilfield');
  const u = useMemo(() => rfUnits(unitSystem), [unitSystem]);
  const [pvtIntake, setPvtIntake] = useState(null);
  const [inPlaceIntake, setInPlaceIntake] = useState(null);
  const [dcaCheck, setDcaCheck] = useState(null); // RF-U2-014: decline forecasts taken as a cross-check
  const [migration, setMigration] = useState(null);

  // --- Derived analysis (pure functions of inputs) ---
  const derived = useMemo(() => deriveRf(inputs, { inPlaceIntake, pvtIntake }), [inputs, inPlaceIntake, pvtIntake]);
  const { drives, inPlace, result } = derived;

  // Any edit of a value moves the case off the sample (the untouched sample
  // values still print as sample values, model.sampleKeysInUse).
  const edit = useCallback((fn) => setInputs((prev) => fn(prev)), []);

  // --- Input actions ---
  const switchPhase = useCallback((phase) => {
    const p = phase === 'gas' ? 'gas' : 'oil';
    edit((prev) => ({ ...prev, phase: p, method: 'analog', driveCode: DEFAULT_DRIVE[p] }));
    setInPlaceIntake((prev) => (prev && ((prev.unit === 'scf') !== (p === 'gas')) ? null : prev));
  }, [edit]);

  const setMethod = useCallback((method) => edit((prev) => ({ ...prev, method })), [edit]);
  const setZMethod = useCallback((zMethod) => edit((prev) => ({ ...prev, zMethod })), [edit]);
  const setDriveCode = useCallback((driveCode) => edit((prev) => ({ ...prev, driveCode })), [edit]);
  const setInPlaceMode = useCallback((inPlaceMode) => edit((prev) => ({ ...prev, inPlaceMode: inPlaceMode === 'direct' ? 'direct' : 'volumetric' })), [edit]);
  const setOoipDirect = useCallback((value) => edit((prev) => ({ ...prev, ooipDirect: value, origin: 'entered' })), [edit]);
  const setVolField = useCallback((key, value) => edit((prev) => ({ ...prev, vol: { ...prev.vol, [key]: value }, origin: prev.origin === 'sample' ? 'sample-edited' : prev.origin })), [edit]);
  const setCorrField = useCallback((key, value) => edit((prev) => ({ ...prev, corr: { ...prev.corr, [key]: value }, origin: prev.origin === 'sample' ? 'sample-edited' : prev.origin })), [edit]);
  // RF-U2-002: the uncertainty run. Switching it on draws a seed when none is held, so the run is reproducible.
  const setMcField = useCallback((key, value) => edit((prev) => ({ ...prev, mc: { ...prev.mc, [key]: value } })), [edit]);
  const setMcEnabled = useCallback((on) => edit((prev) => ({
    ...prev, mc: { ...prev.mc, enabled: !!on, seed: on && !String(prev.mc?.seed ?? '').trim() ? String(drawSeed()) : prev.mc?.seed },
  })), [edit]);
  const newMcSeed = useCallback(() => edit((prev) => ({ ...prev, mc: { ...prev.mc, seed: String(drawSeed()) } })), [edit]);
  const setIdentificationField = useCallback((k, v) => setIdentification((prev) => ({ ...prev, [k]: v })), []);
  const setInputSource = useCallback((key, field, value) => setInputMeta((prev) => setProvenanceField(prev, key, field, value)), []);
  const setUnitSystem = useCallback((sys) => setUnitSystemSaved(sys === 'si' ? 'si' : 'oilfield'), []);

  /** A pvt-1 intake: values land in the method and volumetric inputs, the record is kept. */
  const takePvt = useCallback((patch, intake) => {
    // RF-U2-003: z or Bgi taken from Fluid Systems Studio are used as received (typed method)
    const takesZ = ['zi', 'za'].some((k) => patch?.corr?.[k] != null) || patch?.vol?.bgi != null;
    edit((prev) => ({
      ...prev,
      ...(takesZ ? { zMethod: 'typed' } : {}),
      corr: { ...prev.corr, ...(patch?.corr || {}) },
      vol: { ...prev.vol, ...(patch?.vol || {}) },
      origin: prev.origin === 'sample' ? 'sample-edited' : prev.origin,
    }));
    setPvtIntake(intake || null);
  }, [edit]);

  /** An in-place intake (mbal-1 or a ReservoirCalc Pro project): held as a direct entry with its record. */
  const takeInPlace = useCallback((value, intake) => {
    edit((prev) => ({ ...prev, inPlaceMode: 'direct', ooipDirect: String(value), origin: prev.origin === 'sample' ? 'sample-edited' : prev.origin }));
    setInPlaceIntake(intake || null);
  }, [edit]);
  const clearInPlaceIntake = useCallback(() => setInPlaceIntake(null), []);

  const loadSample = useCallback(() => {
    setInputs(sampleInputs());
    setPvtIntake(null);
    setInPlaceIntake(null);
    setDcaCheck(null);
    addNotification('Sample loaded: a water-drive oil case. Its values are labelled as sample values until you replace them.', 'success');
  }, [addNotification]);

  // --- Project lifecycle ---
  const serialize = useCallback((name, idOverride = null) => ({
    id: currentProjectId,
    name,
    schema: 1,
    payloadVersion: RF_PAYLOAD_VERSION,
    inputs,
    identification,
    inputMeta: serializeProvenance(inputMeta),
    unitSystem,
    pvtIntake,
    inPlaceIntake,
    dcaCheck,
    // RF-U2-001: the rf-1 record of the estimate on screen, read by id by ReservoirCalc Pro
    rf: rfRecordOf({ inputs, derived, identification, inPlaceIntake }, { projectId: idOverride || currentProjectId, projectName: name }),
    modified: new Date().toISOString(),
  }), [currentProjectId, inputs, identification, inputMeta, unitSystem, pvtIntake, inPlaceIntake, dcaCheck, derived]);

  const hydrate = useCallback((raw) => {
    const payload = migrateRfPayload(raw);
    const restored = modelInputsFromPayload(payload);
    if (!restored) return false;
    setInputs(restored);
    setIdentification({ ...DEFAULT_IDENTIFICATION, ...(payload.identification || {}) });
    setInputMeta(deserializeProvenance(payload.inputMeta));
    setUnitSystemSaved(payload.unitSystem === 'si' || payload.unitSystem === 'oilfield' ? payload.unitSystem : null);
    setPvtIntake(payload.pvtIntake || null);
    setInPlaceIntake(payload.inPlaceIntake || null);
    setDcaCheck(payload.dcaCheck || null);
    const zNote = zKeptNote(raw);
    setMigration(payload.migratedFrom || zNote ? { from: payload.migratedFrom || null, note: payload.apiBasisNote || null, zNote } : null);
    return true;
  }, []);

  const refreshProjects = useCallback(async () => {
    const list = await shared.refreshList();
    setProjects(list);
    return list;
  }, [shared.refreshList]); // eslint-disable-line react-hooks/exhaustive-deps
  const myId = shared.sharing.userId;
  const ownProjects = useMemo(() => projects.filter((p) => !sharingStore || !myId || !p.userId || p.userId === myId), [projects, sharingStore, myId]);
  const sharedProjects = useMemo(() => (sharingStore && myId ? projects.filter((p) => p.userId && p.userId !== myId) : []), [projects, sharingStore, myId]);

  useEffect(() => {
    (async () => {
      try {
        await refreshProjects();
      } catch (e) {
        console.error(e);
        addNotification(friendlyError(e), 'error');
      }
    })();
  }, [addNotification]); // eslint-disable-line react-hooks/exhaustive-deps

  const createProject = useCallback(async (name) => {
    const id = uuidv4();
    try {
      await service.save(id, { ...serialize(name, id), id, name });
      await shared.adoptRow(id);
      setCurrentProjectId(id);
      setProjectName(name);
      setHydrated(true);
      setLastSaveTime(new Date());
      setSaveError(null);
      await refreshProjects();
      addNotification(`Project "${name}" created`, 'success');
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [serialize, addNotification, refreshProjects]); // eslint-disable-line react-hooks/exhaustive-deps

  const openProject = useCallback(async (id) => {
    try {
      const payload = await shared.loadForOpen(id);
      if (!payload || !hydrate(payload)) {
        addNotification('Project not found', 'error');
        return;
      }
      setCurrentProjectId(id);
      setProjectName(payload.name || projects.find((p) => p.id === id)?.name || 'Untitled project');
      setHydrated(true);
      setSaveError(null);
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [projects, addNotification, hydrate, shared.loadForOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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
      await refreshProjects();
      addNotification('Project deleted', 'info');
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [currentProjectId, addNotification, refreshProjects]); // eslint-disable-line react-hooks/exhaustive-deps

  const manualSave = useCallback(async () => {
    if (!currentProjectId) {
      addNotification('Create or open a project first', 'info');
      return false;
    }
    setIsSaving(true);
    try {
      const res = await shared.write(currentProjectId, serialize(projectName));
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
  }, [currentProjectId, projectName, serialize, addNotification, shared.write]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Save a copy": the project on screen as my own new project
  const saveCopy = useCallback(async () => {
    const name = shared.copyNameFor(projectName || 'Recovery Factor project');
    const id = uuidv4();
    try {
      await service.save(id, { ...serialize(name, id), id, name });
      await refreshProjects();
      await openProject(id);
      addNotification(`Saved a copy as "${name}"`, 'success');
      return id;
    } catch (e) {
      addNotification(`Could not save a copy: ${e.message}`, 'error');
      return null;
    }
  }, [projectName, serialize, refreshProjects, openProject, addNotification]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced autosave (10 s), only once a project is open and hydrated, never read-only.
  const autosaveRef = useRef(null);
  autosaveRef.current = () => serialize(projectName);
  const writeRef = useRef(shared.write);
  writeRef.current = shared.write;
  useEffect(() => {
    if (!currentProjectId || !hydrated || !canWrite) return undefined;
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        const res = await writeRef.current(currentProjectId, autosaveRef.current());
        if (res.ok) {
          setLastSaveTime(new Date());
          setSaveError(null);
        } else if (!res.readOnly) {
          setSaveError('Auto-save failed');
        }
      } catch (e) {
        console.error(e);
        setSaveError('Auto-save failed');
      } finally {
        setIsSaving(false);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [inputs, identification, inputMeta, unitSystemSaved, pvtIntake, inPlaceIntake, dcaCheck, currentProjectId, hydrated, canWrite]);

  const value = {
    // inputs + derived
    inputs,
    derived,
    drives,
    inPlace,
    result,
    // input actions
    switchPhase,
    setMethod,
    setDriveCode,
    setInPlaceMode,
    setOoipDirect,
    setVolField,
    setCorrField,
    setMcField, setMcEnabled, newMcSeed, setZMethod,
    uncertainty: derived.uncertainty,
    loadSample,
    // report, sources, units, intakes
    identification, setIdentificationField,
    inputMeta, setInputSource,
    unitSystem, setUnitSystem, u, profileSystem, followsProfile: unitSystemSaved == null && !!profileSystem,
    pvtIntake, takePvt,
    inPlaceIntake, takeInPlace, clearInPlaceIntake,
    dcaCheck, setDcaCheck,
    migration,
    build,
    serialize,
    // projects
    projects: ownProjects,
    sharedProjects,
    currentProjectId,
    projectName,
    createProject,
    openProject,
    deleteProject,
    manualSave,
    saveCopy,
    projectRow: shared.projectRow,
    sharing: shared.sharing,
    viewingShared: shared.viewingShared,
    canWrite,
    isSaving,
    saveError,
    lastSaveTime,
    // notifications
    notifications,
    addNotification,
    removeNotification,
  };

  return <RfEstimatorContext.Provider value={value}>{children}</RfEstimatorContext.Provider>;
};
