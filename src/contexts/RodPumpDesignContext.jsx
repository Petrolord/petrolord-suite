// Rod Pump Design Studio state (Production P6, Production-ROADMAP.md
// §3 app 6 — docs/scope/ProductionOperations-STATUS.md).
//
// The P4/P5 recipe: this is a design app, so the well model and the
// equipment ARE the project and they live in the saved_rodpump_projects
// payload (createSavedProjectsService + hydrated guard + 10 s debounced
// autosave). The po_* spine is an optional identity link only.
//
// What is live and what is an explicit run is decided by how many wave
// equation solves a thing costs. One design is one solve, marched to a
// repeating stroke, so it recomputes as you type. The speed sweep is a
// solve per speed, so it is an explicit run with a stale flag.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { supabase } from '@/lib/customSupabaseClient';
import { registerStateKind, openStateRow } from '@/lib/stateVersion';
import * as spine from '@/lib/productionSpine';
import { linspace, num } from '@/utils/nodal/numerics';
import {
  defaultWellInputs, buildWellModel, mergeWellInputs,
} from '@/utils/production/wellModel';
import { useWellModelSync } from '@/hooks/useWellModelSync';
import { useWellDeepLink } from '@/hooks/useWellDeepLink';
import {
  runDesign, speedSweep, parseMeasuredCard, diagnoseMeasured, suggestTaper,
  parseSections, liquidGravity, importLegacyRodInputs,
} from '@/utils/production/rodPump';
import { ROD_SIZES, ROD_GRADES, PLUNGER_SIZES } from '@/utils/production/engine/rodCatalog';

// PP0 state kind: the legacy Artificial Lift Designer rows this studio imports
const LIFT_DESIGN_KIND = 'artificial-lift-design';
registerStateKind(LIFT_DESIGN_KIND, { current: 1, label: 'lift design' });

