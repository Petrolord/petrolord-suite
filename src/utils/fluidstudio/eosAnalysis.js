/**
 * UI-facing orchestrator for the compositional PR78 path — FS5.
 *
 * Bridges the Fluid Studio input state to the validated EOS engine in
 * ./eos/ (FS1-FS4). Everything here is pure and synchronous; only the
 * envelope trace is slow and lives in the web worker (envelopeClient.js).
 *
 * The compositional path is opt-in beside the black-oil default. Nothing
 * in this file touches the black-oil pipeline, which stays pinned by
 * __tests__/blackOilSnapshot.test.js.
 *
 * UI units at this seam: mole percent, °F, psia. The engine works in
 * mole fraction / °R internally (see eos/units.js).
 */

import { COMPONENT_ORDER, COMPONENTS, PLUS_FRACTION_KEY } from './eos/components.js';
import { mixtureFromKeys } from './eos/pr78.js';
import { normalizeTuning, tunedMixtureWithPlusFraction } from './eos/tuning.js';
import { flashPT } from './eos/flash.js';
import { lbcViscosity, weinaugKatzIFT } from './eos/transport.js';
import { separatorTrain } from './eos/separator.js';
import { saturationPressure } from './eos/envelope.js';
import { eosBlackOilTable } from './eos/experiments.js';
import { degFtoR, degRtoF } from './eos/units.js';
import { bwAt, muWaterAt } from '../fluidStudioCalculations.js';
import { pvtContractCsvHeader } from '../../lib/inputProvenance/pvtContract.js';

/** Standard conditions of the compositional path (eos/separator.js stock tank). */
export const EOS_STANDARD_CONDITIONS = Object.freeze({ pressure_psia: 14.696, temperature_degF: 60 });

/** The liberation basis of the EOS black-oil table, in words. */
export const EOS_BASIS = Object.freeze({
  kind: 'differential-adjusted-to-separator',
  text: 'Differential liberation at the flash temperature, converted to the separator (flash) basis of the Separator Train by the Amyx and McCain adjustment: Bo = Bod x Bofb / Bodb and Rs = Rsfb - (Rsdb - Rsd) x Bofb / Bodb. Exact at the saturation pressure, approximate toward atmospheric pressure.',
});

const EOS_NAME = 'Peng-Robinson (1978) with Peneloux volume translation';
const LBC = 'Lohrenz-Bray-Clark, untuned';

/**
 * The method behind every property of the EOS black-oil table, written
 * beside the calls that produce it (runEosPvtTable below): same keys as
 * fluidStudioCalculations blackOilMethods, so a consumer reads one list.
 */
export function eosMethods({ sat, plusMeta, tuned }) {
  const eos = tuned ? `${EOS_NAME}, C7+ tuned to lab data` : EOS_NAME;
  const row = (key, label, method, kind, note, reference = '') => ({ key, label, method, reference, kind, rangeKey: null, ...(note ? { note } : {}) });
  return [
    row('pb', sat?.kind === 'dew' ? 'Dew point pressure' : 'Bubble point pressure', `${eos}: saturation pressure by stability scan and bisection`, 'eos',
      sat?.kindSource === 'density-heuristic' ? 'Near critical: the boundary kind comes from the liquid-likeness heuristic.' : ''),
    row('rs', 'Solution GOR Rs', `${eos}: differential liberation, adjusted to the separator train`, 'eos', 'Amyx and McCain adjustment.'),
    row('bo', 'Oil formation volume factor Bo', `${eos}: differential liberation, adjusted to the separator train`, 'eos', 'Above the saturation pressure: the EOS molar volume ratio.'),
    row('co', 'Oil compressibility co (undersaturated)', 'Not reported by the EOS table', 'not-computed', 'Take it from the slope of Bo above the saturation pressure.'),
    row('mu_od', 'Dead oil viscosity', 'Not reported by the EOS table', 'not-computed'),
    row('mu_o', 'Live (saturated) oil viscosity', LBC, 'correlation', 'Screening grade: up to a factor of two on oil.', 'Lohrenz, Bray and Clark (1964)'),
    row('mu_o_undersaturated', 'Undersaturated oil viscosity', LBC, 'correlation', '', 'Lohrenz, Bray and Clark (1964)'),
    row('z', 'Gas deviation factor Z', `${eos}: the gas liberated at each differential stage`, 'eos'),
    row('mu_g', 'Gas viscosity', LBC, 'correlation', '', 'Lohrenz, Bray and Clark (1964)'),
    row('bg', 'Gas formation volume factor Bg', 'Real gas law with the EOS Z of the liberated gas', 'definition', 'At the standard conditions of this report.'),
    row('bw', 'Water formation volume factor Bw', 'McCain', 'correlation', 'Pure water form: salinity is not applied to Bw. Water is not part of the EOS.', 'McCain (1990)'),
    row('mu_w', 'Water viscosity', 'McCain', 'correlation', 'Water is not part of the EOS.', 'McCain (1991)'),
  ].map((m) => (m.key === 'bw' ? { ...m, rangeKey: 'mccain_bw' } : m.key === 'mu_w' ? { ...m, rangeKey: 'mccain_mu_w' } : m));
}

