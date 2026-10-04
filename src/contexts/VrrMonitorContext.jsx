// Voidage Replacement Monitor state + persistence on the shared Studio-shell
// convention (V1 of the VRR upgrade program, docs/scope/
// VoidageReplacementMonitor-STATUS.md; VRR-U1 of the Reservoir upgrade
// round, docs/upgrade/VoidageReplacementMonitor-UPGRADE.md).
//
// Persistence: saved_vrr_projects, under the record-sharing rules since
// 20261002130000 (VRR-U1-012): the picker lists my projects, then those
// colleagues shared with the organisation; a colleague's project opens to
// view, or to edit while I hold its check-out. Payload
// { id, name, schema: 1, inputs, modified }: inputs only, in oilfield
// units always; everything shown is derived from them by deriveVrr
// (src/utils/vrr/workspace.js), the one model of the screen, the report and
// the ledger CSV. Material Balance Studio reads inputs.pressureSurveys
// (date, p_psia) of a saved project by id: that contract is kept.
import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { useSharedSavedProjects } from '@/lib/recordSharing/useSharedSavedProjects';
import { sampleVRRData } from '@/utils/vrrCalculations';
import { deriveVrr } from '@/utils/vrr/workspace';
import { vrrUnits } from '@/utils/vrr/units';
import { setProvenanceField } from '@/lib/inputProvenance/model';

export const TABLE = 'saved_vrr_projects';

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

/** The identification of the report header, typed per project (RL4). */
export const IDENTIFICATION_FIELDS = Object.freeze([
  ['company', 'Company'],
  ['field', 'Field'],
  ['licence', 'Licence or block'],
  ['reservoir', 'Reservoir or zone'],
  ['area', 'Pattern area or segment'],
  ['dataSource', 'Production data source'],
  ['analyst', 'Analyst'],
]);

export const defaultInputs = (unitSystem = 'oilfield') => ({
  fvf: { Bo: '1.25', Bw: '1.02', Bg: '0.9', Rs: '550' },
  periods: [emptyPeriod()],
  // V2: imported per-well ledger mode + analysis settings.
  mode: 'manual', // 'manual' (period grid) | 'imported' (per-well CSV ledger)
  wellRows: [],   // vrrLedger row schema {date, well, oil_stb, ...}
  settings: { targetBandMin: '1.0', targetBandMax: '1.2', rollingWindow: '3' },
  // V3: reservoir pressure track + pressure-dependent PVT.
  pressureSurveys: [], // [{date: 'YYYY-MM-DD'|'YYYY-MM', p_psia: number}] (Material Balance reads these by id)
  pvtMode: 'constant', // 'constant' | 'track' (correlations) | 'table' (the pvt-1 table of a Fluid project, VRR-U1)
  fluid: { api: '35', gasSg: '0.7', gor: '550', salinityPpm: '35000', tempF: '180' },
  // V4: patterns + injector->producer allocation factors.
  patterns: [],   // [{id, name, producers: [well, ...]}]
  allocation: {}, // {[injector]: {[producer]: fraction-string}}
  // VRR-U1 (additive, schema stays 1)
  unitSystem: unitSystem === 'si' ? 'si' : 'oilfield',
  identification: {},
  inputMeta: {},         // provenance per input key (src/lib/inputProvenance)
  pvtIntake: null,       // the pvt-1 table kept with the project (src/utils/vrr/pvtIntake.js)
  importInfo: null,      // what the ledger door read (file, rows, columns, units, cut-off)
  pressureImportInfo: null,
  datum: { depth: '', reference: '' }, // the depth the surveys are quoted at, stated (no correction applied)
  sampleNote: null,      // set when the inputs came from a built-in sample
  // VRR-U2-004: the confirmed match table of ledger wells to wells registry wells (src/utils/vrr/wellMap.js)
  wellMap: null,
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
    pvtMode: ['track', 'table'].includes(raw.pvtMode) ? raw.pvtMode : 'constant',
    fluid: { ...base.fluid, ...(raw.fluid || {}) },
    patterns: Array.isArray(raw.patterns) ? raw.patterns : [],
    allocation: raw.allocation && typeof raw.allocation === 'object' ? raw.allocation : {},
    // a project saved before VRR-U1 opens in oilfield units, as it was made
    unitSystem: raw.unitSystem === 'si' ? 'si' : 'oilfield',
    identification: raw.identification && typeof raw.identification === 'object' ? raw.identification : {},
    inputMeta: raw.inputMeta && typeof raw.inputMeta === 'object' ? raw.inputMeta : {},
    pvtIntake: raw.pvtIntake && typeof raw.pvtIntake === 'object' ? raw.pvtIntake : null,
    importInfo: raw.importInfo || null,
    pressureImportInfo: raw.pressureImportInfo || null,
    datum: { ...base.datum, ...(raw.datum || {}) },
    sampleNote: raw.sampleNote || null,
    wellMap: raw.wellMap && typeof raw.wellMap === 'object' ? raw.wellMap : null,
  };
};

