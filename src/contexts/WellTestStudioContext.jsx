// Well Test Analysis Studio state. Modeled on WaterfloodDesignContext: all
// analysis results are useMemo-derived from persisted inputs (the
// saved_<app>_projects convention: results are never stored), projects
// persist through the shared savedProjects service, notifications come from
// the Studio shell hook. The auto-fit is the one on-demand computation
// (regression, so it runs on click and its result is transient).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { getModel, evaluateModelTest, evaluateBuildup, toDimensionlessGroups } from '@/utils/welltest/models/modelCatalog';
import { bourdetDerivative, logDecimate, trimSpikes, detectFlowRegimes } from '@/utils/welltest/derivative';
import { agarwalEquivalentTime, rateStepsFromHistory, detectFlowPeriods, equivalentProducingTime } from '@/utils/welltest/superposition';
import { mdhAnalysis, hornerAnalysis, cartesianPssAnalysis, sqrtTimeAnalysis, radiusOfInvestigation, skinPressureDrop, flowEfficiency } from '@/utils/welltest/analysis';
import { autoFitModel } from '@/utils/welltest/autoFit';

const WellTestStudioContext = createContext(null);

export const useWellTestStudio = () => {
  const ctx = useContext(WellTestStudioContext);
  if (!ctx) throw new Error('useWellTestStudio must be used within WellTestStudioProvider');
  return ctx;
};

const service = createSavedProjectsService('saved_well_test_projects', {
  signInMessage: 'Sign in to save well test projects.',
});

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

// Defaults track the WT1 oracle fixture so the sample test and a fresh
// project agree with the validation suite.
export const DEFAULT_RESERVOIR = {
  h: '45', phi: '0.18', rw: '0.354', B: '1.25', mu: '0.9', ct: '0.000012',
  q: '450', pi: '4800',
};

export const DEFAULT_TEST_CONFIG = {
  testType: 'buildup', // 'drawdown' | 'buildup'
  tp: '36',
  pwfShutIn: '', // empty: taken from the earliest gauge point
  smoothingL: '0.1',
  pointsPerDecade: '15',
  spikeTrimOn: true,
  spikeThreshold: '6',
};

export const DEFAULT_MATCH = { modelId: 'homogeneous', k: '50', skin: '0', C: '0.01' };

// Analysis windows as time bounds in hours; empty strings mean full range.
export const DEFAULT_WINDOWS = {
  semilogMin: '', semilogMax: '',
  pssMin: '', pssMax: '',
  sqrtMin: '', sqrtMax: '',
};

/** Numeric reservoir/fluid inputs from form state; error string when invalid. */
export function buildReservoirInputs(r) {
  const out = {
    h: num(r.h), phi: num(r.phi), rw: num(r.rw), B: num(r.B),
    mu: num(r.mu), ct: num(r.ct), q: num(r.q), pi: num(r.pi),
  };
  const positives = ['h', 'phi', 'rw', 'B', 'mu', 'ct', 'q'];
  if (!positives.every((k) => out[k] > 0)) {
    return { reservoir: null, error: 'Thickness, porosity, wellbore radius, FVF, viscosity, compressibility and rate must all be positive.' };
  }
  if (!(out.phi < 1)) return { reservoir: null, error: 'Porosity is a fraction and must be below 1.' };
  if (!Number.isFinite(out.pi)) return { reservoir: null, error: 'Initial pressure is required (psia).' };
  return { reservoir: out, error: null };
}

/** Numeric test configuration; error string when invalid. */
export function buildTestConfig(t) {
  const out = {
    testType: t.testType === 'drawdown' ? 'drawdown' : 'buildup',
    tp: num(t.tp),
    pwfShutIn: num(t.pwfShutIn), // may be NaN: auto from data
    smoothingL: Math.min(Math.max(num(t.smoothingL) || 0.1, 0), 0.5),
    pointsPerDecade: Math.max(Math.round(num(t.pointsPerDecade) || 15), 4),
    spikeTrimOn: !!t.spikeTrimOn,
    spikeThreshold: Math.max(num(t.spikeThreshold) || 6, 2),
  };
  if (out.testType === 'buildup' && !(out.tp > 0)) {
    return { config: null, error: 'Buildup analysis needs a positive producing time tp (hours).' };
  }
  return { config: out, error: null };
}