const TABLE = 'saved_rodpump_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save rod pump designs.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  const missingTable = error?.code === '42P01'
    || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist`, 'i').test(msg);
  if (missingTable) {
    return "Saving isn't set up yet. Run the p6_saved_rodpump_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => {
  // The well description comes from the SHARED shape (P6.5) so a model
  // saved here loads in the gas lift and ESP studios; only the numbers
  // are tuned for the kind of well a rod pump lifts.
  //
  // The completion block is carried even though a rod pump never uses
  // it: it lifts a liquid column and marches no multiphase traverse.
  // It is part of the WELL, and the studios that do march one need it,
  // so dropping it here would mean a model saved from this studio came
  // back incomplete somewhere else.
  const w = defaultWellInputs();
  return {
    well: { ...w.well, depthFt: '5000', whtF: '90', bhtF: '150' },
    fluid: { ...w.fluid, api: '30', gasSg: '0.7', gor: '80' },
    inflow: { ...w.inflow, pr: '1200', pb: '800', pi: '0.6', qmax: '400' },
    // Carried but unused here. The well record is SHARED, so a studio
    // that dropped this section would wipe a gas well's deliverability
    // coefficients the moment it saved the model back.
    gasInflow: { ...w.gasInflow },
    completion: { ...w.completion },
    duty: {
      designRateStbd: '120',
      wctPct: '80',
      whp: '80',
      pumpTvdFt: '4800',
      annulusGradPsiPerFt: '0.38',
      separatorEfficiencyPct: '60',
      pumpEfficiencyPct: '90',
    },
    unit: {
      strokeIn: '64',
      spm: '8',
      plungerDIn: '1.75',
      unitSource: 'generic',
      unitDesignation: 'C-228D-200-74',
      structuralUnbalanceLb: '0',
      crankOffsetDeg: '0',
      dampingRatio: '0.1',
      aIn: '',
      cIn: '',
      pIn: '',
      crankBehindIn: '',
      crankBelowIn: '',
      rIn: '',
    },
    rods: {
      gradeId: 'D',
      serviceFactor: '1',
      sectionsText: '7/8, 2400\n3/4, 2400',
    },
    sweep: { minSpm: '4', maxSpm: '14', nPoints: '6' },
    diagnostics: { cardText: '', spm: '' },
    link: { fieldId: null, wellId: null, wellName: '' },
  };
};

const SECTIONS = ['well', 'fluid', 'inflow', 'gasInflow', 'completion', 'duty', 'unit', 'rods', 'sweep', 'diagnostics', 'link'];

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

const RodPumpDesignContext = createContext();

export const useRodPump = () => {
  const context = useContext(RodPumpDesignContext);
  if (!context) throw new Error('useRodPump must be used within a RodPumpDesignProvider');
  return context;
};

/**
 * Flatten the studio sections into the flat form runDesign takes.
 *
 * The perforation depth is NOT here: it is the well model's node depth,
 * for the same reason as in the ESP studio. Carrying a depth twice is
 * how a design drifts away from the well it was drawn against.
 */
export const designFormFrom = (inputs) => ({
  ...inputs.duty,
  ...inputs.unit,
  ...inputs.rods,
  gorScfStb: inputs.fluid.gor,
  api: inputs.fluid.api,
});

// The nodal bundle this studio runs on now comes from the shared
// well-model module (P6.5): one implementation, so the gas lift, ESP and
// rod pump studios cannot disagree about what a well does. The vlp it
// returns is ignored here — a rod pump lifts a liquid column.
export { buildWellModel };

export const RodPumpDesignProvider = ({ children }) => {
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
  const [legacyDesigns, setLegacyDesigns] = useState([]);
  const [busyMessage, setBusyMessage] = useState(null);

  const [sweep, setSweep] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  const setSection = useCallback((section, key, value) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
  }, []);
  const patchSection = useCallback((section, patch) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
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

  const form = useMemo(() => designFormFrom(inputs), [inputs]);

  const result = useMemo(() => {
    try {
      return runDesign({ form, model });
    } catch (e) {
      console.error(e);
      return { ok: false, errors: [e.message], design: null };
    }
  }, [form, model]);

  const design = result.design;

  // --- Diagnostics: a measured card read through the Gibbs solution ---
  const measuredCard = useMemo(
    () => parseMeasuredCard(inputs.diagnostics.cardText),
    [inputs.diagnostics.cardText],
  );

  const diagnosis = useMemo(() => {
    if (!result.string?.ok || measuredCard.length < 16) return null;
    try {
      return diagnoseMeasured({
        string: result.string,
        card: measuredCard,
        spm: num(inputs.diagnostics.spm, num(inputs.unit.spm, 8)),
        dampingRatio: num(inputs.unit.dampingRatio, 0.1),
      });
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [result.string, measuredCard, inputs.diagnostics.spm, inputs.unit.spm, inputs.unit.dampingRatio]);

  /** Load the design's own predicted surface card into the diagnostics tab. */
  const useDesignCardForDiagnosis = useCallback(() => {
    if (!design) {
      addNotification('Run a design first: the diagnostic reads a card against its rod string.', 'error');
      return;
    }
    const text = design.dynamics.surfaceCard
      .map((p) => `${p.positionIn.toFixed(2)}, ${p.loadLb.toFixed(0)}`)
      .join('\n');
    patchSection('diagnostics', { cardText: text, spm: String(design.spm) });
    addNotification('Loaded the predicted surface card. Diagnosing it should return the pump card the design assumed.', 'info');
  }, [design, patchSection, addNotification]);

  // --- Taper suggestion ---
  const proposeTaper = useCallback((sizes) => {
    if (!design && !result.string?.ok) {
      addNotification('The design has to run before a taper can be proposed against its loads.', 'error');
      return;
    }
    const pumpTvdFt = num(inputs.duty.pumpTvdFt, 0);
    const liquidSg = liquidGravity({
      api: inputs.fluid.api, wct: num(inputs.duty.wctPct, 0) / 100,
    });
    const t = suggestTaper({
      pumpTvdFt,
      sizes,
      plungerDIn: num(inputs.unit.plungerDIn, 1.75),
      pDischargePsi: design ? design.pDischargePsi : 0.433 * liquidSg * pumpTvdFt,
      pIntakePsi: design ? design.intake.pipPsia : 0,
      liquidSg,
    });
    if (!t.ok) {
      addNotification(t.note, 'error');
      return;
    }
    setSection('rods', 'sectionsText',
      t.sections.map((s) => `${s.size}, ${Math.round(s.lengthFt)}`).join('\n'));
    addNotification('Taper proposed: lengths chosen so every section carries the same peak stress.', 'success');
  }, [design, result.string, inputs.duty, inputs.fluid.api, inputs.unit.plungerDIn,
    setSection, addNotification]);

  // --- The explicit run ---
  const runSignature = useMemo(() => JSON.stringify(inputs), [inputs]);
  const sweepStale = !!sweep && sweep.signature !== runSignature;

  const runSweep = useCallback(async () => {
    if (!model) {
      addNotification('Enter a well model first.', 'error');
      return;
    }
    setIsRunning(true);
    setBusyMessage('Solving the wave equation at each pumping speed...');
    // Yield a frame so the busy state paints before the solve blocks.
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const spms = linspace(
        num(inputs.sweep.minSpm, 4),
        num(inputs.sweep.maxSpm, 14),
        Math.max(2, Math.round(num(inputs.sweep.nPoints, 6))),
      );
      const points = speedSweep({ form, model, spms });
      setSweep({ points, signature: runSignature });
    } catch (e) {
      console.error(e);
      addNotification(e.message, 'error');
    } finally {
      setIsRunning(false);
      setBusyMessage(null);
    }
  }, [model, form, inputs.sweep, runSignature, addNotification]);

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
    onLoaded: () => setSweep(null),
  });

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
      if (oil > 0) { duty.designRateStbd = String(oil); applied.push('design rate'); }
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
        .select('id, design_name, design_data, updated_at, schema_version')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const opened = (data || []).map((d) => openStateRow(LIFT_DESIGN_KIND, d));
      const withRod = opened.filter((d) => d.design_data?.rodPumpInputs);
      setLegacyDesigns(withRod);
      if (!withRod.length) {
        addNotification('No old Artificial Lift Designer saves carry rod pump inputs.', 'info');
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
    if (!row) return undefined;
    const { patch, mapped, unmapped } = importLegacyRodInputs(row.design_data.rodPumpInputs);
    setInputs((prev) => ({
      ...prev,
      fluid: { ...prev.fluid, ...(patch.api ? { api: patch.api } : {}) },
      duty: {
        ...prev.duty,
        ...(patch.designRateStbd ? { designRateStbd: patch.designRateStbd } : {}),
        ...(patch.pumpTvdFt ? { pumpTvdFt: patch.pumpTvdFt } : {}),
        ...(patch.whp ? { whp: patch.whp } : {}),
        ...(patch.wctPct ? { wctPct: patch.wctPct } : {}),
      },
      unit: {
        ...prev.unit,
        ...(patch.strokeIn ? { strokeIn: patch.strokeIn } : {}),
        ...(patch.spm ? { spm: patch.spm } : {}),
        ...(patch.plungerDIn ? { plungerDIn: patch.plungerDIn } : {}),
      },
    }));
    addNotification(
      `Imported ${mapped.length} field${mapped.length === 1 ? '' : 's'} from "${row.design_name}".`
      + (unmapped.length ? ' The rod string could not be carried over.' : ''),
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
    rodSizes: ROD_SIZES,
    rodGrades: ROD_GRADES,
    plungerSizes: PLUNGER_SIZES,
    // derived
    model,
    form,
    result,
    design,
    string: result.string,
    unit: result.unit,
    sections: useMemo(() => parseSections(inputs.rods.sectionsText), [inputs.rods.sectionsText]),
    // diagnostics
    measuredCard,
    diagnosis,
    useDesignCardForDiagnosis,
    proposeTaper,
    // explicit run
    sweep,
    sweepStale,
    runSweep,
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
    <RodPumpDesignContext.Provider value={value}>
      {children}
    </RodPumpDesignContext.Provider>
  );
};
