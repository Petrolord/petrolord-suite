/**
 * Nodal Analysis Studio context (NA4).
 *
 * Same doctrine as WaterfloodDesignContext / WellTestStudioContext:
 *  - inputs are string-valued form state seeded from exported DEFAULT_*
 *    groups, persisted whole via createSavedProjectsService (inputs only,
 *    results recomputed on load);
 *  - engine state is oilfield units always; the unit system is a display
 *    concern (src/utils/nodal/units.js);
 *  - cheap derivations (fluid model, trajectory, IPR, single traverse,
 *    system solve) are useMemo; the multi-solve sweeps (sensitivity, gas
 *    lift) run behind explicit actions with a stale flag.
 *
 * Engines: src/utils/nodal/* (validated NA1-NA3; see
 * tools/validation/nodal/README.md for the gate map).
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { UNIT_SYSTEMS } from '@/utils/nodal/units';
import { buildFluidModel } from '@/utils/nodal/pvt';
import { buildTrajectory } from '@/utils/nodal/trajectory';
import { linearGeothermal } from '@/utils/nodal/temperature';
import { computeIpr } from '@/utils/nodal/ipr';
import { darcyGasIpr, backPressureIpr, litIpr } from '@/utils/nodal/iprGas';
import { computeTraverse } from '@/utils/nodal/traverse';
import { CORRELATIONS } from '@/utils/nodal/correlations/index';
import { solveOperatingPoint, solveGasOperatingPoint, operatingPointSweep } from '@/utils/nodal/system';
import { gasLiftScreening } from '@/utils/nodal/gasLift';
import { chokeWhp, chokeSize, gasChokeRate, gasChokeUpstream, CHOKE_COEFFS } from '@/utils/nodal/chokes';
import { linspace } from '@/utils/nodal/numerics';

const service = createSavedProjectsService('saved_nodal_analysis_projects', {
  signInMessage: 'Sign in to save nodal analysis projects.',
});

// ---------------------------------------------------------------------------
// defaults (string form state, oilfield units)

export const DEFAULT_FLUID = {
  api: '35',
  gasSg: '0.75',
  gor: '600',
  salinityPpm: '30000',
};

export const DEFAULT_INFLOW = {
  wellType: 'oil', // 'oil' | 'gas'
  model: 'composite', // pi | vogel | composite | fetkovich | jones
  pr: '3200',
  pb: '2400',
  calMode: 'pi', // 'pi' | 'test' (oil pi/composite); vogel: 'qmax' | 'test'
  pi: '1.2',
  qmax: '1000',
  testQ: '',
  testPwf: '',
  c: '0.00002',
  n: '0.85',
  a: '0.5',
  b: '0.0002',
  gasModel: 'backPressure', // backPressure | lit | darcy
  gasC: '0.01',
  gasN: '0.9',
  gasA: '0.05',
  gasB: '0.000005',
  k: '5',
  h: '50',
  re: '1490',
  rw: '0.354',
  skin: '0',
  resTempF: '190',
};

export const DEFAULT_WELL = {
  mode: 'vertical', // 'vertical' | 'deviated'
  depthFt: '8000',
  surveyText: '0, 0, 0\n2000, 0, 0\n3000, 30, 45\n8900, 30, 45',
  whtF: '100',
  bhtF: '180',
};

export const DEFAULT_COMPLETION = {
  idIn: '2.441',
  roughnessIn: '0.0006',
  whp: '250',
  correlation: 'beggsBrill',
  wctPct: '20',
  prodGor: '600',
  stepFt: '100',
  outflow: 'cullenderSmith', // gas wells: 'cullenderSmith' | 'gray'
  wgr: '5',
  cgr: '20',
};

export const DEFAULT_TRAVERSE_VIEW = { rate: '800' };

export const DEFAULT_SENSITIVITY = {
  parameter: 'whp', // whp | idIn | wctPct | prodGor | pr
  valuesText: '150, 250, 400',
};

export const DEFAULT_GASLIFT = {
  maxQgi: '1600',
  nPoints: '9',
  econSlope: '0.05',
};

export const DEFAULT_CHOKE = {
  mode: 'liquid', // 'liquid' | 'gas'
  q: '400',
  glr: '800',
  s64: '12',
  correlation: 'gilbert',
  pDownstream: '150',
  pUp: '800',
  pDn: '200',
  dIn: '0.5',
  k: '1.3',
  cd: '0.85',
  tUpF: '110',
};

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

// ---------------------------------------------------------------------------
// pure builders (exported for tests)

export const buildFluid = (fluid) => {
  const api = num(fluid.api);
  const gasSg = num(fluid.gasSg);
  const gor = num(fluid.gor);
  const salinityPpm = num(fluid.salinityPpm);
  if (!(api > 5) || !(gasSg > 0.5) || !(gor >= 0) || !(salinityPpm >= 0)) {
    return { model: null, error: 'Fluid needs API above 5, gas gravity above 0.55 and non-negative GOR and salinity.' };
  }
  return { model: buildFluidModel({ api, gasSg, gor, salinityPpm }), error: null };
};

export const parseSurvey = (surveyText) => {
  const rows = String(surveyText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/[,\s]+/).map(parseFloat));
  const survey = rows
    .filter((r) => r.length >= 2 && r.every((x, i) => (i < 2 ? Number.isFinite(x) : true)))
    .map((r) => ({ md: r[0], inc: r[1], azi: Number.isFinite(r[2]) ? r[2] : 0 }));
  return survey;
};

export const buildWell = (well) => {
  const whtF = num(well.whtF);
  const bhtF = num(well.bhtF);
  if (!Number.isFinite(whtF) || !Number.isFinite(bhtF)) {
    return { trajectory: null, error: 'Wellhead and bottomhole temperatures are required.' };
  }
  let trajectory;
  if (well.mode === 'deviated') {
    const survey = parseSurvey(well.surveyText);
    if (survey.length < 2) {
      return { trajectory: null, error: 'A deviated survey needs at least two md, inc, azi rows.' };
    }
    trajectory = buildTrajectory({ mode: 'deviated', survey });
  } else {
    const depthFt = num(well.depthFt);
    if (!(depthFt > 0)) return { trajectory: null, error: 'Vertical depth must be positive.' };
    trajectory = buildTrajectory({ mode: 'vertical', depthFt });
  }
  const tAt = linearGeothermal({ whtF, bhtF, tvdMaxFt: trajectory.tvdMax });
  return { trajectory, tAt, nodeMd: trajectory.mdMax, whtF, bhtF, error: null };
};

export const buildInflow = (inflow) => {
  const pr = num(inflow.pr);
  if (!(pr > 0)) return { ipr: null, gasIpr: null, error: 'Reservoir pressure must be positive.' };

  if (inflow.wellType === 'gas') {
    if (inflow.gasModel === 'darcy') {
      const res = darcyGasIpr({
        pr,
        tempF: num(inflow.resTempF),
        gasGravity: num(inflow.gasSg) || undefined,
        k: num(inflow.k),
        h: num(inflow.h),
        re: num(inflow.re),
        rw: num(inflow.rw),
        skin: num(inflow.skin),
        nPoints: 60,
      });
      return { ipr: null, gasIpr: res, error: res.curve.length ? null : res.warnings[0] || 'Darcy gas IPR inputs are incomplete.' };
    }
    if (inflow.gasModel === 'lit') {
      const res = litIpr({ pr, a: num(inflow.gasA), b: num(inflow.gasB), nPoints: 60 });
      return { ipr: null, gasIpr: res, error: res.curve.length ? null : 'LIT IPR needs positive coefficients.' };
    }
    const res = backPressureIpr({ pr, c: num(inflow.gasC), n: num(inflow.gasN), nPoints: 60 });
    return { ipr: null, gasIpr: res, error: res.curve.length ? null : 'Back-pressure IPR needs positive pr and C.' };
  }

  const base = { model: inflow.model, pr, pb: num(inflow.pb) };
  const testPoint =
    inflow.calMode === 'test' && num(inflow.testQ) > 0 && Number.isFinite(num(inflow.testPwf))
      ? { q: num(inflow.testQ), pwf: num(inflow.testPwf) }
      : null;
  let ipr;
  switch (inflow.model) {
    case 'pi':
    case 'composite':
      ipr = computeIpr(testPoint ? { ...base, testPoint } : { ...base, pi: num(inflow.pi) });
      break;
    case 'vogel':
      ipr = computeIpr(testPoint ? { ...base, testPoint } : { ...base, qmax: num(inflow.qmax) });
      break;
    case 'fetkovich':
      ipr = computeIpr({ ...base, c: num(inflow.c), n: num(inflow.n), ...(testPoint ? { testPoint } : {}) });
      break;
    case 'jones':
      ipr = computeIpr({ ...base, a: num(inflow.a), b: num(inflow.b), ...(testPoint ? { testPoint } : {}) });
      break;
    default:
      ipr = computeIpr({ ...base, pi: num(inflow.pi) });
  }
  const error = ipr.curve.length ? null : ipr.warnings[0] || 'IPR could not be calibrated from these inputs.';
  return { ipr, gasIpr: null, error };
};

export const buildVlpOpts = ({ completion, wellSpec, fluidModel }) => {
  const idIn = num(completion.idIn);
  const whp = num(completion.whp);
  if (!(idIn > 0) || !(whp > 0)) return { vlp: null, error: 'Tubing ID and wellhead pressure must be positive.' };
  const wct = Math.min(Math.max(num(completion.wctPct) / 100 || 0, 0), 0.99);
  return {
    vlp: {
      fluidModel,
      trajectory: wellSpec.trajectory,
      tAt: wellSpec.tAt,
      idIn,
      roughnessIn: num(completion.roughnessIn) || 0.0006,
      correlation: CORRELATIONS[completion.correlation] ? completion.correlation : 'beggsBrill',
      whp,
      nodeMd: wellSpec.nodeMd,
      stepFt: Math.min(Math.max(num(completion.stepFt) || 100, 25), 500),
      rates: { wct, gor: num(completion.prodGor) || 0 },
    },
    error: null,
  };
};

// ---------------------------------------------------------------------------

const NodalAnalysisStudioContext = createContext(null);

export const useNodalStudio = () => {
  const ctx = useContext(NodalAnalysisStudioContext);
  if (!ctx) throw new Error('useNodalStudio must be used inside NodalAnalysisStudioProvider');
  return ctx;
};

export const NodalAnalysisStudioProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  // projects
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  // inputs
  const [unitSystem, setUnitSystemRaw] = useState('oilfield');
  const [fluid, setFluid] = useState(DEFAULT_FLUID);
  const [inflow, setInflow] = useState(DEFAULT_INFLOW);
  const [well, setWell] = useState(DEFAULT_WELL);
  const [completion, setCompletion] = useState(DEFAULT_COMPLETION);
  const [traverseView, setTraverseView] = useState(DEFAULT_TRAVERSE_VIEW);
  const [sensitivityConfig, setSensitivityConfig] = useState(DEFAULT_SENSITIVITY);
  const [gasLiftConfig, setGasLiftConfig] = useState(DEFAULT_GASLIFT);
  const [choke, setChoke] = useState(DEFAULT_CHOKE);

  const setUnitSystem = useCallback(
    (v) => setUnitSystemRaw(UNIT_SYSTEMS.includes(v) ? v : 'oilfield'),
    []
  );
  const setFluidField = useCallback((k, v) => setFluid((p) => ({ ...p, [k]: v })), []);
  const setInflowField = useCallback((k, v) => setInflow((p) => ({ ...p, [k]: v })), []);
  const setWellField = useCallback((k, v) => setWell((p) => ({ ...p, [k]: v })), []);
  const setCompletionField = useCallback((k, v) => setCompletion((p) => ({ ...p, [k]: v })), []);
  const setTraverseViewField = useCallback((k, v) => setTraverseView((p) => ({ ...p, [k]: v })), []);
  const setSensitivityField = useCallback((k, v) => setSensitivityConfig((p) => ({ ...p, [k]: v })), []);
  const setGasLiftField = useCallback((k, v) => setGasLiftConfig((p) => ({ ...p, [k]: v })), []);
  const setChokeField = useCallback((k, v) => setChoke((p) => ({ ...p, [k]: v })), []);

  // ---------------------------------------------------------------------
  // derived (inputs -> engines, oilfield units throughout)

  const fluidSpec = useMemo(() => buildFluid(fluid), [fluid]);
  const wellSpec = useMemo(() => buildWell(well), [well]);
  const inflowSpec = useMemo(() => buildInflow({ ...inflow, gasSg: fluid.gasSg }), [inflow, fluid.gasSg]);

  const vlpSpec = useMemo(() => {
    if (!fluidSpec.model || wellSpec.error) return { vlp: null, error: fluidSpec.error || wellSpec.error };
    return buildVlpOpts({ completion, wellSpec, fluidModel: fluidSpec.model });
  }, [completion, wellSpec, fluidSpec]);

  const isGasWell = inflow.wellType === 'gas';

  // gas-well outflow bundle (Cullender-Smith inputs or Gray traverse opts)
  const gasOutflow = useMemo(() => {
    if (!isGasWell || wellSpec.error || !vlpSpec.vlp) return null;
    if (completion.outflow === 'gray') {
      return {
        outflow: 'gray',
        vlp: { ...vlpSpec.vlp, rates: { wgr: num(completion.wgr) || 0, cgr: num(completion.cgr) || 0 } },
      };
    }
    return {
      outflow: 'cullenderSmith',
      vlp: {
        ptf: num(completion.whp),
        gasSg: num(fluid.gasSg),
        mdFt: wellSpec.nodeMd,
        tvdFt: wellSpec.trajectory.tvdMax,
        whtF: wellSpec.whtF,
        bhtF: wellSpec.bhtF,
        idIn: num(completion.idIn),
        roughnessIn: num(completion.roughnessIn) || 0.0006,
      },
    };
  }, [isGasWell, completion, wellSpec, vlpSpec, fluid.gasSg]);

  // the nodal system solve
  const system = useMemo(() => {
    if (inflowSpec.error) return { status: 'invalid', error: inflowSpec.error };
    if (isGasWell) {
      if (!gasOutflow) return { status: 'invalid', error: wellSpec.error || vlpSpec.error };
      try {
        return {
          ...solveGasOperatingPoint({ iprResult: inflowSpec.gasIpr, ...gasOutflow, nGrid: 30 }),
          error: null,
        };
      } catch (e) {
        return { status: 'invalid', error: e.message };
      }
    }
    if (!vlpSpec.vlp) return { status: 'invalid', error: vlpSpec.error || wellSpec.error || fluidSpec.error };
    try {
      return { ...solveOperatingPoint({ ipr: inflowSpec.ipr, vlp: vlpSpec.vlp, nGrid: 25 }), error: null };
    } catch (e) {
      return { status: 'invalid', error: e.message };
    }
  }, [inflowSpec, vlpSpec, gasOutflow, isGasWell, wellSpec, fluidSpec]);

  // traverse profile at the viewed rate (oil wells)
  const traverseProfile = useMemo(() => {
    if (isGasWell || !vlpSpec.vlp) return null;
    const q = num(traverseView.rate);
    if (!(q > 0)) return null;
    return computeTraverse({
      ...vlpSpec.vlp,
      rates: { ...vlpSpec.vlp.rates, qo: q },
      pStart: vlpSpec.vlp.whp,
      mdStart: 0,
      mdEnd: vlpSpec.vlp.nodeMd,
    });
  }, [isGasWell, vlpSpec, traverseView]);

  // sensitivity sweep (explicit run; stale on input edits)
  const [sensitivity, setSensitivity] = useState(null);
  const [sensitivityStale, setSensitivityStale] = useState(false);
  const runSensitivity = useCallback(() => {
    if (isGasWell) {
      addNotification('Sensitivity sweeps run on oil wells in this version.', 'info');
      return;
    }
    if (!vlpSpec.vlp || inflowSpec.error) {
      addNotification('Complete the fluid, well, inflow and completion inputs first.', 'error');
      return;
    }
    const values = String(sensitivityConfig.valuesText)
      .split(/[,\s]+/)
      .map(parseFloat)
      .filter(Number.isFinite);
    if (values.length === 0) {
      addNotification('Enter at least one sweep value.', 'error');
      return;
    }
    const param = sensitivityConfig.parameter;
    const cases = values.map((value) => {
      let ipr = inflowSpec.ipr;
      let vlp = vlpSpec.vlp;
      if (param === 'whp') vlp = { ...vlp, whp: value };
      if (param === 'idIn') vlp = { ...vlp, idIn: value };
      if (param === 'wctPct') vlp = { ...vlp, rates: { ...vlp.rates, wct: Math.min(Math.max(value / 100, 0), 0.99) } };
      if (param === 'prodGor') vlp = { ...vlp, rates: { ...vlp.rates, gor: value } };
      if (param === 'pr') {
        ipr = buildInflow({ ...inflow, pr: String(value), gasSg: fluid.gasSg }).ipr;
      }
      return { label: `${param} ${value}`, value, ipr, vlp, nGrid: 25 };
    });
    const results = operatingPointSweep(cases.filter((c) => c.ipr));
    setSensitivity({ parameter: param, results });
    setSensitivityStale(false);
  }, [isGasWell, vlpSpec, inflowSpec, sensitivityConfig, inflow, fluid.gasSg, addNotification]);
  useEffect(() => {
    setSensitivityStale(true);
  }, [fluid, inflow, well, completion]);

  // gas-lift screening (explicit run; stale on input edits)
  const [gasLift, setGasLift] = useState(null);
  const [gasLiftStale, setGasLiftStale] = useState(false);
  const [isScreening, setIsScreening] = useState(false);
  const runGasLift = useCallback(() => {
    if (isGasWell) {
      addNotification('Gas lift screening applies to oil wells.', 'info');
      return;
    }
    if (!vlpSpec.vlp || inflowSpec.error) {
      addNotification('Complete the fluid, well, inflow and completion inputs first.', 'error');
      return;
    }
    const maxQgi = num(gasLiftConfig.maxQgi);
    const nPts = Math.min(Math.max(Math.round(num(gasLiftConfig.nPoints) || 9), 3), 21);
    if (!(maxQgi > 0)) {
      addNotification('Maximum injection rate must be positive.', 'error');
      return;
    }
    setIsScreening(true);
    // let the overlay paint before the solve loop occupies the main thread
    setTimeout(() => {
      try {
        const result = gasLiftScreening({
          ipr: inflowSpec.ipr,
          vlp: vlpSpec.vlp,
          qgis: linspace(0, maxQgi, nPts),
          econSlope: num(gasLiftConfig.econSlope) || 0.05,
          nGrid: 25,
        });
        setGasLift(result);
        setGasLiftStale(false);
      } finally {
        setIsScreening(false);
      }
    }, 30);
  }, [isGasWell, vlpSpec, inflowSpec, gasLiftConfig, addNotification]);
  useEffect(() => {
    setGasLiftStale(true);
  }, [fluid, inflow, well, completion]);

  // choke calculators (closed forms, instant)
  const chokeResult = useMemo(() => {
    if (choke.mode === 'gas') {
      const inputs = {
        pUp: num(choke.pUp),
        pDn: num(choke.pDn),
        dIn: num(choke.dIn),
        gasSg: num(fluid.gasSg),
        tUpF: num(choke.tUpF),
        k: num(choke.k) || 1.28,
        cd: num(choke.cd) || 0.85,
      };
      if (!(inputs.pUp > 0) || !(inputs.pDn >= 0) || !(inputs.dIn > 0) || !(inputs.gasSg > 0) || !Number.isFinite(inputs.tUpF)) {
        return { error: 'Gas choke needs upstream and downstream pressures, bean diameter and temperature.' };
      }
      return { gas: gasChokeRate(inputs), error: null };
    }
    const q = num(choke.q);
    const glr = num(choke.glr);
    const s64 = num(choke.s64);
    if (!(q > 0) || !(glr > 0) || !(s64 > 0)) {
      return { error: 'Liquid choke needs rate, GLR and bean size.' };
    }
    const correlation = CHOKE_COEFFS[choke.correlation] ? choke.correlation : 'gilbert';
    const whpRes = chokeWhp({ q, glr, s64, correlation, pDownstream: num(choke.pDownstream) || 0 });
    return {
      liquid: {
        ...whpRes,
        rateAtCurrentWhp: null,
        size: chokeSize({ pwh: whpRes.pwh, q, glr, correlation }),
        allCorrelations: Object.keys(CHOKE_COEFFS).map((id) => ({
          id,
          pwh: chokeWhp({ q, glr, s64, correlation: id }).pwh,
        })),
      },
      error: null,
    };
  }, [choke, fluid.gasSg]);

  // gas choke upstream helper for the panel's inverse mode
  const solveGasChokeUpstream = useCallback(
    (qMscfd) =>
      gasChokeUpstream({
        qMscfd,
        pDn: num(choke.pDn),
        dIn: num(choke.dIn),
        gasSg: num(fluid.gasSg),
        tUpF: num(choke.tUpF),
        k: num(choke.k) || 1.28,
        cd: num(choke.cd) || 0.85,
      }),
    [choke, fluid.gasSg]
  );

  // ---------------------------------------------------------------------
  // persistence (inputs only)

  const serializeInputs = useCallback(
    () => ({
      id: currentProjectId || uuidv4(),
      name: projectName || 'Untitled nodal project',
      unitSystem,
      fluid,
      inflow,
      well,
      completion,
      traverseView,
      sensitivityConfig,
      gasLiftConfig,
      choke,
      modified: new Date().toISOString(),
    }),
    [currentProjectId, projectName, unitSystem, fluid, inflow, well, completion, traverseView, sensitivityConfig, gasLiftConfig, choke]
  );
  const autosaveRef = useRef(serializeInputs);
  useEffect(() => {
    autosaveRef.current = serializeInputs;
  }, [serializeInputs]);

  const hydrate = useCallback((payload) => {
    setUnitSystemRaw(UNIT_SYSTEMS.includes(payload?.unitSystem) ? payload.unitSystem : 'oilfield');
    setFluid({ ...DEFAULT_FLUID, ...(payload?.fluid || {}) });
    setInflow({ ...DEFAULT_INFLOW, ...(payload?.inflow || {}) });
    setWell({ ...DEFAULT_WELL, ...(payload?.well || {}) });
    setCompletion({ ...DEFAULT_COMPLETION, ...(payload?.completion || {}) });
    setTraverseView({ ...DEFAULT_TRAVERSE_VIEW, ...(payload?.traverseView || {}) });
    setSensitivityConfig({ ...DEFAULT_SENSITIVITY, ...(payload?.sensitivityConfig || {}) });
    setGasLiftConfig({ ...DEFAULT_GASLIFT, ...(payload?.gasLiftConfig || {}) });
    setChoke({ ...DEFAULT_CHOKE, ...(payload?.choke || {}) });
    setSensitivity(null);
    setGasLift(null);
    setHydrated(true);
  }, []);

  useEffect(() => {
    let mounted = true;
    service
      .list()
      .then((rows) => mounted && setProjects(rows))
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const openProject = useCallback(
    async (id) => {
      try {
        const payload = await service.load(id);
        if (!payload) {
          addNotification('Project could not be loaded.', 'error');
          return;
        }
        setCurrentProjectId(id);
        setProjectName(payload.name || 'Untitled nodal project');
        hydrate(payload);
      } catch (e) {
        addNotification(e.message || 'Project could not be loaded.', 'error');
      }
    },
    [hydrate, addNotification]
  );

  const createProject = useCallback(
    async (name) => {
      const id = uuidv4();
      const payload = { ...autosaveRef.current(), id, name };
      try {
        await service.save(id, payload);
        setCurrentProjectId(id);
        setProjectName(name);
        setHydrated(true);
        setProjects(await service.list());
        addNotification(`Project "${name}" created.`, 'success');
      } catch (e) {
        addNotification(e.message || 'Project could not be created.', 'error');
      }
    },
    [addNotification]
  );

  const deleteProject = useCallback(
    async (id) => {
      try {
        await service.remove(id);
        if (id === currentProjectId) {
          setCurrentProjectId(null);
          setProjectName('');
          setHydrated(false);
        }
        setProjects(await service.list());
        addNotification('Project deleted.', 'info');
      } catch (e) {
        addNotification(e.message || 'Project could not be deleted.', 'error');
      }
    },
    [currentProjectId, addNotification]
  );

  const manualSave = useCallback(async () => {
    if (!currentProjectId) {
      addNotification('Create or open a project first.', 'info');
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      await service.save(currentProjectId, autosaveRef.current());
      setLastSaveTime(new Date());
      setProjects(await service.list());
    } catch (e) {
      setSaveError(e.message || 'Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [currentProjectId, addNotification]);

  // debounced autosave
  useEffect(() => {
    if (!currentProjectId || !hydrated) return undefined;
    const timer = setTimeout(async () => {
      setIsSaving(true);
      setSaveError(null);
      try {
        await service.save(currentProjectId, autosaveRef.current());
        setLastSaveTime(new Date());
      } catch (e) {
        setSaveError(e.message || 'Autosave failed');
      } finally {
        setIsSaving(false);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [currentProjectId, hydrated, unitSystem, fluid, inflow, well, completion, traverseView, sensitivityConfig, gasLiftConfig, choke]);

  const value = {
    // shell plumbing
    notifications,
    addNotification,
    removeNotification,
    // projects
    projects,
    currentProjectId,
    projectName,
    isSaving,
    saveError,
    lastSaveTime,
    openProject,
    createProject,
    deleteProject,
    manualSave,
    // units
    unitSystem,
    setUnitSystem,
    // inputs
    fluid,
    setFluidField,
    inflow,
    setInflowField,
    well,
    setWellField,
    completion,
    setCompletionField,
    traverseView,
    setTraverseViewField,
    sensitivityConfig,
    setSensitivityField,
    gasLiftConfig,
    setGasLiftField,
    choke,
    setChokeField,
    // derived
    isGasWell,
    fluidSpec,
    wellSpec,
    inflowSpec,
    vlpSpec,
    system,
    traverseProfile,
    // sweeps
    sensitivity,
    sensitivityStale,
    runSensitivity,
    gasLift,
    gasLiftStale,
    isScreening,
    runGasLift,
    // chokes
    chokeResult,
    solveGasChokeUpstream,
  };

  return (
    <NodalAnalysisStudioContext.Provider value={value}>
      {children}
    </NodalAnalysisStudioContext.Provider>
  );
};
