// Storage Tank & Venting Designer state (Facilities F12,
// Facilities-ROADMAP.md §3 app 12) — a NEW app on a fresh slug.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  tankCapacity, shellCourses, normalVenting, wettedAreaFt2, fireVenting,
  evaporativeLosses, lossControl,
} from '@/utils/facilities/engine/storageTank';

const TABLE = 'saved_tank_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save tank studies.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  if (error?.code === '42P01' || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist`, 'i').test(msg)) {
    return "Saving isn't set up yet. Run the f12_saved_tank_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => ({
  tank: {
    diameterFt: '120', heightFt: '40', courseHeightFt: '8',
    liquidLevelFt: '38', sg: '0.85',
    designStressPsi: '23200', testStressPsi: '24900',
    corrosionAllowanceIn: '0.0625',
  },
  venting: {
    fillBblPerHr: '500', drawBblPerHr: '800',
    highVolatility: 'no', insulated: 'no', latitudeFactor: '1.0',
    latentBtuLb: '130', molecularWeight: '90', environmentFactor: '1.0',
  },
  losses: {
    vapourSpaceHeightFt: '12', vapourPressurePsia: '1.5',
    throughputBbl: '500000', molecularWeight: '65', tempSwingF: '20',
    controlEfficiencyPct: '90',
  },
});

const SECTIONS = ['tank', 'venting', 'losses'];

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

export const useTank = () => {
  const context = useContext(Ctx);
  if (!context) throw new Error('useTank must be used within a TankStudioProvider');
  return context;
};

const num = (v, fallback = NaN) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

export const TankStudioProvider = ({ children }) => {
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

  const capacity = useMemo(() => tankCapacity({
    diameterFt: num(inputs.tank.diameterFt),
    heightFt: num(inputs.tank.heightFt),
    fillHeightFt: num(inputs.tank.liquidLevelFt),
  }), [inputs.tank]);

  const shell = useMemo(() => shellCourses({
    diameterFt: num(inputs.tank.diameterFt),
    heightFt: num(inputs.tank.heightFt),
    courseHeightFt: num(inputs.tank.courseHeightFt, 8),
    liquidLevelFt: num(inputs.tank.liquidLevelFt),
    sg: num(inputs.tank.sg, 1),
    designStressPsi: num(inputs.tank.designStressPsi, 23200),
    testStressPsi: num(inputs.tank.testStressPsi, 24900),
    corrosionAllowanceIn: num(inputs.tank.corrosionAllowanceIn, 0),
  }), [inputs.tank]);

  const venting = useMemo(() => {
    if (capacity.error) return { error: capacity.error };
    return normalVenting({
      nominalBbl: capacity.nominalBbl,
      fillBblPerHr: num(inputs.venting.fillBblPerHr, 0),
      drawBblPerHr: num(inputs.venting.drawBblPerHr, 0),
      highVolatility: inputs.venting.highVolatility === 'yes',
      insulated: inputs.venting.insulated === 'yes',
      latitudeFactor: num(inputs.venting.latitudeFactor, 1),
    });
  }, [capacity, inputs.venting]);

  const fire = useMemo(() => {
    const w = wettedAreaFt2({
      diameterFt: num(inputs.tank.diameterFt),
      liquidLevelFt: num(inputs.tank.liquidLevelFt),
    });
    if (w.error) return w;
    const f = fireVenting({
      wettedFt2: w.areaFt2,
      environmentFactor: num(inputs.venting.environmentFactor, 1),
      latentBtuLb: num(inputs.venting.latentBtuLb, 130),
      molecularWeight: num(inputs.venting.molecularWeight, 90),
    });
    if (f.error) return f;
    return { ...w, ...f };
  }, [inputs.tank, inputs.venting]);

  const losses = useMemo(() => {
    const l = evaporativeLosses({
      diameterFt: num(inputs.tank.diameterFt),
      vapourSpaceHeightFt: num(inputs.losses.vapourSpaceHeightFt),
      vapourPressurePsia: num(inputs.losses.vapourPressurePsia),
      throughputBbl: num(inputs.losses.throughputBbl, 0),
      molecularWeight: num(inputs.losses.molecularWeight, 65),
      tempSwingF: num(inputs.losses.tempSwingF, 20),
    });
    if (l.error) return l;
    const c = lossControl({
      uncontrolledLbYr: l.totalLossLbYr,
      controlEfficiencyPct: num(inputs.losses.controlEfficiencyPct, 0),
    });
    return { ...l, control: c };
  }, [inputs.tank.diameterFt, inputs.losses]);


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
    capacity,
    shell,
    venting,
    fire,
    losses,

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
