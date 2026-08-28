// Gas Lift Design Studio state (Production P4, Production-ROADMAP.md
// §3 app 4 — docs/scope/ProductionOperations-STATUS.md).
//
// Unlike the Surveillance and Allocation studios this is a design app,
// not a data app: the well model and the design settings ARE the
// project, and they live in the saved_gaslift_projects payload
// (createSavedProjectsService + hydrated guard + 10 s debounced
// autosave). The po_* spine appears only as an optional identity link:
// naming the well this design is for, and offering its latest well test
// as the design rate rather than making the user retype it.
//
// Everything computed is a pure function of the inputs. The spacing
// design and the point-of-injection construction are cheap enough to
// recompute as you type; the performance curve and the depth sweep each
// solve a node point per sample, so they are explicit runs with a stale
// flag, the Nodal Studio pattern.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { supabase } from '@/lib/customSupabaseClient';
import * as spine from '@/lib/productionSpine';
import { linspace, num } from '@/utils/nodal/numerics';
import {
  defaultWellInputs, buildWellModel as buildSharedWellModel, mergeWellInputs,
} from '@/utils/production/wellModel';
import { useWellModelSync } from '@/hooks/useWellModelSync';
import { useWellDeepLink } from '@/hooks/useWellDeepLink';
import {
  runInstallationDesign, liftedTraverse, injectionPointFromTraverse,
  gasLiftPerformance, injectionDepthSweep, mdAtTvd, psigToPsia,
  importLegacyGasLiftInputs, injectionRateLadder, valveSheetRows,
} from '@/utils/production/gasLift';
import { linearTemperature } from '@/utils/production/engine/gasLiftDesign';
import { VALVE_FAMILIES } from '@/utils/production/engine/gasLiftValveCatalog';

