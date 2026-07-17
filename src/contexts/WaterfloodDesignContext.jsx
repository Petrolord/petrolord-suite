// Waterflood Design Studio state. Modeled on DeclineCurveContext but lean:
// all engine results are useMemo-derived from persisted inputs (the
// saved_<app>_projects convention: results are never stored), projects persist
// through the shared savedProjects service, notifications come from the
// Studio shell hook.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { analyzeDisplacement, validateKrTable } from '@/utils/fractionalFlowCalculations';
import { analyzeLayeredSweep } from '@/utils/layeredSweepCalculations';
import { forecastPattern } from '@/utils/patternForecastCalculations';

const WaterfloodDesignContext = createContext(null);

export const useWaterfloodDesign = () => {
  const ctx = useContext(WaterfloodDesignContext);
  if (!ctx) throw new Error('useWaterfloodDesign must be used within WaterfloodDesignProvider');
  return ctx;
};

const service = createSavedProjectsService('saved_waterflood_design_projects', {
  signInMessage: 'Sign in to save waterflood projects.',
});

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

export const DEFAULT_DISPLACEMENT = {
  krSource: 'corey', // 'corey' | 'table'
  Swc: '0.2', Sor: '0.2', krwMax: '0.4', kroMax: '1.0', nw: '2', no: '2',
  krTable: [], // [{Sw, krw, kro}] when krSource === 'table'
  muW: '0.5', muO: '5.0',
  gravityOn: false,
  k_md: '500', A_ft2: '50000', qt_rbd: '1000', dipDeg: '0', gammaW: '1.05', gammaO: '0.85',
  polymerOn: false,
  polymerMuMult: '4',
};

export const DEFAULT_LAYERS = [
  { h: '10', k: '500' },
  { h: '8', k: '250' },
  { h: '12', k: '120' },
  { h: '6', k: '60' },
  { h: '9', k: '30' },
];

export const DEFAULT_LAYERED_CONFIG = {
  mSource: 'displacement', // 'displacement' | 'manual'
  M: '2.0',
  A: '1.5',
};

export const DEFAULT_PATTERN = {
  area_acres: '40', h_ft: '25', phi: '0.22',
  Bo: '1.25', Bw: '1.02', iw_bpd: '800',
  Sgi: '0', EV: '1', worLimit: '25', maxYears: '30',
};

// Build the engine displacement spec from form inputs; null when invalid.
export function buildDisplacementSpec(d) {
  const muW = num(d.muW);
  const muO = num(d.muO);
  if (!(muW > 0) || !(muO > 0)) return { spec: null, error: 'Viscosities must be positive.' };

  let krSpec;
  if (d.krSource === 'table') {
    const { ok, errors } = validateKrTable(d.krTable);
    if (!ok) return { spec: null, error: errors[0] || 'Invalid rel-perm table.' };
    krSpec = { type: 'table', rows: d.krTable };
  } else {
    const p = { Swc: num(d.Swc), Sor: num(d.Sor), krwMax: num(d.krwMax), kroMax: num(d.kroMax), nw: num(d.nw), no: num(d.no) };
    if (!(1 - p.Swc - p.Sor > 0.01) || !(p.krwMax > 0) || !(p.kroMax > 0) || !(p.nw > 0) || !(p.no > 0)) {
      return { spec: null, error: 'Corey inputs need 1 - Swc - Sor > 0 and positive endpoints/exponents.' };
    }
    krSpec = { type: 'corey', ...p };
  }

  const spec = { krSpec, muW, muO };
  if (d.gravityOn) {
    const gravity = { k_md: num(d.k_md), A_ft2: num(d.A_ft2), qt_rbd: num(d.qt_rbd), dipDeg: num(d.dipDeg), gammaW: num(d.gammaW), gammaO: num(d.gammaO) };
    if (Object.values(gravity).every(Number.isFinite) && gravity.qt_rbd > 0) spec.gravity = gravity;
    else return { spec: null, error: 'Gravity term needs numeric k, A, qt, dip and specific gravities.' };
  }
  if (d.polymerOn) {
    const mult = num(d.polymerMuMult);
    if (!(mult > 0)) return { spec: null, error: 'Polymer viscosity multiplier must be positive.' };
    spec.polymerMuMult = mult;
  }
  return { spec, error: null };
}