/** How the C7+ fraction was characterised, from the characterisation's own record. */
export function plusFractionScheme(plusMeta) {
  if (!plusMeta) return null;
  const tb = plusMeta.tbSource === 'measured' ? 'entered boiling point' : 'Soreide boiling point';
  const omega = plusMeta.omegaMethod === 'edmister' ? 'Edmister acentric factor' : 'Lee-Kesler acentric factor';
  return `Single pseudo-component: ${tb}, Kesler-Lee Tc and Pc, ${omega}, Jhaveri-Youngren volume shift, modified Chueh-Prausnitz methane interaction`;
}

// ---- lab tuning record ------------------------------------------------------

/**
 * The record of a fit that is saved with the project
 * (composition.tuning.fit): the engine's own before and after rows, whether
 * it converged and the bounds it hit. Whether the record still describes the
 * fluid is decided by tuningStatus() below (H10: `tuning.fittedOn`, the
 * request the regression consumed), the one staleness check of the app.
 */
export const tuneRecord = (fit, composition, at = new Date()) => ({
  at: at.toISOString(),
  converged: !!fit.converged,
  iterations: fit.iterations ?? null,
  boundsHit: [...(fit.boundsHit || [])],
  psatTF: Number.isFinite(Number(composition?.tuning?.lab?.psatTF)) && composition?.tuning?.lab?.psatTF !== null && composition?.tuning?.lab?.psatTF !== ''
    ? Number(composition.tuning.lab.psatTF) : (Number(composition?.temp) || null),
  report: (fit.report || []).map((r) => ({
    name: r.name, unit: r.unit, measured: r.measured, untuned: r.untuned, tuned: r.tuned, untunedErr: r.untunedErr, tunedErr: r.tunedErr,
  })),
  // FLUID-U2-008: the uncertainty the regression produces (engines labTune), kept with the record
  uncertainty: tuneUncertaintyRecord(fit.uncertainty),
});

/** The uncertainty of a fit as the record keeps it (no covariance matrix), or null for a fit without one. */
export function tuneUncertaintyRecord(u) {
  if (!u || !u.knobs) return null;
  return {
    targets: u.targets, dof: u.dof, tValue: u.tValue, withheld: u.withheld ?? null,
    knobs: Object.fromEntries(Object.entries(u.knobs).map(([k, v]) => [k, {
      value: v.value, standardError: v.standardError ?? null, ci95: v.ci95 ? [...v.ci95] : null, atBound: !!v.atBound, bounds: v.bounds ? [...v.bounds] : null,
    }])),
  };
}

/**
 * One knob's interval in words: "0.85 to 1.09", or why there is none.
 * An interval wider than the regression bounds says the data do not pin the knob.
 */
export function knobIntervalWords(uncertainty, key, fmt) {
  if (!uncertainty) return 'Not recorded: tuned before the app kept the uncertainty';
  if (uncertainty.withheld) return 'Not stated: the regression has no curvature to read it from';
  const k = uncertainty.knobs?.[key];
  if (!k) return 'Not recorded';
  if (k.atBound) return 'None: the parameter stopped at a regression bound';
  if (!k.ci95) return 'Not stated';
  const words = `${fmt(k.ci95[0])} to ${fmt(k.ci95[1])}`;
  return k.bounds && k.ci95[0] < k.bounds[0] && k.ci95[1] > k.bounds[1] ? `${words}, wider than the regression bounds: the data do not pin it` : words;
}