const TABLE = 'saved_gaslift_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save gas lift designs.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  const missingTable = error?.code === '42P01'
    || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist`, 'i').test(msg);
  if (missingTable) {
    return "Saving isn't set up yet. Run the p4_saved_gaslift_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => {
  // The well description comes from the SHARED shape (P6.5) so a model
  // saved here loads in the ESP and rod pump studios.
  //
  // Note what MOVED to `injection` in that phase: the wellhead pressure
  // and the water cut. They look like completion properties and are
  // not — they are what the well was doing on the day, so they belong
  // to the duty a design is run at, not to the well record every studio
  // shares.
  const w = defaultWellInputs();
  return {
    well: { ...w.well },
    fluid: { ...w.fluid },
    inflow: { ...w.inflow },
    // Carried but unused here. The well record is SHARED, so a studio
    // that dropped this section would wipe a gas well's deliverability
    // coefficients the moment it saved the model back.
    gasInflow: { ...w.gasInflow },
    completion: { ...w.completion },
    injection: {
      kickoffPsig: '1000',
      operatingPsig: '900',
      injGasSg: '0.65',
      targetQgiMscfd: '600',
      designRateStbd: '400',
      maxQgiMscfd: '1600',
      nPoints: '9',
      econSlope: '0.05',
      whp: '150',
      wctPct: '70',
    },
    design: {
      method: 'surfaceClose',
      dpPerValvePsi: '25',
      dpTransferPsi: '50',
      killGradPsiPerFt: '0.45',
      unloadGradPsiPerFt: '0.10',
      whUnloadPsig: '100',
      minSpacingFt: '250',
      maxValves: '12',
      packerDepthFt: '7000',
      bottomOrifice: true,
      orificeIdIn: '0.25',
      valveFamilyId: 'r15',
      valveType: 'IPO',
      useComputedInjectionDepth: true,
    },
    link: { fieldId: null, wellId: null, wellName: '' },
  };
};

const SECTIONS = ['well', 'fluid', 'inflow', 'gasInflow', 'completion', 'injection', 'design', 'link'];

/** Restore inputs from a payload, tolerating missing keys from older rows. */
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

const GasLiftDesignContext = createContext();

export const useGasLift = () => {
  const context = useContext(GasLiftDesignContext);
  if (!context) throw new Error('useGasLift must be used within a GasLiftDesignProvider');
  return context;
};

/** Flatten the studio sections into the flat form runInstallationDesign takes. */
export const designFormFrom = (inputs, targetDepthFt) => ({
  ...inputs.design,
  kickoffPsig: inputs.injection.kickoffPsig,
  operatingPsig: inputs.injection.operatingPsig,
  injGasSg: inputs.injection.injGasSg,
  targetQgiMscfd: inputs.injection.targetQgiMscfd,
  whtF: inputs.well.whtF,
  bhtF: inputs.well.bhtF,
  targetDepthFt: targetDepthFt ?? '',
});

/**
 * The nodal bundle this studio runs on.
 *
 * The well itself comes from the shared model (P6.5), so gas lift, ESP
 * and rod pump cannot disagree about it. What is added here is the part
 * a gas-lift traverse needs and the well record deliberately does not
 * hold: the wellhead pressure the tubing is flowing against and the
 * water cut it is flowing at. Those are duty, not well.
 */
export const buildWellModel = (inputs) => {
  const base = buildSharedWellModel(inputs);
  if (!base) return null;
  return {
    ...base,
    vlp: {
      ...base.vlp,
      whp: num(inputs.injection.whp, NaN),
      rates: {
        wct: num(inputs.injection.wctPct, 0) / 100,
        gor: num(inputs.fluid.gor, 0),
      },
    },
  };
};

export const GasLiftDesignProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  const [inputs, setInputs] = useState(defaultInputs);
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  // Optional spine identity link (never part of the design math).
  const [fields, setFields] = useState([]);
  const [spineWells, setSpineWells] = useState([]);
  const [wellTests, setWellTests] = useState([]);
  const [legacyDesigns, setLegacyDesigns] = useState([]);
  const [busyMessage, setBusyMessage] = useState(null);

  // On-demand runs.
  const [performance, setPerformance] = useState(null);
  const [depthSweep, setDepthSweep] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  const setSection = useCallback((section, key, value) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
  }, []);
  const patchSection = useCallback((section, patch) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
  }, []);

  // --- The well model and everything cheap enough to recompute live ---
  const model = useMemo(() => {
    try {
      return buildWellModel(inputs);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [inputs]);

  const constructionTraverse = useMemo(() => {
    if (!model) return null;
    const qo = num(inputs.injection.designRateStbd, NaN);
    const qgi = num(inputs.injection.targetQgiMscfd, NaN);
    if (!(qo > 0) || !(qgi >= 0)) return null;
    try {
      // Fully lifted from the wellhead: this is the flowing gradient a
      // designer draws down the pressure-depth plot to find where the
      // injection line can still reach.
      return liftedTraverse({
        ...model.vlp, qo, injectionMd: model.vlp.nodeMd, qgiMscfd: qgi,
      });
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [model, inputs.injection.designRateStbd, inputs.injection.targetQgiMscfd]);

  const injectionPoint = useMemo(() => {
    if (!model || !constructionTraverse?.points?.length) return null;
    const pOper = num(inputs.injection.operatingPsig, NaN);
    if (!Number.isFinite(pOper)) return null;
    try {
      return injectionPointFromTraverse({
        traversePoints: constructionTraverse.points,
        pSurfPsia: psigToPsia(pOper),
        gasSg: num(inputs.injection.injGasSg, 0.65),
        tempAtDepthF: linearTemperature({
          whtF: num(inputs.well.whtF, 100),
          bhtF: num(inputs.well.bhtF, 170),
          refDepthFt: model.tvdMax,
        }),
        dpTransferPsi: num(inputs.design.dpTransferPsi, 0),
        maxDepthFt: Math.min(num(inputs.design.packerDepthFt, model.tvdMax), model.tvdMax),
      });
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [model, constructionTraverse, inputs.injection.operatingPsig, inputs.injection.injGasSg,
    inputs.well.whtF, inputs.well.bhtF, inputs.design.dpTransferPsi, inputs.design.packerDepthFt]);

  const targetDepthFt = inputs.design.useComputedInjectionDepth && injectionPoint
    ? injectionPoint.depthFt
    : undefined;

  const installation = useMemo(() => {
    try {
      return runInstallationDesign(designFormFrom(inputs, targetDepthFt));
    } catch (e) {
      console.error(e);
      return { ok: false, errors: [e.message], design: null };
    }
  }, [inputs, targetDepthFt]);

  const valveSheet = useMemo(
    () => valveSheetRows(installation.design),
    [installation.design],
  );

  const operatingValveMd = useMemo(() => {
    const depths = installation.design?.depths || [];
    if (!depths.length || !model) return null;
    return mdAtTvd(model.trajectory, depths[depths.length - 1]);
  }, [installation.design, model]);

  // Any input change makes a previous run stale rather than silently
  // leaving old numbers on screen next to new inputs.
  const runSignature = useMemo(() => JSON.stringify(inputs), [inputs]);
  const performanceStale = !!performance && performance.signature !== runSignature;
  const depthSweepStale = !!depthSweep && depthSweep.signature !== runSignature;

  const runPerformance = useCallback(async () => {
    if (!model || operatingValveMd === null) {
      addNotification('Design a valve string first: the performance curve is solved at the operating valve depth.', 'error');
      return;
    }
    setIsRunning(true);
    setBusyMessage('Solving the gas-lift performance curve...');
    // Yield a frame so the busy state paints before the solve blocks.
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const qgis = injectionRateLadder({
        maxQgiMscfd: inputs.injection.maxQgiMscfd,
        nPoints: inputs.injection.nPoints,
      });
      const result = gasLiftPerformance({
        ipr: model.ipr,
        vlp: model.vlp,
        injectionMd: operatingValveMd,
        qgis,
        econSlope: num(inputs.injection.econSlope, 0.05),
        nGrid: 25,
      });
      setPerformance({ ...result, signature: runSignature });
    } catch (e) {
      console.error(e);
      addNotification(e.message, 'error');
    } finally {
      setIsRunning(false);
      setBusyMessage(null);
    }
  }, [model, operatingValveMd, inputs.injection, runSignature, addNotification]);

  const runDepthSweep = useCallback(async () => {
    if (!model) {
      addNotification('Enter a well model first.', 'error');
      return;
    }
    setIsRunning(true);
    setBusyMessage('Solving the injection-depth sweep...');
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const deepest = Math.min(
        num(inputs.design.packerDepthFt, model.tvdMax),
        model.tvdMax,
      );
      const depthsMd = linspace(deepest * 0.2, deepest, 6)
        .map((tvd) => mdAtTvd(model.trajectory, tvd));
      const result = injectionDepthSweep({
        ipr: model.ipr,
        vlp: model.vlp,
        depthsMd,
        qgiMscfd: num(inputs.injection.targetQgiMscfd, 0),
        nGrid: 25,
      });
      setDepthSweep({ ...result, signature: runSignature });
    } catch (e) {
      console.error(e);
      addNotification(e.message, 'error');
    } finally {
      setIsRunning(false);
      setBusyMessage(null);
    }
  }, [model, inputs.design.packerDepthFt, inputs.injection.targetQgiMscfd, runSignature,
    addNotification]);

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

  // The well's own description lives on the spine (P6.5), shared with
  // every other production studio.
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
    onLoaded: () => { setPerformance(null); setDepthSweep(null); },
  });

  const applyLatestTest = useCallback(() => {
    const t = latestTestForLinkedWell;
    if (!t) {
      addNotification('That well has no valid test on the spine to apply.', 'info');
      return;
    }
    // The spine stores measured rates, not the derived ratios a well
    // model wants, so water cut and gas-oil ratio are computed here from
    // the same test rather than stored twice.
    const oil = num(t.oil_rate_stbd, 0);
    const water = num(t.water_rate_stbd, 0);
    const gas = num(t.gas_rate_mscfd, 0);
    const liquid = oil + water;
    const applied = [];
    setInputs((prev) => {
      const next = { ...prev };
      if (oil > 0) {
        next.injection = { ...prev.injection, designRateStbd: String(oil) };
        applied.push('design rate');
      }
      const injection = { ...next.injection };
      if (liquid > 0) {
        injection.wctPct = ((water / liquid) * 100).toFixed(1);
        applied.push('water cut');
      }
      if (num(t.thp_psia, 0) > 0) {
        injection.whp = String(t.thp_psia);
        applied.push('wellhead pressure');
      }
      next.injection = injection;
      if (oil > 0 && gas > 0) {
        next.fluid = { ...prev.fluid, gor: ((gas * 1000) / oil).toFixed(0) };
        applied.push('gas-oil ratio');
      }
      return next;
    });
    addNotification(
      applied.length
        ? `Applied the ${t.test_date} well test: ${applied.join(', ')}.`
        : `The ${t.test_date} well test has no rates to apply.`,
      applied.length ? 'success' : 'info',
    );
  }, [latestTestForLinkedWell, addNotification]);

  // --- Legacy Artificial Lift Designer import ---
  const loadLegacyDesigns = useCallback(async () => {
    setBusyMessage('Looking for old Artificial Lift Designer saves...');
    try {
      const { data, error } = await supabase
        .from('artificial_lift_designs')
        .select('id, design_name, design_data, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const withGasLift = (data || []).filter((d) => d.design_data?.gasLiftInputs);
      setLegacyDesigns(withGasLift);
      if (!withGasLift.length) {
        addNotification('No old Artificial Lift Designer saves carry gas lift inputs.', 'info');
      }
    } catch (e) {
      console.error(e);
      addNotification(e.message, 'error');
    } finally {
      setBusyMessage(null);
    }
  }, [addNotification]);

  const importLegacyDesign = useCallback((designId) => {
    const row = legacyDesigns.find((d) => d.id === designId);
    if (!row) return;
    const { patch, mapped, unmapped } = importLegacyGasLiftInputs(row.design_data.gasLiftInputs);
    setInputs((prev) => ({
      ...prev,
      well: {
        ...prev.well,
        ...(patch.packerDepthFt ? { depthFt: patch.packerDepthFt } : {}),
        ...(patch.whtF ? { whtF: patch.whtF } : {}),
        ...(patch.bhtF ? { bhtF: patch.bhtF } : {}),
      },
      fluid: {
        ...prev.fluid,
        ...(patch.api ? { api: patch.api } : {}),
        ...(patch.gasSg ? { gasSg: patch.gasSg } : {}),
        ...(patch.gorScfStb ? { gor: patch.gorScfStb } : {}),
        ...(patch.salinityPpm ? { salinityPpm: patch.salinityPpm } : {}),
      },
      inflow: {
        ...prev.inflow,
        ...(patch.prPsia ? { pr: patch.prPsia } : {}),
      },
      completion: {
        ...prev.completion,
        ...(patch.tubingIdIn ? { idIn: patch.tubingIdIn } : {}),
      },
      injection: {
        ...prev.injection,
        ...(patch.kickoffPsig ? { kickoffPsig: patch.kickoffPsig } : {}),
        ...(patch.injGasSg ? { injGasSg: patch.injGasSg } : {}),
        ...(patch.designRateStbd ? { designRateStbd: patch.designRateStbd } : {}),
        ...(patch.whpPsig ? { whp: patch.whpPsig } : {}),
        ...(patch.wctPct ? { wctPct: patch.wctPct } : {}),
      },
      design: {
        ...prev.design,
        ...(patch.packerDepthFt ? { packerDepthFt: patch.packerDepthFt } : {}),
      },
    }));
    addNotification(
      `Imported ${mapped.length} field${mapped.length === 1 ? '' : 's'} from "${row.design_name}".`
      + (unmapped.length ? ` ${unmapped.length} could not be carried over.` : ''),
      'success',
    );
    return { mapped, unmapped };
  }, [legacyDesigns, addNotification]);

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
      setProjectName(payload.name || projects.find((p) => p.id === id)?.name || 'Untitled design');
      setInputs(restored);
      setPerformance(null);
      setDepthSweep(null);
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
      addNotification('Design deleted', 'info');
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [currentProjectId, addNotification]);

  const manualSave = useCallback(async () => {
    if (!currentProjectId) {
      addNotification('Create or open a design first', 'info');
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
    valveFamilies: VALVE_FAMILIES,
    // derived
    model,
    constructionTraverse,
    injectionPoint,
    installation,
    valveSheet,
    operatingValveMd,
    // on-demand runs
    performance,
    performanceStale,
    runPerformance,
    depthSweep,
    depthSweepStale,
    runDepthSweep,
    isRunning,
    busyMessage,
    // spine link
    fields,
    spineWells,
    latestTestForLinkedWell,
    linkWell,
    applyLatestTest,
    // shared well model on the spine
    savedWellModel,
    wellModelDirty,
    loadFromSpine,
    saveToSpine,
    wellModelBusy,
    // legacy import
    legacyDesigns,
    loadLegacyDesigns,
    importLegacyDesign,
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
    <GasLiftDesignContext.Provider value={value}>
      {children}
    </GasLiftDesignContext.Provider>
  );
};
