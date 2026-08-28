// Gas Well Performance Studio state (Production P7,
// Production-ROADMAP.md §3 app 7 — docs/scope/ProductionOperations-STATUS.md).
//
// The first studio built ON the shared well record from the start
// rather than carrying its own copy, which is what P6.5 was for. The
// well description, the phase and the gas inflow all come from
// utils/production/wellModel and sync to the spine through
// hooks/useWellModelSync.
//
// Live versus explicit run is decided the usual way. One analysis is
// one nodal solve and one marched column, so it recomputes as you type.
// The loading forecast is a solve and a column PER reservoir pressure,
// so it is an explicit run with a stale flag.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import * as spine from '@/lib/productionSpine';
import { num } from '@/utils/nodal/numerics';
import {
  defaultWellInputs, buildWellModel, mergeWellInputs,
} from '@/utils/production/wellModel';
import { useWellModelSync } from '@/hooks/useWellModelSync';
import { useWellDeepLink } from '@/hooks/useWellDeepLink';
import {
  runGasWellAnalysis, loadingForecast, tubingOptions, plungerScreen,
  largestSlug, TURNER_FLUIDS, turnerFluid, recommendCorrelation,
} from '@/utils/production/gasWell';

const TABLE = 'saved_gaswell_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save gas well analyses.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  const missingTable = error?.code === '42P01'
    || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist`, 'i').test(msg);
  if (missingTable) {
    return "Saving isn't set up yet. Run the p7_saved_gaswell_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => {
  // The well description comes from the SHARED shape (P6.5). This is a
  // gas well, so the phase says so and the gas inflow is the one that
  // gets built; the oil inflow section stays as it is, because a well
  // re-described later should not have lost it.
  const w = defaultWellInputs();
  return {
    well: { ...w.well, phase: 'gas', depthFt: '8000', whtF: '90', bhtF: '210' },
    fluid: { ...w.fluid, gasSg: '0.65', gor: '100000' },
    inflow: { ...w.inflow, pr: '2200', pb: '0' },
    gasInflow: { ...w.gasInflow, model: 'backPressure', c: '0.0025', n: '0.87' },
    completion: { ...w.completion, idIn: '2.441' },
    conditions: {
      whp: '400',
      gasSg: '0.65',
      fluidPreset: 'water',
      sigmaDyneCm: '60',
      rhoLiquidLbFt3: '67',
      correlation: 'auto',
    },
    forecast: { prFrom: '2200', prTo: '800', nPoints: '8' },
    plunger: {
      casingPressurePsia: '900',
      linePressurePsia: '400',
      slugLengthFt: '150',
      liquidSg: '1.02',
      plungerWeightLb: '6',
      wellGlrScfBbl: '20000',
      frictionPsi: '0',
      riseFtMin: '750',
      fallInGasFtMin: '1000',
      fallInLiquidFtMin: '172',
      afterflowMin: '20',
      shutInMin: '30',
      scfPerBblPer1000ft: '400',
    },
    link: { fieldId: null, wellId: null, wellName: '' },
  };
};

const SECTIONS = [
  'well', 'fluid', 'inflow', 'gasInflow', 'completion',
  'conditions', 'forecast', 'plunger', 'link',
];

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  const base = defaultInputs();
  const out = { ...base, ...mergeWellInputs(raw, base) };
  SECTIONS.forEach((s) => {
    out[s] = { ...base[s], ...(raw[s] || {}) };
  });
  return out;
};

const GasWellContext = createContext();

export const useGasWell = () => {
  const context = useContext(GasWellContext);
  if (!context) throw new Error('useGasWell must be used within a GasWellPerformanceProvider');
  return context;
};

/** The flat form the analytics take. */
export const analysisFormFrom = (inputs) => ({ ...inputs.conditions });

export const GasWellPerformanceProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  const [inputs, setInputs] = useState(defaultInputs);
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  const [fields, setFields] = useState([]);
  const [spineWells, setSpineWells] = useState([]);
  const [wellTests, setWellTests] = useState([]);
  const [busyMessage, setBusyMessage] = useState(null);

  const [forecast, setForecast] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  const setSection = useCallback((section, key, value) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
  }, []);
  const patchSection = useCallback((section, patch) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
  }, []);

  /** Picking a fluid fills its tension and density; both stay editable. */
  const applyFluidPreset = useCallback((id) => {
    const f = turnerFluid(id);
    patchSection('conditions', {
      fluidPreset: id,
      sigmaDyneCm: String(f.sigmaDyneCm),
      rhoLiquidLbFt3: String(f.densityLbFt3),
    });
  }, [patchSection]);

  // --- Live derivations ---
  const model = useMemo(() => {
    try {
      return buildWellModel(inputs);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [inputs]);

  const form = useMemo(() => analysisFormFrom(inputs), [inputs]);

  const analysis = useMemo(() => {
    try {
      return runGasWellAnalysis({ form, model });
    } catch (e) {
      console.error(e);
      return { ok: false, errors: [e.message], result: null };
    }
  }, [form, model]);

  const result = analysis.result;

  const tubing = useMemo(() => {
    if (!result) return null;
    try {
      return tubingOptions({
        result,
        sigmaDyneCm: num(inputs.conditions.sigmaDyneCm, 60),
        rhoLiquidLbFt3: num(inputs.conditions.rhoLiquidLbFt3, 67),
        correlation: result.correlation,
        gasSg: result.gasSg,
      });
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [result, inputs.conditions.sigmaDyneCm, inputs.conditions.rhoLiquidLbFt3]);

  const plunger = useMemo(() => {
    if (!result) return null;
    try {
      const screen = plungerScreen({ model, result, form: inputs.plunger });
      const maxSlugFt = largestSlug({ model, result, form: inputs.plunger });
      return { ...screen, maxSlugFt };
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [model, result, inputs.plunger]);

  const guidance = useMemo(
    () => recommendCorrelation(num(inputs.conditions.whp, 0)),
    [inputs.conditions.whp],
  );

  // --- The explicit run ---
  const runSignature = useMemo(() => JSON.stringify(inputs), [inputs]);
  const forecastStale = !!forecast && forecast.signature !== runSignature;

  const runForecast = useCallback(async () => {
    if (!result) {
      addNotification('Fix the analysis inputs first: the forecast declines this same well.', 'error');
      return;
    }
    setIsRunning(true);
    setBusyMessage('Solving the well at each reservoir pressure...');
    // Yield a frame so the busy state paints before the solves block.
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const out = loadingForecast({
        model,
        inputs,
        whp: result.whp,
        gasSg: result.gasSg,
        sigmaDyneCm: num(inputs.conditions.sigmaDyneCm, 60),
        rhoLiquidLbFt3: num(inputs.conditions.rhoLiquidLbFt3, 67),
        correlation: result.correlation,
        prFrom: num(inputs.forecast.prFrom, 2200),
        prTo: num(inputs.forecast.prTo, 800),
        nPoints: num(inputs.forecast.nPoints, 8),
      });
      setForecast({ ...out, signature: runSignature });
      addNotification(
        out.crossingPrPsia
          ? `This well starts loading at about ${Math.round(out.crossingPrPsia).toLocaleString()} psia reservoir pressure.`
          : 'The well does not cross its critical rate anywhere in this pressure range.',
        'info',
      );
    } catch (e) {
      console.error(e);
      addNotification(e.message, 'error');
    } finally {
      setIsRunning(false);
      setBusyMessage(null);
    }
  }, [result, model, inputs, runSignature, addNotification]);

  // --- Optional spine link ---
  const reloadFields = useCallback(async () => {
    try {
      setFields(await spine.listFields());
    } catch (e) {
      console.error(e);
    }
  }, []);
  useEffect(() => { reloadFields(); }, [reloadFields]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!inputs.link.fieldId) { setSpineWells([]); setWellTests([]); return; }
      try {
        const [w, t] = await Promise.all([
          spine.listPoWells(inputs.link.fieldId),
          spine.listFieldWellTests(inputs.link.fieldId),
        ]);
        if (!cancelled) { setSpineWells(w); setWellTests(t); }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { cancelled = true; };
  }, [inputs.link.fieldId]);

  const latestTestForLinkedWell = useMemo(() => {
    if (!inputs.link.wellId) return null;
    const mine = wellTests
      .filter((t) => t.well_id === inputs.link.wellId && t.is_valid !== false)
      .sort((a, b) => (a.test_date < b.test_date ? 1 : -1));
    return mine[0] || null;
  }, [wellTests, inputs.link.wellId]);

  const linkWell = useCallback((wellId) => {
    const well = spineWells.find((w) => w.id === wellId) || null;
    patchSection('link', { wellId: wellId || null, wellName: well?.name || '' });
  }, [spineWells, patchSection]);

  const applyLatestTest = useCallback(() => {
    const t = latestTestForLinkedWell;
    if (!t) {
      addNotification('That well has no valid test on the spine to apply.', 'info');
      return;
    }
    const applied = [];
    setInputs((prev) => {
      const next = { ...prev };
      const conditions = { ...prev.conditions };
      if (num(t.thp_psia, 0) > 0) {
        conditions.whp = String(t.thp_psia);
        applied.push('wellhead pressure');
      }
      next.conditions = conditions;
      // A gas well's test rate is the gas rate; it is a measurement to
      // check the deliverability against, not an input to it, so it is
      // reported rather than written into the inflow.
      return next;
    });
    addNotification(
      applied.length
        ? `Applied the ${t.test_date} well test: ${applied.join(', ')}. Its ${Math.round(num(t.gas_rate_mscfd, 0)).toLocaleString()} Mscf/d is a measurement to compare the deliverability against.`
        : `The ${t.test_date} well test has nothing this analysis takes as an input.`,
      applied.length ? 'success' : 'info',
    );
  }, [latestTestForLinkedWell, addNotification]);

  // The well's own description on the spine, shared with every other
  // production studio (P6.5).
  // The Advisor (P9) hands a well over in the URL; pick it up once.
  useWellDeepLink({ link: inputs.link, patchSection, spineWells });

  const {
    savedWellModel, wellModelDirty, loadFromSpine, saveToSpine, wellModelBusy,
  } = useWellModelSync({
    inputs,
    setInputs,
    wellId: inputs.link.wellId,
    wellName: inputs.link.wellName,
    addNotification,
    onLoaded: () => setForecast(null),
  });

  // --- Project lifecycle (the studio-kit recipe) ---
  const serialize = useCallback((name) => ({
    id: currentProjectId,
    name,
    schema: 1,
    inputs,
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
      await service.save(id, { id, name, schema: 1, inputs, modified: new Date().toISOString() });
      setCurrentProjectId(id);
      setProjectName(name);
      setHydrated(true);
      setLastSaveTime(new Date());
      setSaveError(null);
      setProjects(await service.list());
      addNotification(`Project "${name}" created`, 'success');
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [inputs, addNotification]);

  const openProject = useCallback(async (id) => {
    try {
      const payload = await service.load(id);
      const restored = inputsFromPayload(payload);
      if (!restored) {
        addNotification('Project not found', 'error');
        return;
      }
      setCurrentProjectId(id);
      setProjectName(payload.name || projects.find((p) => p.id === id)?.name || 'Untitled analysis');
      setInputs(restored);
      setForecast(null);
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
      addNotification('Analysis deleted', 'info');
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [currentProjectId, addNotification]);

  const manualSave = useCallback(async () => {
    if (!currentProjectId) {
      addNotification('Create or open an analysis first', 'info');
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
    applyFluidPreset,
    turnerFluids: TURNER_FLUIDS,
    // derived
    model,
    analysis,
    result,
    tubing,
    plunger,
    guidance,
    // explicit run
    forecast,
    forecastStale,
    runForecast,
    isRunning,
    busyMessage,
    // spine link
    fields,
    spineWells,
    latestTestForLinkedWell,
    linkWell,
    applyLatestTest,
    savedWellModel,
    wellModelDirty,
    loadFromSpine,
    saveToSpine,
    wellModelBusy,
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

  return <GasWellContext.Provider value={value}>{children}</GasWellContext.Provider>;
};
