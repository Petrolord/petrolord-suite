// Choke & Wellhead Performance Studio state (Production P8,
// Production-ROADMAP.md §3 app 8).
//
// Built on the shared per-well record (P6.5) and handles BOTH phases,
// because a choke is a choke: an oil well takes the Gilbert family, a
// gas well takes the single-phase gas choke, and the well record's
// phase decides which without the user restating anything.
//
// Live versus explicit run is the usual rule. One analysis is one nodal
// solve, so it recomputes as you type. The operating envelope is a
// solve per bean size, so it is an explicit run with a stale flag.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import * as spine from '@/lib/productionSpine';
import { num } from '@/utils/nodal/numerics';
import { defaultWellInputs, buildWellModel, mergeWellInputs } from '@/utils/production/wellModel';
import { useWellModelSync } from '@/hooks/useWellModelSync';
import {
  runChokeAnalysis, operatingEnvelope, criticalBeanLimit, beanForRate,
  testsToChokePoints, fitGilbertCoefficients, BEAN_SIZES_64, CHOKE_COEFFS,
  EROSIONAL_C, erosionalC,
} from '@/utils/production/choke';

const TABLE = 'saved_choke_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save choke analyses.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  const missingTable = error?.code === '42P01'
    || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist`, 'i').test(msg);
  if (missingTable) {
    return "Saving isn't set up yet. Run the p8_saved_choke_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => {
  const w = defaultWellInputs();
  return {
    well: { ...w.well },
    fluid: { ...w.fluid, gor: '600' },
    inflow: { ...w.inflow, pr: '3200', pb: '2200', pi: '1.5' },
    gasInflow: { ...w.gasInflow },
    completion: { ...w.completion },
    choke: {
      s64: '32',
      pDownstream: '150',
      correlation: 'gilbert',
      useFitted: false,
      glr: '600',
      wctPct: '20',
      gasSg: '0.65',
      k: '1.28',
      cd: '0.85',
      hydrateMarginF: '0',
    },
    wellhead: {
      flowlineIdIn: '3',
      cFactor: '100',
      cPreset: 'continuous',
    },
    envelope: { minS64: '12', maxS64: '80', nPoints: '12', targetQ: '' },
    fit: { mode: 'all', fixedSet: 'gilbert', manualText: '' },
    link: { fieldId: null, wellId: null, wellName: '' },
  };
};

const SECTIONS = [
  'well', 'fluid', 'inflow', 'gasInflow', 'completion',
  'choke', 'wellhead', 'envelope', 'fit', 'link',
];

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  const base = defaultInputs();
  const out = { ...base, ...mergeWellInputs(raw, base) };
  SECTIONS.forEach((s) => {
    out[s] = { ...base[s], ...(raw[s] || {}) };
  });
  // A fitted coefficient set is a RESULT, not an input, so it is not
  // restored from the payload: reopening an analysis re-fits from the
  // tests that are on the spine now rather than showing yesterday's.
  return out;
};

const ChokeContext = createContext();

export const useChoke = () => {
  const context = useContext(ChokeContext);
  if (!context) throw new Error('useChoke must be used within a ChokePerformanceProvider');
  return context;
};

/** The flat form the analytics take. */
export const analysisFormFrom = (inputs, fitted) => ({
  ...inputs.choke,
  ...inputs.wellhead,
  useFitted: inputs.choke.useFitted && !!fitted,
  fitted,
});

export const ChokePerformanceProvider = ({ children }) => {
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

  const [envelope, setEnvelope] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [fitted, setFitted] = useState(null);

  const setSection = useCallback((section, key, value) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
  }, []);
  const patchSection = useCallback((section, patch) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
  }, []);

  /** Picking an erosional service fills C; it stays editable. */
  const applyCPreset = useCallback((id) => {
    patchSection('wellhead', { cPreset: id, cFactor: String(erosionalC(id).c) });
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

  const form = useMemo(
    () => analysisFormFrom(inputs, fitted?.ok ? fitted : null),
    [inputs, fitted],
  );

  const analysis = useMemo(() => {
    try {
      return runChokeAnalysis({ form, model });
    } catch (e) {
      console.error(e);
      return { ok: false, errors: [e.message], result: null };
    }
  }, [form, model]);

  const result = analysis.result;

  // --- Coefficient fitting from the well's own tests ---
  //
  // Scoped to the linked well when there is one, and to the whole field
  // when there is not. A field-wide fit is a legitimate thing to want
  // on wells that complete alike, but it has to be the user's choice
  // rather than an accident of which list the code happened to read.
  const testsInScope = useMemo(() => (inputs.link.wellId
    ? wellTests.filter((t) => t.well_id === inputs.link.wellId)
    : wellTests), [wellTests, inputs.link.wellId]);
  const chokePoints = useMemo(() => testsToChokePoints(testsInScope), [testsInScope]);

  const runFit = useCallback(() => {
    if (!chokePoints.length) {
      addNotification(
        'No usable well tests on the spine for this field. A test needs a rate, a gas-liquid ratio, a bean size and a tubing head pressure to be fitted against.',
        'info',
      );
      return;
    }
    const fixedSet = CHOKE_COEFFS[inputs.fit.fixedSet] || CHOKE_COEFFS.gilbert;
    const out = fitGilbertCoefficients({
      points: chokePoints,
      mode: inputs.fit.mode,
      fixed: { m: fixedSet.m, n: fixedSet.n },
    });
    setFitted(out);
    addNotification(
      out.ok
        ? `Fitted to ${out.points.length} test${out.points.length === 1 ? '' : 's'}: c = ${out.c.toFixed(2)}, m = ${out.m.toFixed(3)}, n = ${out.n.toFixed(3)}, missing them by ${out.rmsePct.toFixed(1)} percent.`
        : out.error,
      out.ok ? 'success' : 'error',
    );
  }, [chokePoints, inputs.fit, addNotification]);

  // --- The explicit run ---
  const runSignature = useMemo(() => JSON.stringify({ inputs, fitted }), [inputs, fitted]);
  const envelopeStale = !!envelope && envelope.signature !== runSignature;

  const runEnvelope = useCallback(async () => {
    if (!model) {
      addNotification('Enter a well model first.', 'error');
      return;
    }
    setIsRunning(true);
    setBusyMessage('Solving the well at each bean size...');
    // Yield a frame so the busy state paints before the solves block.
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const lo = Math.max(1, Math.round(num(inputs.envelope.minS64, 12)));
      const hi = Math.max(lo + 1, Math.round(num(inputs.envelope.maxS64, 80)));
      const nPoints = Math.max(2, Math.round(num(inputs.envelope.nPoints, 12)));
      const beans = Array.from({ length: nPoints }, (_, i) =>
        Math.round(lo + ((hi - lo) * i) / (nPoints - 1)));
      const points = operatingEnvelope({
        model,
        beans,
        phase: model.phase,
        oil: {
          glr: num(inputs.choke.glr, 0),
          wct: num(inputs.choke.wctPct, 0) / 100,
          pDownstream: num(inputs.choke.pDownstream, 0),
          correlation: inputs.choke.correlation,
          coeffs: form.useFitted ? fitted : null,
        },
        gas: {
          pDownstream: num(inputs.choke.pDownstream, 0),
          gasSg: num(inputs.choke.gasSg, 0.65),
          k: num(inputs.choke.k, 1.28),
          cd: num(inputs.choke.cd, 0.85),
        },
      });
      const limit = criticalBeanLimit(points);
      setEnvelope({ points, limit, signature: runSignature });
      addNotification(
        limit
          ? `Flow stops being critical between ${limit.lastCriticalS64}/64 and ${limit.firstSubcriticalS64}/64. Past there the bean is no longer setting the rate.`
          : 'Every bean in this range stays in critical flow.',
        'info',
      );
    } catch (e) {
      console.error(e);
      addNotification(e.message, 'error');
    } finally {
      setIsRunning(false);
      setBusyMessage(null);
    }
  }, [model, inputs, form.useFitted, fitted, runSignature, addNotification]);

  /** The bean that puts the well on a target rate. Oil wells only. */
  const sizeForTarget = useCallback(() => {
    const targetQ = num(inputs.envelope.targetQ, NaN);
    if (!(targetQ > 0)) {
      addNotification('Enter the rate you want the well on.', 'info');
      return;
    }
    if (model?.phase !== 'oil') {
      addNotification('Bean sizing to a target rate is an oil-well calculation; a gas well is sized from the envelope.', 'info');
      return;
    }
    const b = beanForRate({
      model,
      targetQ,
      glr: num(inputs.choke.glr, 0),
      wct: num(inputs.choke.wctPct, 0) / 100,
      pDownstream: num(inputs.choke.pDownstream, 0),
      correlation: inputs.choke.correlation,
      coeffs: form.useFitted ? fitted : null,
    });
    if (!b.ok) {
      addNotification(b.reason, 'error');
      return;
    }
    setSection('choke', 's64', String(Math.round(b.s64)));
    addNotification(
      `${targetQ.toLocaleString()} stb/d needs about a ${b.s64.toFixed(1)}/64 bean; set to ${Math.round(b.s64)}/64.`,
      'success',
    );
  }, [model, inputs.envelope.targetQ, inputs.choke, form.useFitted, fitted,
    setSection, addNotification]);

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

  const linkWell = useCallback((wellId) => {
    const well = spineWells.find((w) => w.id === wellId) || null;
    patchSection('link', { wellId: wellId || null, wellName: well?.name || '' });
    setFitted(null);
  }, [spineWells, patchSection]);

  const {
    savedWellModel, wellModelDirty, loadFromSpine, saveToSpine, wellModelBusy,
  } = useWellModelSync({
    inputs,
    setInputs,
    wellId: inputs.link.wellId,
    wellName: inputs.link.wellName,
    addNotification,
    onLoaded: () => { setEnvelope(null); setFitted(null); },
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
      setEnvelope(null);
      setFitted(null);
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
    applyCPreset,
    beanSizes: BEAN_SIZES_64,
    chokeCoeffs: CHOKE_COEFFS,
    erosionalPresets: EROSIONAL_C,
    // derived
    model,
    analysis,
    result,
    // fitting
    chokePoints,
    testsInScope,
    fitted,
    runFit,
    // explicit run
    envelope,
    envelopeStale,
    runEnvelope,
    sizeForTarget,
    isRunning,
    busyMessage,
    // spine link
    fields,
    spineWells,
    linkWell,
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

  return <ChokeContext.Provider value={value}>{children}</ChokeContext.Provider>;
};