export const WaterfloodDesignProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  // Projects
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hydrated, setHydrated] = useState(false); // guards autosave until a project is open

  // Persisted inputs
  const [displacementInputs, setDisplacementInputs] = useState(DEFAULT_DISPLACEMENT);
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [layeredConfig, setLayeredConfig] = useState(DEFAULT_LAYERED_CONFIG);
  const [patternInputs, setPatternInputs] = useState(DEFAULT_PATTERN);
  const [scenarios, setScenarios] = useState([]);

  const setDisplacementField = useCallback((k, v) => setDisplacementInputs((prev) => ({ ...prev, [k]: v })), []);
  const setLayeredField = useCallback((k, v) => setLayeredConfig((prev) => ({ ...prev, [k]: v })), []);
  const setPatternField = useCallback((k, v) => setPatternInputs((prev) => ({ ...prev, [k]: v })), []);

  // ---- Derived engine results (never persisted) ----
  const displacementSpec = useMemo(() => buildDisplacementSpec(displacementInputs), [displacementInputs]);
  const displacement = useMemo(
    () => (displacementSpec.spec ? analyzeDisplacement(displacementSpec.spec) : null),
    [displacementSpec],
  );

  const layeredResult = useMemo(() => {
    const L = layers.map((l) => ({ h: num(l.h), k: num(l.k) })).filter((l) => l.h > 0 && l.k > 0);
    if (L.length < 2) return null;
    const M = layeredConfig.mSource === 'displacement' && displacement ? displacement.M : num(layeredConfig.M);
    const A = num(layeredConfig.A);
    if (!(M > 0) || !(A > 0)) return null;
    return { ...analyzeLayeredSweep({ layers: L, M, A }), M, A };
  }, [layers, layeredConfig, displacement]);

  const patternResult = useMemo(() => {
    if (!displacementSpec.spec) return null;
    const pattern = {
      area_acres: num(patternInputs.area_acres), h_ft: num(patternInputs.h_ft), phi: num(patternInputs.phi),
      Bo: num(patternInputs.Bo), Bw: num(patternInputs.Bw), iw_bpd: num(patternInputs.iw_bpd),
      Sgi: num(patternInputs.Sgi) || 0, EV: num(patternInputs.EV) || 1,
      worLimit: num(patternInputs.worLimit) || 25, maxYears: num(patternInputs.maxYears) || 30,
    };
    if (![pattern.area_acres, pattern.h_ft, pattern.phi, pattern.Bo, pattern.Bw, pattern.iw_bpd].every((v) => v > 0)) return null;
    return forecastPattern({ displacementSpec: displacementSpec.spec, pattern });
  }, [displacementSpec, patternInputs]);

  // ---- Project persistence ----
  const serializeInputs = useCallback(() => ({
    id: currentProjectId,
    name: projectName,
    displacementInputs,
    layers,
    layeredConfig,
    patternInputs,
    scenarios,
    modified: new Date().toISOString(),
  }), [currentProjectId, projectName, displacementInputs, layers, layeredConfig, patternInputs, scenarios]);

  const hydrate = useCallback((payload) => {
    setDisplacementInputs({ ...DEFAULT_DISPLACEMENT, ...(payload?.displacementInputs || {}) });
    setLayers(Array.isArray(payload?.layers) && payload.layers.length ? payload.layers : DEFAULT_LAYERS);
    setLayeredConfig({ ...DEFAULT_LAYERED_CONFIG, ...(payload?.layeredConfig || {}) });
    setPatternInputs({ ...DEFAULT_PATTERN, ...(payload?.patternInputs || {}) });
    setScenarios(Array.isArray(payload?.scenarios) ? payload.scenarios : []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const list = await service.list();
        setProjects(list);
      } catch (e) {
        console.error(e);
        addNotification('Could not load saved projects', 'error');
      }
    })();
  }, [addNotification]);

  const openProject = useCallback(async (id) => {
    try {
      const payload = await service.load(id);
      if (!payload) {
        addNotification('Project not found', 'error');
        return;
      }
      setCurrentProjectId(id);
      setProjectName(payload.name || 'Untitled project');
      hydrate(payload);
      setHydrated(true);
      setSaveError(null);
    } catch (e) {
      console.error(e);
      addNotification('Could not open project', 'error');
    }
  }, [addNotification, hydrate]);

  const createProject = useCallback(async (name) => {
    const id = uuidv4();
    try {
      await service.save(id, {
        id, name,
        displacementInputs, layers, layeredConfig, patternInputs, scenarios,
        modified: new Date().toISOString(),
      });
      setCurrentProjectId(id);
      setProjectName(name);
      setHydrated(true);
      setLastSaveTime(new Date());
      setProjects(await service.list());
      addNotification(`Project "${name}" created`, 'success');
    } catch (e) {
      console.error(e);
      addNotification(e.message || 'Could not create project', 'error');
    }
  }, [displacementInputs, layers, layeredConfig, patternInputs, scenarios, addNotification]);

  const deleteProject = useCallback(async (id) => {
    try {
      await service.remove(id);
      if (id === currentProjectId) {
        setCurrentProjectId(null);
        setProjectName('');
        setHydrated(false);
      }
      setProjects(await service.list());
      addNotification('Project deleted', 'info');
    } catch (e) {
      console.error(e);
      addNotification('Could not delete project', 'error');
    }
  }, [currentProjectId, addNotification]);

  const manualSave = useCallback(async () => {
    if (!currentProjectId) {
      addNotification('Create or open a project first', 'info');
      return;
    }
    setIsSaving(true);
    try {
      await service.save(currentProjectId, serializeInputs());
      setLastSaveTime(new Date());
      setSaveError(null);
    } catch (e) {
      console.error(e);
      setSaveError('Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [currentProjectId, serializeInputs, addNotification]);

  // Debounced autosave (10 s after the last change), only once a project is open.
  const autosaveRef = useRef(serializeInputs);
  autosaveRef.current = serializeInputs;
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
  }, [displacementInputs, layers, layeredConfig, patternInputs, scenarios, currentProjectId, hydrated]);

  // ---- Scenarios: named snapshots of all input groups ----
  const saveScenario = useCallback((name) => {
    const snap = {
      id: uuidv4(),
      name,
      createdAt: new Date().toISOString(),
      displacementInputs,
      layers,
      layeredConfig,
      patternInputs,
    };
    setScenarios((prev) => [...prev, snap]);
    addNotification(`Scenario "${name}" saved`, 'success');
  }, [displacementInputs, layers, layeredConfig, patternInputs, addNotification]);

  const deleteScenario = useCallback((id) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const applyScenario = useCallback((id) => {
    const s = scenarios.find((x) => x.id === id);
    if (!s) return;
    setDisplacementInputs({ ...DEFAULT_DISPLACEMENT, ...s.displacementInputs });
    setLayers(s.layers?.length ? s.layers : DEFAULT_LAYERS);
    setLayeredConfig({ ...DEFAULT_LAYERED_CONFIG, ...s.layeredConfig });
    setPatternInputs({ ...DEFAULT_PATTERN, ...s.patternInputs });
    addNotification(`Scenario "${s.name}" applied to the working case`, 'info');
  }, [scenarios, addNotification]);

  const value = {
    // shell plumbing
    notifications, addNotification, removeNotification,
    // projects
    projects, currentProjectId, projectName,
    createProject, openProject, deleteProject, manualSave,
    isSaving, saveError, lastSaveTime,
    // inputs
    displacementInputs, setDisplacementField, setDisplacementInputs,
    layers, setLayers,
    layeredConfig, setLayeredField,
    patternInputs, setPatternField,
    // derived
    displacementSpec, displacement, layeredResult, patternResult,
    // scenarios
    scenarios, saveScenario, deleteScenario, applyScenario,
  };

  return <WaterfloodDesignContext.Provider value={value}>{children}</WaterfloodDesignContext.Provider>;
};
