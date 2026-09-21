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

/**
 * Every derived block below is wrapped in this. A bare useMemo over an
 * engine call takes the whole studio down on a throw, and a studio that
 * shows nothing is worse than one that shows a message.
 */
const safe = (label, fn) => {
  try {
    return fn();
  } catch (e) {
    console.error(`${label} failed`, e);
    return { error: `The ${label} calculation could not be completed. Check the inputs above.` };
  }
};

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
    corrosionAllowanceIn: '0.0625', minimumThicknessIn: '0.1875',
  },
  venting: {
    fillBblPerHr: '500', drawBblPerHr: '800',
    highVolatility: 'no', insulated: 'no', latitudeFactor: '1.0',
    environmentFactor: '1.0',
  },
  losses: {
    vapourPressurePsia: '1.5',
    throughputBbl: '500000', molecularWeight: '65', tempSwingF: '20',
    avgTempR: '530', ventSettingPsi: '0.03',
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

  const capacity = useMemo(() => safe('capacity', () => tankCapacity({
    diameterFt: num(inputs.tank.diameterFt),
    heightFt: num(inputs.tank.heightFt),
    fillHeightFt: num(inputs.tank.liquidLevelFt),
  })), [inputs.tank]);

  /**
   * The vapour space is the shell above the design liquid level, not a
   * separate typed number. A 40 ft shell at a 38 ft level has 2 ft of
   * vapour space; the losses block used to default to 12 ft with nothing
   * linking them, and the standing loss shown was 17,276 lb/yr where the
   * tank as drawn implied 4,854.
   */
  const vapourSpaceHeightFt = useMemo(() => {
    const h = num(inputs.tank.heightFt);
    const level = num(inputs.tank.liquidLevelFt);
    if (!(h > 0) || !(level >= 0)) return NaN;
    return h - Math.min(level, h);
  }, [inputs.tank.heightFt, inputs.tank.liquidLevelFt]);

  const shell = useMemo(() => safe('shell course', () => shellCourses({
    diameterFt: num(inputs.tank.diameterFt),
    heightFt: num(inputs.tank.heightFt),
    courseHeightFt: num(inputs.tank.courseHeightFt, 8),
    liquidLevelFt: num(inputs.tank.liquidLevelFt),
    sg: num(inputs.tank.sg, 1),
    designStressPsi: num(inputs.tank.designStressPsi, 23200),
    testStressPsi: num(inputs.tank.testStressPsi, 24900),
    corrosionAllowanceIn: num(inputs.tank.corrosionAllowanceIn, 0),
    minimumThicknessIn: num(inputs.tank.minimumThicknessIn),
  })), [inputs.tank]);

  const venting = useMemo(() => safe('normal venting', () => {
    if (capacity.error) return { error: capacity.error };
    return normalVenting({
      nominalBbl: capacity.nominalBbl,
      fillBblPerHr: num(inputs.venting.fillBblPerHr),
      drawBblPerHr: num(inputs.venting.drawBblPerHr),
      highVolatility: inputs.venting.highVolatility === 'yes',
      insulated: inputs.venting.insulated === 'yes',
      latitudeFactor: num(inputs.venting.latitudeFactor),
    });
  }), [capacity, inputs.venting]);

  const fire = useMemo(() => safe('fire case', () => {
    const w = wettedAreaFt2({
      diameterFt: num(inputs.tank.diameterFt),
      liquidLevelFt: num(inputs.tank.liquidLevelFt),
    });
    if (w.error) return w;
    const f = fireVenting({
      wettedFt2: w.areaFt2,
      environmentFactor: num(inputs.venting.environmentFactor),
    });
    if (f.error) return f;
    return { ...w, ...f };
  }), [inputs.tank, inputs.venting.environmentFactor]);

  const losses = useMemo(() => safe('evaporative loss', () => {
    if (!(vapourSpaceHeightFt > 0)) {
      return {
        error: 'there is no vapour space: the design liquid level is at or above the shell height, so the shell above the liquid is zero feet. Lower the design liquid level or raise the shell.',
      };
    }
    const l = evaporativeLosses({
      diameterFt: num(inputs.tank.diameterFt),
      vapourSpaceHeightFt,
      vapourPressurePsia: num(inputs.losses.vapourPressurePsia),
      throughputBbl: num(inputs.losses.throughputBbl),
      molecularWeight: num(inputs.losses.molecularWeight),
      tempSwingF: num(inputs.losses.tempSwingF),
      avgTempR: num(inputs.losses.avgTempR),
      ventSettingPsi: num(inputs.losses.ventSettingPsi),
    });
    if (l.error) return l;
    const c = lossControl({
      uncontrolledLbYr: l.totalLossLbYr,
      controlEfficiencyPct: num(inputs.losses.controlEfficiencyPct),
    });
    return { ...l, control: c };
  }), [inputs.tank.diameterFt, vapourSpaceHeightFt, inputs.losses]);


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
    vapourSpaceHeightFt,

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