/**
 * The tuning state a report or a contract may claim (RL8), from the app's
 * one status (tuningStatus) and the saved record of the fit:
 *   none             no tuning applied
 *   tuned            applied, current, and the record of the match is there
 *   tuned-unrecorded applied, with no record of the match or of what it was
 *                    fitted on (a project saved before the records existed)
 *   stale            applied, but an input changed after the fit
 */
export function tuningState(composition, stages) {
  const applied = normalizeTuning(composition?.tuning?.applied);
  // eslint-disable-next-line no-use-before-define
  const status = tuningStatus(composition, stages);
  if (!applied || status === 'none') return { status: 'none', applied: null, fit: null };
  const fit = composition?.tuning?.fit;
  const hasRecord = !!fit && Array.isArray(fit.report);
  if (status === 'stale') return { status: 'stale', applied, fit: hasRecord ? fit : null };
  if (status === 'unrecorded' || !hasRecord) return { status: 'tuned-unrecorded', applied, fit: null };
  return { status: 'tuned', applied, fit };
}

/** Empty composition state (mol%), used by sample data and the input tab. */
export const emptyComposition = () => ({
  model: 'pr78',
  zPct: Object.fromEntries([...COMPONENT_ORDER, PLUS_FRACTION_KEY].map((k) => [k, 0])),
  plus: { mw: null, sg: null, tbF: null },
  pressure: null,
  temp: null,
  envelope: { tMinF: 40, tMaxF: 400, nT: 15 },
  // ET3 lab tuning: `lab` holds the measured values the user types (psat at
  // psatTF, and separator-test GOR/API/Bo measured for the Separator Train
  // stages at the flash T/P as reservoir conditions); `applied` is the
  // accepted {fTc, fPc, kC1, sPlus} knob set (null = untuned).
  tuning: {
    lab: { psatPsia: null, psatTF: null, totalGor: null, stoApi: null, bo: null },
    applied: null,
  },
});

/**
 * Validate and normalize the composition tab state.
 *
 * Returns { valid, errors, warnings, keys, z, plus, sumPct }:
 * keys/z are the engine-ready ordered component list and normalized mole
 * fractions (components at exactly zero are dropped; the engine takes
 * ln z). plus is null when the fluid has no C7+.
 */
export const parseComposition = (composition) => {
  const errors = [];
  const warnings = [];
  const zPct = composition?.zPct ?? {};

  const entries = [...COMPONENT_ORDER, PLUS_FRACTION_KEY]
    .map((k) => [k, Number(zPct[k]) || 0])
    .filter(([, v]) => v > 0);
  const sumPct = entries.reduce((s, [, v]) => s + v, 0);

  if (entries.length < 2) {
    errors.push('Enter at least two components with nonzero mole percent.');
  }
  if (entries.some(([, v]) => v < 0)) errors.push('Mole percents must be positive.');
  if (sumPct > 0 && Math.abs(sumPct - 100) > 1) {
    warnings.push(`Composition sums to ${sumPct.toFixed(2)} mol%; it is renormalized to 100% for the EOS.`);
  }

  const hasPlus = entries.some(([k]) => k === PLUS_FRACTION_KEY);
  let plus = null;
  if (hasPlus) {
    const mw = Number(composition?.plus?.mw);
    const sg = Number(composition?.plus?.sg);
    if (!(mw > 0) || !(sg > 0)) {
      errors.push('The C7+ fraction needs a molecular weight and specific gravity.');
    } else {
      if (mw < 90 || mw > 400) warnings.push('C7+ MW outside the usual 90 to 400 range; correlations are extrapolating.');
      if (sg < 0.7 || sg > 1.0) warnings.push('C7+ SG outside the usual 0.70 to 1.00 range; correlations are extrapolating.');
      plus = { mw, sg };
      const tbF = Number(composition?.plus?.tbF);
      if (Number.isFinite(tbF) && tbF > 0) plus.tbR = degFtoR(tbF);
    }
  }

  const temp = Number(composition?.temp);
  const pressure = Number(composition?.pressure);
  if (!(temp > -400)) errors.push('Enter the flash temperature.');
  if (!(pressure > 0)) errors.push('Enter the flash pressure.');

  const keys = entries.filter(([k]) => k !== PLUS_FRACTION_KEY).map(([k]) => k);
  const z = entries.filter(([k]) => k !== PLUS_FRACTION_KEY).map(([, v]) => v / (sumPct || 1));
  if (plus) {
    const zPlus = entries.find(([k]) => k === PLUS_FRACTION_KEY)[1] / sumPct;
    keys.push(PLUS_FRACTION_KEY);
    z.push(zPlus);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    keys,
    z,
    plus,
    // Applied lab tuning rides the composition state so persistence and the
    // worker payload get it for free; normalized here (ET1), applied only in
    // eos/tuning.js. Tuning without a plus fraction is meaningless: the four
    // knobs all act on the C7+ pseudo.
    tuning: plus ? normalizeTuning(composition?.tuning?.applied) : null,
    sumPct,
    tempF: temp,
    pressurePsia: pressure,
  };
};

