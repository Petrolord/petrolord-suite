// Produced Water Treatment Studio state (Facilities F7,
// Facilities-ROADMAP.md §3 app 7): the rebuilt Produced Water
// Treatment on the studio kit, keeping its slug.
//
// The studio speaks field units (bwpd, F, ppm); the vendored engine
// works in SI on droplet distributions. This layer converts, builds
// the device chain from the user's train, and runs it.
//
// FC7-0 changed three things here that a user can see. Every box is
// parsed STRICTLY, so "50,000" is reported as a number the studio
// cannot read instead of being quietly designed for 50 barrels a day.
// No box has a silent fallback any more, so clearing one refuses by
// name instead of substituting a value nobody typed. And every derived
// block is wrapped, so a throw shows a message rather than a white
// screen.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  waterViscosityPaS, waterDensityKgM3, oilDensityKgM3,
  apiSeparator, plateInterceptor, hydrocyclone, flotation, mediaFilter,
  treatmentTrain, dropletBins, DECLARED_CONSTANTS,
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

/**
 * What separates induced from dissolved gas flotation is the bubble
 * size and the gas rate, and nothing else. The app used to hardcode 80
 * micron for DAF behind the user's back, against an engine in which the
 * bubble size could not move the answer at all, so the two menu items
 * produced the identical number. They are one-click presets on two live
 * boxes now.
 */
export const FLOTATION_PRESETS = {
  igf: { label: 'Induced gas', bubbleMicron: '300', gasRatio: '0.2' },
  daf: { label: 'Dissolved gas', bubbleMicron: '80', gasRatio: '0.03' },
};

/**
 * The filter coefficient used to be hardcoded 3.5 for walnut shell and
 * 4.2 for multi-media, and it was the ONLY difference between the two
 * menu items. It is a typed box now, with both values offered.
 */
export const FILTER_PRESETS = {
  nutshell: { label: 'Walnut shell', filterCoefficientPerM: '3.5' },
  media: { label: 'Multi-media', filterCoefficientPerM: '4.2' },
};

