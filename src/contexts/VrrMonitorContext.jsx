// Voidage Replacement Monitor state + persistence on the shared Studio-shell
// convention (V1 of the VRR upgrade program, docs/scope/
// VoidageReplacementMonitor-STATUS.md). Follows the useFluidStudioProjects
// lifecycle recipe (createSavedProjectsService + hydrated guard + 10s
// debounced autosave), but as a context because the app grows to multiple
// tabs sharing this state (import, pressure, patterns in V2-V4).
//
// Persistence: saved_vrr_projects (owner-scoped RLS). Payload
// { id, name, schema: 1, inputs, modified } — inputs only; results are a
// pure function of inputs and are recomputed on load.
import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  computeVRRSeries, summarizeVRR, sampleVRRData,
  buildFieldPeriods, classifyLedgerWells, computeRollingVRR, flagPeriods,
  attachPressure, findFillUp,
} from '@/utils/vrrCalculations';
import { derivePeriodFvf } from '@/utils/vrr/pvtTrack';

const TABLE = 'saved_vrr_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save VRR projects.',
});

// A missing table means the migration has not been deployed yet. Match the
// undefined_table code (42P01) or a message naming THIS relation, so
// unrelated errors still surface their real cause.
export const friendlyError = (error) => {
  const msg = error?.message || '';
  const missingTable = error?.code === '42P01' || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist`, 'i').test(msg);
  if (missingTable) {
    return "Saving isn't set up yet. Run the create_saved_vrr_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const emptyPeriod = () => ({ label: '', Np: '', Wp: '', Gp: '', Wi: '', Gi: '' });

export const defaultInputs = () => ({
  fvf: { Bo: '1.25', Bw: '1.02', Bg: '0.9', Rs: '550' },
  periods: [emptyPeriod()],
  // V2: imported per-well ledger mode + analysis settings.
  mode: 'manual', // 'manual' (period grid) | 'imported' (per-well CSV ledger)
  wellRows: [],   // vrrLedger row schema {date, well, oil_stb, ...}
  settings: { targetBandMin: '1.0', targetBandMax: '1.2', rollingWindow: '3' },
  // V3: reservoir pressure track + pressure-dependent PVT.
  pressureSurveys: [], // [{date: 'YYYY-MM-DD'|'YYYY-MM', p_psia: number}]
  pvtMode: 'constant', // 'constant' (global FVF set) | 'track' (correlation-derived per period)
  fluid: { api: '35', gasSg: '0.7', gor: '550', salinityPpm: '35000', tempF: '180' },
});

/** Restore inputs from a payload, tolerating missing keys from older rows. */
export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  const base = defaultInputs();
  return {
    ...base,
    ...raw,
    fvf: { ...base.fvf, ...(raw.fvf || {}) },
    periods: Array.isArray(raw.periods) && raw.periods.length ? raw.periods : base.periods,
    mode: raw.mode === 'imported' ? 'imported' : 'manual',
    wellRows: Array.isArray(raw.wellRows) ? raw.wellRows : [],
    settings: { ...base.settings, ...(raw.settings || {}) },
    pressureSurveys: Array.isArray(raw.pressureSurveys) ? raw.pressureSurveys : [],
    pvtMode: raw.pvtMode === 'track' ? 'track' : 'constant',
    fluid: { ...base.fluid, ...(raw.fluid || {}) },
  };
};

const VrrMonitorContext = createContext();

export const useVrrMonitor = () => {
  const context = useContext(VrrMonitorContext);
  if (!context) throw new Error('useVrrMonitor must be used within a VrrMonitorProvider');
  return context;
};

export const VrrMonitorProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  const [inputs, setInputs] = useState(defaultInputs);
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  // --- Derived analysis (pure functions of inputs) ---
  // In imported mode the per-well ledger aggregates to monthly field
  // periods (vrrLedger.buildFieldPeriods); manual mode uses the grid rows
  // directly. Everything downstream (series, rolling, flags) is shared.
  const isImported = inputs.mode === 'imported';
  const basePeriods = useMemo(
    () => (isImported ? buildFieldPeriods(inputs.wellRows) : inputs.periods),
    [isImported, inputs.wellRows, inputs.periods],
  );
  // V3: pressure survey interpolation onto period mid-months (labels must
  // be YYYY-MM; manual free-text labels honestly yield pressure null).
  const periodsWithPressure = useMemo(
    () => attachPressure(basePeriods, inputs.pressureSurveys),
    [basePeriods, inputs.pressureSurveys],
  );
  const hasPressure = useMemo(
    () => periodsWithPressure.some((p) => p.pressure != null),
    [periodsWithPressure],
  );
  // Pressure-dependent PVT: correlation-derived per-period overrides
  // (Suite-side pvtTrack; the engine's resolveFvf honors them). Track
  // overrides win over any manual per-period entries.
  const trackActive = inputs.pvtMode === 'track' && hasPressure;
  const pvtTrack = useMemo(() => {
    if (!trackActive) return null;
    return derivePeriodFvf(inputs.fluid, periodsWithPressure.map((p) => p.pressure));
  }, [trackActive, inputs.fluid, periodsWithPressure]);
  const effectivePeriods = useMemo(() => {
    if (!pvtTrack) return periodsWithPressure;
    return periodsWithPressure.map((p, i) => (pvtTrack.overrides[i] ? { ...p, ...pvtTrack.overrides[i] } : p));
  }, [periodsWithPressure, pvtTrack]);
  const series = useMemo(() => computeVRRSeries(effectivePeriods, inputs.fvf), [effectivePeriods, inputs.fvf]);
  const fillUp = useMemo(() => findFillUp(series), [series]);
  const summary = useMemo(() => summarizeVRR(series), [series]);
  const rolling = useMemo(
    () => computeRollingVRR(series, parseFloat(inputs.settings.rollingWindow) || 3),
    [series, inputs.settings.rollingWindow],
  );
  const targetBand = useMemo(() => ({
    min: parseFloat(inputs.settings.targetBandMin) || 1.0,
    max: parseFloat(inputs.settings.targetBandMax) || 1.2,
  }), [inputs.settings.targetBandMin, inputs.settings.targetBandMax]);
  const flags = useMemo(() => flagPeriods(series, targetBand), [series, targetBand]);
  const ledgerWells = useMemo(
    () => (isImported ? classifyLedgerWells(inputs.wellRows) : { injectors: [], producers: [] }),
    [isImported, inputs.wellRows],
  );

  // --- Input actions ---
  const setFvfField = useCallback((key, value) => {
    setInputs((prev) => ({ ...prev, fvf: { ...prev.fvf, [key]: value } }));
  }, []);

  const updatePeriodCell = useCallback((index, key, value) => {
    setInputs((prev) => ({
      ...prev,
      periods: prev.periods.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    }));
  }, []);

  const addPeriod = useCallback(() => {
    setInputs((prev) => ({ ...prev, periods: [...prev.periods, emptyPeriod()] }));
  }, []);

  const removePeriod = useCallback((index) => {
    setInputs((prev) => ({
      ...prev,
      periods: prev.periods.length > 1 ? prev.periods.filter((_, i) => i !== index) : [emptyPeriod()],
    }));
  }, []);

  const setPeriods = useCallback((periods) => {
    setInputs((prev) => ({ ...prev, periods: periods.length ? periods : [emptyPeriod()] }));
  }, []);

  const loadSample = useCallback(() => {
    const s = sampleVRRData();
    setInputs((prev) => ({
      ...prev,
      fvf: { Bo: String(s.fvf.Bo), Bw: String(s.fvf.Bw), Bg: String(s.fvf.Bg), Rs: String(s.fvf.Rs) },
      periods: s.periods.map((p) => ({
        ...emptyPeriod(), ...p, Np: String(p.Np), Wp: String(p.Wp), Gp: String(p.Gp), Wi: String(p.Wi), Gi: String(p.Gi),
      })),
    }));
    addNotification('Sample loaded: a 6-month waterflood dataset is ready.', 'success');
  }, [addNotification]);

  const clearAll = useCallback(() => {
    setInputs((prev) => ({ ...prev, periods: [emptyPeriod()] }));
    addNotification('Periods cleared', 'info');
  }, [addNotification]);

  // --- V2: imported ledger + settings actions ---
  const importWellRows = useCallback((rows, sourceName) => {
    setInputs((prev) => ({ ...prev, mode: 'imported', wellRows: rows }));
    addNotification(`Loaded ${rows.length.toLocaleString()} well-rows${sourceName ? ` from ${sourceName}` : ''}`, 'success');
  }, [addNotification]);

  const clearImported = useCallback(() => {
    setInputs((prev) => ({ ...prev, mode: 'manual', wellRows: [] }));
    addNotification('Imported data cleared; back to manual entry', 'info');
  }, [addNotification]);

  const setSettingsField = useCallback((key, value) => {
    setInputs((prev) => ({ ...prev, settings: { ...prev.settings, [key]: value } }));
  }, []);

  // --- V3: pressure survey + PVT mode actions ---
  const setPressureSurveys = useCallback((surveys) => {
    setInputs((prev) => ({ ...prev, pressureSurveys: surveys }));
  }, []);

  const updateSurvey = useCallback((index, key, value) => {
    setInputs((prev) => ({
      ...prev,
      pressureSurveys: prev.pressureSurveys.map((s, i) => (i === index ? { ...s, [key]: value } : s)),
    }));
  }, []);

  const addSurvey = useCallback(() => {
    setInputs((prev) => ({ ...prev, pressureSurveys: [...prev.pressureSurveys, { date: '', p_psia: '' }] }));
  }, []);

  const removeSurvey = useCallback((index) => {
    setInputs((prev) => ({ ...prev, pressureSurveys: prev.pressureSurveys.filter((_, i) => i !== index) }));
  }, []);

  const setPvtMode = useCallback((mode) => {
    setInputs((prev) => ({ ...prev, pvtMode: mode === 'track' ? 'track' : 'constant' }));
  }, []);

  const setFluidField = useCallback((key, value) => {
    setInputs((prev) => ({ ...prev, fluid: { ...prev.fluid, [key]: value } }));
  }, []);

  // --- Project lifecycle (useFluidStudioProjects recipe) ---
  const serialize = useCallback((name) => ({
    id: currentProjectId,
    name,
    schema: 1,
    inputs,
    modified: new Date().toISOString(),
  }), [currentProjectId, inputs]);

  useEffect(() => {
    (async () => {
      try {
        setProjects(await service.list());
      } catch (e) {
        console.error(e);
        addNotification(friendlyError(e), 'error');
      }
    })();
  }, [addNotification]);

  const createProject = useCallback(async (name) => {
    const id = uuidv4();
    try {
      await service.save(id, { id, name, schema: 1, inputs, modified: new Date().toISOString() });
      setCurrentProjectId(id);
      setProjectName(name);
      setHydrated(true);
      setLastSaveTime(new Date());
      setSaveError(null);
      setProjects(await service.list());
      addNotification(`Project "${name}" created`, 'success');
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [inputs, addNotification]);

  const openProject = useCallback(async (id) => {
    try {
      const payload = await service.load(id);
      const restored = inputsFromPayload(payload);
      if (!restored) {
        addNotification('Project not found', 'error');
        return;
      }
      setCurrentProjectId(id);
      setProjectName(payload.name || projects.find((p) => p.id === id)?.name || 'Untitled project');
      setInputs(restored);
      setHydrated(true);
      setSaveError(null);
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [projects, addNotification]);

  const deleteProject = useCallback(async (id) => {
    try {
      await service.remove(id);
      if (id === currentProjectId) {
        setCurrentProjectId(null);
        setProjectName('');
        setHydrated(false);
        setLastSaveTime(null);
      }
      setProjects(await service.list());
      addNotification('Project deleted', 'info');
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [currentProjectId, addNotification]);

  const manualSave = useCallback(async () => {
    if (!currentProjectId) {
      addNotification('Create or open a project first', 'info');
      return;
    }
    setIsSaving(true);
    try {
      await service.save(currentProjectId, serialize(projectName));
      setLastSaveTime(new Date());
      setSaveError(null);
    } catch (e) {
      console.error(e);
      setSaveError('Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [currentProjectId, projectName, serialize, addNotification]);

  // Debounced autosave (10 s), only once a project is open and hydrated.
  const autosaveRef = useRef(null);
  autosaveRef.current = () => serialize(projectName);
  useEffect(() => {
    if (!currentProjectId || !hydrated) return undefined;
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await service.save(currentProjectId, autosaveRef.current());
        setLastSaveTime(new Date());
        setSaveError(null);
      } catch (e) {
        console.error(e);
        setSaveError('Auto-save failed');
      } finally {
        setIsSaving(false);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [inputs, currentProjectId, hydrated]);

  const value = {
    // inputs + derived
    inputs,
    series,
    summary,
    rolling,
    flags,
    targetBand,
    isImported,
    ledgerWells,
    effectivePeriods,
    periodsWithPressure,
    hasPressure,
    trackActive,
    pvtTrack,
    fillUp,
    // input actions
    setFvfField,
    updatePeriodCell,
    addPeriod,
    removePeriod,
    setPeriods,
    loadSample,
    clearAll,
    importWellRows,
    clearImported,
    setSettingsField,
    setPressureSurveys,
    updateSurvey,
    addSurvey,
    removeSurvey,
    setPvtMode,
    setFluidField,
    // projects
    projects,
    currentProjectId,
    projectName,
    createProject,
    openProject,
    deleteProject,
    manualSave,
    isSaving,
    saveError,
    lastSaveTime,
    // notifications
    notifications,
    addNotification,
    removeNotification,
  };

  return <VrrMonitorContext.Provider value={value}>{children}</VrrMonitorContext.Provider>;
};
