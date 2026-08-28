// Flow Assurance Studio state (Production P10, Production-ROADMAP.md
// app 10).
//
// Built on the shared per-well record (P6.5), so the wellbore half of
// the trace is the same well every other production studio sees, and
// handles both phases because a subsea tieback does not care which.
//
// Live versus explicit run is the usual rule. One analysis is one
// wellbore traverse plus one flowline march, so it recomputes as you
// type. The insulation sweep is a march per U value, so it is an
// explicit run with a stale flag.
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
import { useWellDeepLink } from '@/hooks/useWellDeepLink';
import {
  runFlowAssurance, insulationSweep, legU,
  CONDUCTIVITIES, FILM_COEFFICIENTS, INSIDE_FILMS, INHIBITORS, DEFAULT_CP,
} from '@/utils/production/flowAssurance';

const TABLE = 'saved_flowassurance_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save flow assurance studies.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  const missingTable = error?.code === '42P01'
    || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist`, 'i').test(msg);
  if (missingTable) {
    return "Saving isn't set up yet. Run the p10_saved_flowassurance_projects migration.";
  }
  return msg || 'Unexpected error.';
};

/** A pipe leg, in the shape the analysis wants it. */
export const defaultLeg = (over = {}) => ({
  enabled: true,
  lengthFt: '26400',
  idIn: '6',
  wallIn: '0.5',
  roughnessIn: '0.0018',
  correlation: 'beggsBrill',
  ambientTempF: '39',
  insideFilmId: 'multiphaseFlowing',
  outsideFilmId: 'seawaterCurrent',
  burialFt: '0',
  soilId: 'soilWet',
  coatings: [{ id: 'c1', materialId: 'syntacticPP', thicknessIn: '1.5' }],
  ...over,
});

export const defaultInputs = () => {
  const w = defaultWellInputs();
  return {
    well: { ...w.well, depthFt: '8000', whtF: '150', bhtF: '210' },
    fluid: { ...w.fluid, gor: '600' },
    inflow: { ...w.inflow, pr: '3200', pb: '2200', pi: '1.5' },
    gasInflow: { ...w.gasInflow },
    completion: { ...w.completion },
    duty: {
      qoStbd: '1200', wctPct: '20', gor: '600', whpPsia: '900',
      qgMscfd: '8000', wgr: '5', cgr: '20',
    },
    choke: { pDownPsia: '400', jtCoeffFPerPsi: '0.04' },
    flowline: defaultLeg(),
    riser: defaultLeg({
      enabled: false, lengthFt: '4000', ambientTempF: '45',
      outsideFilmId: 'seawaterStill',
    }),
    thermal: {
      cpOil: String(DEFAULT_CP.oil),
      cpWater: String(DEFAULT_CP.water),
      cpGas: String(DEFAULT_CP.gas),
      targetArrivalF: '',
    },
    hydrate: { gasSg: '', watF: '' },
    inhibitor: {
      inhibitorId: 'methanol', safetyMarginF: '5', leanWtPct: '100', waterRateBpd: '',
    },
    cooldown: {
      enabled: false, targetTempF: '60', startTempF: '', contentsDensityLbFt3: '',
      contentsCp: String(DEFAULT_CP.oil), steelCp: '0.11',
    },
    link: { fieldId: null, wellId: null, wellName: '' },
  };
};

const SECTIONS = [
  'well', 'fluid', 'inflow', 'gasInflow', 'completion',
  'duty', 'choke', 'flowline', 'riser', 'thermal', 'hydrate',
  'inhibitor', 'cooldown', 'link',
];

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  const base = defaultInputs();
  const out = { ...base, ...mergeWellInputs(raw, base) };
  SECTIONS.forEach((s) => {
    out[s] = { ...base[s], ...(raw[s] || {}) };
  });
  // The coating stack is a LIST, so a spread would leave yesterday's
  // extra layers behind the restored ones. Replace it outright when the
  // payload carries one.
  ['flowline', 'riser'].forEach((k) => {
    if (Array.isArray(raw[k]?.coatings)) out[k].coatings = raw[k].coatings.map((c) => ({ ...c }));
  });
  return out;
};

const FlowAssuranceContext = createContext();

export const useFlowAssurance = () => {
  const context = useContext(FlowAssuranceContext);
  if (!context) throw new Error('useFlowAssurance must be used within a FlowAssuranceProvider');
  return context;
};

/** The flat form the analytics take. */
export const analysisFormFrom = (inputs) => ({
  duty: inputs.duty,
  choke: inputs.choke,
  flowline: inputs.flowline,
  riser: inputs.riser,
  thermal: inputs.thermal,
  hydrate: inputs.hydrate,
  inhibitor: inputs.inhibitor,
  cooldown: inputs.cooldown,
});

export const FlowAssuranceProvider = ({ children }) => {
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
  const [busyMessage, setBusyMessage] = useState(null);

  const [sweep, setSweep] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  const setSection = useCallback((section, key, value) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
  }, []);
  const patchSection = useCallback((section, patch) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
  }, []);

  // --- The coating stack ---
  const addCoating = useCallback((leg) => {
    setInputs((prev) => ({
      ...prev,
      [leg]: {
        ...prev[leg],
        coatings: [...prev[leg].coatings, { id: uuidv4(), materialId: 'polyurethane', thicknessIn: '1' }],
      },
    }));
  }, []);
  const updateCoating = useCallback((leg, id, patch) => {
    setInputs((prev) => ({
      ...prev,
      [leg]: {
        ...prev[leg],
        coatings: prev[leg].coatings.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      },
    }));
  }, []);
  const removeCoating = useCallback((leg, id) => {
    setInputs((prev) => ({
      ...prev,
      [leg]: { ...prev[leg], coatings: prev[leg].coatings.filter((c) => c.id !== id) },
    }));
  }, []);

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
      return runFlowAssurance({ form, model });
    } catch (e) {
      console.error(e);
      return { ok: false, errors: [e.message] };
    }
  }, [form, model]);

  /**
   * The U of each leg on its own, so the insulation panel can show what
   * the stack buys even when the trace as a whole cannot run: a user
   * building up a pipe should see the number moving before every other
   * input is filled in.
   */
  const legUs = useMemo(() => ['flowline', 'riser'].reduce((acc, key) => {
    const spec = inputs[key];
    if (!spec?.enabled) return acc;
    acc[key] = legU({
      idIn: num(spec.idIn, NaN),
      wallIn: num(spec.wallIn, NaN),
      coatings: spec.coatings,
      insideFilmId: spec.insideFilmId,
      outsideFilmId: spec.outsideFilmId,
      burialFt: num(spec.burialFt, 0),
      soilId: spec.soilId,
    });
    return acc;
  }, {}), [inputs.flowline, inputs.riser]);

  // --- The explicit run ---
  const runSignature = useMemo(() => JSON.stringify(inputs), [inputs]);
  const sweepStale = !!sweep && sweep.signature !== runSignature;

  const runSweep = useCallback(async () => {
    if (!analysis?.legs?.length) {
      addNotification('There is no flowline leg to sweep. Enable one and give it a length first.', 'error');
      return;
    }
    setIsRunning(true);
    setBusyMessage('Marching the line at each insulation level...');
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const out = insulationSweep({ analysis, form, model });
      if (!out.ok) {
        addNotification(out.error, 'error');
        return;
      }
      setSweep({ ...out, signature: runSignature });
      addNotification(
        out.breakEvenU != null
          ? `The arrival leaves the hydrate region at about U = ${out.breakEvenU.toFixed(2)} Btu/hr-ft2-F. The line is at ${analysis.legs[0].u.uBtuHrFt2F.toFixed(2)}.`
          : 'No insulation level in this range gets the arrival out of the hydrate region. That is a heating or a dosing problem, not an insulation one.',
        'info',
      );
    } catch (e) {
      console.error(e);
      addNotification(e.message, 'error');
    } finally {
      setIsRunning(false);
      setBusyMessage(null);
    }
  }, [analysis, form, model, runSignature, addNotification]);

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
      if (!inputs.link.fieldId) { setSpineWells([]); return; }
      try {
        const w = await spine.listPoWells(inputs.link.fieldId);
        if (!cancelled) setSpineWells(w);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { cancelled = true; };
  }, [inputs.link.fieldId]);

  const linkWell = useCallback((wellId) => {
    const well = spineWells.find((w) => w.id === wellId) || null;
    patchSection('link', { wellId: wellId || null, wellName: well?.name || '' });
    setSweep(null);
  }, [spineWells, patchSection]);

  const {
    savedWellModel, wellModelDirty, loadFromSpine, saveToSpine, wellModelBusy,
  } = useWellModelSync({
    inputs,
    setInputs,
    wellId: inputs.link.wellId,
    wellName: inputs.link.wellName,
    addNotification,
    onLoaded: () => setSweep(null),
  });

  // Arriving from the Artificial Lift Advisor or another studio with a
  // well already picked (P9's deep link).
  useWellDeepLink({ link: inputs.link, patchSection, spineWells });

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
      addNotification(`Study "${name}" created`, 'success');
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
        addNotification('Study not found', 'error');
        return;
      }
      setCurrentProjectId(id);
      setProjectName(payload.name || projects.find((p) => p.id === id)?.name || 'Untitled study');
      setInputs(restored);
      setSweep(null);
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
    addCoating,
    updateCoating,
    removeCoating,
    conductivities: CONDUCTIVITIES,
    outsideFilms: FILM_COEFFICIENTS,
    insideFilms: INSIDE_FILMS,
    inhibitors: INHIBITORS,
    // derived
    model,
    analysis,
    legUs,
    // explicit run
    sweep,
    sweepStale,
    runSweep,
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

  return (
    <FlowAssuranceContext.Provider value={value}>{children}</FlowAssuranceContext.Provider>
  );
};