/**
 * Turn raw gauge rows into the analysis series. Time is elapsed hours in the
 * analysis period (shut-in time for a buildup); pressure is the gauge psi.
 * dp is the log-log plot ordinate: pi - pwf for a drawdown, pws - pwf(shut-in)
 * for a buildup.
 */
export function prepareTestData({ gaugeRows, reservoir, config }) {
  const rows = (gaugeRows || [])
    .map((r) => ({ t: num(r.t), p: num(r.p) }))
    .filter((r) => r.t > 0 && Number.isFinite(r.p))
    .sort((a, b) => a.t - b.t);
  if (rows.length < 5 || !reservoir || !config) {
    return { points: [], pwfShutIn: NaN, removedSpikes: 0, warnings: rows.length ? ['At least 5 gauge points are needed.'] : [] };
  }

  let series = rows;
  let removedSpikes = 0;
  if (config.spikeTrimOn) {
    const { kept, removed } = trimSpikes(rows, { threshold: config.spikeThreshold, yKey: 'p' });
    series = kept;
    removedSpikes = removed.length;
  }

  const decimated = logDecimate(series, { pointsPerDecade: config.pointsPerDecade, xKey: 't' });

  const warnings = [];
  let pwfShutIn = NaN;
  let points;
  if (config.testType === 'buildup') {
    pwfShutIn = Number.isFinite(config.pwfShutIn) ? config.pwfShutIn : series[0].p;
    points = decimated
      .map((r) => ({ time: r.t, p: r.p, dp: r.p - pwfShutIn }))
      .filter((r) => r.dp > 0 || r.time === decimated[0].t);
    if (!Number.isFinite(config.pwfShutIn)) {
      warnings.push(`Flowing pressure at shut-in taken from the earliest gauge point (${series[0].p.toFixed(1)} psi). Enter it explicitly if the gauge missed the flowing period.`);
    }
  } else {
    points = decimated.map((r) => ({ time: r.t, p: r.p, dp: reservoir.pi - r.p })).filter((r) => r.dp > 0);
    if (points.length < decimated.length) {
      warnings.push('Gauge pressures above initial pressure were dropped from the drawdown series.');
    }
  }
  if (removedSpikes > 0) warnings.push(`${removedSpikes} outlier point${removedSpikes > 1 ? 's' : ''} removed by the spike filter.`);
  return { points, pwfShutIn, removedSpikes, warnings };
}

/**
 * Log-log diagnostic series: dp and Bourdet derivative against elapsed time
 * (drawdown) or Agarwal equivalent time (buildup).
 */
export function buildLoglog({ points, config }) {
  if (!points?.length || !config) return [];
  const abscissa = (t) =>
    config.testType === 'buildup' ? agarwalEquivalentTime(config.tp, t) : t;
  const series = points
    .map((p) => ({ x: abscissa(p.time), y: p.dp, time: p.time }))
    .filter((p) => p.x > 0 && p.y > 0);
  const deriv = bourdetDerivative(series, { L: config.smoothingL });
  return deriv.map((d, i) => ({ x: d.x, time: series[i]?.time ?? d.x, dp: d.y, derivative: d.derivative }));
}

/** Deterministic synthetic buildup used by the Sample button and smoke test. */
export function generateSampleBuildup() {
  const model = getModel('homogeneous');
  const truth = { k: 85, skin: 6.5, C: 0.015 };
  const reservoir = { h: 45, phi: 0.18, rw: 0.354, B: 1.25, mu: 0.9, ct: 0.000012, q: 450, pi: 4800 };
  const tp = 36;
  const n = 45;
  const dts = Array.from({ length: n }, (_, i) => Math.pow(10, -2 + (3.9 * i) / (n - 1)));
  const clean = evaluateBuildup({ model, params: truth, reservoir, tp, dts });
  // quartz-gauge-level noise (~0.1 psi): the Bourdet derivative amplifies
  // pressure noise by the smoothing-window factor, so gauge quality directly
  // sets how clean the sample diagnostics look
  const gaugeRows = clean.map((p, i) => ({
    t: p.dt,
    p: p.pws * (1 + 0.00002 * Math.sin(12.9898 * (i + 1))),
  }));
  return { gaugeRows, tp, truth, pwfShutIn: clean.pwfAtShutIn };
}