/** Build the EOS mixture for a parsed composition (pseudo appended last). */
export const buildMixture = (parsed) => {
  if (parsed.plus) {
    return tunedMixtureWithPlusFraction(parsed.keys.slice(0, -1), parsed.plus, parsed.tuning);
  }
  return mixtureFromKeys(parsed.keys);
};

const round = (v, d) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

/**
 * Synchronous compositional analysis at the flash (T, P): stability-gated
 * two-phase flash, per-phase densities/viscosities, IFT, and the
 * per-component phase table. Fast enough for keystroke recompute; the
 * envelope/Psat slow path goes through the worker instead.
 *
 * Returns null when the composition is not valid yet (the card shows the
 * parse errors instead).
 */
export const runEosFlash = (composition) => {
  const parsed = parseComposition(composition);
  if (!parsed.valid) return { parsed, flash: null };

  const mix = buildMixture(parsed);
  const tR = degFtoR(parsed.tempF);
  const res = flashPT(mix, parsed.z, tR, parsed.pressurePsia);

  const phaseRow = (label, x, props) => {
    const mu = lbcViscosity(mix, x, tR, props);
    return {
      label,
      moleFraction: null,
      density: props.density,
      molarVolume: props.molarVolume,
      zFactor: props.zFactor,
      viscosityCp: mu.viscosityCp,
      apparentMw: props.apparentMw,
    };
  };

  let flash;
  if (res.phases === 2) {
    const liquid = phaseRow('Liquid', res.x, res.liquid);
    const vapor = phaseRow('Vapor', res.y, res.vapor);
    liquid.moleFraction = 1 - res.beta;
    vapor.moleFraction = res.beta;
    const ift = weinaugKatzIFT(mix, res.x, res.y, res.liquid, res.vapor);
    flash = {
      phases: 2,
      beta: res.beta,
      liquid,
      vapor,
      iftDynPerCm: ift.iftDynPerCm,
      componentTable: parsed.keys.map((k, i) => ({
        key: k,
        name: (COMPONENTS[k] || mix.plus?.comp)?.name ?? k,
        z: round(parsed.z[i], 5),
        x: round(res.x[i], 5),
        y: round(res.y[i], 5),
        K: round(res.K[i], 5),
      })),
    };
  } else {
    // negative-flash reasons tell us which side of the boundary we are on;
    // a plain 'stable' outcome stays unlabeled
    const label = res.reason === 'negative-flash-liquid' ? 'Liquid (single phase)'
      : res.reason === 'negative-flash-vapor' ? 'Vapor (single phase)'
        : 'Single phase';
    const feed = phaseRow(label, parsed.z, res.feed);
    feed.moleFraction = 1;
    flash = {
      phases: 1,
      reason: res.reason,
      feed,
      componentTable: parsed.keys.map((k, i) => ({
        key: k,
        name: (COMPONENTS[k] || mix.plus?.comp)?.name ?? k,
        z: round(parsed.z[i], 5),
      })),
    };
  }

  return {
    parsed,
    characterization: mix.plus
      ? { ...mix.plus.comp, meta: mix.plus.meta, bipC1: mix.plus.bip.C1 }
      : null,
    flash,
  };
};

/**
 * Compositional separator train at the seam — FS6.
 *
 * Reuses the SAME Separator Train stage inputs as the black-oil card
 * (pressure psia, temperature °F, enabled flag) but flashes the parsed
 * wellstream through each stage with the FS3 EOS flash. The flash
 * conditions on the Composition tab double as the reservoir state for
 * the Bo block. Returns rounded, display-ready numbers; the black-oil
 * separator path is untouched.
 */
