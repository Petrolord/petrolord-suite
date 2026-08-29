// Pipeline & Line Sizing Studio state (Facilities F1,
// Facilities-ROADMAP.md §3 app 2) — the flagship that consolidates
// Facility Network Hydraulics, the retired Pipeline Sizer and the
// retired Pipeline Designer into one app on validated engines.
//
// Everything here is a live derivation: a single line evaluated at one
// bore, the same line swept across every schedule bore, a profile
// marched station by station, a wall checked against its code. None of
// it is expensive enough to need an explicit run, so it recomputes as
// you type, and a saved project is inputs only — results are re-derived
// on load so a reopened study answers with today's engines.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  liquidLineDrop, liquidLineTraverse, gasOutletPressure, gasLineTraverse,
  multiphaseLine, erosionalStatus, sizeSweep, gasDensityLbFt3,
  oilDensityLbFt3, requiredWallIn, maopPsig,
  lineVolumeBbl, sweptLiquidBbl, pigRun, piggingInterval,
  PIPE_SCHEDULE, ROUGHNESS_IN, roughnessOf, scheduleRow,
  GAS_EQUATIONS, EROSIONAL_C, erosionalC,
} from '@/utils/facilities/lineSizing';

const TABLE = 'saved_linesizing_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save line sizing studies.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  const missingTable = error?.code === '42P01'
    || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist`, 'i').test(msg);
  if (missingTable) {
    return "Saving isn't set up yet. Run the f1_saved_linesizing_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => ({
  mode: 'liquid',
  liquid: {
    qBpd: '8000', rhoMode: 'api', oilApi: '35', rhoLbFt3: '54', muCp: '3', maxVFtS: '15',
  },
  gas: {
    qMMscfd: '20', p1Psia: '900', tAvgF: '70', sg: '0.65',
    equation: 'weymouth', efficiency: '0.95', zMode: 'auto', zAvg: '0.9', muCp: '0.011',
  },
  multiphase: {
    qLiquidBpd: '4000', wctPct: '30', qGasMMscfd: '2', pPsia: '500', tF: '120',
    oilApi: '35', waterSg: '1.02', gasSg: '0.65',
    muOilCp: '2', muWaterCp: '0.6', muGasCp: '0.012', sigmaLDynCm: '25',
  },
  pipe: {
    source: 'schedule', nps: '6', schedule: '40', customIdIn: '6.065',
    roughnessId: 'commercialSteel', customRoughIn: '',
    lengthFt: '15000', elevChangeFt: '0',
    cPreset: 'continuous', cFactor: '100',
  },
  profile: {
    // Which physics marches the profile follows the sizing mode.
    segments: [
      { lengthFt: '5000', elevChangeFt: '0' },
      { lengthFt: '5000', elevChangeFt: '150' },
      { lengthFt: '5000', elevChangeFt: '-150' },
    ],
    p1Psia: '900',
  },
  wall: {
    odIn: '6.625', designPsig: '1440', smysPsi: '52000', code: 'B31.4', locationClass: '1',
    jointFactor: '1', tempDerate: '1', corrosionAllowanceIn: '0.0625', actualWallIn: '0.28',
  },
  pigging: {
    holdupSource: 'multiphase', holdupFrac: '0.1', pigSpeedFtS: '5',
    maxSlugBbl: '200', dropoutBpd: '25',
  },
});

const SECTIONS = ['liquid', 'gas', 'multiphase', 'pipe', 'profile', 'wall', 'pigging'];

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  const base = defaultInputs();
  const out = { ...base, mode: raw.mode || base.mode };
  SECTIONS.forEach((s) => {
    out[s] = { ...base[s], ...(raw[s] || {}) };
  });
  if (Array.isArray(raw.profile?.segments) && raw.profile.segments.length) {
    out.profile.segments = raw.profile.segments.map((seg) => ({
      lengthFt: String(seg.lengthFt ?? '0'),
      elevChangeFt: String(seg.elevChangeFt ?? '0'),
    }));
  }
  return out;
};

const LineSizingContext = createContext();

export const useLineSizing = () => {
  const context = useContext(LineSizingContext);
  if (!context) throw new Error('useLineSizing must be used within a LineSizingProvider');
  return context;
};

const num = (v, fallback = NaN) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

/** The bore the study runs at, from the schedule or typed directly. */
export const resolveBore = (pipe) => {
  if (pipe.source === 'custom') {
    const idIn = num(pipe.customIdIn);
    return idIn > 0 ? { idIn, label: `${idIn} in bore (typed)` } : { error: 'enter a positive bore' };
  }
  const row = scheduleRow(num(pipe.nps), pipe.schedule);
  if (!row) return { error: `no ${pipe.nps} in schedule ${pipe.schedule} row in the checked table; type the bore directly` };
  return { idIn: row.id, odIn: row.od, wallIn: row.wall, label: `${row.nps} in sch ${row.schedule} (${row.id} in bore)` };
};

export const resolveRoughness = (pipe) => {
  const custom = num(pipe.customRoughIn);
  if (custom > 0) return custom;
  const r = roughnessOf(pipe.roughnessId);
  return r > 0 ? r : 0.0018;
};

export const LineSizingProvider = ({ children }) => {
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
  const patchSection = useCallback((section, patch) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
  }, []);
  const setMode = useCallback((mode) => {
    setInputs((prev) => ({ ...prev, mode }));
  }, []);
  const applyCPreset = useCallback((id) => {
    patchSection('pipe', { cPreset: id, cFactor: String(erosionalC(id).c) });
  }, [patchSection]);

  const setSegment = useCallback((index, key, value) => {
    setInputs((prev) => {
      const segments = prev.profile.segments.map((s, i) => (i === index ? { ...s, [key]: value } : s));
      return { ...prev, profile: { ...prev.profile, segments } };
    });
  }, []);
  const addSegment = useCallback(() => {
    setInputs((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        segments: [...prev.profile.segments, { lengthFt: '5000', elevChangeFt: '0' }],
      },
    }));
  }, []);
  const removeSegment = useCallback((index) => {
    setInputs((prev) => ({
      ...prev,
      profile: { ...prev.profile, segments: prev.profile.segments.filter((_, i) => i !== index) },
    }));
  }, []);

  /** Prefill from the Fluid Studio backbone hand-off. */
  const applyFluidBackbone = useCallback((backbone) => {
    if (!backbone) return;
    const patch = {};
    if (Number.isFinite(backbone.oil_gravity)) patch.oilApi = String(backbone.oil_gravity);
    if (Number.isFinite(backbone.gas_gravity)) patch.gasSg = String(backbone.gas_gravity);
    if (Number.isFinite(backbone.inlet_temperature)) patch.tF = String(backbone.inlet_temperature);
    if (Object.keys(patch).length === 0) return;
    setInputs((prev) => ({
      ...prev,
      mode: 'multiphase',
      multiphase: { ...prev.multiphase, ...patch },
      gas: {
        ...prev.gas,
        ...(patch.gasSg ? { sg: patch.gasSg } : {}),
        ...(patch.tF ? { tAvgF: patch.tF } : {}),
      },
    }));
    addNotification('Fluid Studio backbone applied: oil gravity, gas gravity and temperature prefilled.', 'success');
  }, [addNotification]);

  // --- Live derivations ---
  const bore = useMemo(() => resolveBore(inputs.pipe), [inputs.pipe]);
  const roughnessIn = useMemo(() => resolveRoughness(inputs.pipe), [inputs.pipe]);
  const lengthFt = num(inputs.pipe.lengthFt);
  const elevChangeFt = num(inputs.pipe.elevChangeFt, 0);
  const cFactor = num(inputs.pipe.cFactor, 100);

  const liquidArgs = useMemo(() => {
    const rhoLbFt3 = inputs.liquid.rhoMode === 'api'
      ? oilDensityLbFt3(num(inputs.liquid.oilApi, 35))
      : num(inputs.liquid.rhoLbFt3);
    return {
      qBpd: num(inputs.liquid.qBpd), rhoLbFt3, muCp: num(inputs.liquid.muCp),
      lengthFt, elevChangeFt, roughnessIn,
    };
  }, [inputs.liquid, lengthFt, elevChangeFt, roughnessIn]);

  const gasArgs = useMemo(() => {
    const p1Psia = num(inputs.gas.p1Psia);
    const tF = num(inputs.gas.tAvgF, 70);
    const sg = num(inputs.gas.sg, 0.65);
    let zAvg = num(inputs.gas.zAvg, 0.9);
    let zNote = 'typed';
    if (inputs.gas.zMode === 'auto' && p1Psia > 14.7) {
      const z1 = gasDensityLbFt3({ pPsia: p1Psia, tF, gasSg: sg });
      if (!z1.error) { zAvg = z1.z; zNote = 'DAK at inlet'; }
    }
    return {
      qScfd: num(inputs.gas.qMMscfd) * 1e6,
      p1Psia,
      sg,
      tAvgR: tF + 459.67,
      tF,
      zAvg,
      zNote,
      efficiency: num(inputs.gas.efficiency, 1),
      equation: inputs.gas.equation,
      muCp: num(inputs.gas.muCp, 0.011),
      roughnessIn,
      lengthMi: lengthFt / 5280,
      elevChangeFt,
    };
  }, [inputs.gas, lengthFt, elevChangeFt, roughnessIn]);

  const multiphaseArgs = useMemo(() => ({
    qLiquidBpd: num(inputs.multiphase.qLiquidBpd),
    wctPct: num(inputs.multiphase.wctPct, 0),
    qGasScfd: num(inputs.multiphase.qGasMMscfd, 0) * 1e6,
    pPsia: num(inputs.multiphase.pPsia),
    tF: num(inputs.multiphase.tF, 120),
    lengthFt,
    elevChangeFt,
    roughnessIn,
    oilApi: num(inputs.multiphase.oilApi, 35),
    waterSg: num(inputs.multiphase.waterSg, 1.02),
    gasSg: num(inputs.multiphase.gasSg, 0.65),
    muOilCp: num(inputs.multiphase.muOilCp, 2),
    muWaterCp: num(inputs.multiphase.muWaterCp, 0.6),
    muGasCp: num(inputs.multiphase.muGasCp, 0.012),
    sigmaLDynCm: num(inputs.multiphase.sigmaLDynCm, 25),
  }), [inputs.multiphase, lengthFt, elevChangeFt, roughnessIn]);

  const sizing = useMemo(() => {
    if (bore.error) return { error: bore.error };
    try {
      if (inputs.mode === 'liquid') {
        const r = liquidLineDrop({ ...liquidArgs, idIn: bore.idIn });
        if (r.error) return r;
        const ero = erosionalStatus({ vFtS: r.vFtS, rhoMixLbFt3: liquidArgs.rhoLbFt3, cFactor });
        return { mode: 'liquid', ...r, ...ero, maxVFtS: num(inputs.liquid.maxVFtS, 15) };
      }
      if (inputs.mode === 'gas') {
        const inv = gasOutletPressure({ ...gasArgs, idIn: bore.idIn });
        if (inv.error) return inv;
        return {
          mode: 'gas', ...inv, zAvg: gasArgs.zAvg, zNote: gasArgs.zNote,
          gradientPsiPerFt: inv.dpPsi / lengthFt,
        };
      }
      const r = multiphaseLine({ ...multiphaseArgs, idIn: bore.idIn });
      if (r.error) return r;
      const ero = erosionalStatus({ vFtS: r.vm, rhoMixLbFt3: r.rhoMixLbFt3, cFactor });
      return { mode: 'multiphase', ...r, ...ero };
    } catch (e) {
      console.error(e);
      return { error: e.message };
    }
  }, [inputs.mode, inputs.liquid.maxVFtS, bore, liquidArgs, gasArgs, multiphaseArgs, cFactor, lengthFt]);

  const sweep = useMemo(() => {
    try {
      if (inputs.mode === 'liquid') {
        return sizeSweep({
          mode: 'liquid', inputs: liquidArgs, cFactor, maxLiquidVFtS: num(inputs.liquid.maxVFtS, 15),
        });
      }
      if (inputs.mode === 'gas') {
        return sizeSweep({ mode: 'gas', inputs: gasArgs, cFactor });
      }
      return sizeSweep({ mode: 'multiphase', inputs: multiphaseArgs, cFactor });
    } catch (e) {
      console.error(e);
      return { error: e.message };
    }
  }, [inputs.mode, inputs.liquid.maxVFtS, liquidArgs, gasArgs, multiphaseArgs, cFactor]);

  const profile = useMemo(() => {
    if (bore.error) return { error: bore.error };
    const segments = inputs.profile.segments
      .map((s) => ({ lengthFt: num(s.lengthFt), elevChangeFt: num(s.elevChangeFt, 0) }))
      .filter((s) => s.lengthFt > 0);
    if (!segments.length) return { error: 'add at least one profile segment' };
    try {
      if (inputs.mode === 'gas') {
        return gasLineTraverse({
          equation: gasArgs.equation, qScfd: gasArgs.qScfd,
          p1Psia: num(inputs.profile.p1Psia, gasArgs.p1Psia),
          idIn: bore.idIn, sg: gasArgs.sg, tAvgR: gasArgs.tAvgR, zAvg: gasArgs.zAvg,
          efficiency: gasArgs.efficiency, muCp: gasArgs.muCp, roughnessIn,
          profile: segments,
        });
      }
      if (inputs.mode === 'multiphase') {
        // Marched with Beggs & Brill per segment at the local inclination.
        let p = num(inputs.profile.p1Psia, multiphaseArgs.pPsia);
        let x = 0; let zft = 0;
        const stations = [{ distanceFt: 0, elevFt: 0, pPsia: p }];
        for (const seg of segments) {
          const r = multiphaseLine({
            ...multiphaseArgs, pPsia: p, idIn: bore.idIn,
            lengthFt: seg.lengthFt, elevChangeFt: seg.elevChangeFt,
          });
          if (r.error) return { error: `${r.error} (segment ending at ${(x + seg.lengthFt).toFixed(0)} ft)` };
          p = r.p2Psia;
          if (!(p > 14.7)) return { error: `the line dies before ${(x + seg.lengthFt).toFixed(0)} ft: pressure fell to atmospheric` };
          x += seg.lengthFt; zft += seg.elevChangeFt;
          stations.push({ distanceFt: x, elevFt: zft, pPsia: p });
        }
        return { stations, p2Psia: p, dpTotalPsi: stations[0].pPsia - p };
      }
      return liquidLineTraverse({
        p1Psia: num(inputs.profile.p1Psia, 900),
        qBpd: liquidArgs.qBpd, idIn: bore.idIn,
        rhoLbFt3: liquidArgs.rhoLbFt3, muCp: liquidArgs.muCp, roughnessIn,
        profile: segments,
      });
    } catch (e) {
      console.error(e);
      return { error: e.message };
    }
  }, [inputs.mode, inputs.profile, bore, liquidArgs, gasArgs, multiphaseArgs, roughnessIn]);

  const wall = useMemo(() => {
    const args = {
      odIn: num(inputs.wall.odIn),
      designPsig: num(inputs.wall.designPsig),
      smysPsi: num(inputs.wall.smysPsi),
      code: inputs.wall.code,
      locationClass: num(inputs.wall.locationClass, 1),
      jointFactor: num(inputs.wall.jointFactor, 1),
      tempDerate: num(inputs.wall.tempDerate, 1),
      corrosionAllowanceIn: num(inputs.wall.corrosionAllowanceIn, 0),
    };
    const req = requiredWallIn(args);
    if (req.error) return req;
    const actualWallIn = num(inputs.wall.actualWallIn, NaN);
    const rated = Number.isFinite(actualWallIn)
      ? maopPsig({ ...args, wallIn: actualWallIn })
      : null;
    return {
      ...req,
      actualWallIn,
      maop: rated && !rated.error ? rated.maopPsig : null,
      maopError: rated?.error || null,
      pass: Number.isFinite(actualWallIn) ? actualWallIn >= req.tRequiredIn : null,
    };
  }, [inputs.wall]);

  const pigging = useMemo(() => {
    if (bore.error) return { error: bore.error };
    const fromMp = inputs.pigging.holdupSource === 'multiphase';
    const mp = fromMp ? multiphaseLine({ ...multiphaseArgs, idIn: bore.idIn }) : null;
    if (fromMp && mp?.error) return { error: `holdup from the Multiphase tab failed: ${mp.error}` };
    const holdupFrac = fromMp ? mp.holdup : num(inputs.pigging.holdupFrac);
    const swept = sweptLiquidBbl({ idIn: bore.idIn, lengthFt, holdupFrac });
    if (swept.error) return swept;
    const run = pigRun({ lengthFt, pigSpeedFtS: num(inputs.pigging.pigSpeedFtS, 5) });
    if (run.error) return run;
    const interval = piggingInterval({
      maxSlugBbl: num(inputs.pigging.maxSlugBbl),
      dropoutBpd: num(inputs.pigging.dropoutBpd),
      sweptBbl: swept.sweptBbl,
    });
    return {
      holdupFrac,
      holdupNote: fromMp ? `Beggs & Brill holdup at the Multiphase tab's conditions (${mp.pattern})` : 'typed',
      lineVolumeBbl: lineVolumeBbl({ idIn: bore.idIn, lengthFt }),
      sweptBbl: swept.sweptBbl,
      runHours: run.runHours,
      intervalDays: interval.error ? null : interval.intervalDays,
      intervalError: interval.error || null,
    };
  }, [inputs.pigging, bore, lengthFt, multiphaseArgs]);

  // --- Project lifecycle (the studio-kit recipe) ---
  const serialize = useCallback((name) => ({
    id: currentProjectId,
    name,
    schema: 1,
    mode: inputs.mode,
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
      setProjectName(payload.name || projects.find((p) => p.id === id)?.name || 'Untitled study');
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
    patchSection,
    setMode,
    applyCPreset,
    setSegment,
    addSegment,
    removeSegment,
    applyFluidBackbone,
    // catalogs
    pipeSchedule: PIPE_SCHEDULE,
    roughnessOptions: ROUGHNESS_IN,
    gasEquations: GAS_EQUATIONS,
    erosionalPresets: EROSIONAL_C,
    // derived
    bore,
    roughnessIn,
    sizing,
    sweep,
    profile,
    wall,
    pigging,
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

  return <LineSizingContext.Provider value={value}>{children}</LineSizingContext.Provider>;
};
