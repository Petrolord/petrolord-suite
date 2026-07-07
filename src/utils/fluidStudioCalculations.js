/**
 * Fluid Systems & Flow Behavior Studio — client-side engine (Phase 1)
 *
 * Pure, synchronous, framework-free. No Supabase, no React. This is the single
 * source of truth the app recomputes on every keystroke via useMemo.
 *
 * It orchestrates the audited black-oil correlation primitives in
 * `pvtCalculations.js` (Standing / Vasquez-Beggs / Glaso for Rs & Bo,
 * Beggs-Robinson / Beal-Cook-Spillman for oil viscosity) and adds the pieces
 * those primitives lack: a bubble-point solve consistent with the chosen Rs
 * correlation, a real gas Z-factor (Papay + Sutton pseudo-criticals), gas FVF
 * and viscosity (Lee-Gonzalez-Eakin), oil compressibility (Vasquez-Beggs) and
 * the undersaturated oil-viscosity rise, plus a black-oil separator-train
 * staged-liberation flash.
 *
 * PHASE 1 SCOPE: single black-oil stream (Stream A) + separator train. Blending,
 * flow assurance, batch runs, EOS/composition flash and persistence are deferred;
 * clean seams are noted inline.
 */

import { pvtCalcs } from './pvtCalculations';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Coerce a raw string/number to a finite number, else fallback. */
export const num = (v, fallback = 0) => {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const STOCK_TANK = { pressure: 14.7, temperature: 60 }; // psia, °F

// Correlations flagged as non-standard / suspect in the pvtCalculations audit.
// They remain selectable but the engine surfaces a warning so results are honest.
const SUSPECT_CORRELATIONS = {
  glaso: 'Glaso Rs uses a non-standard rearrangement — verify against lab PVT before use.',
  beal_cook_spillman:
    'Beal-Cook-Spillman saturated viscosity is a simplified form — Beggs-Robinson is the audited default.',
};

// ---------------------------------------------------------------------------
// Input normalization
// ---------------------------------------------------------------------------

/**
 * Build the normalized Fluid object from the raw UI inputs.
 * Maps the UI's black-oil keys (gasSg, gor) to engine keys (gasGravity, rsb).
 */
export const normalizeFluid = (inputs) => {
  const bo = inputs?.streamA?.blackOil ?? {};
  const corr = inputs?.correlations ?? {};
  const pbRaw = bo.pb;
  return {
    api: num(bo.api),
    gasGravity: num(bo.gasSg),
    temp: num(bo.temp),
    rsb: num(bo.gor),
    salinity: num(bo.salinity),
    // null => auto-solve from Rsb; a finite value overrides the solve.
    pb: pbRaw === '' || pbRaw === null || pbRaw === undefined ? null : num(pbRaw),
    correlations: {
      pb_rs_bo: corr.pb_rs_bo || 'standing',
      viscosity: corr.viscosity || 'beggs_robinson',
    },
    feed: { oilRate: num(inputs?.feed?.oilRate, 1000) },
  };
};

// ---------------------------------------------------------------------------
// PVT primitives (dispatch + new physics the util lacks)
// ---------------------------------------------------------------------------

/** Solution GOR at pressure p for the selected correlation (scf/STB). */
export const rsAt = (p, fluid) => {
  const { api, gasGravity, temp, correlations } = fluid;
  switch (correlations.pb_rs_bo) {
    case 'vasquez_beggs':
      return pvtCalcs.vasquez_beggs_rs(p, api, gasGravity, temp);
    case 'glaso':
      return pvtCalcs.glaso_rs(p, api, gasGravity, temp);
    case 'standing':
    default:
      return pvtCalcs.standing_rs(p, api, gasGravity, temp);
  }
};

/** Oil FVF for a given Rs and the selected correlation (rb/STB). */
export const boAt = (rs, fluid) => {
  const { api, gasGravity, temp, correlations } = fluid;
  switch (correlations.pb_rs_bo) {
    case 'vasquez_beggs':
      return pvtCalcs.vasquez_beggs_bo(rs, api, gasGravity, temp);
    case 'glaso':
      return pvtCalcs.glaso_bo(rs, api, gasGravity, temp);
    case 'standing':
    default:
      return pvtCalcs.standing_bo(rs, api, gasGravity, temp);
  }
};

/** Saturated (bubble-point) oil viscosity at a given Rs (cp). */
export const muObAt = (rs, fluid) => {
  const { api, temp, correlations } = fluid;
  if (correlations.viscosity === 'beal_cook_spillman') {
    return pvtCalcs.beal_cook_spillman_viscosity(api, temp, true, null, rs);
  }
  return pvtCalcs.beggs_robinson_viscosity(api, temp, true, rs);
};

/**
 * Bubble-point pressure consistent with the chosen Rs correlation: the pressure
 * at which Rs(p) equals the input solution GOR (Rsb). Bisection over a physical
 * bracket; falls back to Standing's explicit Pb if Rsb is unreachable in range.
 */
export const solveBubblePoint = (fluid) => {
  const target = fluid.rsb;
  if (!(target > 0)) return 14.7;

  let lo = 14.7;
  let hi = 15000;
  const rsLo = rsAt(lo, fluid);
  const rsHi = rsAt(hi, fluid);

  // If the correlation can't reach Rsb even at 15000 psia (or is non-monotonic
  // at the low end), fall back to Standing's explicit bubble-point correlation.
  if (!(rsHi >= target) || !(rsLo <= target)) {
    const pb = pvtCalcs.standing_pb(target, fluid.api, fluid.gasGravity, fluid.temp);
    return Math.min(Math.max(pb, 14.7), 15000);
  }

  for (let i = 0; i < 60; i += 1) {
    const mid = 0.5 * (lo + hi);
    const rsMid = rsAt(mid, fluid);
    if (Math.abs(rsMid - target) / target < 1e-4) return mid;
    if (rsMid < target) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
};

/** Sutton (1985) gas pseudo-critical properties from gas gravity. */
const suttonPseudoCriticals = (gasGravity) => ({
  ppc: 756.8 - 131.0 * gasGravity - 3.6 * gasGravity * gasGravity, // psia
  tpc: 169.2 + 349.5 * gasGravity - 74.0 * gasGravity * gasGravity, // °R
});

/** Gas Z-factor via the Papay correlation (dimensionless). */
export const zFactor = (p, tempF, gasGravity) => {
  const { ppc, tpc } = suttonPseudoCriticals(gasGravity);
  const ppr = p / ppc;
  const tpr = (tempF + 460) / tpc;
  if (!(tpr > 0)) return 0.9;
  const z =
    1 -
    (3.52 * ppr) / Math.pow(10, 0.9813 * tpr) +
    (0.274 * ppr * ppr) / Math.pow(10, 0.8157 * tpr);
  // Clamp to a physical band; Papay drifts outside its fit range.
  return Math.min(Math.max(z, 0.25), 1.15);
};

/** Gas FVF (rb/scf). Bg = 0.00504 · Z · T[°R] / p. */
export const bgAt = (p, tempF, z) => (p > 0 ? (0.00504 * z * (tempF + 460)) / p : 0);

/** Gas viscosity via Lee-Gonzalez-Eakin (cp). */
export const muGas = (p, tempF, gasGravity, z) => {
  const tR = tempF + 460;
  const M = 28.97 * gasGravity; // apparent molecular weight
  const K = ((9.4 + 0.02 * M) * Math.pow(tR, 1.5)) / (209 + 19 * M + tR);
  const X = 3.5 + 986 / tR + 0.01 * M;
  const Y = 2.4 - 0.2 * X;
  const rhoG = (1.4935e-3 * p * M) / (z * tR); // g/cm³
  return 1e-4 * K * Math.exp(X * Math.pow(rhoG, Y));
};

/** Undersaturated oil isothermal compressibility (1/psi), Vasquez-Beggs. */
export const coAt = (fluid, p) => {
  const { rsb, temp, gasGravity, api } = fluid;
  const co =
    (-1433 + 5 * rsb + 17.2 * temp - 1180 * gasGravity + 12.61 * api) / (1e5 * Math.max(p, 1));
  return Math.max(co, 1e-6);
};

/**
 * Undersaturated oil viscosity above the bubble point (cp): viscosity rises with
 * pressure. Vasquez-Beggs (1980): μo = μob · (p/pb)^m.
 */
export const undersaturatedMuO = (muob, p, pb) => {
  const m = 2.6 * Math.pow(p, 1.187) * Math.exp(-11.513 - 8.98e-5 * p);
  return muob * Math.pow(p / pb, m);
};

// ---------------------------------------------------------------------------
// PVT table
// ---------------------------------------------------------------------------

/** Assemble one PVT row at pressure p for a fluid whose bubble point is pb. */
export const computePvtRow = (p, fluid, pb) => {
  const saturated = p <= pb;
  const z = zFactor(p, fluid.temp, fluid.gasGravity);

  // Solution GOR: capped at Rsb at/above the bubble point.
  const rs = saturated ? Math.min(rsAt(p, fluid), fluid.rsb) : fluid.rsb;

  // Bubble-point anchors (Rs = Rsb).
  const boPb = boAt(fluid.rsb, fluid);
  const muobPb = muObAt(fluid.rsb, fluid);

  let bo;
  let muO;
  let co = null;
  if (saturated) {
    bo = boAt(rs, fluid);
    muO = muObAt(rs, fluid);
  } else {
    co = coAt(fluid, p);
    bo = boPb * Math.exp(-co * (p - pb)); // undersaturated shrinkage
    muO = undersaturatedMuO(muobPb, p, pb); // rises above Pb
  }

  return {
    pressure: Math.round(p),
    Rs: Number(Math.max(0, rs).toFixed(2)),
    Bo: Number(bo.toFixed(4)),
    Bg: Number(bgAt(p, fluid.temp, z).toFixed(6)),
    Z: Number(z.toFixed(4)),
    mu_o: Number(muO.toFixed(4)),
    mu_g: Number(muGas(p, fluid.temp, fluid.gasGravity, z).toFixed(5)),
    co: co === null ? null : Number(co.toExponential(3)),
    phase: saturated ? 'saturated' : 'undersaturated',
  };
};

/**
 * Full PVT table (descending pressure) + bubble-point KPIs.
 * The grid always includes an exact node at Pb so charts anchor cleanly.
 */
export const computePvtTable = (fluid) => {
  const pb = fluid.pb ?? solveBubblePoint(fluid);
  const sweep = fluid.sweep ?? {};
  const pMin = num(sweep.pMin, 14.7);
  const pMax = num(sweep.pMax, Math.max(pb * 1.4, pb + 2000));
  const nPoints = Math.max(8, Math.round(num(sweep.nPoints, 40)));

  const pressures = new Set([pMin, pMax, pb, 14.7]);
  const step = (pMax - pMin) / (nPoints - 1);
  for (let i = 0; i < nPoints; i += 1) pressures.add(pMin + i * step);

  const table = [...pressures]
    .filter((p) => p >= 14.7 && p <= pMax + 1e-6)
    .sort((a, b) => b - a)
    .map((p) => computePvtRow(p, fluid, pb));

  const kpis = {
    pb: Number(pb.toFixed(0)),
    rsb: Number(fluid.rsb.toFixed(1)),
    bo_at_pb: Number(boAt(fluid.rsb, fluid).toFixed(4)),
    mu_o_at_pb: Number(muObAt(fluid.rsb, fluid).toFixed(4)),
    bg_at_pb: Number(bgAt(pb, fluid.temp, zFactor(pb, fluid.temp, fluid.gasGravity)).toFixed(6)),
    z_at_pb: Number(zFactor(pb, fluid.temp, fluid.gasGravity).toFixed(4)),
    co_at_pb: Number(coAt(fluid, pb).toExponential(3)),
    api: fluid.api,
    gasSg: fluid.gasGravity,
    temp: fluid.temp,
  };

  return { table, kpis, pb };
};

// ---------------------------------------------------------------------------
// Separator-train flash (black-oil staged liberation)
// ---------------------------------------------------------------------------

/**
 * Black-oil staged-liberation GOR partition (empirical, NOT an EOS/K-value flash).
 * The feed enters the first stage holding all solution gas (Rsb). Each stage
 * retains the solution GOR the correlation predicts at that stage's (P,T); the
 * difference is liberated. The implicit stock-tank stage liberates the remainder
 * so the partition telescopes exactly to Rsb.
 */
export const flashSeparatorTrain = (fluid, stages, pb) => {
  const oilRate = fluid.feed?.oilRate ?? 1000;

  const enabled = (stages || [])
    .filter((s) => s && s.enabled)
    .map((s) => ({ pressure: num(s.pressure), temperature: num(s.temperature) }))
    .filter((s) => s.pressure > 0)
    .sort((a, b) => b.pressure - a.pressure);

  // Always finish at stock-tank conditions.
  const train = [...enabled];
  const last = train[train.length - 1];
  if (!last || last.pressure > STOCK_TANK.pressure + 1e-6) train.push({ ...STOCK_TANK });

  const stageRows = [];
  let rsIn = fluid.rsb;
  train.forEach((s, i) => {
    const isStockTank = i === train.length - 1;
    const stageFluid = { ...fluid, temp: s.temperature };
    // Retained solution gas at this stage's P,T (never more than what entered).
    // The final stock-tank stage liberates everything remaining so the train
    // telescopes exactly to Rsb.
    const rsOut = isStockTank ? 0 : Math.min(Math.max(rsAt(s.pressure, stageFluid), 0), rsIn);
    const gasLiberated = Math.max(0, rsIn - rsOut);
    stageRows.push({
      index: i,
      name: isStockTank ? 'Stock Tank' : `Sep ${i + 1}`,
      pressure: s.pressure,
      temperature: s.temperature,
      rs_in: Number(rsIn.toFixed(1)),
      rs_out: Number(rsOut.toFixed(1)),
      gas_liberated: Number(gasLiberated.toFixed(1)),
      gas_gravity: Number(fluid.gasGravity.toFixed(3)), // per-stage EOS seam
      gas_rate: Number(((gasLiberated * oilRate) / 1000).toFixed(1)), // Mscf/d
      bo_stage: Number(boAt(rsOut, stageFluid).toFixed(4)),
    });
    rsIn = rsOut;
  });

  const separatorGor = stageRows
    .filter((s) => s.name !== 'Stock Tank')
    .reduce((sum, s) => sum + s.gas_liberated, 0);
  const stockTankGor = stageRows.find((s) => s.name === 'Stock Tank')?.gas_liberated ?? 0;
  const totalGasRate = stageRows.reduce((sum, s) => sum + s.gas_rate, 0);

  const boSingleStage = boAt(fluid.rsb, fluid); // single flash to stock tank at Pb
  // Multistage separation shrinks the oil less than a single flash, so stock-tank
  // Bo is lower. Approximated (NOT rigorous) as a modest per-separator-stage
  // benefit; depends on stage count so the ordering is non-tautological.
  const nSeparators = stageRows.filter((s) => s.name !== 'Stock Tank').length;
  const stagingBenefit = Math.min(0.015 * nSeparators, 0.08);
  const boMultistage = 1 + (boSingleStage - 1) * (1 - stagingBenefit);

  return {
    stages: stageRows,
    totals: {
      separator_gor: Number(separatorGor.toFixed(1)),
      stock_tank_gor: Number(stockTankGor.toFixed(1)),
      total_gor: Number((separatorGor + stockTankGor).toFixed(1)), // == Rsb
      bo_single_stage: Number(boSingleStage.toFixed(4)),
      bo_multistage_approx: Number(boMultistage.toFixed(4)),
      stock_tank_oil_rate: Number(oilRate.toFixed(0)),
      total_gas_rate: Number(totalGasRate.toFixed(1)),
      surface_gor: Number(((totalGasRate * 1000) / Math.max(oilRate, 1)).toFixed(1)),
    },
  };
};

// ---------------------------------------------------------------------------
// Fluid backbone (the ecosystem handoff object)
// ---------------------------------------------------------------------------

/**
 * The canonical "fluid backbone" other Petrolord apps consume. Keys are authored
 * to match the real Pipeline Sizer consumer contract (oil_gravity, gas_gravity,
 * gor, inlet_temperature, wat); richer PVT is carried for future consumers.
 */
export const buildBackbone = (fluid, pvt, separator) => ({
  oil_gravity: pvt.kpis.api,
  gas_gravity: pvt.kpis.gasSg,
  gor: separator?.totals?.surface_gor ?? pvt.kpis.rsb,
  inlet_temperature: pvt.kpis.temp,
  wat: null, // flow-assurance seam (Phase 2)
  pb: pvt.kpis.pb,
  rsb: pvt.kpis.rsb,
  bo_at_pb: pvt.kpis.bo_at_pb,
  mu_o_at_pb: pvt.kpis.mu_o_at_pb,
  pvt_table: pvt.table,
});

// ---------------------------------------------------------------------------
// Top-level analysis (the single useMemo target)
// ---------------------------------------------------------------------------

const emptyResult = (message) => ({
  pvt: { table: [], kpis: null, pb: null },
  separator: null,
  backbone: null,
  meta: { phase: 1, correlations: null, warnings: [message] },
  blending: null,
  flowAssurance: null,
  batchSummary: null,
});

/**
 * Analyze the full UI inputs into a Results object. Pure function of `inputs`
 * (so Load = setInputs and persistence never stores results). Short-circuits to
 * an empty result when required fluid properties are missing, so the page can
 * render its empty state instead of throwing.
 */
export const analyzeFluidSystem = (inputs) => {
  const fluid = normalizeFluid(inputs);

  const missing = !(fluid.api > 0) || !(fluid.rsb > 0) || !(fluid.gasGravity > 0) || !(fluid.temp > 0);
  if (missing) return emptyResult('Enter API, GOR, gas SG and temperature to run the analysis.');

  const pb = fluid.pb ?? solveBubblePoint(fluid);
  const withPb = { ...fluid, pb };

  const pvt = computePvtTable(withPb);
  const separator = flashSeparatorTrain(withPb, inputs?.separatorTrain?.stages, pb);
  const backbone = buildBackbone(withPb, pvt, separator);

  const warnings = [
    'Separator results use a black-oil staged-liberation approximation (GOR partition), not a compositional flash.',
  ];
  const suspect = SUSPECT_CORRELATIONS[fluid.correlations.pb_rs_bo];
  if (suspect) warnings.push(suspect);
  const suspectVisc = SUSPECT_CORRELATIONS[fluid.correlations.viscosity];
  if (suspectVisc) warnings.push(suspectVisc);
  if (inputs?.streamA?.blackOil?.pb) {
    warnings.push('Bubble point is user-specified; leave it blank to solve it from the GOR.');
  }

  return {
    pvt,
    separator,
    backbone,
    meta: { phase: 1, correlations: fluid.correlations, warnings },
    blending: null, // Phase 2 seam
    flowAssurance: null, // Phase 2 seam
    batchSummary: null, // Phase 2 seam
  };
};

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

/** Realistic default inputs (32°API volatile-ish oil) for the Sample button. */
export const sampleFluidStudioData = () => ({
  streamA: {
    blackOil: { api: 32, gor: 650, gasSg: 0.75, temp: 200, pb: null, salinity: 35000 },
    composition: { model: 'pr', raw: '' },
  },
  correlations: { pb_rs_bo: 'standing', viscosity: 'beggs_robinson' },
  feed: { oilRate: 1000 },
  separatorTrain: {
    stages: [
      { pressure: 450, temperature: 120, enabled: true },
      { pressure: 200, temperature: 100, enabled: true },
      { pressure: 14.7, temperature: 60, enabled: false },
    ],
  },
  // Preserved seams for later phases (unused in Phase 1).
  streamB: { blackOil: { api: 22, gor: 200, gasSg: 0.85, temp: 150, pb: null, salinity: 10000 }, composition: { model: 'pr', raw: '' } },
  blending: { enabled: false, streamB_fraction: 50 },
  batchRun: { enabled: false, variable: 'api', min: 20, max: 40, steps: 5 },
  flowAssurance: { flowline: { length: 2500, diameter: 3, outletPressure: 200, ambientTemp: 85 }, inhibitors: [] },
  ptProfile: { raw: '3000, 180\n2500, 165\n2000, 140\n1500, 110\n1000, 80\n500, 50' },
});
