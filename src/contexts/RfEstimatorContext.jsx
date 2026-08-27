// Recovery Factor Estimator state + persistence on the shared
// Studio-shell convention (kit upgrade, docs/scope/
// RecoveryFactorEstimator-STATUS.md). Follows the VrrMonitorContext /
// useFluidStudioProjects lifecycle recipe: createSavedProjectsService +
// hydrated guard + 10 s debounced autosave. The engine
// (recoveryFactorCalculations.js) is untouched; results are a pure
// function of inputs and are recomputed on load.
//
// Persistence: saved_rf_projects (owner-scoped RLS). Payload
// { id, name, schema: 1, inputs, modified } — inputs only.
import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  DRIVE_MECHANISMS, estimateRecovery, stoiipVolumetric, ogipVolumetric, sampleRecoveryData,
} from '@/utils/recoveryFactorCalculations';
import { DEFAULT_DRIVE } from '@/components/rfestimator/rfFields';

const TABLE = 'saved_rf_projects';

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

const asStrings = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, String(v)]));

export const defaultInputs = () => {
  const d = sampleRecoveryData();
  return {
    phase: 'oil',            // 'oil' | 'gas'
    method: 'analog',        // METHODS[phase] code
    driveCode: DEFAULT_DRIVE.oil,
    inPlaceMode: 'volumetric', // 'volumetric' | 'direct'
    ooipDirect: '',
    vol: asStrings(d.volumetric),
    corr: asStrings(d.correlationInputs),
  };
};

/** Restore inputs from a payload, tolerating missing keys from older rows. */
export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  const base = defaultInputs();
  return {
    ...base,
    ...raw,
    phase: raw.phase === 'gas' ? 'gas' : 'oil',
    inPlaceMode: raw.inPlaceMode === 'direct' ? 'direct' : 'volumetric',
    ooipDirect: typeof raw.ooipDirect === 'string' ? raw.ooipDirect : '',
    vol: { ...base.vol, ...(raw.vol || {}) },
    corr: { ...base.corr, ...(raw.corr || {}) },
  };
};

const RfEstimatorContext = createContext();

export const useRfEstimator = () => {
  const context = useContext(RfEstimatorContext);
  if (!context) throw new Error('useRfEstimator must be used within an RfEstimatorProvider');
  return context;
};

export const RfEstimatorProvider = ({ children }) => {
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
  const drives = useMemo(
    () => DRIVE_MECHANISMS.filter((d) => d.phase === inputs.phase),
    [inputs.phase],
  );

  // Resolve in-place volume (STB or scf).
  const inPlace = useMemo(() => {
    if (inputs.inPlaceMode === 'direct') {
      const n = parseFloat(inputs.ooipDirect);
      return Number.isFinite(n) ? n : null;
    }
    return inputs.phase === 'gas' ? ogipVolumetric(inputs.vol) : stoiipVolumetric(inputs.vol);
  }, [inputs.inPlaceMode, inputs.ooipDirect, inputs.phase, inputs.vol]);

  const result = useMemo(
    () => estimateRecovery({
      method: inputs.method, driveCode: inputs.driveCode, ooip: inPlace, correlationInputs: inputs.corr,
    }),
    [inputs.method, inputs.driveCode, inPlace, inputs.corr],
  );

  // --- Input actions ---
  const switchPhase = useCallback((phase) => {
    const p = phase === 'gas' ? 'gas' : 'oil';
    setInputs((prev) => ({ ...prev, phase: p, method: 'analog', driveCode: DEFAULT_DRIVE[p] }));
  }, []);

  const setMethod = useCallback((method) => {
    setInputs((prev) => ({ ...prev, method }));
  }, []);

  const setDriveCode = useCallback((driveCode) => {
    setInputs((prev) => ({ ...prev, driveCode }));
  }, []);

  const setInPlaceMode = useCallback((inPlaceMode) => {
    setInputs((prev) => ({ ...prev, inPlaceMode: inPlaceMode === 'direct' ? 'direct' : 'volumetric' }));
  }, []);

  const setOoipDirect = useCallback((value) => {
    setInputs((prev) => ({ ...prev, ooipDirect: value }));
  }, []);

  const setVolField = useCallback((key, value) => {
    setInputs((prev) => ({ ...prev, vol: { ...prev.vol, [key]: value } }));
  }, []);

  const setCorrField = useCallback((key, value) => {
    setInputs((prev) => ({ ...prev, corr: { ...prev.corr, [key]: value } }));
  }, []);

  const loadSample = useCallback(() => {
    const d = sampleRecoveryData();
    setInputs((prev) => ({
      ...prev,
      phase: 'oil',
      method: 'analog',
      driveCode: 'water_drive',
      inPlaceMode: 'volumetric',
      vol: asStrings(d.volumetric),
      corr: asStrings(d.correlationInputs),
    }));
    addNotification('Sample loaded: a water-drive oil case is ready.', 'success');
  }, [addNotification]);

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
    loadSample,
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

  return <RfEstimatorContext.Provider value={value}>{children}</RfEstimatorContext.Provider>;
};
