// Separator & Slug Catcher Studio state (Facilities F5,
// Facilities-ROADMAP.md §3 app 5) — the rebuilt Separator & Slug
// Catcher Designer on the studio kit, keeping its slug.
//
// The whole chain is live over the vendored API 12J / GPSA engine:
// conditions -> z and densities -> K -> settling -> vessel, with the
// L/D family swept so the size is chosen from a table.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  K_BASE, kValue, gasDensityLbFt3, oilDensityLbFt3,
  terminalVelocityFtS, gasActualFt3S,
  verticalTwoPhase, horizontalTwoPhase, horizontalThreePhase, ldSweep,
  vesselSlugCatcher, fingerSlugCatcher,
} from '@/utils/facilities/engine/separatorSizing';

const TABLE = 'saved_separator_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save separator studies.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  if (error?.code === '42P01' || /relation[^\n]*saved_separator_projects[^\n]*does not exist/i.test(msg)) {
    return "Saving isn't set up yet. Run the f5_saved_separator_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => ({
  vessel: {
    type: 'horizontal2', // horizontal2 | vertical2 | horizontal3
    internalsId: 'horizontalMesh', kOverride: '',
    liquidLevelFrac: '0.5', allowanceFt: '6',
    diametersFt: '4,6,8,10,12',
    ldMin: '3', ldMax: '5',
  },
  process: {
    qGasMMscfd: '20', pPsig: '985', tF: '100', gasSg: '0.65',
    qOilBpd: '6000', qWaterBpd: '4000',
    oilApi: '35', waterSg: '1.05',
    oilRetentionMin: '3', waterRetentionMin: '5',
    muOilCp: '2', muWaterCp: '0.7', dropletMicron: '500',
  },
  slug: {
    mode: 'vessel',
    slugBbl: '200', qLiquidBpd: '10000', holdMin: '5',
    fillFraction: '0.6', ldRatio: '4',
    fingerIdIn: '24', nFingers: '6', fingerFill: '0.8',
  },
});

const SECTIONS = ['vessel', 'process', 'slug'];

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

const SeparatorContext = createContext();

export const useSeparator = () => {
  const context = useContext(SeparatorContext);
  if (!context) throw new Error('useSeparator must be used within a SeparatorStudioProvider');
  return context;
};

const num = (v, fallback = NaN) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const parseDiameters = (text) => String(text)
  .split(/[,\s]+/)
  .map((t) => parseFloat(t))
  .filter((n) => Number.isFinite(n) && n > 0);

export const SeparatorStudioProvider = ({ children }) => {
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

  /** Conditions: z, densities, K, settling velocity, actual gas rate. */
  const conditions = useMemo(() => {
    const p = inputs.process;
    const v = inputs.vessel;
    const pPsia = num(p.pPsig) + 14.7;
    const gas = gasDensityLbFt3({ pPsia, tF: num(p.tF), gasSg: num(p.gasSg, 0.65) });
    if (gas.error) return gas;
    const rhoOil = oilDensityLbFt3(num(p.oilApi, 35));
    const rhoWater = num(p.waterSg, 1.05) * 62.4;
    const qOil = num(p.qOilBpd, 0);
    const qWater = num(p.qWaterBpd, 0);
    const qLiquid = qOil + qWater;
    // The gas load sees the mixed liquid it is separating from.
    const rhoLiquid = qLiquid > 0
      ? (rhoOil * qOil + rhoWater * qWater) / qLiquid
      : rhoOil;
    const k = kValue({
      internalsId: v.internalsId, pPsig: num(p.pPsig),
      kOverride: num(v.kOverride, 0),
    });
    if (k.error) return k;
    const vt = terminalVelocityFtS({
      k: k.k, rhoLLbFt3: rhoLiquid, rhoGLbFt3: gas.rhoLbFt3,
    });
    if (vt.error) return vt;
    const qGasAct = gasActualFt3S({
      qGasMMscfd: num(p.qGasMMscfd, 0), pPsia, tF: num(p.tF), z: gas.z,
    });
    return {
      pPsia, z: gas.z, rhoGas: gas.rhoLbFt3, rhoOil, rhoWater, rhoLiquid,
      qOil, qWater, qLiquid, kResult: k, k: k.k,
      vTerminalFtS: vt.vFtS, qGasActFt3S: qGasAct,
    };
  }, [inputs.process, inputs.vessel]);

  /** The L/D family across the candidate diameters. */
  const sweep = useMemo(() => {
    if (conditions.error) return { error: conditions.error };
    const v = inputs.vessel;
    const p = inputs.process;
    const diametersFt = parseDiameters(v.diametersFt);
    if (!diametersFt.length) return { error: 'list at least one candidate diameter' };
    const common = {
      diametersFt,
      ldMin: num(v.ldMin, 3),
      ldMax: num(v.ldMax, 5),
      qGasActFt3S: conditions.qGasActFt3S,
      vTerminalFtS: conditions.vTerminalFtS,
      liquidLevelFrac: num(v.liquidLevelFrac, 0.5),
    };
    if (v.type === 'vertical2') {
      return ldSweep({
        ...common, mode: 'vertical2',
        qLiquidBpd: conditions.qLiquid,
        retentionMin: num(p.oilRetentionMin, 3),
        allowanceFt: num(v.allowanceFt, 6),
      });
    }
    if (v.type === 'horizontal3') {
      return ldSweep({
        ...common, mode: 'horizontal3',
        qOilBpd: conditions.qOil, qWaterBpd: conditions.qWater,
        oilRetentionMin: num(p.oilRetentionMin, 3),
        waterRetentionMin: num(p.waterRetentionMin, 5),
        sgOil: conditions.rhoOil / 62.4,
        sgWater: num(p.waterSg, 1.05),
        muOilCp: num(p.muOilCp, 2),
        muWaterCp: num(p.muWaterCp, 0.7),
        dropletMicron: num(p.dropletMicron, 500),
      });
    }
    return ldSweep({
      ...common, mode: 'horizontal2',
      qLiquidBpd: conditions.qLiquid,
      retentionMin: num(p.oilRetentionMin, 3),
    });
  }, [conditions, inputs.vessel, inputs.process]);

  /** The chosen vessel: the preferred sweep row, or the first row. */
  const selected = useMemo(() => {
    if (sweep.error) return { error: sweep.error };
    const row = sweep.preferred || sweep.rows.find((r) => !r.error) || null;
    if (!row) return { error: 'no candidate diameter produced a vessel' };
    return row;
  }, [sweep]);

  /** Detailed result of the selected vessel (for the three-phase view). */
  const detail = useMemo(() => {
    if (selected.error) return { error: selected.error };
    return selected.result;
  }, [selected]);

  /** Slug catcher. */
  const slug = useMemo(() => {
    const s = inputs.slug;
    if (s.mode === 'finger') {
      return fingerSlugCatcher({
        slugBbl: num(s.slugBbl),
        fingerIdIn: num(s.fingerIdIn, 24),
        nFingers: num(s.nFingers, 6),
        fillFraction: num(s.fingerFill, 0.8),
      });
    }
    return vesselSlugCatcher({
      slugBbl: num(s.slugBbl),
      qLiquidBpd: num(s.qLiquidBpd, 0),
      holdMin: num(s.holdMin, 5),
      fillFraction: num(s.fillFraction, 0.6),
      ldRatio: num(s.ldRatio, 4),
    });
  }, [inputs.slug]);

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
    internalsOptions: K_BASE,
    // derived
    conditions,
    sweep,
    selected,
    detail,
    slug,
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

  return <SeparatorContext.Provider value={value}>{children}</SeparatorContext.Provider>;
};
