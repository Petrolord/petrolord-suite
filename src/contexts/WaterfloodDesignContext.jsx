// Waterflood Design Studio state. Modeled on DeclineCurveContext but lean:
// all engine results are useMemo-derived from persisted inputs (the
// saved_<app>_projects convention: results are never stored), projects persist
// through the shared savedProjects service, notifications come from the
// Studio shell hook.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { analyzeDisplacement, validateKrTable } from '@/utils/fractionalFlowCalculations';
import { forecastPattern } from '@/utils/patternForecastCalculations';
import { parseUncertaintyConfig, runWaterfloodUncertaintyAsync } from '@/utils/waterfloodUncertainty';
import { analyzeWaterflood } from '@/utils/waterfloodCalculations';
import { useSharedSavedProjects } from '@/lib/recordSharing/useSharedSavedProjects';
import { WF_PAYLOAD_VERSION, DEFAULT_IDENTIFICATION, migrateWaterfloodPayload } from '@/utils/waterflooddesign/model';
import { setProvenanceField, serializeProvenance, deserializeProvenance } from '@/lib/inputProvenance';
import { mcSummaryRecord, mcInputsFingerprint } from '@/utils/waterflooddesign/mcSummary';
import { wfUnits } from '@/utils/waterflooddesign/units';
import { layeredFrom } from '@/utils/waterflooddesign/workspace';
import { patternKeyOf } from '@/utils/waterflooddesign/patterns';
import { applyHallWindows } from '@/utils/waterflooddesign/hallWindows';

export const WF_PROJECTS_TABLE = 'saved_waterflood_design_projects';

const WaterfloodDesignContext = createContext(null);

export const useWaterfloodDesign = () => {
  const ctx = useContext(WaterfloodDesignContext);
  if (!ctx) throw new Error('useWaterfloodDesign must be used within WaterfloodDesignProvider');
  return ctx;
};

const service = createSavedProjectsService(WF_PROJECTS_TABLE, {
  signInMessage: 'Sign in to save waterflood projects.',
});

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

export const DEFAULT_DISPLACEMENT = {
  krSource: 'corey', // 'corey' | 'table'
  Swc: '0.2', Sor: '0.2', krwMax: '0.4', kroMax: '1.0', nw: '2', no: '2',
  krTable: [], // [{Sw, krw, kro}] when krSource === 'table'
  muW: '0.5', muO: '5.0',
  gravityOn: false,
  k_md: '500', A_ft2: '50000', qt_rbd: '1000', dipDeg: '0', gammaW: '1.05', gammaO: '0.85',
  polymerOn: false,
  polymerMuMult: '4',
};

export const DEFAULT_LAYERS = [
  { h: '10', k: '500' },
  { h: '8', k: '250' },
  { h: '12', k: '120' },
  { h: '6', k: '60' },
  { h: '9', k: '30' },
];

export const DEFAULT_LAYERED_CONFIG = {
  mSource: 'displacement', // 'displacement' | 'manual'
  M: '2.0',
  A: '1.5',
};

export const DEFAULT_PATTERN = {
  area_acres: '40', h_ft: '25', phi: '0.22',
  Bo: '1.25', Bw: '1.02', iw_bpd: '800',
  Sgi: '0', EV: '1', worLimit: '25', maxYears: '30',
  // WF-U1-004: the mobility ratio fed to the areal sweep correlation.
  // Version 1 projects open as 'endpoint' (src/utils/waterflooddesign/model.js).
  mobilityBasis: 'craig',
};

// Uncertainty tab config (persisted with the project; results never are).
// params: { key: { enabled, type, min, mode, max, mean, stdDev } } as strings.
export const DEFAULT_UNCERTAINTY = {
  iterations: '1000',
  params: {},
};

