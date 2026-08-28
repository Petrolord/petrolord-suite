// ESP Design Studio state (Production P5, Production-ROADMAP.md §3 app
// 5 — docs/scope/ProductionOperations-STATUS.md).
//
// Same shape as the P4 Gas Lift studio, and for the same reason: this
// is a design app, not a data app, so the well model and the equipment
// selection ARE the project and they live in the
// saved_esp_projects payload (createSavedProjectsService + hydrated
// guard + 10 s debounced autosave). The po_* spine appears only as an
// optional identity link.
//
// What is live and what is an explicit run is decided by how many
// traverses a thing costs. One design run is a single traverse from the
// wellhead down to the pump, so it recomputes as you type. The system
// curve is a traverse per rate and the operating point is a traverse
// per bisection step, so those are explicit runs with a stale flag.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { supabase } from '@/lib/customSupabaseClient';
import * as spine from '@/lib/productionSpine';
import { rateAtPwf } from '@/utils/nodal/ipr';
import { num } from '@/utils/nodal/numerics';
import {
  defaultWellInputs, buildWellModel, mergeWellInputs,
} from '@/utils/production/wellModel';
import { useWellModelSync } from '@/hooks/useWellModelSync';
import { useWellDeepLink } from '@/hooks/useWellDeepLink';
import {
  runEspDesign, buildStageCurve, pumpVsSystem, stackHeadCurve, solveEspOperatingPoint,
  diagnose, importLegacyEspInputs, rateLadder, mdAtTvd,
} from '@/utils/production/esp';
import { REFERENCE_STAGES, MOTOR_FRAMES, CABLE_SIZES } from '@/utils/production/engine/espCatalog';