export const defaultInputs = () => ({
  water: { ...WATER_PRESETS.conventional, specPpm: '29' },
  train: { primary: 'cpi', secondary: 'hydrocyclone', tertiary: 'nutshell' },
  api: { lengthM: '12', widthM: '2', depthM: '1.2', shortCircuitF: '1.5' },
  cpi: { plateAreaM2: '2', nPlates: '40', efficiencyFactor: '0.7' },
  // 160 liners, not 20: at 50,000 bwpd twenty liners run at 7.7 times
  // their design flow, which the engine now refuses outright
  hydrocyclone: {
    nLiners: '160', linerDiameterMm: '35', linerLengthM: '0.7',
    designFlowPerLinerM3H: '2.16', gFieldAtDesign: '1000',
  },
  flotation: {
    cellVolumeM3: '8', nCells: '4', cellDepthM: '3',
    gasRatio: '0.2', bubbleMicron: '300',
  },
  // 16 m2, not 6: six square metres puts the shipped case at 55 m/hr,
  // over twice the loading the engine warns about
  filter: {
    areaM2: '16', bedDepthM: '0.9', mediaMicron: '800', filterCoefficientPerM: '3.5',
  },
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

/**
 * STRICT. `parseFloat` reads a prefix and throws the rest away, so
 * "50,000" came back as 50, "0.5.5" as 0.5 and "1/2" as 1, and the
 * studio then designed a train for fifty barrels a day and called the
 * result excellent. Anything that is not a whole number reaches the
 * engine as NaN, and the engine refuses it by name.
 *
 * There is no fallback either. A cleared box used to become a value
 * nobody typed: clearing the liner count gave ONE liner.
 */
const NUMERIC = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

export const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const t = v.trim();
  if (t === '' || !NUMERIC.test(t)) return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

/** Which boxes hold something that is not a number at all. */
export const findNumberFormatIssues = (inputs) => {
  const issues = [];
  SECTIONS.filter((s) => s !== 'train').forEach((section) => {
    Object.entries(inputs[section] || {}).forEach(([key, raw]) => {
      if (key === 'label') return;
      if (typeof raw !== 'string') return;
      const t = raw.trim();
      if (t === '' || NUMERIC.test(t)) return;
      issues.push({ section, key, raw });
    });
  });
  return issues;
};

const BWPD_TO_M3S = 0.158987294928 / 86400;

/** Run a derived block and turn anything thrown into a message. */
const guarded = (what, fn) => {
  try {
    return fn();
  } catch (e) {
    return { error: `${what} could not be worked out: ${e?.message || e}` };
  }
};

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

  const applyFlotationPreset = useCallback((key) => {
    const p = FLOTATION_PRESETS[key];
    if (!p) return;
    setInputs((prev) => ({
      ...prev,
      flotation: { ...prev.flotation, bubbleMicron: p.bubbleMicron, gasRatio: p.gasRatio },
    }));
    addNotification(`${p.label} bubble size and gas rate loaded.`, 'success');
  }, [addNotification]);

  const applyFilterPreset = useCallback((key) => {
    const p = FILTER_PRESETS[key];
    if (!p) return;
    setInputs((prev) => ({
      ...prev,
      filter: { ...prev.filter, filterCoefficientPerM: p.filterCoefficientPerM },
    }));
    addNotification(`${p.label} filter coefficient loaded.`, 'success');
  }, [addNotification]);

  const numberFormatIssues = useMemo(() => findNumberFormatIssues(inputs), [inputs]);

  /** Fluid properties: this is where temperature and salinity act. */
  const fluid = useMemo(() => guarded('the water properties', () => {
    const w = inputs.water;
    const tF = num(w.tF);
    const tC = (tF - 32) / 1.8;
    const tdsPpm = num(w.tdsPpm);
    const mu = waterViscosityPaS({ tC, tdsPpm });
    if (mu.error) return mu;
    const rhoW = waterDensityKgM3({ tC, tdsPpm });
    if (rhoW.error) return rhoW;
    const rhoO = oilDensityKgM3({ apiGravity: num(w.oilApi), tC });
    if (rhoO.error) return rhoO;
    const rhoWater = rhoW.rhoKgM3;
    const rhoOil = rhoO.rhoKgM3;
    if (!(rhoWater > rhoOil)) {
      return { error: 'this oil is denser than the water at these conditions: gravity separation cannot work and the whole train premise fails' };
    }
    const flowBwpd = num(w.flowBwpd);
    if (!(flowBwpd > 0)) {
      return { error: 'the water rate must be a positive number of barrels per day' };
    }
    return {
      tC, tdsPpm, muPaS: mu.muPaS, muCp: mu.muPaS * 1000,
      salinityFactor: mu.salinityFactor,
      rhoWater, rhoOil, deltaRho: rhoWater - rhoOil,
      flowM3S: flowBwpd * BWPD_TO_M3S,
    };
  }), [inputs.water]);

  /** Build the device chain from the chosen train. */
  const devices = useMemo(() => guarded('the equipment', () => {
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
          key,
          name: label,
          ...apiSeparator({
            ...common,
            lengthM: num(inputs.api.lengthM),
            widthM: num(inputs.api.widthM),
            depthM: num(inputs.api.depthM),
            shortCircuitF: num(inputs.api.shortCircuitF),
          }),
        };
      }
      if (key === 'cpi') {
        return {
          key,
          name: label,
          ...plateInterceptor({
            ...common,
            plateAreaM2: num(inputs.cpi.plateAreaM2),
            nPlates: num(inputs.cpi.nPlates),
            efficiencyFactor: num(inputs.cpi.efficiencyFactor),
          }),
        };
      }
      if (key === 'hydrocyclone') {
        return {
          key,
          name: label,
          ...hydrocyclone({
            ...common,
            nLiners: num(inputs.hydrocyclone.nLiners),
            linerDiameterM: num(inputs.hydrocyclone.linerDiameterMm) / 1000,
            linerLengthM: num(inputs.hydrocyclone.linerLengthM),
            designFlowPerLinerM3S: num(inputs.hydrocyclone.designFlowPerLinerM3H) / 3600,
            gFieldAtDesign: num(inputs.hydrocyclone.gFieldAtDesign),
          }),
        };
      }
      if (key === 'igf' || key === 'daf') {
        return {
          key,
          name: label,
          ...flotation({
            ...common,
            cellVolumeM3: num(inputs.flotation.cellVolumeM3),
            nCells: num(inputs.flotation.nCells),
            cellDepthM: num(inputs.flotation.cellDepthM),
            gasRatio: num(inputs.flotation.gasRatio),
            bubbleMicron: num(inputs.flotation.bubbleMicron),
          }),
        };
      }
      if (key === 'nutshell' || key === 'media') {
        return {
          key,
          name: label,
          ...mediaFilter({
            flowM3S: fluid.flowM3S,
            areaM2: num(inputs.filter.areaM2),
            bedDepthM: num(inputs.filter.bedDepthM),
            mediaMicron: num(inputs.filter.mediaMicron),
            filterCoefficientPerM: num(inputs.filter.filterCoefficientPerM),
          }),
        };
      }
      return null;
    };
    const list = ['primary', 'secondary', 'tertiary']
      .map((s) => build(inputs.train[s]))
      .filter(Boolean);
    return { list };
  }), [fluid, inputs.train, inputs.api, inputs.cpi, inputs.hydrocyclone, inputs.flotation, inputs.filter]);

  /** Run the train. */
  const result = useMemo(() => guarded('the treatment train', () => {
    if (devices.error) return { error: devices.error };
    if (!devices.list.length) return { error: 'choose at least one treatment device' };
    const w = inputs.water;
    return treatmentTrain({
      inletOiwPpm: num(w.oiwPpm),
      inletD50Micron: num(w.inletD50Micron),
      sigma: num(w.sigma),
      devices: devices.list,
      specPpm: num(w.specPpm),
    });
  }), [devices, inputs.water]);

  /**
   * Inlet distribution for the chart, on THE SAME GRID the train runs
   * on. The chart used to be drawn at 30 bins against a calculation at
   * 60, so the picture and the numbers discretised the same
   * distribution two different ways.
   */
  const distribution = useMemo(() => guarded('the droplet distribution', () => {
    const w = inputs.water;
    return dropletBins({
      d50: num(w.inletD50Micron),
      sigma: num(w.sigma),
      nBins: DECLARED_CONSTANTS.defaultNBins,
    });
  }), [inputs.water]);

  // --- Project lifecycle (studio-kit recipe) ---
  const serialize = useCallback((name) => ({
    id: currentProjectId,
    name,
    schema: 3,
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
    applyFlotationPreset,
    applyFilterPreset,
    presets: WATER_PRESETS,
    flotationPresets: FLOTATION_PRESETS,
    filterPresets: FILTER_PRESETS,
    catalog: DEVICE_CATALOG,
    constants: DECLARED_CONSTANTS,
    // derived
    fluid,
    devices,
    result,
    distribution,
    numberFormatIssues,
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