export const WellTestStudioProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  // Projects
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  // Persisted inputs
  const [wellName, setWellName] = useState('');
  const [reservoirInputs, setReservoirInputs] = useState(DEFAULT_RESERVOIR);
  const [testConfig, setTestConfig] = useState(DEFAULT_TEST_CONFIG);
  const [gaugeRows, setGaugeRows] = useState([]); // [{t, p}] numbers
  const [rateRows, setRateRows] = useState([]); // [{t, q}] strings
  const [matchInputs, setMatchInputs] = useState(DEFAULT_MATCH);
  const [windows, setWindows] = useState(DEFAULT_WINDOWS);
  const [notes, setNotes] = useState('');

  // Transient auto-fit state (regression on demand, never persisted)
  const [fitResult, setFitResult] = useState(null);
  const [isFitting, setIsFitting] = useState(false);
  const [fitStale, setFitStale] = useState(false);
  const hasFitResult = useRef(false);

  const setReservoirField = useCallback((k, v) => setReservoirInputs((prev) => ({ ...prev, [k]: v })), []);
  const setTestField = useCallback((k, v) => setTestConfig((prev) => ({ ...prev, [k]: v })), []);
  // Switching models seeds catalog defaults for any parameter the working
  // match does not carry yet (WT3 models add xf, FcD, omega, lambda, L, W, re).
  const setMatchField = useCallback((k, v) => setMatchInputs((prev) => {
    if (k !== 'modelId') return { ...prev, [k]: v };
    const nextModel = getModel(v);
    const seeded = {};
    for (const meta of nextModel?.parameters || []) {
      if (prev[meta.key] == null || prev[meta.key] === '') seeded[meta.key] = String(meta.default);
    }
    return { ...prev, ...seeded, modelId: v };
  }), []);
  const setWindowField = useCallback((k, v) => setWindows((prev) => ({ ...prev, [k]: v })), []);

  // ---- Derived analysis (never persisted) ----
  const reservoirSpec = useMemo(() => buildReservoirInputs(reservoirInputs), [reservoirInputs]);
  const configSpec = useMemo(() => buildTestConfig(testConfig), [testConfig]);
  const model = useMemo(() => getModel(matchInputs.modelId) || getModel('homogeneous'), [matchInputs.modelId]);

  const prepared = useMemo(
    () => prepareTestData({ gaugeRows, reservoir: reservoirSpec.reservoir, config: configSpec.config }),
    [gaugeRows, reservoirSpec, configSpec],
  );

  const loglog = useMemo(
    () => buildLoglog({ points: prepared.points, config: configSpec.config }),
    [prepared, configSpec],
  );

  const regimes = useMemo(() => detectFlowRegimes(loglog), [loglog]);

  const flowPeriods = useMemo(() => {
    const steps = rateStepsFromHistory(rateRows.map((r) => ({ t: num(r.t), q: num(r.q) })));
    if (!steps.length) return { steps: [], periods: [], equivalentTp: NaN };
    const shutIn = steps.find((s) => s.q === 0 && s.start > 0);
    return {
      steps,
      periods: detectFlowPeriods(steps.map((s) => ({ t: s.start, q: s.q }))),
      equivalentTp: shutIn ? equivalentProducingTime(steps, shutIn.start) : NaN,
    };
  }, [rateRows]);

  // Manual-match parameters assembled from the catalog metadata, so WT3
  // models contribute their extra parameters without context changes.
  const matchParams = useMemo(() => {
    const p = {};
    for (const meta of model.parameters) {
      const v = num(matchInputs[meta.key] ?? meta.default, NaN);
      if (!Number.isFinite(v)) return null;
      if (meta.logScale && !(v > 0)) return null;
      p[meta.key] = v;
    }
    return p.k > 0 && (p.C ?? 0) >= 0 ? p : null;
  }, [matchInputs, model]);

  const modelSeries = useMemo(() => {
    if (!matchParams || !reservoirSpec.reservoir || !configSpec.config || !prepared.points.length) return null;
    const cfg = configSpec.config;
    const times = prepared.points.map((p) => p.time);
    try {
      const series = evaluateModelTest({
        testType: cfg.testType,
        model,
        params: matchParams,
        reservoir: reservoirSpec.reservoir,
        tp: cfg.tp,
        times,
        dts: times,
      });
      const abscissa = (t) => (cfg.testType === 'buildup' ? agarwalEquivalentTime(cfg.tp, t) : t);
      const base = series.map((p, i) => ({ x: abscissa(times[i]), y: p.dp })).filter((p) => p.x > 0 && p.y > 0);
      const deriv = bourdetDerivative(base, { L: cfg.smoothingL });
      return deriv.map((d) => ({ x: d.x, modelDp: d.y, modelDerivative: d.derivative }));
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [matchParams, model, reservoirSpec, configSpec, prepared]);

  const windowedPoints = useCallback((minKey, maxKey) => {
    const lo = num(windows[minKey]);
    const hi = num(windows[maxKey]);
    return prepared.points.filter((p) =>
      (Number.isFinite(lo) ? p.time >= lo : true) && (Number.isFinite(hi) ? p.time <= hi : true));
  }, [windows, prepared]);

  // Straight-line analyses on the (windowed) radial data.
  const semilogResult = useMemo(() => {
    if (!reservoirSpec.reservoir || !configSpec.config) return null;
    const cfg = configSpec.config;
    const pts = windowedPoints('semilogMin', 'semilogMax');
    if (pts.length < 4) return null;
    if (cfg.testType === 'buildup') {
      return hornerAnalysis({
        points: pts.map((p) => ({ dt: p.time, pws: p.p })),
        tp: cfg.tp,
        pwfShutIn: prepared.pwfShutIn,
        ...reservoirSpec.reservoir,
      });
    }
    return mdhAnalysis({
      points: pts.map((p) => ({ t: p.time, pwf: p.p })),
      ...reservoirSpec.reservoir,
    });
  }, [reservoirSpec, configSpec, prepared, windowedPoints]);

  const pssResult = useMemo(() => {
    if (!reservoirSpec.reservoir || configSpec.config?.testType !== 'drawdown') return null;
    const pts = windowedPoints('pssMin', 'pssMax');
    if (pts.length < 4) return null;
    return cartesianPssAnalysis({
      points: pts.map((p) => ({ t: p.time, pwf: p.p })),
      q: reservoirSpec.reservoir.q, B: reservoirSpec.reservoir.B, ct: reservoirSpec.reservoir.ct,
    });
  }, [reservoirSpec, configSpec, windowedPoints]);

  const sqrtResult = useMemo(() => {
    const pts = windowedPoints('sqrtMin', 'sqrtMax');
    if (pts.length < 4) return null;
    return sqrtTimeAnalysis({ points: pts.map((p) => ({ t: p.time, dp: p.dp })) });
  }, [windowedPoints]);

  // Headline quantities derived from the working match (falls back to the
  // semilog answer when no match parameters are set).
  const derivedKpis = useMemo(() => {
    const r = reservoirSpec.reservoir;
    if (!r) return null;
    const k = matchParams?.k ?? semilogResult?.k;
    const skin = matchParams?.skin ?? semilogResult?.skin;
    if (!(k > 0)) return null;
    const lastTime = prepared.points.length ? prepared.points[prepared.points.length - 1].time : NaN;
    const dpSkin = Number.isFinite(skin) ? skinPressureDrop({ q: r.q, B: r.B, mu: r.mu, k, h: r.h, skin }) : NaN;
    const pRef = semilogResult?.pStar ?? r.pi;
    const fe = Number.isFinite(dpSkin) && Number.isFinite(prepared.pwfShutIn)
      ? flowEfficiency({ pAvg: pRef, pwf: prepared.pwfShutIn, dpSkin })
      : NaN;
    return {
      k, skin, kh: k * r.h,
      ri: Number.isFinite(lastTime)
        ? radiusOfInvestigation({ k, tHours: lastTime, phi: r.phi, mu: r.mu, ct: r.ct })
        : NaN,
      dpSkin,
      flowEfficiency: fe,
      cd: matchParams?.C != null && Number.isFinite(matchParams.C)
        ? matchParams.C * toDimensionlessGroups({ ...r, k }).cdPerBblPsi
        : NaN,
    };
  }, [reservoirSpec, matchParams, semilogResult, prepared]);

  // ---- Auto-fit (on demand, transient result) ----
  const runAutoFit = useCallback(async () => {
    if (isFitting) return;
    if (!reservoirSpec.reservoir) {
      addNotification(reservoirSpec.error || 'Fix the reservoir inputs first.', 'error');
      return;
    }
    if (!configSpec.config) {
      addNotification(configSpec.error || 'Fix the test configuration first.', 'error');
      return;
    }
    if (prepared.points.length < 8) {
      addNotification('Load at least 8 usable gauge points before fitting.', 'error');
      return;
    }
    setIsFitting(true);
    try {
      // yield a frame so the busy overlay paints before the regression runs
      await new Promise((resolve) => setTimeout(resolve, 30));
      const cfg = configSpec.config;
      const data = prepared.points.map((p) =>
        cfg.testType === 'buildup' ? { dt: p.time, dp: p.dp } : { t: p.time, dp: p.dp });
      const fit = autoFitModel({
        model,
        testType: cfg.testType,
        data,
        reservoir: reservoirSpec.reservoir,
        tp: cfg.tp,
        initialParams: matchParams || undefined,
        smoothingL: cfg.smoothingL,
      });
      if (!fit) {
        addNotification('Not enough valid data to fit.', 'error');
        return;
      }
      setFitResult({ ...fit, testType: cfg.testType, ranAt: new Date().toISOString() });
      hasFitResult.current = true;
      setFitStale(false);
      setMatchInputs((prev) => ({
        ...prev,
        ...Object.fromEntries(model.parameters.map((meta) => [
          meta.key,
          meta.logScale ? fit.params[meta.key].toPrecision(4) : fit.params[meta.key].toFixed(2),
        ])),
      }));
      addNotification(
        fit.converged
          ? `Auto-fit converged in ${fit.iterations} iterations.`
          : 'Auto-fit stopped without full convergence. Review the match.',
        fit.converged ? 'success' : 'info',
      );
    } catch (e) {
      console.error(e);
      addNotification(e.message || 'Auto-fit failed', 'error');
    } finally {
      setIsFitting(false);
    }
  }, [isFitting, reservoirSpec, configSpec, prepared, model, matchParams, addNotification]);

  // Data or configuration edits invalidate an existing fit result (the match
  // parameters it produced stay in the working match).
  useEffect(() => {
    if (hasFitResult.current) setFitStale(true);
  }, [gaugeRows, reservoirInputs, testConfig]);

  // ---- Sample test ----
  const loadSampleTest = useCallback(() => {
    const sample = generateSampleBuildup();
    setGaugeRows(sample.gaugeRows);
    setReservoirInputs(DEFAULT_RESERVOIR);
    setTestConfig({
      ...DEFAULT_TEST_CONFIG,
      testType: 'buildup',
      tp: String(sample.tp),
      pwfShutIn: sample.pwfShutIn.toFixed(1),
    });
    setRateRows([
      { t: '0', q: DEFAULT_RESERVOIR.q },
      { t: String(sample.tp), q: '0' },
    ]);
    setWellName('Sample well 1');
    addNotification('Sample buildup loaded (synthetic homogeneous test, tp = 36 hr).', 'success');
  }, [addNotification]);

  // ---- Project persistence ----
  const serializeInputs = useCallback(() => ({
    id: currentProjectId,
    name: projectName,
    wellName,
    reservoirInputs,
    testConfig,
    gaugeRows,
    rateRows,
    matchInputs,
    windows,
    notes,
    modified: new Date().toISOString(),
  }), [currentProjectId, projectName, wellName, reservoirInputs, testConfig, gaugeRows, rateRows, matchInputs, windows, notes]);

  const hydrate = useCallback((payload) => {
    setWellName(payload?.wellName || '');
    setReservoirInputs({ ...DEFAULT_RESERVOIR, ...(payload?.reservoirInputs || {}) });
    setTestConfig({ ...DEFAULT_TEST_CONFIG, ...(payload?.testConfig || {}) });
    setGaugeRows(Array.isArray(payload?.gaugeRows) ? payload.gaugeRows : []);
    setRateRows(Array.isArray(payload?.rateRows) ? payload.rateRows : []);
    setMatchInputs({ ...DEFAULT_MATCH, ...(payload?.matchInputs || {}) });
    setWindows({ ...DEFAULT_WINDOWS, ...(payload?.windows || {}) });
    setNotes(payload?.notes || '');
    setFitResult(null);
    hasFitResult.current = false;
    setFitStale(false);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setProjects(await service.list());
      } catch (e) {
        console.error(e);
        addNotification('Could not load saved projects', 'error');
      }
    })();
  }, [addNotification]);

  const openProject = useCallback(async (id) => {
    try {
      const payload = await service.load(id);
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
  }, [addNotification, hydrate]);

  const createProject = useCallback(async (name) => {
    const id = uuidv4();
    try {
      await service.save(id, { ...serializeInputs(), id, name });
      setCurrentProjectId(id);
      setProjectName(name);
      setHydrated(true);
      setLastSaveTime(new Date());
      setProjects(await service.list());
      addNotification(`Project "${name}" created`, 'success');
    } catch (e) {
      console.error(e);
      addNotification(e.message || 'Could not create project', 'error');
    }
  }, [serializeInputs, addNotification]);

  const deleteProject = useCallback(async (id) => {
    try {
      await service.remove(id);
      if (id === currentProjectId) {
        setCurrentProjectId(null);
        setProjectName('');
        setHydrated(false);
      }
      setProjects(await service.list());
      addNotification('Project deleted', 'info');
    } catch (e) {
      console.error(e);
      addNotification('Could not delete project', 'error');
    }
  }, [currentProjectId, addNotification]);

  const manualSave = useCallback(async () => {
    if (!currentProjectId) {
      addNotification('Create or open a project first', 'info');
      return;
    }
    setIsSaving(true);
    try {
      await service.save(currentProjectId, serializeInputs());
      setLastSaveTime(new Date());
      setSaveError(null);
    } catch (e) {
      console.error(e);
      setSaveError('Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [currentProjectId, serializeInputs, addNotification]);

  // Debounced autosave (10 s after the last change), only once a project is open.
  const autosaveRef = useRef(serializeInputs);
  autosaveRef.current = serializeInputs;
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
  }, [wellName, reservoirInputs, testConfig, gaugeRows, rateRows, matchInputs, windows, notes, currentProjectId, hydrated]);

  const value = {
    // shell plumbing
    notifications, addNotification, removeNotification,
    // projects
    projects, currentProjectId, projectName,
    createProject, openProject, deleteProject, manualSave,
    isSaving, saveError, lastSaveTime,
    // inputs
    wellName, setWellName,
    reservoirInputs, setReservoirField,
    testConfig, setTestField,
    gaugeRows, setGaugeRows,
    rateRows, setRateRows,
    matchInputs, setMatchField,
    windows, setWindowField,
    notes, setNotes,
    // derived
    reservoirSpec, configSpec, model,
    prepared, loglog, regimes, flowPeriods,
    matchParams, modelSeries,
    semilogResult, pssResult, sqrtResult, derivedKpis,
    // auto-fit
    fitResult, isFitting, fitStale, runAutoFit,
    // sample
    loadSampleTest,
  };

  return <WellTestStudioContext.Provider value={value}>{children}</WellTestStudioContext.Provider>;
};
