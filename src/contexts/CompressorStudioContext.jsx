// Compressor Station Designer state (Facilities F9,
// Facilities-ROADMAP.md §3 app 9) — a NEW app on a fresh slug, not a
// rebuild: the F0-retired Compressor & Pump Pack printed its answers
// as literal strings and is archived.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  compressorTrain, machineScreen, driverFuel, actualInletCfm, compressionStage,
} from '@/utils/facilities/engine/compression';

const TABLE = 'saved_compressor_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save compressor studies.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  if (error?.code === '42P01' || /relation[^\n]*saved_compressor_projects[^\n]*does not exist/i.test(msg)) {
    return "Saving isn't set up yet. Run the f9_saved_compressor_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => ({
  duty: {
    qMMscfd: '20', pSuctionPsig: '85', tSuctionF: '100', pDischargePsig: '985',
    gasSg: '0.65', k: '1.28',
  },
  machine: {
    polytropicEfficiency: '0.75', mechanicalEfficiency: '0.97',
    maxRatioPerStage: '4', maxDischargeF: '300',
    interstageCoolToF: '110', cpBtuLbF: '0.55',
  },
  driver: {
    heatRateBtuHpHr: '8000', gasLhvBtuScf: '950',
  },
  sweep: {
    dischargePressures: '600,800,1000,1200,1400',
  },
});

const SECTIONS = ['duty', 'machine', 'driver', 'sweep'];

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

const CompressorContext = createContext();

export const useCompressor = () => {
  const context = useContext(CompressorContext);
  if (!context) throw new Error('useCompressor must be used within a CompressorStudioProvider');
  return context;
};

const num = (v, fallback = NaN) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

export const CompressorStudioProvider = ({ children }) => {
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

  const engineArgs = useMemo(() => {
    const d = inputs.duty;
    const m = inputs.machine;
    return {
      qMMscfd: num(d.qMMscfd),
      pSuctionPsia: num(d.pSuctionPsig) + 14.7,
      tSuctionF: num(d.tSuctionF),
      pDischargePsia: num(d.pDischargePsig) + 14.7,
      gasSg: num(d.gasSg, 0.65),
      k: num(d.k, 1.28),
      polytropicEfficiency: num(m.polytropicEfficiency, 0.75),
      mechanicalEfficiency: num(m.mechanicalEfficiency, 0.97),
      maxRatioPerStage: num(m.maxRatioPerStage, 4),
      maxDischargeF: num(m.maxDischargeF, 300),
      interstageCoolToF: num(m.interstageCoolToF, NaN),
      cpBtuLbF: num(m.cpBtuLbF, 0.55),
    };
  }, [inputs.duty, inputs.machine]);

  /** The train. */
  const train = useMemo(() => compressorTrain(engineArgs), [engineArgs]);

  /** Machine screening from the train's own answer. */
  const screen = useMemo(() => {
    if (train.error) return { error: train.error };
    return machineScreen({
      qMMscfd: engineArgs.qMMscfd,
      pSuctionPsia: engineArgs.pSuctionPsia,
      tSuctionF: engineArgs.tSuctionF,
      gasSg: engineArgs.gasSg,
      overallRatio: train.overallRatio,
      totalBrakeHp: train.totalBrakeHp,
    });
  }, [train, engineArgs]);

  /** Driver fuel from the brake power. */
  const fuel = useMemo(() => {
    if (train.error) return { error: train.error };
    return driverFuel({
      brakeHp: train.totalBrakeHp,
      heatRateBtuHpHr: num(inputs.driver.heatRateBtuHpHr, 8000),
      gasLhvBtuScf: num(inputs.driver.gasLhvBtuScf, 950),
    });
  }, [train, inputs.driver]);

  /** Power against discharge pressure: the curve a station is sized on. */
  const sweep = useMemo(() => {
    const list = String(inputs.sweep.dischargePressures)
      .split(/[,\s]+/)
      .map((t) => parseFloat(t))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!list.length) return { error: 'list at least one discharge pressure' };
    const rows = list.map((psig) => {
      const t = compressorTrain({ ...engineArgs, pDischargePsia: psig + 14.7 });
      if (t.error) return { pDischargePsig: psig, error: t.error };
      const f = driverFuel({
        brakeHp: t.totalBrakeHp,
        heatRateBtuHpHr: num(inputs.driver.heatRateBtuHpHr, 8000),
        gasLhvBtuScf: num(inputs.driver.gasLhvBtuScf, 950),
      });
      return {
        pDischargePsig: psig,
        stages: t.stages.length,
        totalBrakeHp: t.totalBrakeHp,
        overallRatio: t.overallRatio,
        finalDischargeF: t.finalDischargeF,
        fuelMMscfd: f.error ? null : f.fuelMMscfd,
        coolingMMBtuHr: t.totalCoolingMMBtuHr,
      };
    });
    return { rows };
  }, [engineArgs, inputs.sweep, inputs.driver]);

  /** Inlet volume, which is what the machine screen turns on. */
  const acfm = useMemo(() => actualInletCfm({
    qMMscfd: engineArgs.qMMscfd,
    pPsia: engineArgs.pSuctionPsia,
    tF: engineArgs.tSuctionF,
    gasSg: engineArgs.gasSg,
  }), [engineArgs]);

  /** A single stage at the train's own ratio, for the detail card. */
  const firstStage = useMemo(() => {
    if (train.error) return { error: train.error };
    return compressionStage({
      qMMscfd: engineArgs.qMMscfd,
      pSuctionPsia: engineArgs.pSuctionPsia,
      tSuctionF: engineArgs.tSuctionF,
      ratio: train.ratioPerStage,
      gasSg: engineArgs.gasSg,
      k: engineArgs.k,
      polytropicEfficiency: engineArgs.polytropicEfficiency,
      mechanicalEfficiency: engineArgs.mechanicalEfficiency,
    });
  }, [train, engineArgs]);

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
    train,
    screen,
    fuel,
    sweep,
    acfm,
    firstStage,
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

  return <CompressorContext.Provider value={value}>{children}</CompressorContext.Provider>;
};