/**
 * A Separator Train stage counts only when the user has enabled it and given
 * it a positive pressure.
 *
 * This predicate is shared deliberately. Lab tuning used to select stages with
 * its own looser test (any finite pressure), so a DISABLED stage entered the
 * tuning targets while being excluded from every result it was being matched
 * against. On the shipped defaults that bit: the third stage is disabled at
 * 14.7 psia, and because 14.7 sits just above standard pressure,
 * normalizeStages then appended a second stock-tank stage on top of it. Lab
 * tuning regressed against a four-stage train while the displayed separator
 * results, the black-oil table and the Pipeline Sizer handoff all used three.
 */
export const isActiveStage = (s) => Boolean(s) && Boolean(s.enabled) && Number(s.pressure) > 0;

/** A stage's temperature in °F, defaulting to standard temperature. */
const stageTempF = (s) => (Number.isFinite(Number(s.temperature)) ? Number(s.temperature) : 60);

/** Separator Train UI stages -> engine stages (psia / °R, enabled only). */
const toEngineStages = (stages) => (stages || [])
  .filter(isActiveStage)
  .map((s) => ({ tR: degFtoR(stageTempF(s)), pPsia: Number(s.pressure) }));

export const runEosSeparator = (composition, stages) => {
  const parsed = parseComposition(composition);
  if (!parsed.valid) return { parsed, separator: null };

  const mix = buildMixture(parsed);
  const engineStages = toEngineStages(stages);

  const res = separatorTrain(mix, parsed.z, engineStages, {
    resTR: degFtoR(parsed.tempF),
    resPPsia: parsed.pressurePsia,
  });

  const stageRows = res.stages.map((s) => ({
    name: s.isStockTank ? 'Stock Tank' : `Sep ${s.index + 1}`,
    isStockTank: s.isStockTank,
    pressure: round(s.pPsia, 1),
    temperature: round(degRtoF(s.tR), 0),
    phases: s.phases,
    vaporMolePct: round(s.vaporMoles * 100, 2),
    liquidMolePct: round(s.liquidMoles * 100, 2),
    gasGravity: round(s.gasGravity, 3),
    gor: round(s.gorScfPerStb, 1),
  }));

  const separator = {
    stages: stageRows,
    stockTank: res.stockTank
      ? {
        api: round(res.stockTank.api, 1),
        sg: round(res.stockTank.sg, 4),
        density: round(res.stockTank.density, 2),
        apparentMw: round(res.stockTank.apparentMw, 1),
      }
      : null,
    totals: res.stockTank
      ? {
        separatorGor: round(res.totals.separatorGor, 1),
        stockTankGor: round(res.totals.stockTankGor, 1),
        totalGor: round(res.totals.totalGor, 1),
        surfaceGasGravity: round(res.totals.surfaceGasGravity, 3),
      }
      : null,
    bo: res.bo
      ? {
        reservoirPhases: res.bo.reservoirPhases,
        multistage: round(res.bo.multistage, 4),
        singleStage: round(res.bo.singleStage, 4),
        singleStageGor: round(res.bo.singleStageGor, 1),
      }
      : null,
    warnings: res.warnings,
  };

  return { parsed, separator };
};

/**
 * EOS PVT table + backbone at the seam — FS7.
 *
 * One saturation-pressure scan at the flash temperature anchors the CCE/
 * DL machinery; the composite table is the FS6 separator train's flash
 * Bo/GOR grafted onto differential liberation (Amyx adjustment). The
 * whole pipeline is a few dozen flashes (~tens of ms), so it recomputes
 * synchronously with the inputs like runEosFlash.
 *
 * Returns { parsed, table, backbone }:
 *   table    display-rounded rows { pressure, Rs, Bo, Bg, Z, mu_o, mu_g,
 *            phase } descending, plus kpis and warnings; null when the
 *            composition is invalid, no saturation point exists at this
 *            temperature, or the fluid leaves no stock-tank oil.
 *   backbone Pipeline Sizer-shaped handoff object built from the EOS
 *            surface numbers (oil_gravity = STO API, gas_gravity =
 *            surface gas SG, gor = separator-flash total GOR, pb = EOS
 *            saturation pressure), with the table rows as pvt_table.
 */
