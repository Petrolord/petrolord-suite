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

export const ABSOLUTE_ZERO_F = -459.67;

/**
 * One horsepower-hour is 2544.43 Btu, so a driver whose heat rate is
 * below that figure is being reported as more than 100 percent
 * efficient (FC3 finding C3).
 */
export const MIN_HEAT_RATE_BTU_HP_HR = 2544.43;

/**
 * Every typed box this studio hands to the compression engine, checked
 * at the door.
 *
 * The engine guards about half of its inputs and hands the rest
 * straight to the arithmetic, so an unguarded one comes back as a
 * non-finite number with no `error` key, or as a refusal that names
 * four inputs that were all correct, or (at a negative maximum ratio
 * per stage) as a thrown TypeError that takes the whole studio down.
 * A refusal here is a named refusal (FC3 findings S3, C4, C6, C7).
 */
export const dutyIssue = (a) => {
  const finite = [
    ['qMMscfd', 'the gas rate'],
    ['pSuctionPsia', 'the suction pressure'],
    ['pDischargePsia', 'the discharge pressure'],
    ['tSuctionF', 'the suction temperature'],
    ['gasSg', 'the gas gravity'],
    ['k', 'the heat capacity ratio k'],
    ['polytropicEfficiency', 'the polytropic efficiency'],
    ['mechanicalEfficiency', 'the mechanical efficiency'],
    ['maxRatioPerStage', 'the maximum ratio per stage'],
    ['maxDischargeF', 'the maximum discharge temperature'],
    ['cpBtuLbF', 'the gas heat capacity'],
  ];
  const blank = finite.find(([key]) => !Number.isFinite(a[key]));
  if (blank) return `${blank[1]} needs a number`;

  if (!(a.qMMscfd > 0)) return 'the gas rate must be above zero';
  if (!(a.pSuctionPsia > 0)) return 'the suction pressure must be above a full vacuum, which is -14.7 psig';
  if (!(a.pDischargePsia > a.pSuctionPsia)) return 'the discharge pressure must be above the suction pressure';
  if (!(a.gasSg > 0)) return 'the gas gravity must be above zero';
  if (!(a.k > 1)) return 'the heat capacity ratio k must be above 1';
  if (!(a.tSuctionF > ABSOLUTE_ZERO_F)) {
    return `a suction temperature of ${a.tSuctionF} F is at or below absolute zero (${ABSOLUTE_ZERO_F} F)`;
  }
  if (!(a.maxDischargeF > ABSOLUTE_ZERO_F)) {
    return `a maximum discharge temperature of ${a.maxDischargeF} F is at or below absolute zero (${ABSOLUTE_ZERO_F} F)`;
  }
  if (Number.isFinite(a.interstageCoolToF) && !(a.interstageCoolToF > ABSOLUTE_ZERO_F)) {
    return `an intercooler outlet of ${a.interstageCoolToF} F is at or below absolute zero (${ABSOLUTE_ZERO_F} F)`;
  }
  if (!(a.polytropicEfficiency > 0) || a.polytropicEfficiency > 1) {
    return 'the polytropic efficiency must be above 0 and at most 1: 0.72 to 0.82 is the usual range';
  }
  if (!(a.mechanicalEfficiency > 0) || a.mechanicalEfficiency > 1) {
    return 'the mechanical efficiency must be above 0 and at most 1';
  }
  if (!(a.maxRatioPerStage > 1)) {
    return 'the maximum ratio per stage must be above 1: at a ratio of 1 a stage does no compression at all, so no number of stages reaches the discharge pressure';
  }
  if (!(a.cpBtuLbF > 0)) return 'the gas heat capacity must be above zero';
  return null;
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

  /** Every typed input, checked at the door before the engine sees it. */
  const refusal = useMemo(() => {
    const issue = dutyIssue(engineArgs);
    return issue ? { error: issue } : null;
  }, [engineArgs]);

  /** The train. */
  const train = useMemo(
    () => refusal || compressorTrain(engineArgs),
    [refusal, engineArgs],
  );

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
    const heatRate = num(inputs.driver.heatRateBtuHpHr);
    const lhv = num(inputs.driver.gasLhvBtuScf);
    if (!Number.isFinite(heatRate)) return { error: 'the driver heat rate needs a number in Btu/hp-hr' };
    if (!Number.isFinite(lhv) || !(lhv > 0)) return { error: 'the fuel heating value must be above zero Btu/scf' };
    if (heatRate < MIN_HEAT_RATE_BTU_HP_HR) {
      return {
        error: `a heat rate of ${heatRate} Btu/hp-hr is below the ${MIN_HEAT_RATE_BTU_HP_HR} Btu in one horsepower-hour, which would make the driver more than 100 percent efficient`,
      };
    }
    return driverFuel({
      brakeHp: train.totalBrakeHp,
      heatRateBtuHpHr: heatRate,
      gasLhvBtuScf: lhv,
    });
  }, [train, inputs.driver]);

  /** Power against discharge pressure: the curve a station is sized on. */
  const sweep = useMemo(() => {
    const list = String(inputs.sweep.dischargePressures)
      .split(/[,\s]+/)
      .map((t) => parseFloat(t))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (refusal) return refusal;
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
  }, [refusal, engineArgs, inputs.sweep, inputs.driver]);

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

  /**
   * Stages that finish above the limit the user typed.
   *
   * The engine picks the stage count from the suction temperature for
   * every stage, then runs every stage after the first from the
   * intercooler outlet, so an intercooler that leaves the gas warmer
   * than the suction runs the later stages hotter than the count was
   * chosen for. Its own hot-stage warning is measured against a fixed
   * 300 F rather than against the limit in the box, so it stays silent
   * on exactly those cases (FC3 findings C1 and C2). The staging repair
   * belongs in the engines repo; until it lands, the studio at least
   * checks the limit the user actually typed.
   */
  const dischargeLimitCheck = useMemo(() => {
    if (train.error) return null;
    const limitF = engineArgs.maxDischargeF;
    const over = train.stages.filter((s) => s.tDischargeF > limitF);
    if (!over.length) return null;
    const named = over.map((s) => `stage ${s.stage} at ${s.tDischargeF.toFixed(1)} F`).join(', ');
    return {
      limitF,
      stages: over,
      note: `${named}: above the ${limitF} F limit this train was staged against. The stage count is chosen from the suction temperature, while every stage after the first starts from the intercooler outlet, so an intercooler that leaves the gas warmer than the suction runs the later stages hotter than the count allowed for. Intercool closer to the suction temperature, or add a stage.`,
    };
  }, [train, engineArgs.maxDischargeF]);

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
    dischargeLimitCheck,
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