const TABLE = 'saved_esp_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save ESP designs.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  const missingTable = error?.code === '42P01'
    || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist`, 'i').test(msg);
  if (missingTable) {
    return "Saving isn't set up yet. Run the p5_saved_esp_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => {
  // The well description comes from the SHARED shape (P6.5) so a model
  // saved here loads in the gas lift and rod pump studios; only the
  // numbers are tuned for the kind of well an ESP usually lifts.
  const w = defaultWellInputs();
  return {
    well: { ...w.well, depthFt: '7500', bhtF: '190' },
    fluid: { ...w.fluid, gor: '120' },
    inflow: { ...w.inflow, pr: '2200', pb: '1500', pi: '0.5' },
    // Carried but unused here. The well record is SHARED, so a studio
    // that dropped this section would wipe a gas well's deliverability
    // coefficients the moment it saved the model back.
    gasInflow: { ...w.gasInflow },
    completion: { ...w.completion, idIn: '3.958', stepFt: '250' },
    duty: {
      designRateStbd: '300',
      wctPct: '90',
      whp: '200',
      pumpTvdFt: '7000',
      annulusGradPsiPerFt: '0.4',
      separatorEfficiencyPct: '70',
      gvfStandardMaxPct: '10',
      gvfHandlerMaxPct: '25',
    },
    pump: {
      curveSource: 'reference',
      referenceStageId: 'ref-562-4000',
      curveRefHz: '60',
      curveText: '',
      hz: '60',
    },
    motor: {
      motorFrameId: 'm-250-2400',
      nameplateHp: '250',
      nameplateVolts: '2400',
      nameplateAmps: '67',
      motorEfficiencyPct: '85',
      powerFactor: '0.85',
      cableLengthFt: '7200',
      cableTempF: '180',
      maxDropPct: '5',
    },
    diagnostics: {
      qBpd: '',
      pIntakePsia: '',
      pDischargePsia: '',
      hz: '60',
      amps: '',
      stagesOverride: '',
    },
    system: { nPoints: '9' },
    link: { fieldId: null, wellId: null, wellName: '' },
  };
};

const SECTIONS = [
  'well', 'fluid', 'inflow', 'gasInflow', 'completion', 'duty', 'pump', 'motor',
  'diagnostics', 'system', 'link',
];

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

const EspDesignContext = createContext();

export const useEsp = () => {
  const context = useContext(EspDesignContext);
  if (!context) throw new Error('useEsp must be used within an EspDesignProvider');
  return context;
};

/**
 * Flatten the studio sections into the flat form runEspDesign takes.
 *
 * The perforation depth is NOT a separate field: it is the node depth
 * of the well model. Carrying it twice is how a pump ends up designed
 * against a depth the traverse never saw.
 */
export const designFormFrom = (inputs, model) => ({
  ...inputs.duty,
  ...inputs.pump,
  ...inputs.motor,
  gorScfStb: inputs.fluid.gor,
  perfTvdFt: model ? String(model.tvdMax) : '',
});

// The nodal bundle this studio runs on now comes from the shared
// well-model module (P6.5): one implementation, so the gas lift, ESP and
// rod pump studios cannot disagree about what a well does.
export { buildWellModel };

export const EspDesignProvider = ({ children }) => {
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

  // On-demand run.
  const [systemRun, setSystemRun] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  const setSection = useCallback((section, key, value) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
  }, []);
  const patchSection = useCallback((section, patch) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
  }, []);

  /** Typing a motor frame fills the nameplate; every number stays editable. */
  const applyMotorFrame = useCallback((id) => {
    const frame = MOTOR_FRAMES.find((m) => m.id === id);
    if (!frame) return;
    patchSection('motor', {
      motorFrameId: id,
      nameplateHp: String(frame.hp),
      nameplateVolts: String(frame.volts),
      nameplateAmps: String(frame.amps),
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

  const form = useMemo(() => designFormFrom(inputs, model), [inputs, model]);

  const curve = useMemo(() => {
    try {
      return buildStageCurve(form);
    } catch (e) {
      console.error(e);
      return { ok: false, warnings: [e.message] };
    }
  }, [form]);

  const result = useMemo(() => {
    try {
      return runEspDesign({ form, model });
    } catch (e) {
      console.error(e);
      return { ok: false, errors: [e.message], design: null, curve };
    }
  }, [form, model, curve]);

  const design = result.design;

  /** The stack's own head curve. Pure curve arithmetic, so it stays live. */
  const stackCurvePoints = useMemo(() => {
    if (!design || !curve.ok) return [];
    try {
      return stackHeadCurve({
        curve,
        stages: design.sized.stages,
        hz: design.hz,
        specificGravity: design.duty.intake.specificGravity,
        nPoints: 25,
      });
    } catch (e) {
      console.error(e);
      return [];
    }
  }, [design, curve]);

  // --- Diagnostics (the absorbed ESP Performance Monitor) ---
  const diagnosis = useMemo(() => {
    if (!design || !curve.ok) return null;
    const d = inputs.diagnostics;
    const qBpd = num(d.qBpd, NaN);
    const pIntakePsia = num(d.pIntakePsia, NaN);
    const pDischargePsia = num(d.pDischargePsia, NaN);
    if (!(qBpd > 0) || !Number.isFinite(pIntakePsia) || !Number.isFinite(pDischargePsia)) {
      return null;
    }
    const stages = num(d.stagesOverride, NaN);
    try {
      return diagnose({
        curve,
        stages: Number.isFinite(stages) && stages > 0 ? Math.round(stages) : design.sized.stages,
        hz: num(d.hz, design.hz),
        specificGravity: design.duty.intake.specificGravity,
        measured: { qBpd, pIntakePsia, pDischargePsia, amps: num(d.amps, NaN) },
        nameplateAmps: num(inputs.motor.nameplateAmps, NaN),
      });
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [design, curve, inputs.diagnostics, inputs.motor.nameplateAmps]);

  // --- The explicit run ---
  // Any input change makes a previous run stale rather than leaving old
  // numbers on screen beside new inputs.
  const runSignature = useMemo(() => JSON.stringify(inputs), [inputs]);
  const systemStale = !!systemRun && systemRun.signature !== runSignature;

  const runSystemCurve = useCallback(async () => {
    if (!result.ok || !model) {
      addNotification('Fix the design inputs first: the system curve is solved on the same well model.', 'error');
      return;
    }
    setIsRunning(true);
    setBusyMessage('Solving the system curve and the operating point...');
    // Yield a frame so the busy state paints before the solve blocks.
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const qMaxStbd = model.ipr.qmax ?? rateAtPwf(model.ipr, 0);
      const rates = rateLadder({ qMaxStbd, nPoints: num(inputs.system.nPoints, 9) });
      const points = pumpVsSystem({ design, curve, model, form, rates });
      const operating = solveEspOperatingPoint({
        model,
        curve,
        stages: design.sized.stages,
        hz: design.hz,
        wct: design.wct,
        gorScfStb: design.gorScfStb,
        pumpTvdFt: design.pumpTvdFt,
        pumpMd: design.pumpMd,
        perfTvdFt: design.perfTvdFt,
        annulusGradPsiPerFt: num(inputs.duty.annulusGradPsiPerFt, 0),
        separatorEfficiency: num(inputs.duty.separatorEfficiencyPct, 0) / 100,
        whp: num(inputs.duty.whp, 0),
        gasLimits: design.gasLimits,
        qMaxStbd,
      });
      setSystemRun({ points, operating, qMaxStbd, signature: runSignature });
    } catch (e) {
      console.error(e);
      addNotification(e.message, 'error');
    } finally {
      setIsRunning(false);
      setBusyMessage(null);
    }
  }, [result.ok, model, design, curve, form, inputs.system.nPoints, inputs.duty,
    runSignature, addNotification]);

  /** Measured depth of the pump, for the report. */
  const pumpMd = useMemo(() => {
    if (!model) return null;
    return mdAtTvd(model.trajectory, num(inputs.duty.pumpTvdFt, 0));
  }, [model, inputs.duty.pumpTvdFt]);

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
  // every other production studio. Loading and saving are deliberate:
  // a design may try a different inflow without rewriting the field's
  // record for everyone.
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
    onLoaded: () => setSystemRun(null),
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
        .select('id, design_name, design_data, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const withEsp = (data || []).filter((d) => d.design_data?.espInputs);
      setLegacyDesigns(withEsp);
      if (!withEsp.length) {
        addNotification('No old Artificial Lift Designer saves carry ESP inputs.', 'info');
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
    const { patch, mapped, unmapped } = importLegacyEspInputs(row.design_data.espInputs);
    setInputs((prev) => ({
      ...prev,
      well: {
        ...prev.well,
        ...(patch.perfTvdFt ? { depthFt: patch.perfTvdFt } : {}),
      },
      fluid: {
        ...prev.fluid,
        ...(patch.api ? { api: patch.api } : {}),
        ...(patch.gasSg ? { gasSg: patch.gasSg } : {}),
        ...(patch.gorScfStb ? { gor: patch.gorScfStb } : {}),
      },
      completion: {
        ...prev.completion,
        ...(patch.tubingIdIn ? { idIn: patch.tubingIdIn } : {}),
        ...(patch.casingIdIn ? { casingIdIn: patch.casingIdIn } : {}),
      },
      duty: {
        ...prev.duty,
        ...(patch.designRateStbd ? { designRateStbd: patch.designRateStbd } : {}),
        ...(patch.pumpTvdFt ? { pumpTvdFt: patch.pumpTvdFt } : {}),
        ...(patch.whp ? { whp: patch.whp } : {}),
        ...(patch.wctPct ? { wctPct: patch.wctPct } : {}),
      },
      pump: {
        ...prev.pump,
        ...(patch.hz ? { hz: patch.hz } : {}),
      },
    }));
    addNotification(
      `Imported ${mapped.length} field${mapped.length === 1 ? '' : 's'} from "${row.design_name}".`
      + (unmapped.length ? ' The pump model could not be carried over.' : ''),
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
      setSystemRun(null);
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
    applyMotorFrame,
    referenceStages: REFERENCE_STAGES,
    motorFrames: MOTOR_FRAMES,
    cableSizes: CABLE_SIZES,
    // derived
    model,
    form,
    curve,
    result,
    design,
    stackCurvePoints,
    diagnosis,
    pumpMd,
    // explicit run
    systemRun,
    systemStale,
    runSystemCurve,
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
    <EspDesignContext.Provider value={value}>
      {children}
    </EspDesignContext.Provider>
  );
};