export const runEosPvtTable = (composition, stages, { salinityPpm = 0 } = {}) => {
  const parsed = parseComposition(composition);
  if (!parsed.valid) return { parsed, table: null, backbone: null };

  const mix = buildMixture(parsed);
  const tR = degFtoR(parsed.tempF);
  const sat = saturationPressure(mix, parsed.z, tR, {});
  if (!sat) {
    return {
      parsed,
      table: null,
      backbone: null,
      warnings: ['No saturation point at this temperature inside the pressure window; the fluid stays single phase, so there is no black-oil table to build.'],
    };
  }

  const res = eosBlackOilTable(mix, parsed.z, tR, toEngineStages(stages), {
    psatPsia: sat.pPsia,
  });
  if (!res.ok) {
    return { parsed, table: null, backbone: null, warnings: res.warnings };
  }

  const rows = res.rows.map((r) => ({
    pressure: round(r.pressure, 0),
    Rs: round(r.Rs, 1),
    Bo: round(r.Bo, 4),
    Bg: round(r.Bg, 6),
    Z: round(r.Z, 4),
    mu_o: round(r.mu_o, 4),
    mu_g: round(r.mu_g, 5),
    // water is outside the EOS: the canonical McCain forms at the row pressure
    Bw: round(bwAt(r.pressure, parsed.tempF, salinityPpm), 4),
    mu_w: round(muWaterAt(r.pressure, parsed.tempF, salinityPpm), 4),
    phase: r.phase,
  }));

  const table = {
    pb: round(res.pb, 0),
    satKind: sat.kind,
    rows,
    kpis: {
      rsfb: round(res.kpis.rsfb, 1),
      bofb: round(res.kpis.bofb, 4),
      bodb: round(res.kpis.bodb, 4),
      rsdb: round(res.kpis.rsdb, 1),
      stoApi: round(res.kpis.stoApi, 1),
      surfaceGasGravity: round(res.kpis.surfaceGasGravity, 3),
    },
    warnings: res.warnings,
  };

  const pbRow = rows.find((r) => r.phase === 'saturated');
  const backbone = {
    source: 'eos',
    oil_gravity: table.kpis.stoApi,
    gas_gravity: table.kpis.surfaceGasGravity,
    gor: table.kpis.rsfb,
    inlet_temperature: parsed.tempF,
    wat: null,
    pb: table.pb,
    rsb: table.kpis.rsfb,
    bo_at_pb: table.kpis.bofb,
    mu_o_at_pb: pbRow ? pbRow.mu_o : null,
    pvt_table: rows,
  };

  // FLUID-U1: what this table was computed with, for the report and pvt-1
  const methods = eosMethods({ sat, plusMeta: mix.plus?.meta, tuned: !!parsed.tuning });
  const model = {
    eos: EOS_NAME,
    c7plus: plusFractionScheme(mix.plus?.meta),
    viscosity: 'Lohrenz-Bray-Clark (untuned)',
    tempF: parsed.tempF,
    satKindSource: sat.kindSource ?? null,
  };

  return { parsed, table, backbone, methods, model, basis: EOS_BASIS, standardConditions: EOS_STANDARD_CONDITIONS };
};

/**
 * CSV of the composite table in MB Studio's PVT lab-table schema
 * (fluidStudioPvtPrefill row keys, ascending pressure) so the export
 * drops straight into the Material Balance lab-table workflow.
 */
export const eosPvtTableCsv = (table, { contract = null } = {}) => {
  const cols = ['pressure_psia', 'bo_rb_stb', 'rs_scf_stb', 'oil_viscosity_cp',
    'z_factor', 'bg_rb_mscf', 'gas_viscosity_cp'];
  const rows = table.rows.slice().sort((a, b) => a.pressure - b.pressure).map((r) => [
    r.pressure,
    r.Bo,
    r.Rs,
    r.mu_o,
    r.Z ?? '',
    r.Bg != null ? round(r.Bg * 1000, 4) : '',
    r.mu_g ?? '',
  ].join(','));
  // FLUID-U1: the same provenance header as the PVT CSV, when the pvt-1
  // block is handed in (the schema's column names already carry the units)
  const header = contract
    ? pvtContractCsvHeader(contract, { extra: ['Units of this file: those in the column names (Material Balance Studio lab-table schema), whatever the display units. Pressures are absolute. Bg is RB/Mscf.'] })
    : [];
  return [...header, cols.join(','), ...rows].join('\n');
};