// Surveillance tab (W6, absorbed from the retired Waterflood Dashboard):
// field injection/production history + the analyzeWaterflood engine config.
// Empty dates mean "analyze the full uploaded range".
export const DEFAULT_SURVEILLANCE_CONFIG = {
  start_date: '', end_date: '',
  bo: '1.25', bw: '1.02', bg: '0.9', rs: '500',
  smooth_window_days: '5', vrr_window_days: '30', target_vrr: '1.0',
  // WF-U1: what the pressure column holds (Hall plot basis); stated, not converted
  pressure_basis: 'wellhead',
  // WF-U1-007: the reservoir pressure at which a pvt-1 intake read the FVFs
  pvt_pressure: '',
};

// analyzeWaterflood expects numeric config; the studio keeps strings in form
// state like every other tab.
export function buildSurveillanceConfig(c) {
  const numOr = (v, fallback) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    start_date: c.start_date || undefined,
    end_date: c.end_date || undefined,
    bo: numOr(c.bo, 1.25), bw: numOr(c.bw, 1.02),
    bg: numOr(c.bg, 0), rs: numOr(c.rs, 0),
    smooth_window_days: numOr(c.smooth_window_days, 5),
    vrr_window_days: numOr(c.vrr_window_days, 30),
    target_vrr: numOr(c.target_vrr, 1.0),
    // WF-U1-005: volumes are rate x days and the window is calendar days
    time_weighting: 'calendar',
  };
}

// Numeric pattern inputs from form state; null when invalid. Shared by the
// deterministic Pattern tab memo and the uncertainty run.
export function buildPatternInputs(p) {
  const pattern = {
    area_acres: num(p.area_acres), h_ft: num(p.h_ft), phi: num(p.phi),
    Bo: num(p.Bo), Bw: num(p.Bw), iw_bpd: num(p.iw_bpd),
    Sgi: num(p.Sgi) || 0, EV: num(p.EV) || 1,
    worLimit: num(p.worLimit) || 25, maxYears: num(p.maxYears) || 30,
    mobilityBasis: p.mobilityBasis === 'endpoint' ? 'endpoint' : 'craig',
    // WF-U2-002: the flood pattern; a project without one is a five-spot.
    // Not in DEFAULT_PATTERN, so saved projects keep their Monte Carlo fingerprint.
    patternType: patternKeyOf(p.patternType),
  };
  if (![pattern.area_acres, pattern.h_ft, pattern.phi, pattern.Bo, pattern.Bw, pattern.iw_bpd].every((v) => v > 0)) return null;
  return pattern;
}

// Build the engine displacement spec from form inputs; null when invalid.
export function buildDisplacementSpec(d) {
  const muW = num(d.muW);
  const muO = num(d.muO);
  if (!(muW > 0) || !(muO > 0)) return { spec: null, error: 'Viscosities must be positive.' };

  let krSpec;
  if (d.krSource === 'table') {
    const { ok, errors } = validateKrTable(d.krTable);
    if (!ok) return { spec: null, error: errors[0] || 'Invalid rel-perm table.' };
    krSpec = { type: 'table', rows: d.krTable };
  } else {
    const p = { Swc: num(d.Swc), Sor: num(d.Sor), krwMax: num(d.krwMax), kroMax: num(d.kroMax), nw: num(d.nw), no: num(d.no) };
    if (!(1 - p.Swc - p.Sor > 0.01) || !(p.krwMax > 0) || !(p.kroMax > 0) || !(p.nw > 0) || !(p.no > 0)) {
      return { spec: null, error: 'Corey inputs need 1 - Swc - Sor > 0 and positive endpoints/exponents.' };
    }
    krSpec = { type: 'corey', ...p };
  }

  const spec = { krSpec, muW, muO };
  if (d.gravityOn) {
    const gravity = { k_md: num(d.k_md), A_ft2: num(d.A_ft2), qt_rbd: num(d.qt_rbd), dipDeg: num(d.dipDeg), gammaW: num(d.gammaW), gammaO: num(d.gammaO) };
    if (Object.values(gravity).every(Number.isFinite) && gravity.qt_rbd > 0) spec.gravity = gravity;
    else return { spec: null, error: 'Gravity term needs numeric k, A, qt, dip and specific gravities.' };
  }
  if (d.polymerOn) {
    const mult = num(d.polymerMuMult);
    if (!(mult > 0)) return { spec: null, error: 'Polymer viscosity multiplier must be positive.' };
    spec.polymerMuMult = mult;
  }
  return { spec, error: null };
}

