// Artificial Lift Advisor state (Production P9,
// Production-ROADMAP.md §3 app 9).
//
// The phase the shared well record (P6.5) existed for. Comparing lift
// methods is meaningless if each studio holds its own description of
// the well; with one record, the four engine-backed methods run against
// exactly the same trajectory, fluid, inflow and completion.
//
// Two layers, deliberately kept apart. Screening is a rules matrix and
// is live, because it is arithmetic on a handful of numbers. The design
// pass runs four real design chains -- a wave equation among them -- so
// it is an explicit run with a stale flag.
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
  screenLift, screeningInputsFromModel, LIFT_METHODS,
} from '@/utils/production/liftScreening';
import { runDesignPass, reconcile } from '@/utils/production/liftAdvisor';

const TABLE = 'saved_liftadvisor_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save lift studies.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  const missingTable = error?.code === '42P01'
    || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist`, 'i').test(msg);
  if (missingTable) {
    return "Saving isn't set up yet. Run the p9_saved_liftadvisor_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => {
  const w = defaultWellInputs();
  return {
    well: { ...w.well },
    fluid: { ...w.fluid, gor: '400' },
    inflow: { ...w.inflow, pr: '2400', pb: '1800', pi: '0.8' },
    gasInflow: { ...w.gasInflow },
    completion: { ...w.completion, idIn: '2.992' },
    duty: {
      targetRateStbd: '400',
      wctPct: '60',
      whp: '150',
    },
    // Facility facts. They are not properties of the well, so they are
    // never written to the shared record.
    facility: {
      powerAvailable: true,
      gasAvailable: true,
      isOffshore: false,
      hasSand: false,
      isHorizontal: false,
      injectionPsig: '900',
      injectionMscfd: '500',
      injGasSg: '0.65',
      separatorEfficiencyPct: '70',
      casingPressurePsia: '600',
      slugLengthFt: '150',
      plungerWeightLb: '6',
    },
    link: { fieldId: null, wellId: null, wellName: '' },
  };
};

const SECTIONS = [
  'well', 'fluid', 'inflow', 'gasInflow', 'completion', 'duty', 'facility', 'link',
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

const LiftAdvisorContext = createContext();

export const useLiftAdvisor = () => {
  const context = useContext(LiftAdvisorContext);
  if (!context) throw new Error('useLiftAdvisor must be used within a LiftAdvisorProvider');
  return context;
};

/** Screening inputs: the well fills what it knows, the facility the rest. */
export const screeningInputsFrom = (inputs, model) => ({
  ...screeningInputsFromModel(model, {
    targetRate: num(inputs.duty.targetRateStbd, 0),
    wctPct: num(inputs.duty.wctPct, 0),
  }),
  gor: num(inputs.fluid.gor, 0),
  api: num(inputs.fluid.api, 32),
  isOffshore: !!inputs.facility.isOffshore,
  hasSand: !!inputs.facility.hasSand,
  isHorizontal: !!inputs.facility.isHorizontal,
  powerAvailable: inputs.facility.powerAvailable !== false,
  gasAvailable: inputs.facility.gasAvailable !== false,
  // A well drawn down below a quarter of its own reservoir pressure to
  // make the target is one the screening should call depleted.
  reservoirPressureLow: !!model && num(inputs.duty.targetRateStbd, 0)
    > 0.75 * (model.ipr?.qmax ?? 0),
});

export const LiftAdvisorProvider = ({ children }) => {
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

  const [designPass, setDesignPass] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  const setSection = useCallback((section, key, value) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
  }, []);
  const patchSection = useCallback((section, patch) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
  }, []);

  // --- Live: the well and the screening matrix ---
  const model = useMemo(() => {
    try {
      return buildWellModel(inputs);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [inputs]);

  const screeningInputs = useMemo(
    () => screeningInputsFrom(inputs, model),
    [inputs, model],
  );

  const screening = useMemo(() => screenLift(screeningInputs), [screeningInputs]);

  // --- The explicit run: four real design chains ---
  const runSignature = useMemo(() => JSON.stringify(inputs), [inputs]);
  const designStale = !!designPass && designPass.signature !== runSignature;

  const runDesigns = useCallback(async () => {
    if (!model) {
      addNotification('Enter a well model first.', 'error');
      return;
    }
    setIsRunning(true);
    setBusyMessage('Designing each lift method on this well...');
    // Yield a frame so the busy state paints before the solves block.
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const pass = runDesignPass({
        model,
        targetRate: num(inputs.duty.targetRateStbd, 0),
        wctPct: num(inputs.duty.wctPct, 0),
        gorScfStb: num(inputs.fluid.gor, 0),
        whp: num(inputs.duty.whp, 0),
        facility: {
          injectionPsig: num(inputs.facility.injectionPsig, 900),
          injectionMscfd: num(inputs.facility.injectionMscfd, 500),
          injGasSg: num(inputs.facility.injGasSg, 0.65),
          separatorEfficiencyPct: num(inputs.facility.separatorEfficiencyPct, 70),
          casingPressurePsia: num(inputs.facility.casingPressurePsia, NaN),
          slugLengthFt: num(inputs.facility.slugLengthFt, 150),
          plungerWeightLb: num(inputs.facility.plungerWeightLb, 6),
        },
      });
      setDesignPass({ ...pass, signature: runSignature });
      if (!pass.ok) {
        addNotification(pass.errors[0], 'error');
      } else {
        const worked = pass.results.filter((r) => r.ok).length;
        addNotification(
          worked
            ? `${worked} of ${pass.results.length} methods design on this well.`
            : 'None of the four methods designs on this well at that target. The refusals say why.',
          worked ? 'success' : 'info',
        );
      }
    } catch (e) {
      console.error(e);
      addNotification(e.message, 'error');
    } finally {
      setIsRunning(false);
      setBusyMessage(null);
    }
  }, [model, inputs, runSignature, addNotification]);

  const comparison = useMemo(
    () => reconcile({ screening, designPass: designPass?.ok ? designPass : null }),
    [screening, designPass],
  );

  /** Where to send the user to design the winner properly. */
  const studioLink = useCallback((methodId) => {
    const method = LIFT_METHODS.find((m) => m.id === methodId);
    if (!method?.studio) return null;
    const params = new URLSearchParams();
    if (inputs.link.fieldId) params.set('field', inputs.link.fieldId);
    if (inputs.link.wellId) params.set('well', inputs.link.wellId);
    const qs = params.toString();
    return `/dashboard/apps/production/${method.studio}${qs ? `?${qs}` : ''}`;
  }, [inputs.link]);

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
    const oil = num(t.oil_rate_stbd, 0);
    const water = num(t.water_rate_stbd, 0);
    const gas = num(t.gas_rate_mscfd, 0);
    const liquid = oil + water;
    const applied = [];
    setInputs((prev) => {
      const next = { ...prev };
      const duty = { ...prev.duty };
      if (oil > 0) { duty.targetRateStbd = String(oil); applied.push('target rate'); }
      if (liquid > 0) { duty.wctPct = ((water / liquid) * 100).toFixed(1); applied.push('water cut'); }
      if (num(t.thp_psia, 0) > 0) { duty.whp = String(t.thp_psia); applied.push('wellhead pressure'); }
      next.duty = duty;
      if (oil > 0 && gas > 0) {
        next.fluid = { ...prev.fluid, gor: ((gas * 1000) / oil).toFixed(0) };
        applied.push('gas-oil ratio');
      }
      return next;
    });
    addNotification(
      applied.length
        ? `Applied the ${t.test_date} well test: ${applied.join(', ')}. The target is what the well made then; change it to what you want it to make.`
        : `The ${t.test_date} well test has no rates to apply.`,
      applied.length ? 'success' : 'info',
    );
  }, [latestTestForLinkedWell, addNotification]);

  useWellDeepLink({ link: inputs.link, patchSection, spineWells });

  const {
    savedWellModel, wellModelDirty, loadFromSpine, saveToSpine, wellModelBusy,
  } = useWellModelSync({
    inputs,
    setInputs,
    wellId: inputs.link.wellId,
    wellName: inputs.link.wellName,
    addNotification,
    onLoaded: () => setDesignPass(null),
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
      setDesignPass(null);
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
    methods: LIFT_METHODS,
    // derived
    model,
    screeningInputs,
    screening,
    comparison,
    studioLink,
    // explicit run
    designPass,
    designStale,
    runDesigns,
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

  return <LiftAdvisorContext.Provider value={value}>{children}</LiftAdvisorContext.Provider>;
};
