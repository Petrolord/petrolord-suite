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

/** Empty composition state (mol%), used by sample data and the input tab. */
export const emptyComposition = () => ({
  model: 'pr78',
  zPct: Object.fromEntries([...COMPONENT_ORDER, PLUS_FRACTION_KEY].map((k) => [k, 0])),
  plus: { mw: null, sg: null, tbF: null },
  pressure: null,
  temp: null,
  envelope: { tMinF: 40, tMaxF: 400, nT: 15 },
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
/** Separator Train UI stages -> engine stages (psia / °R, enabled only). */
const toEngineStages = (stages) => (stages || [])
  .filter((s) => s && s.enabled && Number(s.pressure) > 0)
  .map((s) => ({
    tR: degFtoR(Number.isFinite(Number(s.temperature)) ? Number(s.temperature) : 60),
    pPsia: Number(s.pressure),
  }));

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
export const runEosPvtTable = (composition, stages) => {
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

  return { parsed, table, backbone };
};

/**
 * CSV of the composite table in MB Studio's PVT lab-table schema
 * (fluidStudioPvtPrefill row keys, ascending pressure) so the export
 * drops straight into the Material Balance lab-table workflow.
 */
export const eosPvtTableCsv = (table) => {
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
  return [cols.join(','), ...rows].join('\n');
};

/**
 * The envelope-trace request payload for the worker (plain data only).
 * resTempF marks the temperature whose saturation pressure is reported.
 */
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
