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
import { useSharedSavedProjects } from '@/lib/recordSharing/useSharedSavedProjects';
import { getModel, evaluateModelTest, evaluateBuildup, toDimensionlessGroups } from '@/utils/welltest/models/modelCatalog';
import { bourdetDerivative, logDecimate, trimSpikes, detectFlowRegimes } from '@/utils/welltest/derivative';
import { agarwalEquivalentTime, rateStepsFromHistory, detectFlowPeriods, equivalentProducingTime } from '@/utils/welltest/superposition';
import { mdhAnalysis, hornerAnalysis, cartesianPssAnalysis, sqrtTimeAnalysis, radiusOfInvestigation, skinPressureDrop, flowEfficiency, multiRateSemilogAnalysis } from '@/utils/welltest/analysis';
import { autoFitModel } from '@/utils/welltest/autoFit';
import { buildGasPvtTable, makePseudoPressure, deliverabilityAnalysis, normalizedPseudoTime, GAS, WELLTEST_Z_METHODS, rateDependentSkinFit, nonDarcyDFromF } from '@/utils/welltest/gas';
import { UNIT_SYSTEMS } from '@/utils/welltest/units';
import { useProfileSystem } from '@/lib/units/useProfileSystem';
import { buildLabel } from '@/lib/platformBuild';
import { buildWtaRecord } from '@/lib/wellTestSource';
import { provenanceFromPayload, setProvenanceField } from '@/lib/inputProvenance';
import {
  DEFAULT_IDENTIFICATION, DEFAULT_COMPLETION, resolveTotalCompressibility,
  buildSkinBreakdown, buildInputsTable, buildFlowSummary, buildIdentificationRows,
  buildPressureBasisRows, buildDataUseRows, buildLimitsRows, pvtIntakeFromBackbone, changingStorageRows, completionDatumCorrection,
} from '@/utils/welltest/reportModel';
import { buildHistoryMatch, buildOverviewData, thinRows } from '@/utils/welltest/plotData';

// Families that decide Well Test's system from the Suite unit profile
const WT_PROFILE_FAMILIES = ['pressure', 'liquidRate', 'depth'];

// A gauge reading this close to shut-in (hours) is taken as the pressure at
// the instant of shut-in.
export const SHUT_IN_T_EPS_HR = 1e-4;
import {
  prepareProductionRows, materialBalanceTime, rateNormalizedSeries,
  flowingMaterialBalanceOil, flowingMaterialBalanceGas, transientLinearAnalysis,
} from '@/utils/welltest/rta';

const WellTestStudioContext = createContext(null);

export const useWellTestStudio = () => {
  const ctx = useContext(WellTestStudioContext);
  if (!ctx) throw new Error('useWellTestStudio must be used within WellTestStudioProvider');
  return ctx;
};

