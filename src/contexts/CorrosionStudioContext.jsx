// Corrosion & Integrity Studio state (Facilities F6,
// Facilities-ROADMAP.md §3 app 6) — the upgraded Corrosion Rate
// Predictor on the studio kit, keeping its slug.
//
// The studio speaks field units; the vendored engine is published in
// the correlations' own units (C, bar, m/s, m), so this layer is where
// the conversion lives and nowhere else.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { screen, corrosionRate, rateCategory } from '@/utils/facilities/engine/corrosion';

const TABLE = 'saved_corrosion_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save corrosion studies.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  if (error?.code === '42P01' || /relation[^\n]*saved_corrosion_projects[^\n]*does not exist/i.test(msg)) {
    return "Saving isn't set up yet. Run the f6_saved_corrosion_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => ({
  conditions: {
    tF: '140', pPsig: '725', co2MolPct: '3', h2sMolPct: '0.1', ph: '4.5',
  },
  flow: {
    velocityFtS: '10', idIn: '6', densityLbFt3: '56', viscosityCp: '1',
    flowRegime: 'waterWet', waterCutPct: '100',
  },
  mitigation: {
    inhibitorEfficiencyPct: '90', inhibitorAvailabilityPct: '95',
  },
  integrity: {
    corrosionAllowanceIn: '0.125', consumedIn: '0', designLifeYears: '20',
  },
  sweep: {
    velocitiesFtS: '2,5,10,15,20',
  },
});

const SECTIONS = ['conditions', 'flow', 'mitigation', 'integrity', 'sweep'];

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

const CorrosionContext = createContext();

export const useCorrosion = () => {
  const context = useContext(CorrosionContext);
  if (!context) throw new Error('useCorrosion must be used within a CorrosionStudioProvider');
  return context;
};

const num = (v, fallback = NaN) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Field to correlation units, in one place. */
export const toEngineUnits = (inputs) => {
  const c = inputs.conditions;
  const f = inputs.flow;
  const m = inputs.mitigation;
  return {
    tC: (num(c.tF) - 32) / 1.8,
    pTotalBar: (num(c.pPsig) + 14.7) / 14.5038,
    co2MolFrac: num(c.co2MolPct, 0) / 100,
    h2sMolFrac: num(c.h2sMolPct, 0) / 100,
    ph: num(c.ph, 4.5),
    velocityMS: num(f.velocityFtS) * 0.3048,
    diameterM: num(f.idIn) * 0.0254,
    densityKgM3: num(f.densityLbFt3) * 16.0185,
    viscosityPaS: num(f.viscosityCp) * 1e-3,
    flowRegime: f.flowRegime,
    waterCutFrac: num(f.waterCutPct, 100) / 100,
    inhibitorEfficiencyPct: num(m.inhibitorEfficiencyPct, 0),
    inhibitorAvailabilityPct: num(m.inhibitorAvailabilityPct, 100),
  };
};

const MM_PER_IN = 25.4;

export const CorrosionStudioProvider = ({ children }) => {
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

  /** The full screen at the stated conditions. */
  const result = useMemo(() => {
    const eng = toEngineUnits(inputs);
    const i = inputs.integrity;
    const out = screen({
      ...eng,
      corrosionAllowanceMm: num(i.corrosionAllowanceIn, 0) * MM_PER_IN,
      consumedMm: num(i.consumedIn, 0) * MM_PER_IN,
      designLifeYears: num(i.designLifeYears, 0),
    });
    if (out.error) return out;
    return {
      ...out,
      // convenience in inches for the integrity tab
      rateMpy: out.rate.rateMmYr / MM_PER_IN * 1000,
      uninhibitedMpy: out.rate.uninhibitedMmYr / MM_PER_IN * 1000,
    };
  }, [inputs]);

  /** Rate against velocity: the curve the predecessor could not draw. */
  const velocitySweep = useMemo(() => {
    const eng = toEngineUnits(inputs);
    const vels = String(inputs.sweep.velocitiesFtS)
      .split(/[,\s]+/)
      .map((t) => parseFloat(t))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!vels.length) return { error: 'list at least one velocity' };
    const rows = vels.map((vFtS) => {
      const r = corrosionRate({ ...eng, velocityMS: vFtS * 0.3048 });
      return {
        velocityFtS: vFtS,
        rateMmYr: r.error ? null : r.rateMmYr,
        uninhibitedMmYr: r.error ? null : r.uninhibitedMmYr,
        controlling: r.error ? null : r.controlling,
        category: r.error ? null : rateCategory(r.rateMmYr),
        error: r.error || null,
      };
    });
    return { rows };
  }, [inputs]);

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
    // derived
    result,
    velocitySweep,
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

  return <CorrosionContext.Provider value={value}>{children}</CorrosionContext.Provider>;
};