/** The saved payload of a project (what `.pld` carries and Material Balance reads). */
export const projectPayload = ({ id, name, inputs }) => ({ id, name, schema: 1, inputs, modified: new Date().toISOString() });

const VrrMonitorContext = createContext();

export const useVrrMonitor = () => {
  const context = useContext(VrrMonitorContext);
  if (!context) throw new Error('useVrrMonitor must be used within a VrrMonitorProvider');
  return context;
};

/**
 * @param {{children: any, sharingStore?: ?object, profileSystem?: ?('oilfield'|'si'), organizationName?: ?string}} props
 *   `sharingStore` the record sharing store (supabaseSharingStore() on the page, a memory store in tests);
 *   `profileSystem` the system the Suite unit profile leans to, for a new workspace only
 */
export const VrrMonitorProvider = ({ children, sharingStore = null, profileSystem = null, organizationName = null }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  const [inputs, setInputs] = useState(() => defaultInputs(profileSystem));
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const shared = useSharedSavedProjects({ table: TABLE, service, sharingStore });
  const [projectRows, setProjectRows] = useState([]);
  const canWrite = shared.canWrite;

  // a new workspace follows the profile once it is known (a saved project keeps its own)
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current && !currentProjectId && profileSystem) setInputs((prev) => ({ ...prev, unitSystem: profileSystem === 'si' ? 'si' : 'oilfield' }));
  }, [profileSystem, currentProjectId]);
  const edit = useCallback((fn) => { touched.current = true; setInputs(fn); }, []);

  // --- Derived analysis: one pure function of the inputs ---
  const derived = useMemo(() => deriveVrr(inputs), [inputs]);
  const u = useMemo(() => vrrUnits(inputs.unitSystem), [inputs.unitSystem]);

  // --- Input actions ---
  const setUnitSystem = useCallback((system) => edit((prev) => ({ ...prev, unitSystem: system === 'si' ? 'si' : 'oilfield' })), [edit]);
  const setFvfField = useCallback((key, value) => {
    edit((prev) => ({ ...prev, fvf: { ...prev.fvf, [key]: value }, sampleNote: prev.sampleNote }));
  }, [edit]);
  const setInputMetaField = useCallback((key, field, value) => {
    edit((prev) => ({ ...prev, inputMeta: setProvenanceField(prev.inputMeta || {}, key, field, value) }));
  }, [edit]);
  const setIdentificationField = useCallback((key, value) => {
    edit((prev) => ({ ...prev, identification: { ...(prev.identification || {}), [key]: value } }));
  }, [edit]);
  const setDatumField = useCallback((key, value) => {
    edit((prev) => ({ ...prev, datum: { ...(prev.datum || {}), [key]: value } }));
  }, [edit]);

  const updatePeriodCell = useCallback((index, key, value) => {
    edit((prev) => ({ ...prev, periods: prev.periods.map((row, i) => (i === index ? { ...row, [key]: value } : row)) }));
  }, [edit]);
  const addPeriod = useCallback(() => edit((prev) => ({ ...prev, periods: [...prev.periods, emptyPeriod()] })), [edit]);
  const removePeriod = useCallback((index) => {
    edit((prev) => ({ ...prev, periods: prev.periods.length > 1 ? prev.periods.filter((_, i) => i !== index) : [emptyPeriod()] }));
  }, [edit]);
  const setPeriods = useCallback((periods, source = null) => {
    edit((prev) => ({ ...prev, periods: periods.length ? periods : [emptyPeriod()], importInfo: source ? { kind: 'grid', ...source } : prev.importInfo }));
  }, [edit]);

  const loadSample = useCallback(() => {
    const s = sampleVRRData();
    edit((prev) => ({
      ...prev,
      fvf: { Bo: String(s.fvf.Bo), Bw: String(s.fvf.Bw), Bg: String(s.fvf.Bg), Rs: String(s.fvf.Rs) },
      periods: s.periods.map((p) => ({
        ...emptyPeriod(), ...p, Np: String(p.Np), Wp: String(p.Wp), Gp: String(p.Gp), Wi: String(p.Wi), Gi: String(p.Gi),
      })),
      sampleNote: 'The built-in 6-month waterflood sample of the app (illustrative volumes).',
    }));
    addNotification('Sample loaded: a 6-month waterflood dataset is ready.', 'success');
  }, [edit, addNotification]);

  const clearAll = useCallback(() => {
    edit((prev) => ({ ...prev, periods: [emptyPeriod()] }));
    addNotification('Periods cleared', 'info');
  }, [edit, addNotification]);

  // --- V2: imported ledger + settings actions ---
  const importWellRows = useCallback((rows, sourceName, info = null) => {
    edit((prev) => ({
      ...prev,
      mode: 'imported',
      wellRows: rows,
      importInfo: { kind: 'ledger', file: sourceName || null, at: new Date().toISOString(), ...(info || {}) },
      sampleNote: info?.sample ? info.sample : null,
    }));
    addNotification(`Loaded ${rows.length.toLocaleString()} well-rows${sourceName ? ` from ${sourceName}` : ''}`, 'success');
  }, [edit, addNotification]);

  const clearImported = useCallback(() => {
    edit((prev) => ({ ...prev, mode: 'manual', wellRows: [], importInfo: null }));
    addNotification('Imported data cleared; back to manual entry', 'info');
  }, [edit, addNotification]);

  const setSettingsField = useCallback((key, value) => {
    edit((prev) => ({ ...prev, settings: { ...prev.settings, [key]: value } }));
  }, [edit]);

  // --- V3: pressure survey + PVT mode actions ---
  const setPressureSurveys = useCallback((surveys, info = null) => {
    edit((prev) => ({ ...prev, pressureSurveys: surveys, pressureImportInfo: info ? { at: new Date().toISOString(), ...info } : prev.pressureImportInfo }));
  }, [edit]);
  const updateSurvey = useCallback((index, key, value) => {
    edit((prev) => ({ ...prev, pressureSurveys: prev.pressureSurveys.map((s, i) => (i === index ? { ...s, [key]: value } : s)) }));
  }, [edit]);
  const addSurvey = useCallback(() => {
    edit((prev) => ({ ...prev, pressureSurveys: [...prev.pressureSurveys, { date: '', p_psia: '' }] }));
  }, [edit]);
  const removeSurvey = useCallback((index) => {
    edit((prev) => ({ ...prev, pressureSurveys: prev.pressureSurveys.filter((_, i) => i !== index) }));
  }, [edit]);
  const setPvtMode = useCallback((mode) => {
    edit((prev) => ({ ...prev, pvtMode: ['track', 'table'].includes(mode) ? mode : 'constant' }));
  }, [edit]);
  const setFluidField = useCallback((key, value) => {
    edit((prev) => ({ ...prev, fluid: { ...prev.fluid, [key]: value } }));
  }, [edit]);

  // --- VRR-U1: the pvt-1 intake from Fluid Systems Studio ---
  /** Keep the table, fill the constant set at the stated pressure, and run the periods on the table. */
  const takePvt = useCallback((intake, constant) => {
    edit((prev) => ({ ...prev, pvtIntake: intake, fvf: { ...prev.fvf, ...constant }, pvtMode: 'table' }));
  }, [edit]);
  const clearPvt = useCallback(() => {
    edit((prev) => ({ ...prev, pvtIntake: null, pvtMode: prev.pvtMode === 'table' ? 'constant' : prev.pvtMode }));
  }, [edit]);

  // --- V4: pattern + allocation actions ---
  const addPattern = useCallback((name) => {
    const clean = String(name || '').trim();
    if (!clean) return;
    edit((prev) => ({ ...prev, patterns: [...prev.patterns, { id: `pt_${uuidv4().slice(0, 8)}`, name: clean, producers: [] }] }));
  }, [edit]);
  const removePattern = useCallback((id) => {
    edit((prev) => ({ ...prev, patterns: prev.patterns.filter((p) => p.id !== id) }));
  }, [edit]);
  const togglePatternProducer = useCallback((id, well) => {
    edit((prev) => ({
      ...prev,
      patterns: prev.patterns.map((p) => {
        if (p.id !== id) return p;
        const has = p.producers.includes(well);
        return { ...p, producers: has ? p.producers.filter((w) => w !== well) : [...p.producers, well] };
      }),
    }));
  }, [edit]);
  const setAllocationCell = useCallback((injector, producer, value) => {
    edit((prev) => {
      const row = { ...(prev.allocation[injector] || {}) };
      if (String(value).trim() === '') delete row[producer];
      else row[producer] = value;
      return { ...prev, allocation: { ...prev.allocation, [injector]: row } };
    });
  }, [edit]);
  // Explicit user action, so this is not the engine faking a split.
  const evenSplitInjector = useCallback((injector, producers) => {
    if (!producers.length) return;
    const frac = (1 / producers.length).toFixed(4);
    edit((prev) => ({ ...prev, allocation: { ...prev.allocation, [injector]: Object.fromEntries(producers.map((p) => [p, frac])) } }));
  }, [edit]);

  // --- Project lifecycle, with record sharing ---
  // VRR-U2-004: the confirmed match table (ledger well -> registry well with its coordinates)
  const setWellMap = useCallback((wellMap) => edit((prev) => ({ ...prev, wellMap })), [edit]);
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
      } catch (e) {
        console.error(e);
        addNotification(friendlyError(e), 'error');
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
      console.error(e);
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
      console.error(e);
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
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [currentProjectId, shared, refresh, addNotification]);

  const writeNow = useCallback(async () => {
    const res = await shared.write(currentProjectId, serialize(projectName));
    if (res.ok) { setLastSaveTime(new Date()); setSaveError(null); }
    else if (!res.readOnly) { setSaveError('Save failed'); addNotification(res.message || 'Save failed', 'error'); }
    return res;
  }, [shared, currentProjectId, serialize, projectName, addNotification]);

  /** Save now. @returns {Promise<boolean>} whether the project was written */
  const manualSave = useCallback(async () => {
    if (!currentProjectId) {
      addNotification('Create or open a project first', 'info');
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
      console.error(e);
      setSaveError('Save failed');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [currentProjectId, canWrite, shared, writeNow, addNotification]);

  /** "Save a copy": the project on screen as my own new project. */
  const saveCopy = useCallback(async () => {
    const name = shared.copyNameFor(projectName || 'VRR project');
    const id = uuidv4();
    try {
      await service.save(id, projectPayload({ id, name, inputs }));
      await refresh();
      await openProject(id);
      addNotification(`Saved a copy as "${name}"`, 'success');
      return id;
    } catch (e) {
      addNotification(`Could not save a copy: ${e.message}`, 'error');
      return null;
    }
  }, [shared, projectName, inputs, refresh, openProject, addNotification]);

  // Debounced autosave (10 s), only once a project is open and hydrated, and
  // never while it is open read-only (a colleague's, or not checked out by me)
  const autosaveRef = useRef(null);
  autosaveRef.current = writeNow;
  useEffect(() => {
    if (!currentProjectId || !hydrated || !canWrite) return undefined;
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await autosaveRef.current();
      } catch (e) {
        console.error(e);
        setSaveError('Auto-save failed');
      } finally {
        setIsSaving(false);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [inputs, currentProjectId, hydrated, canWrite]);

  const value = {
    // inputs + derived
    inputs,
    ...derived,
    u,
    organizationName,
    // input actions
    setUnitSystem,
    setFvfField,
    setInputMetaField,
    setIdentificationField,
    setDatumField,
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
    takePvt,
    clearPvt,
    addPattern,
    removePattern,
    togglePatternProducer,
    setAllocationCell,
    evenSplitInjector,
    setWellMap,
    // projects and sharing
    projects,
    sharedProjects,
    currentProjectId,
    projectName,
    projectRow: shared.projectRow,
    sharing: shared.sharing,
    viewingShared: shared.viewingShared,
    canWrite,
    createProject,
    openProject,
    deleteProject,
    manualSave,
    saveCopy,
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
