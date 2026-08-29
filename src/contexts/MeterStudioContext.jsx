// Flow Metering Designer state (Facilities F12,
// Facilities-ROADMAP.md §3 app 13) — a NEW app on a fresh slug.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  orificeFlow, sizeOrifice, permanentLoss, orificeUncertainty,
  transmitterUncertaintyPct, straightRunDiameters, dischargeCoefficient,
} from '@/utils/facilities/engine/metering';

const TABLE = 'saved_meter_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save metering studies.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  if (error?.code === '42P01' || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist`, 'i').test(msg)) {
    return "Saving isn't set up yet. Run the f12_saved_meter_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => ({
  run: {
    pipeIdIn: '6.065', orificeIdIn: '3.0', dpInH2O: '100', spanInH2O: '200',
    p1Psia: '500', densityLbFt3: '2.5', viscosityCp: '0.012', k: '1.3',
    upstreamFitting: 'singleElbow',
  },
  sizing: {
    targetMassLbHr: '50000', designDpInH2O: '100',
  },
  uncertainty: {
    cdUncertaintyPct: '0.5', expansibilityUncertaintyPct: '0.2',
    boreUncertaintyPct: '0.05', pipeUncertaintyPct: '0.1',
    dpUncertaintyPct: '0.5', densityUncertaintyPct: '0.3',
    transmitterAccuracyPctOfSpan: '0.075',
  },
});

const SECTIONS = ['run', 'sizing', 'uncertainty'];

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  const base = defaultInputs();
  const out = { ...base };
  SECTIONS.forEach((s) => {
    out[s] = { ...base[s], ...(raw[s] || {}) };
  });
  return out;
};

const Ctx = createContext();

export const useMeter = () => {
  const context = useContext(Ctx);
  if (!context) throw new Error('useMeter must be used within a MeterStudioProvider');
  return context;
};

const num = (v, fallback = NaN) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

export const MeterStudioProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  const [inputs, setInputs] = useState(defaultInputs);
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  const setSection = useCallback((section, key, value) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
  }, []);

  const flow = useMemo(() => orificeFlow({
    pipeIdIn: num(inputs.run.pipeIdIn),
    orificeIdIn: num(inputs.run.orificeIdIn),
    dpInH2O: num(inputs.run.dpInH2O),
    p1Psia: num(inputs.run.p1Psia),
    densityLbFt3: num(inputs.run.densityLbFt3),
    viscosityCp: num(inputs.run.viscosityCp),
    k: num(inputs.run.k, 1.3),
  }), [inputs.run]);

  const sized = useMemo(() => sizeOrifice({
    pipeIdIn: num(inputs.run.pipeIdIn),
    targetMassLbHr: num(inputs.sizing.targetMassLbHr),
    dpInH2O: num(inputs.sizing.designDpInH2O),
    p1Psia: num(inputs.run.p1Psia),
    densityLbFt3: num(inputs.run.densityLbFt3),
    viscosityCp: num(inputs.run.viscosityCp),
    k: num(inputs.run.k, 1.3),
  }), [inputs.run, inputs.sizing]);

  const loss = useMemo(() => {
    if (flow.error) return { error: flow.error };
    return permanentLoss({
      dpInH2O: num(inputs.run.dpInH2O), beta: flow.beta, cd: flow.cd,
    });
  }, [flow, inputs.run.dpInH2O]);

  const uncertainty = useMemo(() => {
    if (flow.error) return { error: flow.error };
    const u = inputs.uncertainty;
    return orificeUncertainty({
      beta: flow.beta,
      cdUncertaintyPct: num(u.cdUncertaintyPct, 0.5),
      expansibilityUncertaintyPct: num(u.expansibilityUncertaintyPct, 0.2),
      boreUncertaintyPct: num(u.boreUncertaintyPct, 0.05),
      pipeUncertaintyPct: num(u.pipeUncertaintyPct, 0.1),
      dpUncertaintyPct: num(u.dpUncertaintyPct, 0.5),
      densityUncertaintyPct: num(u.densityUncertaintyPct, 0.3),
    });
  }, [flow, inputs.uncertainty]);

  const transmitter = useMemo(() => transmitterUncertaintyPct({
    dpInH2O: num(inputs.run.dpInH2O),
    spanInH2O: num(inputs.run.spanInH2O),
    accuracyPctOfSpan: num(inputs.uncertainty.transmitterAccuracyPctOfSpan, 0.075),
  }), [inputs.run.dpInH2O, inputs.run.spanInH2O, inputs.uncertainty.transmitterAccuracyPctOfSpan]);

  const straightRun = useMemo(() => {
    if (flow.error) return { error: flow.error };
    return straightRunDiameters({
      beta: flow.beta, upstreamFitting: inputs.run.upstreamFitting,
    });
  }, [flow, inputs.run.upstreamFitting]);

  /** Cd against Reynolds, so the reader sees it is not a constant. */
  const cdCurve = useMemo(() => {
    if (flow.error) return { error: flow.error };
    const rows = [];
    for (let e = 3.5; e <= 7.5; e += 0.25) {
      const re = 10 ** e;
      const c = dischargeCoefficient({
        beta: flow.beta, reynolds: re, pipeIdIn: num(inputs.run.pipeIdIn),
      });
      if (!c.error) rows.push({ reynolds: re, cd: c.cd });
    }
    return { rows };
  }, [flow, inputs.run.pipeIdIn]);


  // --- Project lifecycle (studio-kit recipe) ---
  const serialize = useCallback((name) => ({
    id: currentProjectId,
    name,
    schema: 1,
    ...SECTIONS.reduce((acc, s) => ({ ...acc, [s]: inputs[s] }), {}),
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
      await service.save(id, { ...serialize(name), id });
      setCurrentProjectId(id);
      setProjectName(name);
      setHydrated(true);
      setLastSaveTime(new Date());
      setSaveError(null);
      setProjects(await service.list());
      addNotification(`Study "${name}" created`, 'success');
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [serialize, addNotification]);

  const openProject = useCallback(async (id) => {
    try {
      const payload = await service.load(id);
      const restored = inputsFromPayload(payload);
      if (!restored) {
        addNotification('Study not found', 'error');
        return;
      }
      setCurrentProjectId(id);
      setProjectName(payload?.name || projects.find((p) => p.id === id)?.name || 'Untitled study');
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
      addNotification('Study deleted', 'info');
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [currentProjectId, addNotification]);

  const manualSave = useCallback(async () => {
    if (!currentProjectId) {
      addNotification('Create or open a study first', 'info');
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
    inputs,
    setSection,
    flow,
    sized,
    loss,
    uncertainty,
    transmitter,
    straightRun,
    cdCurve,

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
    notifications,
    addNotification,
    removeNotification,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
