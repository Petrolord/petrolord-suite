// Well Intervention Planner state (Production P12,
// Production-ROADMAP.md app 12) — the last app in the module.
//
// It reads everything the others produced: the production history from
// the spine (P1), the shared per-well description (P6.5), the validated
// nodal chain, and the Suite's canonical screening economics.
//
// Live versus explicit run, by the usual rule. The diagnosis, the
// screening and the economics are cheap and stay live. The SIZING is
// not: each treatment is two full nodal solves, so the plan runs when
// asked and goes stale when the inputs move.
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
  diagnose, runIntervention, minimumSkin, TREATMENTS, CHAN_DEFAULTS,
} from '@/utils/production/intervention';

const TABLE = 'saved_intervention_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save intervention plans.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  const missingTable = error?.code === '42P01'
    || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist`, 'i').test(msg);
  if (missingTable) {
    return "Saving isn't set up yet. Run the p12_saved_intervention_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => {
  const w = defaultWellInputs();
  return {
    well: {
      ...w.well, depthFt: '7800', whtF: '140', bhtF: '205',
      skin: '7', reFt: '1800', rwFt: '0.354', expectedGor: '', flowing: true,
    },
    fluid: { ...w.fluid, api: '33', gasSg: '0.7', gor: '520' },
    inflow: { ...w.inflow, pr: '2900', pb: '2000', calMode: 'pi', pi: '0.9' },
    gasInflow: { ...w.gasInflow },
    completion: { ...w.completion, idIn: '2.441' },
    duty: { wctPct: '55', gor: '520', whpPsia: '250' },
    diagnostic: { ratio: 'wor', lateFraction: '0.5', settings: {} },
    treatment: { kind: 'stimulation', skinAfter: '0', wctAfterPct: '15' },
    economics: {
      costUsdMM: '1.4', oilPriceUsd: '70', declinePctPerYear: '25',
      projectLife: '8', discountRate: '10', opexUsdPerBbl: '6',
      royaltyRate: '0', taxRate: '0', uptimeFraction: '0.95',
      fiscalType: 'TaxRoyalty',
    },
    link: { fieldId: null, wellId: null, wellName: '' },
  };
};

const SECTIONS = [
  'well', 'fluid', 'inflow', 'gasInflow', 'completion',
  'duty', 'diagnostic', 'treatment', 'economics', 'link',
];

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  const base = defaultInputs();
  const out = { ...base, ...mergeWellInputs(raw, base) };
  SECTIONS.forEach((s) => { out[s] = { ...base[s], ...(raw[s] || {}) }; });
  return out;
};

const InterventionContext = createContext();

export const useIntervention = () => {
  const ctx = useContext(InterventionContext);
  if (!ctx) throw new Error('useIntervention must be used within an InterventionPlannerProvider');
  return ctx;
};

/** The flat shape the analytics take. */
export const planInputsFrom = (inputs) => ({
  well: {
    skin: inputs.well.skin,
    reFt: inputs.well.reFt,
    rwFt: inputs.well.rwFt,
    expectedGor: inputs.well.expectedGor,
    flowing: inputs.well.flowing,
  },
  inflow: inputs.inflow,
  duty: inputs.duty,
  diagnostic: {
    ratio: inputs.diagnostic.ratio,
    lateFraction: num(inputs.diagnostic.lateFraction, 0.5),
    settings: inputs.diagnostic.settings,
  },
  treatment: inputs.treatment,
  economics: inputs.economics,
});

export const InterventionPlannerProvider = ({ children }) => {
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
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [busyMessage, setBusyMessage] = useState(null);

  const [plan, setPlan] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  const setSection = useCallback((section, key, value) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
  }, []);
  const patchSection = useCallback((section, patch) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
  }, []);

  // --- live derivations ---
  const model = useMemo(() => {
    try {
      return buildWellModel(inputs);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [inputs]);

  /**
   * The diagnosis is LIVE, because it costs a Bourdet pass over a few
   * hundred points and because it is the thing the whole plan turns on:
   * a user changing which ratio to read, or how much of the history
   * counts as late, needs to see the mechanism move.
   */
  const diagnosis = useMemo(() => {
    if (!history.length) return null;
    try {
      return diagnose({
        rows: history,
        ratio: inputs.diagnostic.ratio,
        lateFraction: num(inputs.diagnostic.lateFraction, 0.5),
        settings: inputs.diagnostic.settings,
      });
    } catch (e) {
      console.error(e);
      return { ok: false, error: e.message };
    }
  }, [history, inputs.diagnostic]);

  /** The floor on how negative a skin this geometry can carry. */
  const skinFloor = useMemo(() => minimumSkin({
    reFt: num(inputs.well.reFt, NaN), rwFt: num(inputs.well.rwFt, NaN),
  }), [inputs.well.reFt, inputs.well.rwFt]);

  // --- the explicit run ---
  const runSignature = useMemo(
    () => JSON.stringify({ inputs, n: history.length }),
    [inputs, history.length],
  );
  const planStale = !!plan && plan.signature !== runSignature;

  const runPlan = useCallback(async () => {
    if (!model) {
      addNotification('The well model is incomplete. Fill in the Well tab.', 'error');
      return;
    }
    setIsRunning(true);
    setBusyMessage('Diagnosing, screening, then solving the well before and after...');
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const r = runIntervention({
        inputs: planInputsFrom(inputs), model, rows: history,
      });
      setPlan({ ...r, signature: runSignature });
      r.notes.forEach((n) => addNotification(n, 'info'));
      if (r.sized?.ok) {
        addNotification(
          `${r.chosen === 'shutoff' ? 'The shutoff' : 'The stimulation'} is worth about ${Math.round(r.sized.upliftStbd)} stb/d on this well.`,
          'success',
        );
      }
    } catch (e) {
      console.error(e);
      addNotification(e.message, 'error');
    } finally {
      setIsRunning(false);
      setBusyMessage(null);
    }
  }, [model, inputs, history, runSignature, addNotification]);

  // --- the spine ---
  const reloadFields = useCallback(async () => {
    try { setFields(await spine.listFields()); } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { reloadFields(); }, [reloadFields]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!inputs.link.fieldId) { setSpineWells([]); return; }
      try {
        const w = await spine.listPoWells(inputs.link.fieldId);
        if (!cancelled) setSpineWells(w);
      } catch (e) { console.error(e); }
    })();
    return () => { cancelled = true; };
  }, [inputs.link.fieldId]);

  /**
   * Pull the linked well's daily production.
   *
   * This is the studio's raw material: without it there is no
   * diagnosis, and without a diagnosis the screening refuses every
   * water treatment. That refusal is correct and it is worth seeing.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!inputs.link.fieldId || !inputs.link.wellId) { setHistory([]); return; }
      setHistoryLoading(true);
      try {
        // Filtered in the query rather than after it: a field with a
        // few years of daily production across thirty wells is a lot of
        // rows to pull back and throw away.
        const mine = await spine.getDailyProduction(inputs.link.fieldId, {
          wellId: inputs.link.wellId,
        });
        if (!cancelled) {
          setHistory(mine);
          setPlan(null);
          if (!mine.length) {
            addNotification(
              'This well has no daily production on the spine. Import it in the Surveillance Studio; without a history there is no diagnosis, and without a diagnosis the water treatments are refused rather than guessed at.',
              'info',
            );
          }
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) addNotification(e.message, 'error');
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [inputs.link.fieldId, inputs.link.wellId, addNotification]);

  const linkWell = useCallback((wellId) => {
    const well = spineWells.find((w) => w.id === wellId) || null;
    patchSection('link', { wellId: wellId || null, wellName: well?.name || '' });
    setPlan(null);
  }, [spineWells, patchSection]);

  const {
    savedWellModel, wellModelDirty, loadFromSpine, saveToSpine, wellModelBusy,
  } = useWellModelSync({
    inputs,
    setInputs,
    wellId: inputs.link.wellId,
    wellName: inputs.link.wellName,
    addNotification,
    onLoaded: () => setPlan(null),
  });

  useWellDeepLink({ link: inputs.link, patchSection, spineWells });

  // --- project lifecycle (the studio-kit recipe) ---
  const serialize = useCallback((name) => ({
    id: currentProjectId, name, schema: 1, inputs, modified: new Date().toISOString(),
  }), [currentProjectId, inputs]);

  useEffect(() => {
    (async () => {
      try { setProjects(await service.list()); } catch (e) {
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
      addNotification(`Plan "${name}" created`, 'success');
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [inputs, addNotification]);

  const openProject = useCallback(async (id) => {
    try {
      const payload = await service.load(id);
      const restored = inputsFromPayload(payload);
      if (!restored) { addNotification('Plan not found', 'error'); return; }
      setCurrentProjectId(id);
      setProjectName(payload.name || projects.find((p) => p.id === id)?.name || 'Untitled plan');
      setInputs(restored);
      setPlan(null);
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
      addNotification('Plan deleted', 'info');
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [currentProjectId, addNotification]);

  const manualSave = useCallback(async () => {
    if (!currentProjectId) { addNotification('Create or open a plan first', 'info'); return; }
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
    treatments: TREATMENTS,
    chanDefaults: CHAN_DEFAULTS,
    // live
    model,
    diagnosis,
    skinFloor,
    history,
    historyLoading,
    // explicit
    plan,
    planStale,
    runPlan,
    isRunning,
    busyMessage,
    // spine
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
    notifications,
    addNotification,
    removeNotification,
  };

  return <InterventionContext.Provider value={value}>{children}</InterventionContext.Provider>;
};