/**
 * The envelope-trace request payload for the worker (plain data only).
 * resTempF marks the temperature whose saturation pressure is reported.
 */
/**
 * ET3: build the worker request for the lab-tune regression from the
 * composition state and the app's Separator Train stages. Returns null
 * (with reasons) until the composition parses and at least one measured
 * value is present. Separator-test measurements are interpreted against
 * the configured Separator Train stages, with the flash T/P as the
 * reservoir conditions for Bo.
 */
export const labTuneRequest = (composition, stages) => {
  const parsed = parseComposition(composition);
  if (!parsed.valid) return { request: null, reasons: parsed.errors };
  if (!parsed.plus) return { request: null, reasons: ['Tuning needs a C7+ plus fraction.'] };

  const lab = composition?.tuning?.lab ?? {};
  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
  const psatPsia = num(lab.psatPsia);
  const psatTF = num(lab.psatTF) ?? parsed.tempF;
  const totalGor = num(lab.totalGor);
  const stoApi = num(lab.stoApi);
  const bo = num(lab.bo);

  const targets = {};
  if (psatPsia !== null) targets.psat = { tF: psatTF, pPsia: psatPsia };
  if (totalGor !== null || stoApi !== null || bo !== null) {
    // Same stage selection as every consumer of the separator train, so the
    // targets and the results being matched describe the same train.
    const stagesF = (stages || [])
      .filter(isActiveStage)
      .map((s) => [stageTempF(s), Number(s.pressure)]);
    if (!stagesF.length) {
      return { request: null, reasons: ['Separator-test measurements need at least one enabled Separator Train stage.'] };
    }
    targets.separatorTest = {
      stagesF,
      resTF: parsed.tempF,
      resPPsia: parsed.pressurePsia,
      ...(totalGor !== null ? { totalGor } : {}),
      ...(stoApi !== null ? { stoApi } : {}),
      ...(bo !== null ? { bo } : {}),
    };
  }
  if (!targets.psat && !targets.separatorTest) {
    return { request: null, reasons: ['Enter at least one measured lab value.'] };
  }

  return {
    request: {
      fluid: { keys: parsed.keys, plus: parsed.plus, z: parsed.z },
      targets,
    },
    reasons: [],
  };
};

/**
 * H10: is the applied lab tune still the tune of this fluid?
 *
 * The regression consumes exactly the worker request (feed, C7+ description,
 * the measured values, the flash conditions and the enabled separator
 * stages). The request is kept as text beside the applied knobs
 * (`tuning.fittedOn`) when a tune is applied, and compared here. An edit to
 * anything in it leaves the tuned C7+ properties applied to a fluid they
 * were not fitted to, so "Lab tuned" is no longer true.
 *
 *   'none'        no tune applied
 *   'current'     the inputs are the ones the tune was fitted on
 *   'stale'       an input changed after the tune
 *   'unrecorded'  a tune saved before this record existed: cannot be confirmed
 */
export const tuningFingerprint = (composition, stages) => {
  const { request } = labTuneRequest(composition, stages);
  return request ? JSON.stringify(request) : null;
};

export const tuningStatus = (composition, stages) => {
  if (!composition?.tuning?.applied) return 'none';
  const fittedOn = composition.tuning.fittedOn;
  if (!fittedOn) return 'unrecorded';
  return fittedOn === tuningFingerprint(composition, stages) ? 'current' : 'stale';
};

export const envelopeRequest = (composition) => {
  const parsed = parseComposition(composition);
  if (!parsed.valid) return null;
  const env = composition?.envelope ?? {};
  return {
    keys: parsed.keys,
    z: parsed.z,
    plus: parsed.plus,
    tuning: parsed.tuning,
    tMinF: Number(env.tMinF) || 40,
    tMaxF: Number(env.tMaxF) || 400,
    nT: Math.min(Math.max(Math.round(Number(env.nT) || 15), 5), 40),
    resTempF: parsed.tempF,
    resPressurePsia: parsed.pressurePsia,
  };
};