export const WT_PROJECTS_TABLE = 'saved_well_test_projects';
const service = createSavedProjectsService(WT_PROJECTS_TABLE, {
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
  // these correlation inputs (z by gasZMethod, Lee-Gonzalez-Eakin viscosity).
  fluid: 'oil', // 'oil' | 'gas'
  gasGravity: '0.65',
  tempF: '180',
  // WTA-U1-003: z-factor method of the gas PVT table. New work runs on the
  // canonical Dranchuk-Abou-Kassem engine (the Fluid Systems Studio default);
  // a project saved before 2026-10-04 carries no method and opens on Papay,
  // the method it was interpreted with (see hydrate).
  gasZMethod: 'dranchuk_abou_kassem',
  // WTA-U2-001: where a gas test's z and viscosity come from. 'correlation'
  // (gasZMethod with Lee-Gonzalez-Eakin, the path of every project without
  // a Fluid intake) or 'fluid-table' (the Z and mu_g columns of the pvt-1
  // table a Fluid Systems Studio project sent, kept in pvtIntake.gasTable).
  gasPvtSource: 'correlation',
  // Tester round 2 (report inputs). ctMode 'total' keeps ct as the one
  // entered number; 'components' sums cf + So co + Sw cw + Sg cg in the
  // engine. Everything below is blank until entered and prints as n/a.
  ctMode: 'total',
  cf: '', so: '', co: '', sw: '', cw: '', sg: '', cg: '',
  apiGravity: '', gor: '',
  // oil tests: recorded for the report, not used by the oil analysis
  solutionGasGravity: '', reservoirTempF: '',
  kvkh: '', // blank = DEFAULT_KVKH, stated as an assumption
};

export const DEFAULT_DELIVERABILITY = {
  pr: '', // average reservoir pressure, psia
  method: 'pressure-squared', // 'pressure-squared' | 'pseudo-pressure'
  rows: [], // [{q (Mscf/D), pwf (psia)}] strings
};

export const DEFAULT_TEST_CONFIG = {
  testType: 'buildup', // 'drawdown' | 'buildup' | 'injection' | 'falloff'
  tp: '36',
  pwfShutIn: '', // empty: the gauge reading at shut-in (dt = 0) if the file has one, else skin is withheld
  // Gauge-clock time (hr) of the shut-in (buildup/falloff) or of the start of
  // flow (drawdown/injection). Empty = 0: the file's time column is already
  // the elapsed test time. Readings before it are the preceding period.
  testStartTime: '',
  smoothingL: '0.1',
  pointsPerDecade: '15',
  spikeTrimOn: true,
  spikeThreshold: '6',
  // WT8: diagnostics abscissa, gas tests only ('time' | 'pseudo-time')
  abscissa: 'time',
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
export function buildReservoirInputs(r, { gasTable = null } = {}) {
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
  // ct: the entered total, or the engine's sum of its components
  const componentMode = r.ctMode === 'components';
  if (fluid === 'gas') {
    const gasGravity = num(r.gasGravity);
    const tempF = num(r.tempF);
    if (!(gasGravity >= 0.55 && gasGravity <= 1.5)) {
      return { reservoir: null, error: 'Gas gravity must be between 0.55 and 1.5 (air = 1).' };
    }
    if (!(tempF > 32 && tempF < 500)) {
      return { reservoir: null, error: 'Reservoir temperature must be given in degF.' };
    }
    const zMethod = WELLTEST_Z_METHODS[r.gasZMethod] ? r.gasZMethod : 'papay';
    // WTA-U2-001: the Fluid Systems Studio table, when chosen and held
    const fromTable = r.gasPvtSource === 'fluid-table';
    if (fromTable && !(gasTable?.rows?.length >= 3)) {
      return { reservoir: null, error: 'The gas PVT is set to the Fluid Systems Studio table, but this project holds none. Take a Fluid Systems Studio project, or switch the gas PVT to correlations.' };
    }
    if (fromTable && out.pi > gasTable.pMax * (1 + 1e-9)) {
      return { reservoir: null, error: `The Fluid Systems Studio table stops at ${gasTable.pMax} psia, below the initial pressure ${out.pi} psia. Ask Fluid Systems Studio for a table up to the initial pressure, or switch the gas PVT to correlations.`, tableTooShort: { pMax: gasTable.pMax, need: out.pi } };
    }
    const tableRows = fromTable
      ? buildGasPvtTable({ table: gasTable.rows.map((x) => ({ p: x.p, z: x.z, mu: x.mu })) })
      : buildGasPvtTable({ gasGravity, tempF, pMax: Math.max(out.pi * 1.5, 2000), zMethod });
    const pvt = makePseudoPressure(tableRows);
    if (!pvt) return { reservoir: null, error: 'Gas PVT table could not be built.' };
    if (fromTable) {
      // the engine names a supplied table; the studio adds where it came from
      pvt.source = {
        ...pvt.source,
        kind: 'fluid-table',
        z: `Fluid Systems Studio table (${gasTable.zMethod})`,
        viscosity: `Fluid Systems Studio table (${gasTable.muMethod})`,
        zMethod: gasTable.zMethod,
        muMethod: gasTable.muMethod,
        origin: gasTable.origin,
        rows: gasTable.n,
        pMin: gasTable.pMin,
        pMax: gasTable.pMax,
        temperatureF: gasTable.temperatureF,
        rangeFlags: gasTable.rangeFlags || [],
      };
    }
    const muI = pvt.muOf(out.pi);
    // components: a gas saturation with no cg entered takes cg(pi) from the PVT table
    const ctInfoGas = componentMode ? resolveTotalCompressibility(r, { cgFallback: pvt.cgOf(out.pi) }) : null;
    if (ctInfoGas?.error) return { reservoir: null, error: ctInfoGas.error, ctInfo: ctInfoGas };
    const ctI = ctInfoGas ? ctInfoGas.ct : (out.ct > 0 ? out.ct : pvt.cgOf(out.pi));
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
        zMethod: fromTable ? null : zMethod,
        mOfP: pvt.mOfP,
        pOfM: pvt.pOfM,
        // WT8 pseudo-time abscissa: mu(p) ct(p) along the gauge pressures.
        // The correlation cg is used for the variation even when a manual ct
        // overrides the initial value (the ratio is what matters).
        muCtOf: (p) => pvt.muOf(p) * pvt.cgOf(p),
        muCtInitial: muI * ctI,
        // WT9 RTA: the gas dynamic material balance needs the full PVT
        // accessor set (p/z inversion and property variation along pbar)
        pvt,
        // the correlations the PVT table was built with, as the engine names them
        pvtSource: pvt.source,
      },
      error: null,
      ctInfo: ctInfoGas || { mode: 'total', ct: ctI, error: null, breakdown: null },
    };
  }
  const ctInfo = resolveTotalCompressibility(r);
  if (ctInfo.error) return { reservoir: null, error: ctInfo.error, ctInfo };
  out.ct = ctInfo.ct;
  if (!(out.B > 0) || !(out.mu > 0) || !(out.ct > 0)) {
    return { reservoir: null, error: 'FVF, viscosity and compressibility must all be positive.', ctInfo };
  }
  return { reservoir: out, error: null, ctInfo };
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
    testStartTime: Number.isFinite(num(t.testStartTime)) ? num(t.testStartTime) : 0,
    smoothingL: Math.min(Math.max(num(t.smoothingL) || 0.1, 0), 0.5),
    pointsPerDecade: Math.max(Math.round(num(t.pointsPerDecade) || 15), 4),
    spikeTrimOn: !!t.spikeTrimOn,
    spikeThreshold: Math.max(num(t.spikeThreshold) || 6, 2),
    abscissa: t.abscissa === 'pseudo-time' ? 'pseudo-time' : 'time',
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
    points: [], pwfShutIn: NaN, pwfSource: null, testStartTime: config?.testStartTime || 0, preTestPoints: 0, preTest: [], info: [],
    skinWithheld: null, removedSpikes: 0, warnings, exclusions: null,
    paI: NaN, paShutIn: NaN, fromAnalysis: (v) => v, dpToGauge: (v) => v,
  });
  // Gauge clock -> elapsed test time: dt = t - testStartTime (tester round
  // 2026-09-28: the shut-in can happen part-way through the gauge record).
  const t0 = Number.isFinite(config?.testStartTime) ? config.testStartTime : 0;
  const all = (gaugeRows || [])
    .map((r) => ({ t: num(r.t) - t0, p: num(r.p) }))
    .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.p));
  // a reading at the shut-in instant (dt = 0) cannot go on a log axis, but
  // it IS the pressure at shut-in, so it is kept for that
  const atShutIn = all.find((r) => Math.abs(r.t) <= SHUT_IN_T_EPS_HR) || null;
  // readings before the test start belong to the preceding flow period; the
  // last of them is the flowing pressure just before the shut-in
  const before = all.filter((r) => r.t < -SHUT_IN_T_EPS_HR).sort((a, b) => a.t - b.t);
  const lastBefore = before.length ? before[before.length - 1] : null;
  const rows = all
    .filter((r) => r.t > SHUT_IN_T_EPS_HR)
    .sort((a, b) => a.t - b.t);
  if (rows.length < 5 || !reservoir || !config) {
    return empty(rows.length ? ['At least 5 gauge points are needed.'] : []);
  }

  const isGas = reservoir.fluid === 'gas';
  const A = isGas ? reservoir.mOfP : (v) => v;
  const fromM = isGas ? reservoir.pOfM : (v) => v;

  let series = rows;
  let removedSpikes = 0;
  let spikeList = [];
  if (config.spikeTrimOn) {
    const { kept, removed } = trimSpikes(rows, { threshold: config.spikeThreshold, yKey: 'p' });
    series = kept;
    removedSpikes = removed.length;
    spikeList = removed.map((r) => ({ t: r.t, p: r.p }));
  }

  const decimated = logDecimate(series, { pointsPerDecade: config.pointsPerDecade, xKey: 't' });

  const warnings = [];
  let pwfShutIn = NaN;
  let pwfSource = null;
  let skinWithheld = null;
  let base; // analysis-space reference the test moves away from
  if (config.family === 'buildup') {
    // pwf at dt = 0: entered value, else the gauge reading at the shut-in
    // instant, else the last flowing reading before it, else (skin
    // withheld) the first buildup reading
    if (Number.isFinite(config.pwfShutIn)) {
      pwfShutIn = config.pwfShutIn;
      pwfSource = { kind: 'entered' };
    } else if (atShutIn) {
      pwfShutIn = atShutIn.p;
      pwfSource = { kind: 'gauge', dt: 0 };
    } else if (lastBefore && lastBefore.t > -0.25) {
      pwfShutIn = lastBefore.p;
      pwfSource = { kind: 'gauge-before', dt: lastBefore.t };
    } else {
      pwfShutIn = series[0].p;
      pwfSource = { kind: 'first-buildup', dt: series[0].t };
    }
    base = A(pwfShutIn);
    // Skin is measured from the pressure at the instant of shut-in. When it
    // is not entered and the gauge starts after shut-in, the earliest point
    // has already built up, so skin (and the flow efficiency built on it)
    // would come out biased; they are withheld with the reason. Permeability
    // and p* come from the slope and do not depend on it.
    const flowing = config.mirror ? 'injection' : 'flowing';
    if (pwfSource.kind === 'first-buildup' && series[0].t > SHUT_IN_T_EPS_HR) {
      skinWithheld = `Skin is withheld: enter the ${flowing} pressure at shut-in. The gauge starts ${series[0].t.toPrecision(3)} h after shut-in, `
        + `already into the ${config.mirror ? 'falloff' : 'buildup'}, so its first reading (${series[0].p.toFixed(1)} psi) would bias the skin. `
        + 'If the file also holds the flowing period, set the shut-in time on the gauge clock instead. '
        + 'Permeability and p* do not depend on it.';
      warnings.push(skinWithheld);
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
  // informational, not a warning: splitting a gauge record at the shut-in
  // is routine
  const info = [];
  if (before.length > 0) {
    info.push(`${before.length} reading${before.length > 1 ? 's' : ''} before the ${isBuildupFamily ? (config.mirror ? 'shut-in of the injector' : 'shut-in') : 'start of flow'} (gauge time ${Number(t0.toPrecision(6))} hr) ${before.length > 1 ? 'are' : 'is'} excluded from the analysis series.`);
  }
  if (removedSpikes > 0) warnings.push(`${removedSpikes} outlier point${removedSpikes > 1 ? 's' : ''} removed by the spike filter.`);

  const dpToGauge = (dp) => fromM(base + s * dp);
  // WTA-U1-006 (RL5): every gauge reading is accounted for once, used or
  // left out with its reason; the report lists them
  const exclusions = {
    total: (gaugeRows || []).length,
    unreadable: (gaugeRows || []).length - all.length,
    before: {
      count: before.length,
      from: before.length ? before[0].t + t0 : NaN,
      to: before.length ? before[before.length - 1].t + t0 : NaN,
    },
    atShutIn: all.filter((r) => Math.abs(r.t) <= SHUT_IN_T_EPS_HR).length,
    spikes: spikeList,
    spikeThreshold: config.spikeTrimOn ? config.spikeThreshold : null,
    thinned: series.length - decimated.length,
    pointsPerDecade: config.pointsPerDecade,
    notAboveBase: decimated.length - points.length,
    family: config.family,
    mirror: config.mirror,
  };
  return {
    points,
    exclusions,
    pwfShutIn,
    pwfSource,
    testStartTime: t0,
    preTestPoints: before.length,
    // the readings before the test start, thinned, on the elapsed clock
    // (negative hours): the history-match plot shows them with the model
    preTest: thinRows(before, 200).map((r) => ({ time: r.t, p: r.p })),
    // gauge pressure of the period before a shut-in for a model dp counted
    // from pi: a drawdown falls below pi, an injection rises above it
    priorToGauge: (dp) => fromM(A(reservoir.pi) + (config.mirror ? 1 : -1) * dp),
    info,
    skinWithheld,
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
 * (drawdown) or Agarwal equivalent time (buildup). taOf (WT8) maps elapsed
 * time to normalized pseudo-time before the Agarwal transform when the gas
 * pseudo-time abscissa is selected; the identical map is applied to the
 * model overlay so the comparison stays apples-to-apples.
 */
export function buildLoglog({ points, config, taOf = (t) => t }) {
  if (!points?.length || !config) return [];
  const abscissa = (t) =>
    config.family === 'buildup' ? agarwalEquivalentTime(config.tp, taOf(t)) : taOf(t);
  const series = points
    .map((p) => ({ x: abscissa(p.time), y: p.dp, time: p.time }))
    .filter((p) => p.x > 0 && p.y > 0);
  const deriv = bourdetDerivative(series, { L: config.smoothingL });
  return deriv.map((d, i) => ({ x: d.x, time: series[i]?.time ?? d.x, dp: d.y, derivative: d.derivative }));
}

/**
 * How the working match was reached (tester round 2026-09-28). A regression
 * result describes the match only while the match still holds exactly the
 * fitted values of the same model on the same inputs. Moving a slider,
 * switching model or editing the data afterwards turns it back into a
 * manual match, and the regression status and its confidence intervals are
 * no longer reported. kind: 'none' | 'manual' | 'regression'.
 */
export function resolveMatchMethod({ source, fitResult, fitStale, model, matchInputs }) {
  if (source !== 'match') return { kind: 'none', note: null };
  if (!fitResult) return { kind: 'manual', note: null };
  const sameParams = fitResult.modelId === model?.id && (model?.parameters || []).every(
    (meta) => String(matchInputs?.[meta.key] ?? '') === String(fitResult.appliedInputs?.[meta.key] ?? ''),
  );
  if (sameParams && !fitStale) return { kind: 'regression', note: null };
  return {
    kind: 'manual',
    note: fitStale && sameParams
      ? 'Auto-fit was run on earlier inputs; re-run it to report the regression.'
      : 'Adjusted by hand after an auto-fit.',
  };
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

export const WellTestStudioProvider = ({ children, organizationName = '', sharingStore = null }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  // WTA-U1-011: saved_well_test_projects is under the record sharing rules
  // (migration 20261002130000, applied). With a store the picker lists my
  // projects, then those colleagues shared; a save goes through the store
  // and only while I may write (the owner, or the colleague holding the
  // check-out). Without a store every save is the plain owner save.
  const shared = useSharedSavedProjects({ table: WT_PROJECTS_TABLE, service, sharingStore });
  const canWrite = shared.canWrite;

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
  // report header identity (tester round 2026-09-28)
  const [fieldName, setFieldName] = useState('');
  const [analyst, setAnalyst] = useState('');
  // tester round 2 (2026-10-02): identification, completion, where each
  // input came from, and what the user adds to each flow period. All of it
  // lives in the project jsonb; older projects open with the defaults.
  const [identification, setIdentification] = useState(DEFAULT_IDENTIFICATION);
  const [completion, setCompletion] = useState(DEFAULT_COMPLETION);
  const [inputMeta, setInputMeta] = useState({}); // { [inputKey]: { source, correlation, note } }
  const [periodMeta, setPeriodMeta] = useState({}); // { [period start]: { choke, recovered, remark } }
  const [pvtIntake, setPvtIntake] = useState(null); // { fields: [...], text } from a Fluid Systems Studio handoff
  // WTA-U1-005: what the gauge import read (file, units, rows), so the report
  // can say whether pressures were gauge and how they became absolute.
  // null = not recorded (data typed in, or a project saved before 2026-10-04)
  const [gaugeImport, setGaugeImport] = useState(null);
  const setIdentificationField = useCallback((k, v) => setIdentification((prev) => ({ ...prev, [k]: v })), []);
  const setCompletionField = useCallback((k, v) => setCompletion((prev) => ({ ...prev, [k]: v })), []);
  const setInputMetaField = useCallback((key, k, v) => setInputMeta((prev) => setProvenanceField(prev, key, k, v)), []);
  const setPeriodMetaField = useCallback((key, k, v) => setPeriodMeta((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [k]: v } })), []);
  const [reservoirInputs, setReservoirInputs] = useState(DEFAULT_RESERVOIR);
  const [testConfig, setTestConfig] = useState(DEFAULT_TEST_CONFIG);
  const [gaugeRows, setGaugeRows] = useState([]); // [{t, p}] numbers
  const [rateRows, setRateRows] = useState([]); // [{t, q}] strings
  const [matchInputs, setMatchInputs] = useState(DEFAULT_MATCH);
  const [windows, setWindows] = useState(DEFAULT_WINDOWS);
  const [deliverabilityInputs, setDeliverabilityInputs] = useState(DEFAULT_DELIVERABILITY);
  const [notes, setNotes] = useState('');
  // WTA-U2-003: apparent skins of the well at other rates [{q (Mscf/D), skin, note}] strings
  const [rateSkinRows, setRateSkinRows] = useState([]);
  // WT8: display-layer unit system; state and engines stay oilfield always
  const [unitSystem, setUnitSystemRaw] = useState('oilfield');
  // Suite unit profile: a NEW (not yet saved or opened) workspace starts
  // from the profile's system; an explicit choice or an opened project wins
  const profileUnitSystem = useProfileSystem('welltest', WT_PROFILE_FAMILIES);
  const unitPickedRef = useRef(false);
  const setUnitSystem = useCallback(
    (v) => { unitPickedRef.current = true; setUnitSystemRaw(UNIT_SYSTEMS.includes(v) ? v : 'oilfield'); },
    [],
  );
  // WT9 RTA: production history [{t (days), q, pwf}] strings + the
  // transient-linear window bounds (days); persisted with the project
  const [rtaRows, setRtaRows] = useState([]);
  const [rtaWindows, setRtaWindows] = useState({ linMin: '', linMax: '' });
  // WTA-U1-010: what the production import read, for the read-back and the report
  const [rtaImport, setRtaImport] = useState(null);
  const setRtaWindowField = useCallback((k, v) => setRtaWindows((prev) => ({ ...prev, [k]: v })), []);

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
  const gasTable = pvtIntake?.gasTable || null;
  const reservoirSpec = useMemo(() => buildReservoirInputs(reservoirInputs, { gasTable }), [reservoirInputs, gasTable]);
  const configSpec = useMemo(() => buildTestConfig(testConfig), [testConfig]);
  const model = useMemo(() => getModel(matchInputs.modelId) || getModel('homogeneous'), [matchInputs.modelId]);

  const prepared = useMemo(
    () => prepareTestData({ gaugeRows, reservoir: reservoirSpec.reservoir, config: configSpec.config }),
    [gaugeRows, reservoirSpec, configSpec],
  );

  // WT8: normalized pseudo-time map over the gauge pressures (gas only).
  // Exact at the sample times because both the data series and the model
  // overlay evaluate on the same time grid.
  const pseudoTime = useMemo(() => {
    const r = reservoirSpec.reservoir;
    const cfg = configSpec.config;
    const active = r?.fluid === 'gas' && cfg?.abscissa === 'pseudo-time' && prepared.points.length >= 2;
    if (!active) return { active: false, taOf: (t) => t };
    const map = normalizedPseudoTime(
      prepared.points.map((p) => ({ t: p.time, p: p.p })),
      { muCtOf: r.muCtOf, muCtInitial: r.muCtInitial },
    );
    if (!map.length) return { active: false, taOf: (t) => t };
    const lookup = new Map(map.map((row) => [row.t, row.ta]));
    return { active: true, taOf: (t) => lookup.get(t) ?? t };
  }, [reservoirSpec, configSpec, prepared]);

  const loglog = useMemo(
    () => buildLoglog({ points: prepared.points, config: configSpec.config, taOf: pseudoTime.taOf }),
    [prepared, configSpec, pseudoTime],
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
      const abscissa = (t) =>
        (cfg.family === 'buildup' ? agarwalEquivalentTime(cfg.tp, pseudoTime.taOf(t)) : pseudoTime.taOf(t));
      const base = series.map((p, i) => ({ x: abscissa(times[i]), y: p.dp })).filter((p) => p.x > 0 && p.y > 0);
      const deriv = bourdetDerivative(base, { L: cfg.smoothingL });
      return deriv.map((d) => ({ x: d.x, modelDp: d.y, modelDerivative: d.derivative }));
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [matchParams, model, reservoirSpec, configSpec, prepared, pseudoTime]);

  const windowedPoints = useCallback((minKey, maxKey, auto = null) => {
    let lo = num(windows[minKey]);
    let hi = num(windows[maxKey]);
    if (auto && !Number.isFinite(lo) && !Number.isFinite(hi)) ({ min: lo, max: hi } = auto);
    return prepared.points.filter((p) =>
      (Number.isFinite(lo) ? p.time >= lo : true) && (Number.isFinite(hi) ? p.time <= hi : true));
  }, [windows, prepared]);

  // WTA-T1-001: an empty semilog window used to fit every point, storage
  // included (k 23 md on the sample against a truth of 85). With both bounds
  // empty the line now sits on the detected radial-flow regime, mapped from
  // the diagnostic abscissa (equivalent time for buildups) back to gauge
  // time; the full range is the fallback only when no radial flow is found.
  const autoSemilogWindow = useMemo(() => {
    const radial = regimes.find((r) => r.regime === 'radial');
    if (!radial) return null;
    const ts = loglog
      .filter((p) => p.x >= radial.xStart * (1 - 1e-9) && p.x <= radial.xEnd * (1 + 1e-9))
      .map((p) => p.time);
    if (ts.length < 4) return null;
    return { min: Math.min(...ts), max: Math.max(...ts) };
  }, [regimes, loglog]);
  // The sqrt(t) line always fits something; it only means linear flow when a
  // linear regime was detected or the user set its window (WTA-T1-004)
  const sqrtMeaningful = regimes.some((r) => r.regime === 'linear')
    || Number.isFinite(num(windows.sqrtMin)) || Number.isFinite(num(windows.sqrtMax));
  const semilogWindowSource = (Number.isFinite(num(windows.semilogMin)) || Number.isFinite(num(windows.semilogMax)))
    ? 'manual'
    : (autoSemilogWindow ? 'radial' : 'full');

  // Straight-line analyses on the (windowed) radial data, in analysis space
  // (pa: m(p) for gas, mirrored for injection/falloff); p1hr and p* are
  // converted back to gauge psi before leaving this memo.
  const semilogResult = useMemo(() => {
    if (!reservoirSpec.reservoir || !configSpec.config) return null;
    const cfg = configSpec.config;
    const pts = windowedPoints('semilogMin', 'semilogMax', autoSemilogWindow);
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
      // the elapsed-time window the line was fitted on (report plot marks it)
      windowMin: pts[0].time,
      windowMax: pts[pts.length - 1].time,
      // skin needs the pressure at the instant of shut-in (prepared.skinWithheld)
      skin: prepared.skinWithheld ? null : raw.skin,
      // analysis-space line anchors (for drawing the fitted line), plus the
      // gauge-psi conversions everything user-facing reports
      p1hrA: raw.p1hr,
      pStarA: raw.pStar,
      p1hr: Number.isFinite(raw.p1hr) ? prepared.fromAnalysis(raw.p1hr) : raw.p1hr,
      pStar: Number.isFinite(raw.pStar) ? prepared.fromAnalysis(raw.pStar) : raw.pStar,
    };
  }, [reservoirSpec, configSpec, prepared, windowedPoints, autoSemilogWindow]);

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

  // WT9 RTA: everything derives from the production rows and the reservoir
  // spec. The Bourdet derivative runs on the rate-normalized series against
  // material-balance time; the FMB is oil or gas by fluid.
  const rtaResult = useMemo(() => {
    const r = reservoirSpec.reservoir;
    const rows = prepareProductionRows(rtaRows);
    if (!r || rows.length < 3) return null;
    const rowsTe = materialBalanceTime(rows);
    const isGas = r.fluid === 'gas';
    const paOf = isGas ? r.mOfP : (v) => v;
    const series = rateNormalizedSeries(rowsTe, { pi: r.pi, paOf });
    const deriv = bourdetDerivative(series.map((p) => ({ x: p.x, y: p.y })), { L: 0.15 });
    const loglogRta = deriv.map((d, i) => ({ x: d.x, y: d.y, derivative: d.derivative, t: series[i]?.t }));
    const fmb = isGas
      ? flowingMaterialBalanceGas({ rowsTe, pi: r.pi, pvt: r.pvt, ctI: r.ct })
      : flowingMaterialBalanceOil({ rowsTe, pi: r.pi, ct: r.ct });
    const lo = num(rtaWindows.linMin);
    const hi = num(rtaWindows.linMax);
    const linRows = rows.filter((p) =>
      (Number.isFinite(lo) ? p.t >= lo : true) && (Number.isFinite(hi) ? p.t <= hi : true));
    const linear = linRows.length >= 3
      ? transientLinearAnalysis({
        rows: linRows, pi: r.pi, B: r.B, mu: r.mu, phi: r.phi, ct: r.ct, h: r.h, paOf,
      })
      : null;
    return { rows, rowsTe, series, loglogRta, fmb, linear, isGas };
  }, [reservoirSpec, rtaRows, rtaWindows]);

  // WTA-U2-003: rate-dependent skin. Route 1, the apparent skins of two or
  // more rates on a line (engine rateDependentSkinFit); route 2, the
  // pseudo-pressure LIT b as the non-Darcy coefficient F (Ahmed eq. 6-159).
  // Computed after derivedKpis below (it needs this test's k and s').
  // Headline quantities derived from the working match (falls back to the
  // semilog answer when no match parameters are set).
  const derivedKpis = useMemo(() => {
    const r = reservoirSpec.reservoir;
    if (!r) return null;
    // WTA-T1-002: the untouched default match (k 50, skin 0) is a starting
    // point for the sliders, not an interpretation, so until the match has
    // been moved or fitted the derived values come from the semilog line
    const matchTouched = !!fitResult || Object.keys(DEFAULT_MATCH).some((key) => String(matchInputs[key] ?? '') !== String(DEFAULT_MATCH[key]))
      || Object.keys(matchInputs).some((key) => !(key in DEFAULT_MATCH));
    const useMatch = matchTouched && matchParams;
    const source = useMatch ? 'match' : (semilogResult?.k > 0 ? 'semilog' : null);
    const k = useMatch ? matchParams.k : semilogResult?.k;
    const skin = prepared.skinWithheld ? null : (useMatch ? matchParams.skin : semilogResult?.skin);
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
      source,
      k, skin, kh: k * r.h,
      ri: Number.isFinite(lastTime)
        ? radiusOfInvestigation({ k, tHours: lastTime, phi: r.phi, mu: r.mu, ct: r.ct })
        : NaN,
      dpSkin,
      flowEfficiency: fe,
      cd: useMatch && matchParams?.C != null && Number.isFinite(matchParams.C)
        ? matchParams.C * toDimensionlessGroups({ ...r, k }).cdPerBblPsi
        : NaN,
    };
  }, [reservoirSpec, matchParams, matchInputs, fitResult, semilogResult, prepared]);

  const rateSkin = useMemo(() => {
    const r = reservoirSpec.reservoir;
    if (!r || r.fluid !== 'gas') return null;
    const pts = rateSkinRows.map((row) => ({ q: num(row.q), skin: num(row.skin) })).filter((x) => x.q > 0 && Number.isFinite(x.skin));
    const fit = rateDependentSkinFit(pts);
    const lit = deliverabilityResult?.method === 'pseudo-pressure' && deliverabilityResult.lit?.b > 0 && derivedKpis?.k > 0
      ? nonDarcyDFromF({ F: deliverabilityResult.lit.b, k: derivedKpis.k, h: r.h, tempR: r.tempR })
      : NaN;
    const source = fit.ok ? 'multi-rate' : (Number.isFinite(lit) ? 'lit' : null);
    const D = source === 'multi-rate' ? fit.D : (source === 'lit' ? lit : NaN);
    const sApparent = Number.isFinite(derivedKpis?.skin) ? derivedKpis.skin : NaN;
    const Dq = Number.isFinite(D) ? D * r.q : NaN;
    return {
      fit, points: pts, litD: lit, source, D, q: r.q, Dq,
      // the true skin of THIS test: s' - D q (route 1 also gives its own intercept s)
      trueSkin: Number.isFinite(sApparent) && Number.isFinite(Dq) ? sApparent - Dq : NaN,
      apparentSkin: sApparent,
    };
  }, [reservoirSpec, rateSkinRows, deliverabilityResult, derivedKpis]);

  // kh and CD of the working match itself, for the Match tab
  const matchKpis = useMemo(() => {
    const r = reservoirSpec.reservoir;
    if (!r || !matchParams) return null;
    return {
      kh: matchParams.k * r.h,
      cd: Number.isFinite(matchParams.C) ? matchParams.C * toDimensionlessGroups({ ...r, k: matchParams.k }).cdPerBblPsi : NaN,
    };
  }, [reservoirSpec, matchParams]);

  // WTA-U2-002: the storage on both sides of a changing-storage match, for
  // the Match tab, the Report tab and the PDF
  const changingStorage = useMemo(() => {
    const r = reservoirSpec.reservoir;
    if (!r || !matchParams) return [];
    return changingStorageRows({ model, params: matchParams, reservoir: r, groups: toDimensionlessGroups({ ...r, k: matchParams.k }), unitSystem });
  }, [model, matchParams, reservoirSpec, unitSystem]);

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
      const appliedInputs = Object.fromEntries(model.parameters.map((meta) => [
        meta.key,
        meta.logScale ? fit.params[meta.key].toPrecision(4) : fit.params[meta.key].toFixed(2),
      ]));
      setFitResult({
        ...fit, testType: cfg.testType, ranAt: new Date().toISOString(), modelId: model.id, appliedInputs,
      });
      hasFitResult.current = true;
      setFitStale(false);
      setMatchInputs((prev) => ({ ...prev, ...appliedInputs }));
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

  const matchMethod = useMemo(
    () => resolveMatchMethod({ source: derivedKpis?.source, fitResult, fitStale, model, matchInputs }),
    [derivedKpis, fitResult, fitStale, model, matchInputs],
  );

  // ---- Report model (tester round 2): everything the report prints about
  // the inputs, the completion and the operations, built once here so the
  // Report tab and the PDF read the same rows.
  const skinBreakdown = useMemo(() => buildSkinBreakdown({
    totalSkin: derivedKpis?.skin,
    reservoir: reservoirSpec.reservoir,
    completion,
    kvkhInput: reservoirInputs.kvkh,
    isGas: reservoirInputs.fluid === 'gas',
    rateSkin,
  }), [derivedKpis, reservoirSpec, completion, reservoirInputs.kvkh, reservoirInputs.fluid, rateSkin]);

  const inputsTable = useMemo(() => buildInputsTable({
    reservoirInputs, reservoirSpec, completion, inputMeta, unitSystem, pvtIntake,
  }), [reservoirInputs, reservoirSpec, completion, inputMeta, unitSystem, pvtIntake]);

  const flowSummary = useMemo(() => buildFlowSummary({
    rateRows, config: configSpec.config, reservoir: reservoirSpec.reservoir, prepared, periodMeta, unitSystem,
  }), [rateRows, configSpec, reservoirSpec, prepared, periodMeta, unitSystem]);

  const identificationRows = useMemo(() => buildIdentificationRows({
    projectName, wellName, fieldName, analyst, identification, completion, config: configSpec.config, unitSystem,
    organizationName, build: buildLabel(),
  }), [projectName, wellName, fieldName, analyst, identification, completion, configSpec, unitSystem, organizationName]);

  // WTA-U1-005 and -006: the pressure basis and the readings left out, once
  // for the Report tab and the PDF
  // WTA-U2-004: the correction to datum with the user's gradient (none by default)
  const datum = useMemo(() => completionDatumCorrection(completion), [completion]);
  const pressureBasisRows = useMemo(() => buildPressureBasisRows({
    completion, gaugeImport, unitSystem, datum,
    pStar: configSpec.config?.family === 'buildup' ? semilogResult?.pStar : NaN,
    pwfShutIn: prepared.pwfShutIn,
  }), [completion, gaugeImport, unitSystem, datum, configSpec, semilogResult, prepared]);
  const dataUse = useMemo(() => buildDataUseRows({ prepared, unitSystem }), [prepared, unitSystem]);
  const limitsRows = useMemo(() => buildLimitsRows({
    reservoir: reservoirSpec.reservoir, config: configSpec.config, model, prepared, datum,
  }), [reservoirSpec, configSpec, model, prepared, datum]);

  // History match (model against the gauge over the whole record) and the
  // test overview: one calculation, drawn on the tabs and in the PDF.
  const historyMatch = useMemo(() => buildHistoryMatch({
    prepared, matchParams, model, reservoir: reservoirSpec.reservoir, config: configSpec.config, unitSystem,
  }), [prepared, matchParams, model, reservoirSpec, configSpec, unitSystem]);

  const overview = useMemo(() => buildOverviewData({
    gaugeRows, rateRows, config: configSpec.config, reservoir: reservoirSpec.reservoir, unitSystem,
  }), [gaugeRows, rateRows, configSpec, reservoirSpec, unitSystem]);

  // Data or configuration edits invalidate an existing fit result (the match
  // parameters it produced stay in the working match).
  // Only inputs the analysis reads count. The report-only fields added in
  // tester round 2 (Sw as a record, API gravity, GOR, kv/kh, the source
  // notes) do not move the fit, so editing them must not withdraw it.
  const analysisInputsKey = useMemo(() => {
    const r = reservoirSpec.reservoir;
    if (!r) return `invalid:${reservoirSpec.error || ''}`;
    const table = r.pvtSource?.kind === 'fluid-table' ? `table:${r.pvtSource.rows}:${r.pvtSource.pMin}:${r.pvtSource.pMax}:${r.pvtSource.origin}` : '';
    return [r.fluid, r.h, r.phi, r.rw, r.B, r.mu, r.ct, r.q, r.pi, r.tempR ?? '', r.gasGravity ?? '', r.zMethod ?? '', table].join('|');
  }, [reservoirSpec]);
  useEffect(() => {
    if (hasFitResult.current) setFitStale(true);
  }, [gaugeRows, analysisInputsKey, testConfig]);

  // ---- PVT from Fluid Systems Studio (router state or read by id) ----
  // WTA-U2-001: one door for the first intake and for "Read it again" on
  // the shared card. The handoff's values go into the inputs, the record
  // (with the gas table when the block carries one) is kept with the
  // project. Returns the intake, or null when the handoff held nothing.
  const takeFluidPvt = useCallback((fluid, how = 'received from Fluid Systems Studio') => {
    const intake = pvtIntakeFromBackbone(fluid);
    if (!intake) return null;
    setReservoirInputs((prev) => ({ ...prev, ...intake.patch }));
    setPvtIntake(intake.intake);
    addNotification(`Fluid properties ${how}: ${intake.applied.join(', ')} applied. Review total compressibility manually.`, 'success');
    return intake;
  }, [addNotification]);

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
    // a sample completion so the report's skin split and identification
    // have something to show: 30 ft of the 45 ft pay perforated from its top
    setCompletion({ ...DEFAULT_COMPLETION, perfTopMd: '9850', perfBaseMd: '9880', payTopMd: '9850' });
    setIdentification({ ...DEFAULT_IDENTIFICATION, zone: 'Sample sand', operation: 'production' });
    setInputMeta({});
    setPeriodMeta({});
    setPvtIntake(null);
    setGaugeImport({ sample: true, pressureUnit: 'psia', timeUnit: 'hr', count: sample.gaugeRows.length, skipped: 0 });
    addNotification('Sample buildup loaded (synthetic homogeneous test, tp = 36 hr).', 'success');
  }, [addNotification]);

  // WTA-U1-012: the wta-1 record of the interpretation on screen, written
  // into every save so other apps read the results by id (lib/wellTestSource)
  const wtaRecord = useMemo(() => buildWtaRecord({
    reservoirSpec, derivedKpis, configSpec, semilogResult, matchMethod, fitResult, model, skinBreakdown, prepared,
    completion, reservoirInputs, identification, projectName, wellName, fieldName, analyst, currentProjectId, rateSkin, datum,
  }), [datum, reservoirSpec, derivedKpis, configSpec, semilogResult, matchMethod, fitResult, model, skinBreakdown, prepared,
    completion, reservoirInputs, identification, projectName, wellName, fieldName, analyst, currentProjectId, rateSkin]);

  // ---- Project persistence ----
  const serializeInputs = useCallback(() => ({
    id: currentProjectId,
    name: projectName,
    wellName,
    fieldName,
    analyst,
    identification,
    completion,
    inputMeta,
    periodMeta,
    pvtIntake,
    gaugeImport,
    reservoirInputs,
    testConfig,
    gaugeRows,
    rateRows,
    matchInputs,
    windows,
    deliverabilityInputs,
    notes,
    rateSkinRows,
    unitSystem,
    rtaRows,
    rtaWindows,
    rtaImport,
    wta: wtaRecord ? { ...wtaRecord, computed_at: new Date().toISOString() } : null,
    modified: new Date().toISOString(),
  }), [wtaRecord, currentProjectId, projectName, wellName, fieldName, analyst, identification, completion, inputMeta, periodMeta, pvtIntake, gaugeImport, reservoirInputs, testConfig, gaugeRows, rateRows, matchInputs, windows, deliverabilityInputs, notes, rateSkinRows, unitSystem, rtaRows, rtaWindows, rtaImport]);

  const hydrate = useCallback((payload) => {
    setWellName(payload?.wellName || '');
    setFieldName(payload?.fieldName || '');
    setAnalyst(payload?.analyst || '');
    // projects saved before tester round 2 carry none of these: defaults
    setIdentification({ ...DEFAULT_IDENTIFICATION, ...(payload?.identification || {}) });
    setCompletion({ ...DEFAULT_COMPLETION, ...(payload?.completion || {}) });
    setInputMeta(provenanceFromPayload(payload));
    setPeriodMeta(payload?.periodMeta && typeof payload.periodMeta === 'object' ? payload.periodMeta : {});
    setPvtIntake(payload?.pvtIntake && Array.isArray(payload.pvtIntake.fields) ? payload.pvtIntake : null);
    setGaugeImport(payload?.gaugeImport && typeof payload.gaugeImport === 'object' ? payload.gaugeImport : null);
    // WTA-U1-003: a payload with reservoir inputs but no z method was saved
    // before the method existed, and was interpreted on Papay; it keeps it
    const savedInputs = payload?.reservoirInputs || {};
    const zKept = payload?.reservoirInputs && !savedInputs.gasZMethod ? { gasZMethod: 'papay' } : {};
    setReservoirInputs({ ...DEFAULT_RESERVOIR, ...savedInputs, ...zKept });
    setTestConfig({ ...DEFAULT_TEST_CONFIG, ...(payload?.testConfig || {}) });
    setGaugeRows(Array.isArray(payload?.gaugeRows) ? payload.gaugeRows : []);
    setRateRows(Array.isArray(payload?.rateRows) ? payload.rateRows : []);
    setMatchInputs({ ...DEFAULT_MATCH, ...(payload?.matchInputs || {}) });
    setWindows({ ...DEFAULT_WINDOWS, ...(payload?.windows || {}) });
    setDeliverabilityInputs({ ...DEFAULT_DELIVERABILITY, ...(payload?.deliverabilityInputs || {}) });
    setNotes(payload?.notes || '');
    setRateSkinRows(Array.isArray(payload?.rateSkinRows) ? payload.rateSkinRows : []);
    // a saved project keeps the system it was saved with
    setUnitSystemRaw(UNIT_SYSTEMS.includes(payload?.unitSystem) ? payload.unitSystem : 'oilfield');
    setRtaRows(Array.isArray(payload?.rtaRows) ? payload.rtaRows : []);
    setRtaWindows({ linMin: '', linMax: '', ...(payload?.rtaWindows || {}) });
    setRtaImport(payload?.rtaImport && typeof payload.rtaImport === 'object' ? payload.rtaImport : null);
    setFitResult(null);
    hasFitResult.current = false;
    setFitStale(false);
  }, []);

  const refreshProjects = useCallback(async () => {
    const list = await shared.refreshList();
    setProjects(list);
    return list;
  }, [shared.refreshList]); // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    if (!profileUnitSystem || hydrated || currentProjectId || unitPickedRef.current) return;
    setUnitSystemRaw(profileUnitSystem);
  }, [profileUnitSystem, hydrated, currentProjectId]);

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

  // An exported project JSON read back into the workspace (not saved until
  // the user saves it or it lands in an open project's autosave).
  const importProjectPayload = useCallback((payload) => {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.gaugeRows)) {
      addNotification('That file is not a Well Test Analysis Studio project export.', 'error');
      return false;
    }
    hydrate(payload);
    addNotification(`Imported "${payload.name || 'project'}" into the workspace. Save it to keep it.`, 'success');
    return true;
  }, [hydrate, addNotification]);

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
      return false;
    }
    setIsSaving(true);
    try {
      const res = await shared.write(currentProjectId, serializeInputs());
      if (!res.ok) {
        setSaveError(res.readOnly ? 'Read-only' : 'Save failed');
        addNotification(res.message, res.readOnly ? 'info' : 'error');
        return false;
      }
      setLastSaveTime(new Date());
      setSaveError(null);
      return true;
    } catch (e) {
      console.error(e);
      setSaveError('Save failed');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [currentProjectId, serializeInputs, addNotification, shared.write]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Save a copy": the project on screen as my own new project
  const saveCopy = useCallback(async () => {
    const name = shared.copyNameFor(projectName || 'Well test project');
    const id = uuidv4();
    try {
      await service.save(id, { ...serializeInputs(), id, name });
      await refreshProjects();
      await openProject(id);
      addNotification(`Saved a copy as "${name}"`, 'success');
      return id;
    } catch (e) {
      addNotification(`Could not save a copy: ${e.message}`, 'error');
      return null;
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
  }, [wellName, fieldName, analyst, identification, completion, inputMeta, periodMeta, pvtIntake, gaugeImport, reservoirInputs, testConfig, gaugeRows, rateRows, matchInputs, windows, deliverabilityInputs, notes, rateSkinRows, unitSystem, rtaRows, rtaWindows, rtaImport, currentProjectId, hydrated, canWrite]);

  const value = {
    // shell plumbing
    notifications, addNotification, removeNotification,
    organizationName,
    // projects
    // my own projects (with a store), then those shared with me
    projects: shared.projects.length || !projects.length ? shared.projects : projects,
    currentProjectId, projectName,
    createProject, openProject, deleteProject, manualSave, saveCopy,
    sharedProjects: shared.sharedProjects,
    projectRow: shared.projectRow, sharing: shared.sharing, viewingShared: shared.viewingShared, canWrite,
    isSaving, saveError, lastSaveTime,
    // inputs
    wellName, setWellName,
    fieldName, setFieldName,
    analyst, setAnalyst,
    identification, setIdentificationField, setIdentification,
    completion, setCompletionField, setCompletion,
    inputMeta, setInputMetaField,
    periodMeta, setPeriodMetaField,
    pvtIntake, setPvtIntake, takeFluidPvt,
    gaugeImport, setGaugeImport,
    serializeInputs, importProjectPayload,
    reservoirInputs, setReservoirField,
    testConfig, setTestField,
    gaugeRows, setGaugeRows,
    rateRows, setRateRows,
    matchInputs, setMatchField,
    windows, setWindowField,
    notes, setNotes,
    deliverabilityInputs, setDeliverabilityField, setDeliverabilityRows,
    rateSkinRows, setRateSkinRows, rateSkin,
    unitSystem, setUnitSystem, profileUnitSystem,
    rtaRows, setRtaRows,
    rtaWindows, setRtaWindowField,
    rtaImport, setRtaImport,
    // derived
    reservoirSpec, configSpec, model,
    prepared, loglog, regimes, flowPeriods, pseudoTime, rtaResult,
    autoSemilogWindow, semilogWindowSource, matchKpis, sqrtMeaningful,
    matchParams, modelSeries, changingStorage,
    semilogResult, pssResult, sqrtResult, derivedKpis,
    multiRateResult, deliverabilityResult,
    // report model and shared plot series (tester round 2)
    skinBreakdown, inputsTable, flowSummary, identificationRows, historyMatch, overview,
    pressureBasisRows, dataUse, limitsRows, wtaRecord, datum,
    // auto-fit
    fitResult, isFitting, fitStale, runAutoFit, matchMethod,
    // sample
    loadSampleTest,
  };

  return <WellTestStudioContext.Provider value={value}>{children}</WellTestStudioContext.Provider>;
};
