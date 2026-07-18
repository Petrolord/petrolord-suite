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
import { mdhAnalysis, hornerAnalysis, cartesianPssAnalysis, sqrtTimeAnalysis, radiusOfInvestigation, skinPressureDrop, flowEfficiency, multiRateSemilogAnalysis } from '@/utils/welltest/analysis';
import { autoFitModel } from '@/utils/welltest/autoFit';
import { buildGasPvtTable, makePseudoPressure, deliverabilityAnalysis, GAS } from '@/utils/welltest/gas';

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
  // WT4 gas mode: analyses run in pseudo-pressure m(p) space built from
  // these correlation inputs (Papay z, Lee-Gonzalez-Eakin viscosity).
  fluid: 'oil', // 'oil' | 'gas'
  gasGravity: '0.65',
  tempF: '180',
};

export const DEFAULT_DELIVERABILITY = {
  pr: '', // average reservoir pressure, psia
  method: 'pressure-squared', // 'pressure-squared' | 'pseudo-pressure'
  rows: [], // [{q (Mscf/D), pwf (psia)}] strings
};

export const DEFAULT_TEST_CONFIG = {
  testType: 'buildup', // 'drawdown' | 'buildup' | 'injection' | 'falloff'
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

/**
 * Numeric reservoir/fluid inputs from form state; error string when invalid.
 *
 * Gas mode (WT4): analyses run in pseudo-pressure m(p) space. The returned
 * reservoir carries mu = mu_i, ct = ct_i (evaluated at pi from the PVT
 * table; the ct field, when filled, overrides the computed c_g) and the
 * equivalent FVF B_eq = 1637 T / (162.6 mu_i), which makes every liquid
 * formula (141.2 q B mu -> 1422 q T, 162.6 q B mu -> 1637 q T) the correct
 * gas expression in m(p) space. mOfP/pOfM convert gauge pressures in and
 * answers back out.
 */
export function buildReservoirInputs(r) {
  const fluid = r.fluid === 'gas' ? 'gas' : 'oil';
  const out = {
    h: num(r.h), phi: num(r.phi), rw: num(r.rw), B: num(r.B),
    mu: num(r.mu), ct: num(r.ct), q: num(r.q), pi: num(r.pi),
    fluid,
  };
  if (!(out.phi > 0 && out.phi < 1)) {
    return { reservoir: null, error: 'Porosity is a fraction between 0 and 1.' };
  }
  if (!(out.h > 0) || !(out.rw > 0) || !(out.q > 0)) {
    return { reservoir: null, error: 'Thickness, wellbore radius and rate must all be positive.' };
  }
  if (!Number.isFinite(out.pi) || !(out.pi > 0)) {
    return { reservoir: null, error: 'Initial pressure is required (psia).' };
  }
  if (fluid === 'gas') {
    const gasGravity = num(r.gasGravity);
    const tempF = num(r.tempF);
    if (!(gasGravity >= 0.55 && gasGravity <= 1.5)) {
      return { reservoir: null, error: 'Gas gravity must be between 0.55 and 1.5 (air = 1).' };
    }
    if (!(tempF > 32 && tempF < 500)) {
      return { reservoir: null, error: 'Reservoir temperature must be given in degF.' };
    }
    const pvt = makePseudoPressure(buildGasPvtTable({ gasGravity, tempF, pMax: Math.max(out.pi * 1.5, 2000) }));
    if (!pvt) return { reservoir: null, error: 'Gas PVT table could not be built.' };
    const muI = pvt.muOf(out.pi);
    const ctI = out.ct > 0 ? out.ct : pvt.cgOf(out.pi);
    if (!(muI > 0) || !(ctI > 0)) return { reservoir: null, error: 'Gas viscosity and compressibility must be positive.' };
    const tempR = tempF + 460;
    return {
      reservoir: {
        ...out,
        mu: muI,
        ct: ctI,
        B: (GAS.SEMILOG_SLOPE * tempR) / (162.6 * muI),
        tempR,
        gasGravity,
        mOfP: pvt.mOfP,
        pOfM: pvt.pOfM,
      },
      error: null,
    };
  }
  if (!(out.B > 0) || !(out.mu > 0) || !(out.ct > 0)) {
    return { reservoir: null, error: 'FVF, viscosity and compressibility must all be positive.' };
  }
  return { reservoir: out, error: null };
}

/**
 * Numeric test configuration; error string when invalid.
 *
 * WT4 test types: injection and falloff map onto the drawdown/buildup
 * machinery (config.family) with mirrored pressures (config.mirror): an
 * injection raises pressure above pi exactly as a drawdown lowers it, and a
 * falloff decays from the injection pressure exactly as a buildup rises
 * from the flowing pressure, with q the injection rate magnitude.
 */
export function buildTestConfig(t) {
  const TYPES = ['drawdown', 'buildup', 'injection', 'falloff'];
  const testType = TYPES.includes(t.testType) ? t.testType : 'buildup';
  const out = {
    testType,
    family: testType === 'buildup' || testType === 'falloff' ? 'buildup' : 'drawdown',
    mirror: testType === 'injection' || testType === 'falloff',
    tp: num(t.tp),
    pwfShutIn: num(t.pwfShutIn), // may be NaN: auto from data
    smoothingL: Math.min(Math.max(num(t.smoothingL) || 0.1, 0), 0.5),
    pointsPerDecade: Math.max(Math.round(num(t.pointsPerDecade) || 15), 4),
    spikeTrimOn: !!t.spikeTrimOn,
    spikeThreshold: Math.max(num(t.spikeThreshold) || 6, 2),
  };
  if (out.family === 'buildup' && !(out.tp > 0)) {
    return {
      config: null,
      error: testType === 'falloff'
        ? 'Falloff analysis needs a positive injection time tp (hours).'
        : 'Buildup analysis needs a positive producing time tp (hours).',
    };
  }
  return { config: out, error: null };
}

/**
 * Turn raw gauge rows into the analysis series. Time is elapsed hours in the
 * analysis period (shut-in time for a buildup/falloff); p is the gauge psi.
 *
 * Analysis space (WT4): pa is the value the straight-line analyses and the
 * model see. For gas it is m(p); for injection/falloff it is additionally
 * mirrored about the reference (initial pressure for an injection, the
 * shut-in injection pressure for a falloff), which turns those tests into
 * standard drawdowns/buildups. dp is the log-log ordinate in analysis
 * units (psi for oil, psi^2/cp for gas), always positive.
 *
 * fromAnalysis(v) converts a pa-space answer (p1hr, p*) back to gauge psi;
 * dpToGauge(dp) converts a pressure change back to gauge psi at the
 * matching side of the reference.
 */
export function prepareTestData({ gaugeRows, reservoir, config }) {
  const empty = (warnings = []) => ({
    points: [], pwfShutIn: NaN, removedSpikes: 0, warnings,
    paI: NaN, paShutIn: NaN, fromAnalysis: (v) => v, dpToGauge: (v) => v,
  });
  const rows = (gaugeRows || [])
    .map((r) => ({ t: num(r.t), p: num(r.p) }))
    .filter((r) => r.t > 0 && Number.isFinite(r.p))
    .sort((a, b) => a.t - b.t);
  if (rows.length < 5 || !reservoir || !config) {
    return empty(rows.length ? ['At least 5 gauge points are needed.'] : []);
  }

  const isGas = reservoir.fluid === 'gas';
  const A = isGas ? reservoir.mOfP : (v) => v;
  const fromM = isGas ? reservoir.pOfM : (v) => v;

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
  let base; // analysis-space reference the test moves away from
  if (config.family === 'buildup') {
    pwfShutIn = Number.isFinite(config.pwfShutIn) ? config.pwfShutIn : series[0].p;
    base = A(pwfShutIn);
    if (!Number.isFinite(config.pwfShutIn)) {
      warnings.push(`${config.mirror ? 'Injection' : 'Flowing'} pressure at shut-in taken from the earliest gauge point (${series[0].p.toFixed(1)} psi). Enter it explicitly if the gauge missed the ${config.mirror ? 'injection' : 'flowing'} period.`);
    }
  } else {
    base = A(reservoir.pi);
  }
  // Physical direction the gauge moves away from the reference:
  // buildup and injection climb (s = +1), drawdown and falloff fall (s = -1).
  const s = (config.family === 'buildup') !== config.mirror ? 1 : -1;
  const isBuildupFamily = config.family === 'buildup';
  const points = decimated
    .map((r) => {
      const dp = s * (A(r.p) - base);
      // pa presents the point as a standard test of its family: pws rising
      // from base for buildups, pwf falling from base (= A(pi)) for drawdowns
      return { time: r.t, p: r.p, pa: base + (isBuildupFamily ? dp : -dp), dp };
    })
    .filter((r, i) => r.dp > 0 || (isBuildupFamily && i === 0));
  if (!isBuildupFamily && points.length < decimated.length) {
    warnings.push(config.mirror
      ? 'Gauge pressures below initial pressure were dropped from the injection series.'
      : 'Gauge pressures above initial pressure were dropped from the drawdown series.');
  }
  if (removedSpikes > 0) warnings.push(`${removedSpikes} outlier point${removedSpikes > 1 ? 's' : ''} removed by the spike filter.`);

  const dpToGauge = (dp) => fromM(base + s * dp);
  return {
    points,
    pwfShutIn,
    removedSpikes,
    warnings,
    paI: A(reservoir.pi),
    paShutIn: isBuildupFamily ? base : NaN,
    // inverse of the pa mapping, back to gauge psi (p1hr, p*)
    fromAnalysis: (v) => dpToGauge(isBuildupFamily ? v - base : base - v),
    dpToGauge,
  };
}

/**
 * Log-log diagnostic series: dp and Bourdet derivative against elapsed time
 * (drawdown) or Agarwal equivalent time (buildup).
 */
export function buildLoglog({ points, config }) {
  if (!points?.length || !config) return [];
  const abscissa = (t) =>
    config.family === 'buildup' ? agarwalEquivalentTime(config.tp, t) : t;
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
  const [deliverabilityInputs, setDeliverabilityInputs] = useState(DEFAULT_DELIVERABILITY);
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
  const setDeliverabilityField = useCallback((k, v) => setDeliverabilityInputs((prev) => ({ ...prev, [k]: v })), []);
  const setDeliverabilityRows = useCallback((rows) => setDeliverabilityInputs((prev) => ({ ...prev, rows })), []);

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
        testType: cfg.family,
        model,
        params: matchParams,
        reservoir: reservoirSpec.reservoir,
        tp: cfg.tp,
        times,
        dts: times,
      });
      const abscissa = (t) => (cfg.family === 'buildup' ? agarwalEquivalentTime(cfg.tp, t) : t);
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

  // Straight-line analyses on the (windowed) radial data, in analysis space
  // (pa: m(p) for gas, mirrored for injection/falloff); p1hr and p* are
  // converted back to gauge psi before leaving this memo.
  const semilogResult = useMemo(() => {
    if (!reservoirSpec.reservoir || !configSpec.config) return null;
    const cfg = configSpec.config;
    const pts = windowedPoints('semilogMin', 'semilogMax');
    if (pts.length < 4) return null;
    const raw = cfg.family === 'buildup'
      ? hornerAnalysis({
        points: pts.map((p) => ({ dt: p.time, pws: p.pa })),
        tp: cfg.tp,
        pwfShutIn: prepared.paShutIn,
        ...reservoirSpec.reservoir,
      })
      : mdhAnalysis({
        points: pts.map((p) => ({ t: p.time, pwf: p.pa })),
        ...reservoirSpec.reservoir,
        pi: prepared.paI, // analysis-space pi must win over the gauge value in the spread
      });
    if (!raw) return null;
    return {
      ...raw,
      // analysis-space line anchors (for drawing the fitted line), plus the
      // gauge-psi conversions everything user-facing reports
      p1hrA: raw.p1hr,
      pStarA: raw.pStar,
      p1hr: Number.isFinite(raw.p1hr) ? prepared.fromAnalysis(raw.p1hr) : raw.p1hr,
      pStar: Number.isFinite(raw.pStar) ? prepared.fromAnalysis(raw.pStar) : raw.pStar,
    };
  }, [reservoirSpec, configSpec, prepared, windowedPoints]);

  // Cartesian PSS pore volume stays a liquid drawdown analysis.
  const pssResult = useMemo(() => {
    const cfg = configSpec.config;
    if (!reservoirSpec.reservoir || cfg?.testType !== 'drawdown' || reservoirSpec.reservoir.fluid === 'gas') return null;
    const pts = windowedPoints('pssMin', 'pssMax');
    if (pts.length < 4) return null;
    return cartesianPssAnalysis({
      points: pts.map((p) => ({ t: p.time, pwf: p.p })),
      q: reservoirSpec.reservoir.q, B: reservoirSpec.reservoir.B, ct: reservoirSpec.reservoir.ct,
    });
  }, [reservoirSpec, configSpec, windowedPoints]);

  // Multi-rate (Odeh-Jones) superposition analysis: available for flowing
  // tests whenever the rate history holds more than one nonzero rate step.
  const multiRateResult = useMemo(() => {
    const cfg = configSpec.config;
    if (!reservoirSpec.reservoir || !cfg || cfg.family !== 'drawdown') return null;
    const steps = flowPeriods.steps;
    if (steps.filter((s) => s.q !== 0).length < 2) return null;
    if (prepared.points.length < 6) return null;
    return multiRateSemilogAnalysis({
      points: prepared.points.map((p) => ({ t: p.time, pwf: p.pa })),
      steps,
      pi: prepared.paI,
      B: reservoirSpec.reservoir.B,
      mu: reservoirSpec.reservoir.mu,
      h: reservoirSpec.reservoir.h,
      phi: reservoirSpec.reservoir.phi,
      ct: reservoirSpec.reservoir.ct,
      rw: reservoirSpec.reservoir.rw,
    });
  }, [reservoirSpec, configSpec, prepared, flowPeriods]);

  // Gas deliverability (flow-after-flow / isochronal points entered on the
  // Specialized tab): Rawlins-Schellhardt C-and-n plus Houpeurt LIT, with
  // AOF at base pressure. Gas wells only.
  const deliverabilityResult = useMemo(() => {
    const r = reservoirSpec.reservoir;
    if (!r || r.fluid !== 'gas') return null;
    const points = (deliverabilityInputs.rows || [])
      .map((row) => ({ q: num(row.q), pwf: num(row.pwf) }))
      .filter((row) => row.q > 0 && row.pwf > 0);
    if (points.length < 2) return null;
    const pr = num(deliverabilityInputs.pr) > 0 ? num(deliverabilityInputs.pr) : r.pi;
    return deliverabilityAnalysis({
      points,
      pr,
      method: deliverabilityInputs.method,
      mOfP: r.mOfP,
    });
  }, [reservoirSpec, deliverabilityInputs]);

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
    // analysis units (psi for oil, psi^2/cp for gas via the equivalent FVF)
    const dpSkinA = Number.isFinite(skin) ? skinPressureDrop({ q: r.q, B: r.B, mu: r.mu, k, h: r.h, skin }) : NaN;
    // display value in gauge psi: offset the reference by the skin drop
    const dpSkin = Number.isFinite(dpSkinA)
      ? Math.abs(prepared.dpToGauge(dpSkinA) - prepared.dpToGauge(0))
      : NaN;
    // flow efficiency is a ratio, so it is computed in analysis space
    const paAvg = Number.isFinite(semilogResult?.pStar)
      ? (r.fluid === 'gas' ? r.mOfP(semilogResult.pStar) : semilogResult.pStar)
      : prepared.paI;
    const fe = Number.isFinite(dpSkinA) && Number.isFinite(prepared.paShutIn)
      ? flowEfficiency({ pAvg: paAvg, pwf: prepared.paShutIn, dpSkin: dpSkinA })
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
        cfg.family === 'buildup' ? { dt: p.time, dp: p.dp } : { t: p.time, dp: p.dp });
      const fit = autoFitModel({
        model,
        testType: cfg.family,
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
    deliverabilityInputs,
    notes,
    modified: new Date().toISOString(),
  }), [currentProjectId, projectName, wellName, reservoirInputs, testConfig, gaugeRows, rateRows, matchInputs, windows, deliverabilityInputs, notes]);

  const hydrate = useCallback((payload) => {
    setWellName(payload?.wellName || '');
    setReservoirInputs({ ...DEFAULT_RESERVOIR, ...(payload?.reservoirInputs || {}) });
    setTestConfig({ ...DEFAULT_TEST_CONFIG, ...(payload?.testConfig || {}) });
    setGaugeRows(Array.isArray(payload?.gaugeRows) ? payload.gaugeRows : []);
    setRateRows(Array.isArray(payload?.rateRows) ? payload.rateRows : []);
    setMatchInputs({ ...DEFAULT_MATCH, ...(payload?.matchInputs || {}) });
    setWindows({ ...DEFAULT_WINDOWS, ...(payload?.windows || {}) });
    setDeliverabilityInputs({ ...DEFAULT_DELIVERABILITY, ...(payload?.deliverabilityInputs || {}) });
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
  }, [wellName, reservoirInputs, testConfig, gaugeRows, rateRows, matchInputs, windows, deliverabilityInputs, notes, currentProjectId, hydrated]);

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
    deliverabilityInputs, setDeliverabilityField, setDeliverabilityRows,
    // derived
    reservoirSpec, configSpec, model,
    prepared, loglog, regimes, flowPeriods,
    matchParams, modelSeries,
    semilogResult, pssResult, sqrtResult, derivedKpis,
    multiRateResult, deliverabilityResult,
    // auto-fit
    fitResult, isFitting, fitStale, runAutoFit,
    // sample
    loadSampleTest,
  };

  return <WellTestStudioContext.Provider value={value}>{children}</WellTestStudioContext.Provider>;
};
