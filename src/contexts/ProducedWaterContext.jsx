// Produced Water Treatment Studio state (Facilities F7,
// Facilities-ROADMAP.md §3 app 7) — the rebuilt Produced Water
// Treatment on the studio kit, keeping its slug.
//
// The studio speaks field units (bwpd, F, ppm); the vendored engine
// works in SI on droplet distributions. This layer converts, builds
// the device chain from the user's train, and runs it.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  waterViscosityPaS, waterDensityKgM3, oilDensityKgM3,
  apiSeparator, plateInterceptor, hydrocyclone, flotation, mediaFilter,
  treatmentTrain, dropletBins,
} from '@/utils/facilities/engine/producedWater';

const TABLE = 'saved_pwt_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save water treatment studies.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  if (error?.code === '42P01' || /relation[^\n]*saved_pwt_projects[^\n]*does not exist/i.test(msg)) {
    return "Saving isn't set up yet. Run the f7_saved_pwt_projects migration.";
  }
  return msg || 'Unexpected error.';
};

/** Water presets, now carrying the droplet character that matters. */
export const WATER_PRESETS = {
  conventional: {
    label: 'Conventional produced water',
    flowBwpd: '50000', oiwPpm: '500', tdsPpm: '35000', tF: '120',
    oilApi: '32', inletD50Micron: '30', sigma: '0.7',
  },
  unconventional: {
    label: 'Unconventional (high TDS)',
    flowBwpd: '20000', oiwPpm: '1500', tdsPpm: '150000', tF: '140',
    oilApi: '38', inletD50Micron: '20', sigma: '0.8',
  },
  flowback: {
    label: 'Flowback (sheared, fine)',
    flowBwpd: '10000', oiwPpm: '2000', tdsPpm: '80000', tF: '110',
    oilApi: '35', inletD50Micron: '12', sigma: '0.9',
  },
};

export const DEVICE_CATALOG = {
  none: { label: 'None' },
  api: { label: 'API 421 separator (gravity basin)', stage: 'primary' },
  cpi: { label: 'Corrugated plate interceptor', stage: 'primary' },
  hydrocyclone: { label: 'De-oiling hydrocyclone', stage: 'secondary' },
  igf: { label: 'Induced gas flotation', stage: 'secondary' },
  daf: { label: 'Dissolved gas flotation', stage: 'secondary' },
  nutshell: { label: 'Walnut shell filter', stage: 'tertiary' },
  media: { label: 'Multi-media filter', stage: 'tertiary' },
};

export const defaultInputs = () => ({
  water: { ...WATER_PRESETS.conventional, specPpm: '29' },
  train: { primary: 'cpi', secondary: 'hydrocyclone', tertiary: 'nutshell' },
  api: { lengthM: '12', widthM: '2', depthM: '1.2', shortCircuitF: '1.5' },
  cpi: { plateAreaM2: '2', nPlates: '40', efficiencyFactor: '0.7' },
  hydrocyclone: { nLiners: '20', linerDiameterMm: '35' },
  flotation: { cellVolumeM3: '8', nCells: '4', gasRatio: '0.3', bubbleMicron: '300' },
  filter: { areaM2: '6', bedDepthM: '0.9' },
});

const SECTIONS = ['water', 'train', 'api', 'cpi', 'hydrocyclone', 'flotation', 'filter'];

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

const ProducedWaterContext = createContext();

export const useProducedWater = () => {
  const context = useContext(ProducedWaterContext);
  if (!context) throw new Error('useProducedWater must be used within a ProducedWaterProvider');
  return context;
};

const num = (v, fallback = NaN) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const BWPD_TO_M3S = 0.158987294928 / 86400;