export const WaterfloodDesignProvider = ({ children, sharingStore = null, profileSystem = null, build = null }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  // Projects. WF-U1: saved_waterflood_design_projects is under the record
  // sharing rules (20261002130000): with a store the picker lists my
  // projects, then those shared with me; a save goes through the store and
  // only while I may write (owner, or the colleague holding the check-out).
  const shared = useSharedSavedProjects({ table: WF_PROJECTS_TABLE, service, sharingStore });
  const canWrite = shared.canWrite;
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hydrated, setHydrated] = useState(false); // guards autosave until a project is open

  // Persisted inputs
  const [displacementInputs, setDisplacementInputs] = useState(DEFAULT_DISPLACEMENT);
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [layeredConfig, setLayeredConfig] = useState(DEFAULT_LAYERED_CONFIG);
  const [patternInputs, setPatternInputs] = useState(DEFAULT_PATTERN);
  const [scenarios, setScenarios] = useState([]);
  const [uncertaintyConfig, setUncertaintyConfig] = useState(DEFAULT_UNCERTAINTY);
  const [surveillanceRows, setSurveillanceRows] = useState([]);
  const [surveillanceConfig, setSurveillanceConfig] = useState(DEFAULT_SURVEILLANCE_CONFIG);
  // WF-U1: the report header, input sources, display units, the pvt-1
  // intake, the surveillance import record, the last Monte Carlo summary
  const [identification, setIdentification] = useState(DEFAULT_IDENTIFICATION);
  const [inputMeta, setInputMeta] = useState({});
  const [unitSystemSaved, setUnitSystemSaved] = useState(null); // null: follows the Suite unit profile
  const unitSystem = unitSystemSaved === 'si' || unitSystemSaved === 'oilfield' ? unitSystemSaved : (profileSystem === 'si' ? 'si' : 'oilfield');
  const u = useMemo(() => wfUnits(unitSystem), [unitSystem]);
  const [pvtIntake, setPvtIntake] = useState(null);
  const [surveillanceImport, setSurveillanceImport] = useState(null);
  const [mcSummary, setMcSummary] = useState(null);
  const [migratedFrom, setMigratedFrom] = useState(null);
  // WF-U2-001: the flood start date that puts the forecast on the calendar
  // for the wf-forecast-1 contract (kept outside patternInputs, so saved
  // Monte Carlo summaries keep their fingerprint)
  const [floodStart, setFloodStart] = useState('');
  // WF-U2-003: Hall windows chosen per injector, with the reason
  const [hallWindows, setHallWindows] = useState({});
  const setHallWindow = useCallback((injector, choice) => setHallWindows((prev) => {
    const next = { ...prev };
    if (choice) next[injector] = choice; else delete next[injector];
    return next;
  }), []);

  // Transient Monte Carlo state: expensive and stochastic, so it is run on
  // demand (never a useMemo) and never persisted.
  const [uncertaintyResult, setUncertaintyResult] = useState(null);
  const [isRunningUncertainty, setIsRunningUncertainty] = useState(false);
  const [uncertaintyProgress, setUncertaintyProgress] = useState(0);
  const [uncertaintyStale, setUncertaintyStale] = useState(false);
  const hasUncertaintyResult = useRef(false);

  const setDisplacementField = useCallback((k, v) => setDisplacementInputs((prev) => ({ ...prev, [k]: v })), []);
  const setLayeredField = useCallback((k, v) => setLayeredConfig((prev) => ({ ...prev, [k]: v })), []);
  const setPatternField = useCallback((k, v) => setPatternInputs((prev) => ({ ...prev, [k]: v })), []);
  const setSurveillanceField = useCallback((k, v) => setSurveillanceConfig((prev) => ({ ...prev, [k]: v })), []);
  const setIdentificationField = useCallback((k, v) => setIdentification((prev) => ({ ...prev, [k]: v })), []);
  const setInputSource = useCallback((key, field, value) => setInputMeta((prev) => setProvenanceField(prev, key, field, value)), []);
  // WF-U1: a pvt-1 intake lands in three tabs at once and is kept with the project
  const takePvt = useCallback((patch, intake) => {
    if (patch?.displacement) setDisplacementInputs((prev) => ({ ...prev, ...patch.displacement }));
    if (patch?.pattern) setPatternInputs((prev) => ({ ...prev, ...patch.pattern }));
    if (patch?.surveillance) setSurveillanceConfig((prev) => ({ ...prev, ...patch.surveillance }));
    setPvtIntake(intake || null);
  }, []);
  const setUnitSystem = useCallback((sys) => setUnitSystemSaved(sys === 'si' ? 'si' : 'oilfield'), []);
  const setUncertaintyIterations = useCallback((v) => setUncertaintyConfig((prev) => ({ ...prev, iterations: v })), []);
  // WF-U2-005: blank draws a seed at run time (recorded); a number reproduces a run
  const setUncertaintySeed = useCallback((v) => setUncertaintyConfig((prev) => {
    const next = { ...prev };
    if (v == null || String(v).trim() === '') delete next.seed; else next.seed = String(v).trim();
    return next;
  }), []);
  const setUncertaintyParam = useCallback((key, patch) => setUncertaintyConfig((prev) => ({
    ...prev,
    params: { ...prev.params, [key]: { ...(prev.params[key] || {}), ...patch } },
  })), []);

  // ---- Derived engine results (never persisted) ----
  const displacementSpec = useMemo(() => buildDisplacementSpec(displacementInputs), [displacementInputs]);
  const displacement = useMemo(
    () => (displacementSpec.spec ? analyzeDisplacement(displacementSpec.spec) : null),
    [displacementSpec],
  );

  const layeredResult = useMemo(
    () => layeredFrom(layers, layeredConfig, displacement, patternInputs),
    [layers, layeredConfig, displacement, patternInputs.Bo, patternInputs.Bw], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const patternResult = useMemo(() => {
    if (!displacementSpec.spec) return null;
    const pattern = buildPatternInputs(patternInputs);
    if (!pattern) return null;
    return forecastPattern({ displacementSpec: displacementSpec.spec, pattern });
  }, [displacementSpec, patternInputs]);

  // Surveillance analysis: pure engine over uploaded history; recomputed on
  // any data/config change, never persisted (rows + config are the inputs).
  const surveillanceResult = useMemo(() => {
    if (!surveillanceRows.length) return null;
    try {
      return applyHallWindows(analyzeWaterflood(surveillanceRows, buildSurveillanceConfig(surveillanceConfig)), hallWindows);
    } catch (e) {
      return { error: e.message || 'Surveillance analysis failed' };
    }
  }, [surveillanceRows, surveillanceConfig, hallWindows]);

  // ---- Uncertainty (Monte Carlo) run: on demand, results transient ----
  const runUncertainty = useCallback(async () => {
    if (isRunningUncertainty) return;
    const { distributions, iterations, seed, errors } = parseUncertaintyConfig(uncertaintyConfig);
    if (errors.length) {
      addNotification(errors[0], 'error');
      return;
    }
    if (Object.keys(distributions).length === 0) {
      addNotification('Enable at least one uncertain parameter first.', 'info');
      return;
    }
    if (!displacementSpec.spec) {
      addNotification(displacementSpec.error || 'Fix the Displacement tab inputs first.', 'error');
      return;
    }
    const pattern = buildPatternInputs(patternInputs);
    if (!pattern) {
      addNotification('Fix the Pattern tab inputs first. Geometry, FVFs and injection rate must all be positive.', 'error');
      return;
    }
    setIsRunningUncertainty(true);
    setUncertaintyProgress(0);
    try {
      const result = await runWaterfloodUncertaintyAsync(
        { displacementSpec: displacementSpec.spec, pattern, distributions, iterations, seed },
        setUncertaintyProgress,
      );
      const ranAt = new Date().toISOString();
      const seedFrom = seed == null ? 'drawn' : 'entered';
      setUncertaintyResult({ ...result, ranAt, seedFrom });
      // WF-U1: the summary of the canonical module's run is kept with the
      // project (the realizations are not), stamped with what it was run on
      setMcSummary(mcSummaryRecord({ ...result, seedFrom }, { ranAt, fingerprint: mcInputsFingerprint({ displacementInputs, patternInputs, uncertaintyConfig }) }));
      hasUncertaintyResult.current = true;
      setUncertaintyStale(false);
      if (result.validCount > 0) {
        addNotification(`Uncertainty run complete: ${result.validCount.toLocaleString()} valid realizations.`, 'success');
      } else {
        addNotification('Uncertainty run produced no valid realizations. Check the distribution ranges.', 'error');
      }
    } catch (e) {
      console.error(e);
      addNotification(e.message || 'Uncertainty run failed', 'error');
    } finally {
      setIsRunningUncertainty(false);
    }
  }, [isRunningUncertainty, uncertaintyConfig, displacementSpec, patternInputs, displacementInputs, addNotification]);

  // Any working-case or config edit makes an existing MC result stale (it
  // was computed from the old inputs). The result stays visible with a
  // banner instead of being discarded on every keystroke.
  useEffect(() => {
    if (hasUncertaintyResult.current) setUncertaintyStale(true);
  }, [displacementInputs, patternInputs, uncertaintyConfig]);

  // ---- Project persistence ----
  const serializeInputs = useCallback(() => ({
    id: currentProjectId,
    name: projectName,
    displacementInputs,
    layers,
    layeredConfig,
    patternInputs,
    scenarios,
    uncertaintyConfig,
    surveillance: { rows: surveillanceRows, config: surveillanceConfig, import: surveillanceImport },
    payloadVersion: WF_PAYLOAD_VERSION,
    identification,
    inputMeta: serializeProvenance(inputMeta),
    unitSystem,
    pvtIntake,
    mcSummary,
    floodStart,
    hallWindows,
    modified: new Date().toISOString(),
  }), [hallWindows, currentProjectId, projectName, displacementInputs, layers, layeredConfig, patternInputs, scenarios, uncertaintyConfig, surveillanceRows, surveillanceConfig, surveillanceImport, identification, inputMeta, unitSystem, pvtIntake, mcSummary, floodStart]);

  const hydrate = useCallback((raw) => {
    const payload = migrateWaterfloodPayload(raw);
    setMigratedFrom(payload?.migratedFrom ?? null);
    setIdentification({ ...DEFAULT_IDENTIFICATION, ...(payload?.identification || {}) });
    setInputMeta(deserializeProvenance(payload?.inputMeta));
    setUnitSystemSaved(payload?.unitSystem === 'si' || payload?.unitSystem === 'oilfield' ? payload.unitSystem : null);
    setPvtIntake(payload?.pvtIntake || null);
    setSurveillanceImport(payload?.surveillance?.import || null);
    setMcSummary(payload?.mcSummary || null);
    setFloodStart(typeof payload?.floodStart === 'string' ? payload.floodStart : '');
    setHallWindows(payload?.hallWindows && typeof payload.hallWindows === 'object' ? payload.hallWindows : {});
    setDisplacementInputs({ ...DEFAULT_DISPLACEMENT, ...(payload?.displacementInputs || {}) });
    setLayers(Array.isArray(payload?.layers) && payload.layers.length ? payload.layers : DEFAULT_LAYERS);
    setLayeredConfig({ ...DEFAULT_LAYERED_CONFIG, ...(payload?.layeredConfig || {}) });
    setPatternInputs({ ...DEFAULT_PATTERN, ...(payload?.patternInputs || {}) });
    setScenarios(Array.isArray(payload?.scenarios) ? payload.scenarios : []);
    setUncertaintyConfig({
      ...DEFAULT_UNCERTAINTY,
      ...(payload?.uncertaintyConfig || {}),
      params: payload?.uncertaintyConfig?.params || {},
    });
    setSurveillanceRows(Array.isArray(payload?.surveillance?.rows) ? payload.surveillance.rows : []);
    setSurveillanceConfig({ ...DEFAULT_SURVEILLANCE_CONFIG, ...(payload?.surveillance?.config || {}) });
    // MC results belong to the previous working case.
    setUncertaintyResult(null);
    hasUncertaintyResult.current = false;
    setUncertaintyStale(false);
  }, []);

  // shared.refreshList lists my projects and, with a store, those shared
  // with me (split below by owner)
  const refreshProjects = useCallback(async () => {
    const list = await shared.refreshList();
    setProjects(list);
    return list;
  }, [shared.refreshList]); // eslint-disable-line react-hooks/exhaustive-deps
  const myId = shared.sharing.userId;
  const ownProjects = useMemo(() => projects.filter((p) => !sharingStore || !myId || !p.userId || p.userId === myId), [projects, sharingStore, myId]);
  const sharedProjects = useMemo(() => (sharingStore && myId ? projects.filter((p) => p.userId && p.userId !== myId) : []), [projects, sharingStore, myId]);

  useEffect(() => {
    (async () => {
      try {
        await refreshProjects();
      } catch (e) {
        console.error(e);
        addNotification('Could not load saved projects', 'error');
      }
    })();
  }, [addNotification]); // eslint-disable-line react-hooks/exhaustive-deps

  const openProject = useCallback(async (id) => {
    try {
      const payload = await shared.loadForOpen(id);
      if (!payload) {
        addNotification('Project not found', 'error');
        return;
      }
      setCurrentProjectId(id);
      setProjectName(payload.name || 'Untitled project');
      hydrate(payload);
      setHydrated(true);
      setSaveError(null);
    } catch (e) {
      console.error(e);
      addNotification('Could not open project', 'error');
    }
  }, [addNotification, hydrate, shared.loadForOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const createProject = useCallback(async (name) => {
    const id = uuidv4();
    try {
      await service.save(id, { ...serializeInputs(), id, name });
      await shared.adoptRow(id);
      setCurrentProjectId(id);
      setProjectName(name);
      setHydrated(true);
      setLastSaveTime(new Date());
      await refreshProjects();
      addNotification(`Project "${name}" created`, 'success');
    } catch (e) {
      console.error(e);
      addNotification(e.message || 'Could not create project', 'error');
    }
  }, [serializeInputs, addNotification, refreshProjects]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteProject = useCallback(async (id) => {
    try {
      await service.remove(id);
      if (id === currentProjectId) {
        setCurrentProjectId(null);
        setProjectName('');
        setHydrated(false);
        shared.close();
      }
      await refreshProjects();
      addNotification('Project deleted', 'info');
    } catch (e) {
      console.error(e);
      addNotification('Could not delete project', 'error');
    }
  }, [currentProjectId, addNotification, refreshProjects]); // eslint-disable-line react-hooks/exhaustive-deps

  const manualSave = useCallback(async () => {
    if (!currentProjectId) {
      addNotification('Create or open a project first', 'info');
      return;
    }
    setIsSaving(true);
    try {
      const res = await shared.write(currentProjectId, serializeInputs());
      if (!res.ok) {
        setSaveError(res.readOnly ? 'Read-only' : 'Save failed');
        addNotification(res.message, res.readOnly ? 'info' : 'error');
        return;
      }
      setLastSaveTime(new Date());
      setSaveError(null);
    } catch (e) {
      console.error(e);
      setSaveError('Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [currentProjectId, serializeInputs, addNotification, shared.write]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Save a copy": the project on screen as my own new project
  const saveCopy = useCallback(async () => {
    const name = shared.copyNameFor(projectName || 'Waterflood project');
    const id = uuidv4();
    try {
      await service.save(id, { ...serializeInputs(), id, name });
      await refreshProjects();
      await openProject(id);
      addNotification(`Saved a copy as "${name}"`, 'success');
    } catch (e) {
      addNotification(`Could not save a copy: ${e.message}`, 'error');
    }
  }, [projectName, serializeInputs, refreshProjects, openProject, addNotification]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced autosave (10 s after the last change), only once a project is
  // open and never while it is open read-only.
  const autosaveRef = useRef(serializeInputs);
  autosaveRef.current = serializeInputs;
  const writeRef = useRef(shared.write);
  writeRef.current = shared.write;
  useEffect(() => {
    if (!currentProjectId || !hydrated || !canWrite) return undefined;
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        const res = await writeRef.current(currentProjectId, autosaveRef.current());
        if (res.ok) {
          setLastSaveTime(new Date());
          setSaveError(null);
        } else if (!res.readOnly) {
          setSaveError('Auto-save failed');
        }
      } catch (e) {
        console.error(e);
        setSaveError('Auto-save failed');
      } finally {
        setIsSaving(false);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [displacementInputs, layers, layeredConfig, patternInputs, scenarios, uncertaintyConfig, surveillanceRows, surveillanceConfig, surveillanceImport, identification, inputMeta, unitSystemSaved, pvtIntake, mcSummary, floodStart, hallWindows, currentProjectId, hydrated, canWrite]);

  // ---- Scenarios: named snapshots of all input groups ----
  const saveScenario = useCallback((name) => {
    const snap = {
      id: uuidv4(),
      name,
      createdAt: new Date().toISOString(),
      displacementInputs,
      layers,
      layeredConfig,
      patternInputs,
    };
    setScenarios((prev) => [...prev, snap]);
    addNotification(`Scenario "${name}" saved`, 'success');
  }, [displacementInputs, layers, layeredConfig, patternInputs, addNotification]);

  const deleteScenario = useCallback((id) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const applyScenario = useCallback((id) => {
    const s = scenarios.find((x) => x.id === id);
    if (!s) return;
    setDisplacementInputs({ ...DEFAULT_DISPLACEMENT, ...s.displacementInputs });
    setLayers(s.layers?.length ? s.layers : DEFAULT_LAYERS);
    setLayeredConfig({ ...DEFAULT_LAYERED_CONFIG, ...s.layeredConfig });
    setPatternInputs({ ...DEFAULT_PATTERN, ...s.patternInputs });
    addNotification(`Scenario "${s.name}" applied to the working case`, 'info');
  }, [scenarios, addNotification]);

  const value = {
    // shell plumbing
    notifications, addNotification, removeNotification,
    // projects
    projects: ownProjects, sharedProjects, currentProjectId, projectName,
    createProject, openProject, deleteProject, manualSave, saveCopy,
    projectRow: shared.projectRow, sharing: shared.sharing, viewingShared: shared.viewingShared, canWrite,
    build,
    // WF-U1: report header, sources, units, intakes, MC summary
    identification, setIdentificationField,
    inputMeta, setInputSource,
    unitSystem, setUnitSystem, u, profileSystem, followsProfile: unitSystemSaved == null && !!profileSystem,
    pvtIntake, setPvtIntake, takePvt,
    surveillanceImport, setSurveillanceImport,
    mcSummary, migratedFrom, serializeInputs, setPatternInputs, setSurveillanceConfig,
    floodStart, setFloodStart,
    hallWindows, setHallWindow,
    isSaving, saveError, lastSaveTime,
    // inputs
    displacementInputs, setDisplacementField, setDisplacementInputs,
    layers, setLayers,
    layeredConfig, setLayeredField,
    patternInputs, setPatternField,
    // derived
    displacementSpec, displacement, layeredResult, patternResult,
    // surveillance
    surveillanceRows, setSurveillanceRows,
    surveillanceConfig, setSurveillanceField,
    surveillanceResult,
    // uncertainty
    uncertaintyConfig, setUncertaintyIterations, setUncertaintyParam, setUncertaintySeed,
    uncertaintyResult, isRunningUncertainty, uncertaintyProgress, uncertaintyStale,
    runUncertainty,
    // scenarios
    scenarios, saveScenario, deleteScenario, applyScenario,
  };

  return <WaterfloodDesignContext.Provider value={value}>{children}</WaterfloodDesignContext.Provider>;
};
