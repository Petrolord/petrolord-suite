// Gas Processing Studio state (Facilities F3,
// Facilities-ROADMAP.md §3 app 3) — the upgraded Gas Treating &
// Dehydration on the studio kit, keeping its slug. One app, three
// units (owner decision F#1): dehydration, sweetening, dew point.
//
// Every design choice the old app hid inside a constant is a visible
// input here. All derivations are live; a saved study is inputs only.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  saturatedWaterContent, kremserFractionRemoved, kremserStagesFor,
  tegPackage, AMINES, aminePackage, contactorDiameter,
  jouleThomsonFPerPsi, jtDrop,
} from '@/utils/facilities/engine/gasProcessing';

const TABLE = 'saved_gasprocessing_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save gas processing studies.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  if (error?.code === '42P01' || /relation[^\n]*saved_gasprocessing_projects[^\n]*does not exist/i.test(msg)) {
    return "Saving isn't set up yet. Run the f3_saved_gasprocessing_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => ({
  teg: {
    gasMMscfd: '50', pPsia: '1000', tF: '100',
    inletMode: 'saturated', inletLbMMscf: '60', outletLbMMscf: '7',
    circulationGalPerLb: '3', leanTegWtPct: '99',
    absorberTF: '100', reboilerTF: '380', refluxRatio: '0.25',
    stages: '2', absorptionFactor: '2.5',
    btexInletPpmv: '100', btexAbsorbedFrac: '0.15',
    gasSg: '0.65', ksFtS: '0.3',
  },
  amine: {
    gasMMscfd: '100', pPsia: '1000', tF: '110',
    co2MolPct: '4', h2sMolPct: '1', co2SpecMolPct: '2', h2sSpecMolPct: '0.0004',
    amineId: 'MDEA', amineWtPct: '45', leanLoading: '0.05', richLoading: '0.5',
    dutyBtuPerGal: '800', gasSg: '0.7', ksFtS: '0.25',
  },
  dewpoint: {
    p1Psia: '1000', p2Psia: '600', tF: '100', gasSg: '0.65', cpBtuLbmolF: '9.5',
  },
});

const SECTIONS = ['teg', 'amine', 'dewpoint'];

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

const GasProcessingContext = createContext();

export const useGasProcessing = () => {
  const context = useContext(GasProcessingContext);
  if (!context) throw new Error('useGasProcessing must be used within a GasProcessingProvider');
  return context;
};

const num = (v, fallback = NaN) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

export const GasProcessingProvider = ({ children }) => {
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

  // --- Dehydration ---
  const dehydration = useMemo(() => {
    const t = inputs.teg;
    const saturated = saturatedWaterContent({ pPsia: num(t.pPsia), tF: num(t.tF) });
    const inletLbMMscf = t.inletMode === 'saturated' && !saturated.error
      ? saturated.lbPerMMscf
      : num(t.inletLbMMscf);
    const pack = tegPackage({
      gasMMscfd: num(t.gasMMscfd),
      inletLbMMscf,
      outletLbMMscf: num(t.outletLbMMscf),
      circulationGalPerLb: num(t.circulationGalPerLb, 3),
      leanTegWtPct: num(t.leanTegWtPct, 99),
      absorberTF: num(t.absorberTF, 100),
      reboilerTF: num(t.reboilerTF, 380),
      refluxRatio: num(t.refluxRatio, 0.25),
      btexInletPpmv: num(t.btexInletPpmv, 0),
      btexAbsorbedFrac: num(t.btexAbsorbedFrac, 0.15),
    });
    if (pack.error) return { ...pack, saturated, inletLbMMscf };
    const removalNeeded = 1 - num(t.outletLbMMscf) / inletLbMMscf;
    const stagesNeeded = kremserStagesFor({
      absorptionFactor: num(t.absorptionFactor, 2.5),
      fractionRemoved: removalNeeded,
    });
    const fractionAtStages = kremserFractionRemoved({
      absorptionFactor: num(t.absorptionFactor, 2.5),
      stages: num(t.stages, 2),
    });
    const contactor = contactorDiameter({
      gasMMscfd: num(t.gasMMscfd), pPsia: num(t.pPsia), tF: num(t.tF),
      gasSg: num(t.gasSg, 0.65), ksFtS: num(t.ksFtS, 0.3),
    });
    return {
      saturated, inletLbMMscf, ...pack,
      removalNeeded, stagesNeeded, fractionAtStages,
      contactor,
    };
  }, [inputs.teg]);

  // --- Sweetening ---
  const sweetening = useMemo(() => {
    const a = inputs.amine;
    const pack = aminePackage({
      gasMMscfd: num(a.gasMMscfd),
      co2MolPct: num(a.co2MolPct, 0), h2sMolPct: num(a.h2sMolPct, 0),
      co2SpecMolPct: num(a.co2SpecMolPct, 0), h2sSpecMolPct: num(a.h2sSpecMolPct, 0),
      amineId: a.amineId,
      amineWtPct: num(a.amineWtPct, undefined),
      leanLoading: num(a.leanLoading, 0.05),
      richLoading: num(a.richLoading, undefined),
      dutyBtuPerGal: num(a.dutyBtuPerGal, undefined),
    });
    if (pack.error) return pack;
    const contactor = contactorDiameter({
      gasMMscfd: num(a.gasMMscfd), pPsia: num(a.pPsia), tF: num(a.tF),
      gasSg: num(a.gasSg, 0.7), ksFtS: num(a.ksFtS, 0.25),
    });
    return { ...pack, contactor };
  }, [inputs.amine]);

  // --- Dew point / JT ---
  const dewpoint = useMemo(() => {
    const d = inputs.dewpoint;
    const mu = jouleThomsonFPerPsi({
      pPsia: num(d.p1Psia), tF: num(d.tF), gasSg: num(d.gasSg, 0.65),
      cpBtuLbmolF: num(d.cpBtuLbmolF, 9.5),
    });
    if (mu.error) return mu;
    const drop = jtDrop({
      p1Psia: num(d.p1Psia), p2Psia: num(d.p2Psia), tF: num(d.tF),
      gasSg: num(d.gasSg, 0.65), cpBtuLbmolF: num(d.cpBtuLbmolF, 9.5),
    });
    if (drop.error) return { ...mu, dropError: drop.error };
    const waterAtOutlet = saturatedWaterContent({ pPsia: num(d.p2Psia), tF: drop.t2F });
    return { ...mu, ...drop, waterAtOutlet };
  }, [inputs.dewpoint]);

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
    amines: AMINES,
    // derived
    dehydration,
    sweetening,
    dewpoint,
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

  return <GasProcessingContext.Provider value={value}>{children}</GasProcessingContext.Provider>;
};