export const ProducedWaterProvider = ({ children }) => {
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

  const applyPreset = useCallback((key) => {
    const p = WATER_PRESETS[key];
    if (!p) return;
    setInputs((prev) => ({ ...prev, water: { ...prev.water, ...p } }));
    addNotification(`${p.label} loaded.`, 'success');
  }, [addNotification]);

  /** Fluid properties: this is where temperature and salinity act. */
  const fluid = useMemo(() => {
    const w = inputs.water;
    const tC = (num(w.tF) - 32) / 1.8;
    const tdsPpm = num(w.tdsPpm, 0);
    const mu = waterViscosityPaS({ tC, tdsPpm });
    if (mu.error) return mu;
    const rhoWater = waterDensityKgM3({ tC, tdsPpm });
    const rhoOil = oilDensityKgM3({ apiGravity: num(w.oilApi, 32), tC });
    if (!(rhoWater > rhoOil)) {
      return { error: 'this oil is denser than the water at these conditions: gravity separation cannot work and the whole train premise fails' };
    }
    return {
      tC, tdsPpm, muPaS: mu.muPaS, muCp: mu.muPaS * 1000,
      salinityFactor: mu.salinityFactor,
      rhoWater, rhoOil, deltaRho: rhoWater - rhoOil,
      flowM3S: num(w.flowBwpd) * BWPD_TO_M3S,
    };
  }, [inputs.water]);

  /** Build the device chain from the chosen train. */
  const devices = useMemo(() => {
    if (fluid.error) return { error: fluid.error };
    const common = {
      flowM3S: fluid.flowM3S,
      rhoWater: fluid.rhoWater,
      rhoOil: fluid.rhoOil,
      muPaS: fluid.muPaS,
    };
    const build = (key) => {
      if (!key || key === 'none') return null;
      const label = DEVICE_CATALOG[key]?.label || key;
      if (key === 'api') {
        return {
          key, name: label,
          ...apiSeparator({
            ...common,
            lengthM: num(inputs.api.lengthM), widthM: num(inputs.api.widthM),
            depthM: num(inputs.api.depthM), shortCircuitF: num(inputs.api.shortCircuitF, 1.5),
          }),
        };
      }
      if (key === 'cpi') {
        return {
          key, name: label,
          ...plateInterceptor({
            ...common,
            plateAreaM2: num(inputs.cpi.plateAreaM2), nPlates: num(inputs.cpi.nPlates),
            efficiencyFactor: num(inputs.cpi.efficiencyFactor, 0.7),
          }),
        };
      }
      if (key === 'hydrocyclone') {
        return {
          key, name: label,
          ...hydrocyclone({
            ...common,
            nLiners: num(inputs.hydrocyclone.nLiners, 1),
            linerDiameterM: num(inputs.hydrocyclone.linerDiameterMm, 35) / 1000,
          }),
        };
      }
      if (key === 'igf' || key === 'daf') {
        return {
          key, name: label,
          ...flotation({
            ...common,
            cellVolumeM3: num(inputs.flotation.cellVolumeM3),
            nCells: num(inputs.flotation.nCells, 1),
            gasRatio: num(inputs.flotation.gasRatio, 0.3),
            bubbleMicron: key === 'daf' ? 80 : num(inputs.flotation.bubbleMicron, 300),
          }),
        };
      }
      if (key === 'nutshell' || key === 'media') {
        return {
          key, name: label,
          ...mediaFilter({
            flowM3S: fluid.flowM3S,
            areaM2: num(inputs.filter.areaM2),
            bedDepthM: num(inputs.filter.bedDepthM, 0.9),
            filterCoefficientPerM: key === 'nutshell' ? 3.5 : 4.2,
          }),
        };
      }
      return null;
    };
    const list = ['primary', 'secondary', 'tertiary']
      .map((s) => build(inputs.train[s]))
      .filter(Boolean);
    return { list };
  }, [fluid, inputs.train, inputs.api, inputs.cpi, inputs.hydrocyclone, inputs.flotation, inputs.filter]);

  /** Run the train. */
  const result = useMemo(() => {
    if (devices.error) return { error: devices.error };
    if (!devices.list.length) return { error: 'choose at least one treatment device' };
    const w = inputs.water;
    const t = treatmentTrain({
      inletOiwPpm: num(w.oiwPpm),
      inletD50Micron: num(w.inletD50Micron, 30),
      sigma: num(w.sigma, 0.7),
      devices: devices.list,
      specPpm: num(w.specPpm, 0),
    });
    return t;
  }, [devices, inputs.water]);

  /** Inlet distribution for the chart. */
  const distribution = useMemo(() => {
    const w = inputs.water;
    const d = dropletBins({
      d50: num(w.inletD50Micron, 30), sigma: num(w.sigma, 0.7), nBins: 30,
    });
    return d;
  }, [inputs.water]);

  // --- Project lifecycle (studio-kit recipe) ---
  const serialize = useCallback((name) => ({
    id: currentProjectId,
    name,
    schema: 2,
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
    applyPreset,
    presets: WATER_PRESETS,
    catalog: DEVICE_CATALOG,
    // derived
    fluid,
    devices,
    result,
    distribution,
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

  return <ProducedWaterContext.Provider value={value}>{children}</ProducedWaterContext.Provider>;
};
