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
 * correlation, a real gas Z-factor (Dranchuk-Abou-Kassem or Hall-Yarborough on
 * Sutton pseudo-criticals, from the engines library since FLUID-U2-006), gas FVF
 * and viscosity (Lee-Gonzalez-Eakin), oil compressibility (Vasquez-Beggs) and
 * the undersaturated oil-viscosity rise, plus a black-oil separator-train
 * staged-liberation flash.
 *
 * SHIPPED SCOPE: Stream A black-oil PVT, separator train, Stream B blending
 * (with asphaltene compatibility screening), flow-assurance screening (Motiee
 * hydrate curve, WAT resolution), batch sweeps and project persistence.
 *
 * STILL DEFERRED: EOS/compositional flash (the FS-program work; the per-stage
 * seam is noted inline), AOP (needs asphaltene characterization) and rigorous
 * wax thermodynamics (WAT stays measured/wax-content screening only).
 */

import { pvtCalcs } from './pvtCalculations.js';
import {
  mccainBw, mccainMuW, gasZDetail, GAS_Z_METHODS, DEFAULT_GAS_Z_METHOD,
} from '../../packages/engines/engines/fluid/blackOil';
import { readPtProfile } from './fluidstudio/ptProfileImport.js';
import { labDataOf } from './fluidstudio/labData.js';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Coerce a raw string/number to a finite number, else fallback. */
export const num = (v, fallback = 0) => {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

const STOCK_TANK = { pressure: 14.7, temperature: 60 }; // psia, °F

// Batch-sweep variables (Stream A black-oil keys) with display metadata.
const BATCH_VARS = {
  api: { label: 'API Gravity', unit: '°API' },
  gor: { label: 'Solution GOR', unit: 'scf/STB' },
  gasSg: { label: 'Gas SG', unit: 'air=1' },
  temp: { label: 'Temperature', unit: '°F' },
};

// Honest labels for the flow-assurance screening approximations.
const FA_WARNINGS = {
  hydrate: 'The hydrate curve is the Motiee (1991) gas gravity screening correlation: gas gravity 0.55 to 1.0, within about 5 to 8 degF, sweet gas, with no correction for hydrogen sulphide, carbon dioxide or inhibitor. It is a screening curve and no hydrate flash.',
  aop: 'Asphaltene onset pressure cannot be computed from black-oil inputs: it needs SARA or compositional data and the reservoir pressure, so it is left blank.',
  watNull: 'The wax appearance temperature cannot be computed from black-oil PVT alone: the wax content sets it, and the API gravity does not. Enter a measured value or a wax content.',
  watWax: 'The wax appearance temperature is a screening estimate from the wax content (empirical, within about 10 degF). Confirm it against a measured cloud point.',
  sgBand: 'Gas gravity is outside the Motiee range of 0.55 to 1.0, so the hydrate curve is extrapolated. Treat it as indicative only.',
};

// Correlations flagged as non-standard / suspect in the pvtCalculations audit.
// They remain selectable but the engine surfaces a warning so results are honest.
const SUSPECT_CORRELATIONS = {
  beal_cook_spillman:
    'Beal-Cook-Spillman saturated viscosity is a simplified form. Beggs-Robinson is the default.',
};

// Published data ranges of the black-oil correlations: Standing (1947) as
// tabulated by Ahmed (Reservoir Engineering Handbook); Vasquez-Beggs and
// Glaso as in the engines blackOil correlationValidityWarnings. Outside them
// the correlation extrapolates (Wave 2 T1: nothing said so).
export const CORRELATION_RANGES = {
  standing: { label: 'Standing', rs: [20, 1425], temp: [100, 258], api: [16.5, 63.8], gasGravity: [0.59, 0.95] },
  vasquez_beggs: { label: 'Vasquez-Beggs', rs: [20, 2199], temp: [75, 294], api: [15.3, 59.5], gasGravity: [0.511, 1.351] },
  glaso: { label: 'Glaso', rs: [90, 2637], temp: [80, 280], api: [22.3, 48.1], gasGravity: [0.65, 1.276] },
};
// Oil viscosity correlations by key, as oilViscosityAt applies them.
export const VISCOSITY_CORRELATION_LABELS = {
  beggs_robinson: 'Beggs-Robinson',
  beal_cook_spillman: 'Beal-Cook-Spillman',
};

/**
 * Names of the correlations a normalized fluid was computed with, for a
 * consumer that has to state them (the Well Test report's Source column).
 */
export const correlationLabels = (fluid) => ({
  pb_rs_bo: CORRELATION_RANGES[fluid?.correlations?.pb_rs_bo]?.label || null,
  viscosity: VISCOSITY_CORRELATION_LABELS[fluid?.correlations?.viscosity] || null,
});

const RANGE_WORDS = { rs: ['solution GOR', 'scf/STB'], temp: ['temperature', 'F'], api: ['API gravity', 'API'], gasGravity: ['gas gravity', ''] };

/** Warnings for inputs outside the chosen correlation's published data range. */
export function correlationRangeWarnings(fluid) {
  const r = CORRELATION_RANGES[fluid?.correlations?.pb_rs_bo];
  if (!r) return [];
  const vals = { rs: fluid.rsb, temp: fluid.temp, api: fluid.api, gasGravity: fluid.gasGravity };
  const out = [];
  for (const [k, [lo, hi]] of Object.entries({ rs: r.rs, temp: r.temp, api: r.api, gasGravity: r.gasGravity })) {
    const v = Number(vals[k]);
    if (Number.isFinite(v) && (v < lo || v > hi)) {
      const [name, unit] = RANGE_WORDS[k];
      out.push(`${r.label}: ${name} ${v}${unit ? ` ${unit}` : ''} is outside its data range (${lo} to ${hi}${unit ? ` ${unit}` : ''}); the result is extrapolated.`);
    }
  }
  return out;
}

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
  const match = appliedLabMatch(inputs);
  return {
    api: num(bo.api),
    gasGravity: num(bo.gasSg),
    temp: num(bo.temp),
    rsb: num(bo.gor),
    salinity: num(bo.salinity),
    // null => auto-solve from Rsb; a finite value overrides the solve.
    // A bubble point that is not a positive number is no bubble point (FLUID-U1-006).
    // A bubble point matched to the laboratory one (FLUID-U2-004) takes the place of a typed one.
    pb: match?.pb > 0 ? match.pb : (num(pbRaw) > 0 ? num(pbRaw) : null),
    ...(match ? { ...(match.pb > 0 ? { pbFrom: 'lab' } : {}), match: { rsMult: match.rsMult, rsShift: match.rsShift, rsLowP: match.rsLowP, boMult: match.boMult, boShift: match.boShift, mu: match.mu } } : {}),
    correlations: {
      pb_rs_bo: corr.pb_rs_bo || 'standing',
      viscosity: corr.viscosity || 'beggs_robinson',
      // FLUID-U2-006: the z-factor of the canonical engines library (was Papay)
      z_factor: GAS_Z_METHODS[corr.z_factor] ? corr.z_factor : DEFAULT_GAS_Z_METHOD,
    },
    feed: { oilRate: num(inputs?.feed?.oilRate, 1000) },
    // FLUID-U2-001: with laboratory tables loaded the pressure table is
    // carried up to their highest pressure, so every lab row has a model
    // value beside it. Absent when no table is loaded.
    ...labSweep(inputs),
  };
};

/**
 * The correlation match to laboratory data that is applied to this fluid
 * (FLUID-U2-004), or null: the laboratory bubble point, and for each of
 * Rs, Bo and the oil viscosity a stated multiplier (Rs and Bo also a
 * shift): value = multiplier x correlation + shift. A blend is another
 * fluid than the one the laboratory measured, so a match is never applied
 * to it.
 */
export const appliedLabMatch = (inputs) => {
  const a = inputs?.labMatch?.applied;
  if (!a || typeof a !== 'object' || inputs?.blending?.enabled) return null;
  const mult = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 1);
  const shift = (v) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : 0);
  const pb = num(a.pb) > 0 ? num(a.pb) : null;
  return {
    pb,
    // without a matched bubble point the Rs correlation is left as it is
    rsMult: pb && a.rsMult != null ? mult(a.rsMult) : null, rsShift: pb ? shift(a.rsShift) : 0,
    // the lowest laboratory pressure the Rs fit used: below it the shift is tapered out (see saturatedRs)
    rsLowP: pb && num(a.rsLowP) > 0 ? num(a.rsLowP) : null,
    boMult: mult(a.boMult), boShift: shift(a.boShift), mu: mult(a.mu),
  };
};

/** The highest pressure of the loaded laboratory tables (psia), as the table's cover, or nothing. */
const labSweep = (inputs) => {
  const d = labDataOf(inputs);
  const top = Math.max(0, ...[d.cce, d.dl, d.viscosity].filter(Boolean).flatMap((t) => t.rows.map((r) => r.pressure)));
  return top > 0 ? { sweep: { pCover: Math.ceil(top) } } : {};
};

// ---------------------------------------------------------------------------
// Stream blending (Phase 2)
// ---------------------------------------------------------------------------

/**
 * Volume-fraction blend of two black-oil streams. `fractionB` is the volume % of
 * stream B (0-100). API is blended on a specific-gravity (density) basis, NOT as
 * a linear API average — crude blends obey ideal volume additivity of density.
 * Returns the same raw keys as the input streams. Pb is intentionally omitted
 * (the blend's bubble point is re-solved downstream, never blended).
 */
export const blendBlackOil = (a, b, fractionB) => {
  const fB = clamp(num(fractionB, 0) / 100, 0, 1);
  const fA = 1 - fB;

  const apiA = num(a.api);
  const apiB = num(b.api);
  const gA = 141.5 / (apiA + 131.5);
  const gB = 141.5 / (apiB + 131.5);
  const gMix = fA * gA + fB * gB; // volume-weighted specific gravity
  const api = 141.5 / gMix - 131.5;

  const gorA = num(a.gor);
  const gorB = num(b.gor);
  const gor = fA * gorA + fB * gorB; // per unit oil volume

  // Gas SG weighted by produced gas volume (scf), which tracks each stream's GOR.
  const scfA = fA * gorA;
  const scfB = fB * gorB;
  const scfTot = scfA + scfB;
  const gasSg = scfTot > 0 ? (scfA * num(a.gasSg) + scfB * num(b.gasSg)) / scfTot : num(a.gasSg);

  // Temperature: mass-flow (mixing-cup, equal-cp) estimate — a labeled proxy.
  const mA = fA * gA;
  const mB = fB * gB;
  const temp = mA + mB > 0 ? (mA * num(a.temp) + mB * num(b.temp)) / (mA + mB) : num(a.temp);

  // Salinity: volume-weighted (equal-water-cut proxy). Does not enter any PVT primitive.
  const salinity = fA * num(a.salinity) + fB * num(b.salinity);

  return { api, gor, gasSg, temp, salinity };
};

/**
 * Asphaltene compatibility SCREENING index (0..1) — an API-contrast heuristic,
 * NOT a SARA-based CII / Wiehe-Kennedy calculation. Flags the classic risk of
 * blending a heavy asphaltenic crude with a light paraffinic diluent.
 */
export const screenAsphalteneCompatibility = (apiA, apiB, fractionB) => {
  const fB = clamp(num(fractionB, 0) / 100, 0, 1);
  const contrast = clamp(Math.abs(num(apiA) - num(apiB)) / 25, 0, 1); // 0 same, 1 at >=25° contrast
  const light = clamp((Math.max(num(apiA), num(apiB)) - 30) / 25, 0, 1); // paraffinic diluent presence
  const mixExposure = 4 * fB * (1 - fB); // 0 at endpoints, 1 at 50/50
  const asi = contrast * (0.4 + 0.6 * light) * mixExposure;
  const stable = asi < 0.35;
  let message;
  if (asi < 0.35) message = 'Screens compatible: low risk of asphaltene destabilization. Confirm with an ASTM D7112 or D7157 spot test before commingling.';
  else if (asi < 0.6) message = 'Marginal: asphaltenes may destabilize on blending. Bench-test (ASTM D7112) before commingling.';
  else message = 'High risk: a strong heavy and light contrast is likely to destabilize asphaltenes. Do not commingle without lab confirmation.';
  return { stable, message, asi: Number(asi.toFixed(3)) };
};

/**
 * Single blend splice point used before PVT. Returns the effective engine Fluid
 * to run through the identical PVT/separator path, plus the blending result (or
 * null when blending is off). Re-normalizes through normalizeFluid so the blend
 * inherits the chosen correlations and feed and gets pb=null => auto-solve.
 */
export const resolveEffectiveFluid = (inputs) => {
  const blend = inputs?.blending;
  if (!blend?.enabled || !inputs?.streamB?.blackOil) {
    return { fluid: normalizeFluid(inputs), blending: null };
  }
  const boA = inputs.streamA?.blackOil ?? {};
  const boB = inputs.streamB.blackOil;
  const fraction = clamp(num(blend.streamB_fraction, 0), 0, 100);
  const mixed = blendBlackOil(boA, boB, fraction);
  const fluid = normalizeFluid({
    ...inputs,
    streamA: { ...inputs.streamA, blackOil: { ...mixed, pb: null } },
  });
  return {
    fluid,
    blending: {
      compatibility: screenAsphalteneCompatibility(num(boA.api), num(boB.api), fraction),
      properties: {
        api: Number(mixed.api.toFixed(2)),
        gor: Number(mixed.gor.toFixed(1)),
        gasSg: Number(mixed.gasSg.toFixed(3)),
        salinity: Number(mixed.salinity.toFixed(0)),
      },
    },
  };
};

// ---------------------------------------------------------------------------
// PVT primitives (dispatch + new physics the util lacks)
// ---------------------------------------------------------------------------

/**
 * The selectable Pb / Rs / Bo correlations. One record holds the name a
 * report prints AND the functions the engine calls, so the name can never
 * drift from the calculation (FLUID-U1, RL1 and RL11): rsAt and boAt read
 * `rs` and `bo` from the record whose `label` goes into meta.methods.
 */
export const PB_RS_BO_METHODS = Object.freeze({
  standing: Object.freeze({
    label: 'Standing',
    reference: 'Standing (1947)',
    rs: (p, f) => pvtCalcs.standing_rs(p, f.api, f.gasGravity, f.temp),
    bo: (rs, f) => pvtCalcs.standing_bo(rs, f.api, f.gasGravity, f.temp),
  }),
  vasquez_beggs: Object.freeze({
    label: 'Vasquez-Beggs',
    reference: 'Vasquez and Beggs (1980)',
    // what the primitive does with the gas gravity, said where the report can read it
    note: 'The gas gravity is corrected to the 114.7 psia reference separator with a fixed 100 psia separator at the reservoir temperature; the Separator Train does not enter.',
    rs: (p, f) => pvtCalcs.vasquez_beggs_rs(p, f.api, f.gasGravity, f.temp),
    bo: (rs, f) => pvtCalcs.vasquez_beggs_bo(rs, f.api, f.gasGravity, f.temp),
  }),
  glaso: Object.freeze({
    label: 'Glaso',
    reference: 'Glaso (1980)',
    rs: (p, f) => pvtCalcs.glaso_rs(p, f.api, f.gasGravity, f.temp),
    bo: (rs, f) => pvtCalcs.glaso_bo(rs, f.api, f.gasGravity, f.temp),
  }),
});

/** The selectable oil viscosity correlations, name and functions in one record. */
export const OIL_VISCOSITY_METHODS = Object.freeze({
  beggs_robinson: Object.freeze({
    label: 'Beggs-Robinson',
    reference: 'Beggs and Robinson (1975)',
    live: (rs, f) => pvtCalcs.beggs_robinson_viscosity(f.api, f.temp, true, rs),
    dead: (f) => pvtCalcs.beggs_robinson_viscosity(f.api, f.temp, false),
  }),
  beal_cook_spillman: Object.freeze({
    label: 'Beal-Cook-Spillman',
    reference: 'Beal (1946), Cook and Spillman chart fit (simplified form)',
    live: (rs, f) => pvtCalcs.beal_cook_spillman_viscosity(f.api, f.temp, true, null, rs),
    dead: (f) => pvtCalcs.beal_cook_spillman_viscosity(f.api, f.temp, false),
  }),
});

/** The record the engine uses for a fluid: an unknown key runs Standing, and says so. */
export const pbRsBoMethod = (fluid) => PB_RS_BO_METHODS[fluid?.correlations?.pb_rs_bo] || PB_RS_BO_METHODS.standing;
/** The record the engine uses for oil viscosity: an unknown key runs Beggs-Robinson. */
export const oilViscosityMethod = (fluid) => OIL_VISCOSITY_METHODS[fluid?.correlations?.viscosity] || OIL_VISCOSITY_METHODS.beggs_robinson;

/** Solution GOR at pressure p for the selected correlation (scf/STB). */
export const rsAt = (p, fluid) => pbRsBoMethod(fluid).rs(p, fluid);

// The parameters of a correlation match to laboratory data (FLUID-U2-004):
// multiplier 1 and shift 0 for a fluid that carries no match.
const pos = (v, d) => (Number.isFinite(v) && v > 0 ? v : d);
const boMultiplier = (fluid) => pos(fluid?.match?.boMult, 1);
const boShift = (fluid) => (Number.isFinite(fluid?.match?.boShift) ? fluid.match.boShift : 0);
const muMultiplier = (fluid) => pos(fluid?.match?.mu, 1);

/** Oil FVF for a given Rs and the selected correlation (rb/STB): multiplier x correlation + shift when a lab match is applied. */
export const boAt = (rs, fluid) => pbRsBoMethod(fluid).bo(rs, fluid) * boMultiplier(fluid) + boShift(fluid);

/** Saturated (bubble-point) oil viscosity at a given Rs (cp), times the lab match multiplier when one is applied. */
export const muObAt = (rs, fluid) => oilViscosityMethod(fluid).live(rs, fluid) * muMultiplier(fluid);

/** Dead (gas-free) oil viscosity at the fluid temperature (cp), on the same matched curve. */
export const muOdAt = (fluid) => oilViscosityMethod(fluid).dead(fluid) * muMultiplier(fluid);

/**
 * Solution GOR of the saturated oil at pressure p (scf/STB) as the table
 * holds it: the correlation times `fluid.rsScale` plus `fluid.rsShift`,
 * never above the solution GOR and never below zero. The scale is 1 and
 * the shift 0 unless a bubble point was entered (FLUID-U1-005: one
 * multiplier makes Rs meet Rsb there) or matched to laboratory data
 * (FLUID-U2-004: multiplier and shift, still meeting Rsb at Pb).
 *
 * A shift would leave gas in solution at atmospheric pressure. So below
 * `fluid.rsLowP`, the lowest laboratory pressure the match was fitted on,
 * Rs follows the correlation scaled to meet the matched curve at that
 * pressure, and returns to (nearly) zero with it.
 */
export const saturatedRs = (p, fluid) => {
  const scale = Number.isFinite(fluid.rsScale) && fluid.rsScale > 0 ? fluid.rsScale : 1;
  const shift = Number.isFinite(fluid.rsShift) ? fluid.rsShift : 0;
  const linear = (q) => rsAt(q, fluid) * scale + shift;
  const low = fluid.rsLowP;
  let rs;
  if (shift !== 0 && Number.isFinite(low) && low > 0 && p < low) {
    const fLow = rsAt(low, fluid);
    rs = fLow > 0 ? (linear(low) * rsAt(p, fluid)) / fLow : 0;
  } else rs = linear(p);
  return Math.max(0, Math.min(rs, fluid.rsb));
};

/**
 * Rs, Bo and oil viscosity of the saturated oil at a pressure at or below
 * the bubble point, unrounded: what computePvtRow prints, for a caller that
 * fits to them (the laboratory match).
 */
export const saturatedAt = (p, fluid) => {
  const rs = saturatedRs(p, fluid);
  return { rs, bo: boAt(rs, fluid), muO: muObAt(rs, fluid) };
};

/**
 * Rs, Bo and oil viscosity at any pressure for a fluid whose bubble point
 * is pb, unrounded, by the relations computePvtRow uses on either side of
 * it. `boShape` is the factor the undersaturated Bo carries on Bo(Pb)
 * (1 at and below the bubble point).
 */
export const oilAt = (p, fluid, pb) => {
  if (p <= pb) return { ...saturatedAt(p, fluid), boShape: 1 };
  const boShape = undersaturatedBo(fluid, p, pb, 1);
  return { rs: fluid.rsb, bo: boAt(fluid.rsb, fluid) * boShape, muO: undersaturatedMuO(muObAt(fluid.rsb, fluid), p, pb), boShape };
};

/**
 * Bubble-point pressure consistent with the chosen Rs correlation: the pressure
 * at which Rs(p) equals the input solution GOR (Rsb). Bisection over a physical
 * bracket; falls back to Standing's explicit Pb if Rsb is unreachable in range.
 * `route` says which happened: 'solved', 'standing-explicit' (the fallback,
 * which a report has to name) or 'no-solution-gas'.
 */
export const solveBubblePointDetail = (fluid) => {
  const target = fluid.rsb;
  if (!(target > 0)) return { pb: 14.7, route: 'no-solution-gas' };

  let lo = 14.7;
  let hi = 15000;
  const rsLo = rsAt(lo, fluid);
  const rsHi = rsAt(hi, fluid);

  // If the correlation can't reach Rsb even at 15000 psia (or is non-monotonic
  // at the low end), fall back to Standing's explicit bubble-point correlation.
  if (!(rsHi >= target) || !(rsLo <= target)) {
    const pb = pvtCalcs.standing_pb(target, fluid.api, fluid.gasGravity, fluid.temp);
    return { pb: Math.min(Math.max(pb, 14.7), 15000), route: 'standing-explicit' };
  }

  for (let i = 0; i < 60; i += 1) {
    const mid = 0.5 * (lo + hi);
    const rsMid = rsAt(mid, fluid);
    if (Math.abs(rsMid - target) / target < 1e-4) return { pb: mid, route: 'solved' };
    if (rsMid < target) lo = mid;
    else hi = mid;
  }
  return { pb: 0.5 * (lo + hi), route: 'solved' };
};

/**
 * An entered bubble point with the constant that makes the Rs correlation
 * meet the solution GOR there: Rs(p) = scale x Rs_correlation(p) below Pb,
 * scale = Rsb / Rs_correlation(Pb). Without it the table jumps at Pb (the
 * correlation's own Rs at the entered pressure is not Rsb) and Bo at the
 * bubble point disagrees with the headline Bo. One-point matching of a
 * correlation to a measured bubble point by a multiplier is the usual
 * practice (the "Parameter 1" multiplier of black-oil matching); `scale`
 * is reported so a reviewer sees how far the correlation was moved.
 */
export const enteredBubblePoint = (fluid) => {
  const pb = fluid.pb;
  const rsCorr = rsAt(pb, fluid);
  const onePoint = fluid.rsb > 0 && rsCorr > 0 ? fluid.rsb / rsCorr : 1;
  const correlationPb = solveBubblePointDetail({ ...fluid, pb: null }).pb;
  // The laboratory saturation pressure of a correlation match (FLUID-U2-004):
  // the match's own multiplier, with the shift that still makes Rs meet the
  // solution GOR at the bubble point. Without a fitted multiplier it is the
  // one-point match above.
  if (fluid.pbFrom === 'lab') {
    const fitted = Number.isFinite(fluid.match?.rsMult) && fluid.match.rsMult > 0;
    const rsScale = fitted ? fluid.match.rsMult : onePoint;
    return { pb, route: 'lab', rsScale, rsShift: fitted ? fluid.rsb - rsScale * rsCorr : 0, correlationPb };
  }
  return { pb, route: 'entered', rsScale: onePoint, rsShift: 0, correlationPb };
};

/** The bubble point alone (psia); solveBubblePointDetail also says how it was reached. */
export const solveBubblePoint = (fluid) => solveBubblePointDetail(fluid).pb;

/** Sutton (1985) gas pseudo-critical properties from gas gravity. */
const suttonPseudoCriticals = (gasGravity) => ({
  ppc: 756.8 - 131.0 * gasGravity - 3.6 * gasGravity * gasGravity, // psia
  tpc: 169.2 + 349.5 * gasGravity - 74.0 * gasGravity * gasGravity, // °R
});

/**
 * LEGACY: gas Z-factor via the Papay correlation (dimensionless), held in
 * 0.25 to 1.15. The Fluid Systems Studio table no longer uses it
 * (FLUID-U2-006: gasZ below, from the canonical engines library, gated on
 * the Standing-Katz chart). It stays exported, unchanged, for the apps that
 * still call it until their own rounds move them: Nodal Analysis
 * (utils/nodal/pvt.js, cullenderSmith.js) and the gas well deliverability
 * of Production Operations (utils/production/gasWell.js).
 */
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

/** The z-factor methods of the table, with their report names (from the engines library). */
export const GAS_Z_METHOD_RECORDS = GAS_Z_METHODS;
export const gasZMethod = (fluid) => (GAS_Z_METHODS[fluid?.correlations?.z_factor] ? fluid.correlations.z_factor : DEFAULT_GAS_Z_METHOD);

/**
 * Gas Z-factor of the black-oil table (FLUID-U2-006): Sutton pseudo-critical
 * properties into Dranchuk-Abou-Kassem (default) or Hall-Yarborough, from the
 * canonical engines library (engines/fluid/blackOil gasZDetail), gated there
 * on readings of the Standing-Katz chart.
 */
export const gasZ = (p, tempF, gasGravity, method = DEFAULT_GAS_Z_METHOD) => gasZDetail(p, tempF, gasGravity, method).z;

/** The pseudo-reduced temperature of a gas at a temperature (Sutton pseudo-criticals, 459.67 offset). */
export const pseudoReducedState = (p, tempF, gasGravity) => {
  const d = gasZDetail(p, tempF, gasGravity);
  return { ppr: d.ppr, tpr: d.tpr, ppc: d.ppc, tpc: d.tpc };
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

/** The floor coAt holds the compressibility above (1/psi). */
const CO_FLOOR = 1e-6;

/** Undersaturated oil isothermal compressibility (1/psi), Vasquez-Beggs. */
export const coAt = (fluid, p) => {
  const { rsb, temp, gasGravity, api } = fluid;
  const co =
    (-1433 + 5 * rsb + 17.2 * temp - 1180 * gasGravity + 12.61 * api) / (1e5 * Math.max(p, 1));
  return Math.max(co, CO_FLOOR);
};

/**
 * Oil FVF above the bubble point (rb/STB) from the Vasquez-Beggs
 * compressibility. co = A / p with A constant for a fluid, so the definition
 * co = -(1/Bo) dBo/dp integrates to Bo = Bob (pb/p)^A (the form Vasquez and
 * Beggs give, Bo = Bob exp(-A ln(p/pb))). Before FLUID-U1-007 the table used
 * Bob exp(-co(p) (p - pb)), the compressibility at p times the whole
 * pressure step: its Bo fell too slowly, by a compressibility up to 38
 * percent below the co printed in the same row. Where coAt holds co at its
 * floor (A not positive) the compressibility is constant and the
 * exponential form is exact.
 */
export const undersaturatedBo = (fluid, p, pb, boPb) => {
  if (!(p > pb)) return boPb;
  const { rsb, temp, gasGravity, api } = fluid;
  const A = (-1433 + 5 * rsb + 17.2 * temp - 1180 * gasGravity + 12.61 * api) / 1e5;
  // co = A / p down to the floor of coAt; the floor acts above pFloor
  const pFloor = A > 0 ? A / CO_FLOOR : 0;
  const pSwitch = Math.min(Math.max(pFloor, pb), p);
  const power = pSwitch > pb ? Math.pow(pb / pSwitch, A) : 1;
  return boPb * power * Math.exp(-CO_FLOOR * (p - pSwitch));
};

/**
 * Undersaturated oil viscosity above the bubble point (cp): viscosity rises with
 * pressure. Vasquez-Beggs (1980): μo = μob · (p/pb)^m.
 */
export const undersaturatedMuO = (muob, p, pb) => {
  const m = 2.6 * Math.pow(p, 1.187) * Math.exp(-11.513 - 8.98e-5 * p);
  return muob * Math.pow(p / pb, m);
};

/**
 * Formation water FVF (RB/STB) and viscosity (cp) from the canonical
 * engines library (McCain 1990 and 1991). Salinity enters the viscosity
 * only: the engine's Bw is the pure-water form and says so.
 */
export const bwAt = (p, tempF) => mccainBw(p, tempF);
export const muWaterAt = (p, tempF, salinityPpm) => mccainMuW(p, tempF, Math.max(0, num(salinityPpm)));

// ---------------------------------------------------------------------------
// Flow assurance (Phase 2) — hydrate screening + WAT resolution
// ---------------------------------------------------------------------------

/**
 * Gas-hydrate formation temperature (°F) at pressure p (psia) via Motiee (1991),
 * a gas-gravity screening correlation in native field units. Returns null for
 * non-positive pressure. Gas gravity is clamped to the 0.55-1.0 validity band.
 */
export const hydrateTempMotiee = (p, gasGravity) => {
  if (!(p > 0)) return null;
  const g = clamp(num(gasGravity), 0.55, 1.0);
  const logP = Math.log10(p);
  return (
    -238.24469 +
    78.99667 * logP -
    5.352544 * logP * logP +
    349.473877 * g -
    150.854675 * g * g -
    27.604065 * logP * g
  );
};

/** Hydrate formation curve [{pressure, temp}] over a pressure range (ascending). */
export const hydrateCurve = (gasGravity, pMin = 100, pMax = 3500, nPoints = 30) => {
  const n = Math.max(2, Math.round(nPoints));
  const step = (pMax - pMin) / (n - 1);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const p = pMin + i * step;
    const t = hydrateTempMotiee(p, gasGravity);
    if (t != null && Number.isFinite(t)) out.push({ pressure: Math.round(p), temp: Number(t.toFixed(1)) });
  }
  return out;
};

/**
 * A pasted P-T profile as [{pressure (psia), temp (degF)}], pressure
 * descending. The door (fluidstudio/ptProfileImport readPtProfile) reads any
 * separator, a header and the units chosen with it; a bare string is read
 * as psia and degF, as every saved project holds it.
 */
export const parsePtProfile = (raw, units) => {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'string') return [];
  return readPtProfile(raw, units).points;
};

/** Opt-in screening WAT (°F) from wax content (wt%). Labeled, not a cited correlation. */
const watFromWax = (waxWtPct) => {
  const w = num(waxWtPct);
  if (!(w > 0)) return null;
  return Math.min(40 + 4.0 * w, 160);
};

/**
 * Flow-assurance screening. Always draws the hydrate envelope from gas gravity;
 * detects whether the P-T profile crosses into the hydrate region. WAT is
 * resolved measured > wax-screening > null (never fabricated from API). AOP is
 * structurally null. Returns null only when the fluid itself is invalid.
 */
export const computeFlowAssurance = (fluid, fa, ptRaw, ptUnits) => {
  if (!fluid || !(fluid.gasGravity > 0)) return null;
  // Engaged only when the user gives it something to analyze: a P-T profile,
  // a measured WAT, or a wax content. Otherwise stay out of the results.
  const profileRaw = typeof ptRaw === 'string' ? ptRaw.trim() : '';
  const engaged = profileRaw.length > 0 || num(fa?.measuredWat) > 0 || num(fa?.waxContent) > 0;
  if (!engaged) return null;

  const warnings = [FA_WARNINGS.hydrate, FA_WARNINGS.aop];
  if (num(fluid.gasGravity) < 0.55 || num(fluid.gasGravity) > 1.0) warnings.push(FA_WARNINGS.sgBand);

  // WAT resolution order.
  const measured = num(fa?.measuredWat);
  let wat = null;
  let watBasis = null;
  if (measured > 0) {
    wat = measured;
    watBasis = 'measured';
  } else {
    const waxWat = watFromWax(fa?.waxContent);
    if (waxWat != null) {
      wat = Number(waxWat.toFixed(1));
      watBasis = 'wax_content_screening';
      warnings.push(FA_WARNINGS.watWax);
    } else {
      warnings.push(FA_WARNINGS.watNull);
    }
  }

  const curve = hydrateCurve(fluid.gasGravity);
  const profile = parsePtProfile(ptRaw, ptUnits).map((pt) => {
    const tHyd = hydrateTempMotiee(pt.pressure, fluid.gasGravity);
    const subcooling = tHyd != null ? tHyd - pt.temp : null;
    return {
      pressure: pt.pressure,
      temp: pt.temp,
      t_hyd: tHyd != null ? Number(tHyd.toFixed(1)) : null,
      subcooling: subcooling != null ? Number(subcooling.toFixed(1)) : null,
      at_risk: subcooling != null && subcooling > 0,
    };
  });

  const crossers = profile.filter((pt) => pt.at_risk);
  const minTemp = profile.length ? Math.min(...profile.map((pt) => pt.temp)) : null;
  const maxSubcooling = profile.reduce((mx, pt) => Math.max(mx, pt.subcooling ?? 0), 0);

  return {
    wat,
    wat_basis: watBasis,
    aop: null, // structurally null — not computable from black-oil
    hydrate_risk: {
      min_temp: minTemp,
      profile_crosses: crossers.length > 0,
      first_crossing: crossers.length ? { pressure: crossers[0].pressure, temp: crossers[0].temp } : null,
      max_subcooling: Number(maxSubcooling.toFixed(1)),
    },
    hydrate_curve: curve,
    pt_profile: profile,
    meta: { hydrate_correlation: 'Motiee (1991)', wat_correlation: watBasis, warnings },
  };
};

// ---------------------------------------------------------------------------
// PVT table
// ---------------------------------------------------------------------------

/** Assemble one PVT row at pressure p for a fluid whose bubble point is pb. */
export const computePvtRow = (p, fluid, pb) => {
  const saturated = p <= pb;
  const z = gasZ(p, fluid.temp, fluid.gasGravity, gasZMethod(fluid));

  // Solution GOR: capped at Rsb at/above the bubble point. With an entered
  // bubble point the correlation is scaled by one constant (fluid.rsScale,
  // set by analyzeFluidSystem) so that Rs meets Rsb at that pressure; the
  // scale is exactly 1 when the bubble point was solved (FLUID-U1-005). A
  // laboratory match adds a shift (FLUID-U2-004); see saturatedRs.
  const rs = saturated ? saturatedRs(p, fluid) : fluid.rsb;

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
    bo = undersaturatedBo(fluid, p, pb, boPb); // undersaturated shrinkage
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
    Bw: Number(bwAt(p, fluid.temp).toFixed(4)),
    mu_w: Number(muWaterAt(p, fluid.temp, fluid.salinity).toFixed(4)),
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
  // the default span, widened to cover the laboratory pressures when there are any
  const pMax = num(sweep.pMax, Math.max(pb * 1.4, pb + 2000, num(sweep.pCover, 0)));
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
    bg_at_pb: Number(bgAt(pb, fluid.temp, gasZ(pb, fluid.temp, fluid.gasGravity, gasZMethod(fluid))).toFixed(6)),
    z_at_pb: Number(gasZ(pb, fluid.temp, fluid.gasGravity, gasZMethod(fluid)).toFixed(4)),
    co_at_pb: Number(coAt(fluid, pb).toExponential(3)),
    mu_od: Number(muOdAt(fluid).toFixed(4)),
    bw_at_pb: Number(bwAt(pb, fluid.temp).toFixed(4)),
    mu_w_at_pb: Number(muWaterAt(pb, fluid.temp, fluid.salinity).toFixed(4)),
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
  const exact = [];
  let rsIn = fluid.rsb;
  train.forEach((s, i) => {
    const isStockTank = i === train.length - 1;
    const stageFluid = { ...fluid, temp: s.temperature };
    // Retained solution gas at this stage's P,T (never more than what entered).
    // The final stock-tank stage liberates everything remaining so the train
    // telescopes exactly to Rsb.
    const rsOut = isStockTank ? 0 : Math.min(Math.max(rsAt(s.pressure, stageFluid), 0), rsIn);
    const gasLiberated = Math.max(0, rsIn - rsOut);
    exact.push({ isStockTank, gas: gasLiberated });
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

  // Totals are summed before rounding (FLUID-U1-008): summing the rounded
  // stage values printed 650.1 scf/STB for a 650.0 solution GOR.
  const separatorGor = exact.filter((s) => !s.isStockTank).reduce((sum, s) => sum + s.gas, 0);
  const stockTankGor = exact.find((s) => s.isStockTank)?.gas ?? 0;
  const totalGasRate = exact.reduce((sum, s) => sum + (s.gas * oilRate) / 1000, 0);

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
// What the engine used: the method per property, the bubble point source and
// the published ranges (FLUID-U1: the report, the limits block and the pvt-1
// contract all read these; nothing downstream restates a correlation name)
// ---------------------------------------------------------------------------

/** Standard conditions of the black-oil stream (psia, degF). */
export const BLACK_OIL_STANDARD_CONDITIONS = Object.freeze({ pressure_psia: STOCK_TANK.pressure, temperature_degF: STOCK_TANK.temperature });

/**
 * Published data ranges of the fixed correlations (the selectable Pb / Rs /
 * Bo ones are in CORRELATION_RANGES). Each entry is [low, high]. Sources:
 * the primary publications as documented in the engines library
 * (packages/engines/engines/fluid/blackOil.ts viscosityValidityWarnings and
 * mccainMuW) for Beggs-Robinson, Beal, the Vasquez-Beggs undersaturated
 * viscosity and Lee-Gonzalez-Eakin; Vasquez and Beggs (1980) for the oil
 * compressibility (the same data set as their Rs and Bo); Sutton (1985) for
 * the pseudo-critical fit; McCain (1990) for the water FVF. The z-factor
 * window is the pseudo-reduced window over which the engines library checked
 * each method against readings of the Standing-Katz chart (GAS_Z_METHODS).
 */
export const FIXED_CORRELATION_RANGES = Object.freeze({
  beggs_robinson: { api: [16, 58], temp: [70, 295], rs: [20, 2070] },
  beal_cook_spillman: { api: [18, 50], temp: [100, 220] },
  vasquez_beggs_co: { rs: [20, 2199], temp: [75, 294], api: [15.3, 59.5], gasGravity: [0.511, 1.351] },
  vasquez_beggs_undersaturated: { pressure: [141, 9515] },
  sutton: { gasGravity: [0.57, 1.68] },
  lee_gonzalez_eakin: { pressure: [100, 8000], temp: [100, 340], gasGravity: [0.55, 1.0] },
  mccain_bw: { pressure: [0, 5000], temp: [0, 260] },
  mccain_mu_w: { pressure: [0, 10000], temp: [100, 400], salinity: [0, 260000] },
  // the z-factor: Sutton's gas gravity range and the pseudo-reduced window of the chart check
  dranchuk_abou_kassem: { gasGravity: [0.57, 1.68], tpr: GAS_Z_METHODS.dranchuk_abou_kassem.chartTpr, ppr: [0, GAS_Z_METHODS.dranchuk_abou_kassem.chartPpr[1]] },
  hall_yarborough: { gasGravity: [0.57, 1.68], tpr: GAS_Z_METHODS.hall_yarborough.chartTpr, ppr: [0, GAS_Z_METHODS.hall_yarborough.chartPpr[1]] },
});
/** Published pressure ranges of the Pb / Rs / Bo correlations (psia). */
export const PB_RS_BO_PRESSURE_RANGES = Object.freeze({ standing: [130, 7000], vasquez_beggs: [50, 5250], glaso: [150, 7127] });
/** LEGACY: the band the Papay zFactor clamps to (no longer used by the table). */
export const Z_CLAMP = Object.freeze([0.25, 1.15]);

/** The liberation basis of the black-oil correlation table, in words. */
export const BLACK_OIL_BASIS = Object.freeze({
  kind: 'correlation-separator',
  text: 'Black-oil correlations on a surface separation (flash) basis: Rs and Bo are per stock-tank barrel, and the correlations do not distinguish differential from flash liberation below the bubble point.',
});

const RANGE_VARIABLES = Object.freeze({
  rs: { label: 'solution GOR', unit: 'scf/STB', family: 'gor' },
  temp: { label: 'temperature', unit: 'degF', family: 'temperature' },
  api: { label: 'API gravity', unit: 'degAPI', family: null },
  gasGravity: { label: 'gas gravity', unit: 'air = 1', family: null },
  pressure: { label: 'pressure', unit: 'psia', family: 'pressure' },
  salinity: { label: 'salinity', unit: 'ppm', family: null },
  tpr: { label: 'pseudo-reduced temperature', unit: '', family: null },
  ppr: { label: 'pseudo-reduced pressure', unit: '', family: null },
});

/**
 * The method behind every property of the black-oil table, read from the
 * same records and branches the calculation ran through.
 * @param {object} fluid the normalized fluid the table was computed for
 * @param {{route: string}} pbDetail how the bubble point was reached
 * @returns {Array<{key: string, label: string, method: string, reference: string,
 *   kind: 'correlation'|'entered'|'definition', rangeKey: ?string, note?: string}>}
 */
export function blackOilMethods(fluid, pbDetail) {
  const prb = pbRsBoMethod(fluid);
  const prbKey = Object.keys(PB_RS_BO_METHODS).find((k) => PB_RS_BO_METHODS[k] === prb);
  const visc = oilViscosityMethod(fluid);
  const viscKey = Object.keys(OIL_VISCOSITY_METHODS).find((k) => OIL_VISCOSITY_METHODS[k] === visc);
  const route = pbDetail?.route;
  let pb;
  if (route === 'entered' || route === 'lab') {
    const scale = Number(pbDetail.rsScale ?? 1);
    pb = {
      method: route === 'lab' ? 'Laboratory saturation pressure (correlation match)' : 'Entered by the user', reference: '', kind: route === 'lab' ? 'lab' : 'entered', rangeKey: null,
      note: route === 'lab' && Number(pbDetail.rsShift ?? 0) !== 0
        ? `${prb.label} alone puts the bubble point at ${Math.round(pbDetail.correlationPb)} psia. Below the laboratory pressure its Rs is multiplied by ${scale.toFixed(3)} and shifted by ${Number(pbDetail.rsShift).toFixed(1)} scf/STB, so that Rs meets the solution GOR there and follows the laboratory Rs below it.${fluid.match?.rsLowP ? ` Below ${Math.round(fluid.match.rsLowP)} psia, the lowest laboratory pressure of the fit, Rs follows the correlation scaled to meet the matched curve there.` : ''}`
        : `${prb.label} alone puts the bubble point at ${Math.round(pbDetail.correlationPb)} psia. Below the ${route === 'lab' ? 'laboratory' : 'entered'} pressure its Rs is multiplied by ${scale.toFixed(3)} so that Rs meets the solution GOR there.`,
    };
  } else if (route === 'standing-explicit') {
    pb = { method: 'Standing explicit bubble point', reference: 'Standing (1947)', kind: 'correlation', rangeKey: 'standing', note: `${prb.label} Rs could not reach the solution GOR between 14.7 and 15,000 psia, so the engine fell back to Standing.` };
  } else if (route === 'no-solution-gas') {
    pb = { method: 'Set to 14.7 psia (no solution gas)', reference: '', kind: 'definition', rangeKey: null };
  } else {
    pb = { method: `${prb.label} Rs(p) solved for the solution GOR`, reference: prb.reference, kind: 'correlation', rangeKey: prbKey, note: 'Solved by bisection on pressure.' };
  }
  const row = (key, label, rec) => ({ key, label, ...rec });
  // a correlation match to laboratory data names its multiplier and shift beside the correlation (FLUID-U2-004)
  const kBo = boMultiplier(fluid);
  const sBo = boShift(fluid);
  const kMu = muMultiplier(fluid);
  const sign = (v, d) => `${v >= 0 ? 'plus' : 'minus'} ${Math.abs(v).toFixed(d)}`;
  const boWords = kBo !== 1 || sBo !== 0 ? `${prb.label}, multiplied by ${kBo.toFixed(4)}${sBo !== 0 ? ` ${sign(sBo, 4)} RB/STB` : ''} (laboratory match)` : prb.label;
  const muWords = kMu !== 1 ? `${visc.label}, multiplied by ${kMu.toFixed(4)} (laboratory match)` : visc.label;
  const rsShiftValue = Number(pbDetail?.rsShift ?? 0);
  const rsWords = route === 'entered' ? `${prb.label}, scaled to the entered bubble point`
    : route === 'lab' ? `${prb.label}, multiplied by ${Number(pbDetail.rsScale ?? 1).toFixed(4)}${rsShiftValue !== 0 ? ` ${sign(rsShiftValue, 1)} scf/STB` : ''} (laboratory match)` : prb.label;
  return [
    row('pb', 'Bubble point pressure', pb),
    row('rs', 'Solution GOR Rs', {
      method: rsWords,
      reference: prb.reference, kind: 'correlation', rangeKey: prbKey, note: ['Held at the solution GOR above the bubble point.', prb.note].filter(Boolean).join(' '),
    }),
    row('bo', 'Oil formation volume factor Bo', { method: boWords, reference: prb.reference, kind: 'correlation', rangeKey: prbKey, note: 'Above the bubble point: Bo(Pb) (Pb / p)^A, the Vasquez-Beggs compressibility co = A / p integrated.' }),
    row('co', 'Oil compressibility co (undersaturated)', { method: 'Vasquez-Beggs', reference: 'Vasquez and Beggs (1980)', kind: 'correlation', rangeKey: 'vasquez_beggs_co' }),
    row('mu_od', 'Dead oil viscosity', { method: muWords, reference: visc.reference, kind: 'correlation', rangeKey: viscKey }),
    row('mu_o', 'Live (saturated) oil viscosity', { method: muWords, reference: visc.reference, kind: 'correlation', rangeKey: viscKey }),
    row('mu_o_undersaturated', 'Undersaturated oil viscosity', { method: 'Vasquez-Beggs', reference: 'Vasquez and Beggs (1980)', kind: 'correlation', rangeKey: 'vasquez_beggs_undersaturated' }),
    row('z', 'Gas deviation factor Z', (() => {
      const zm = gasZMethod(fluid);
      const rec = GAS_Z_METHODS[zm];
      return {
        method: `${rec.label}, with Sutton pseudo-critical properties`, reference: `${rec.reference}; Sutton (1985)`, kind: 'correlation', rangeKey: zm,
        note: `Within ${(rec.chartError * 100).toFixed(2)} percent of the Standing-Katz chart from pseudo-reduced temperature ${rec.chartTpr[0]} to ${rec.chartTpr[1]} and pressure ${rec.chartPpr[0]} to ${rec.chartPpr[1]}. ${rec.nearCritical}`,
      };
    })()),
    row('mu_g', 'Gas viscosity', { method: 'Lee-Gonzalez-Eakin', reference: 'Lee, Gonzalez and Eakin (1966)', kind: 'correlation', rangeKey: 'lee_gonzalez_eakin' }),
    row('bg', 'Gas formation volume factor Bg', { method: 'Real gas law, Bg = 0.00504 Z T / p', reference: '', kind: 'definition', rangeKey: null, note: 'The constant is for field units (RB/scf, T in degR, p in psia), at the standard conditions of this report.' }),
    row('bw', 'Water formation volume factor Bw', { method: 'McCain', reference: 'McCain (1990)', kind: 'correlation', rangeKey: 'mccain_bw', note: 'Pure water form: salinity is not applied to Bw.' }),
    row('mu_w', 'Water viscosity', { method: 'McCain', reference: 'McCain (1991)', kind: 'correlation', rangeKey: 'mccain_mu_w' }),
  ];
}

/** The published range record behind a method's rangeKey, or null. */
export const publishedRange = (rangeKey) => {
  if (!rangeKey) return null;
  if (CORRELATION_RANGES[rangeKey]) {
    const { label: _label, ...vars } = CORRELATION_RANGES[rangeKey];
    return { ...vars, pressure: PB_RS_BO_PRESSURE_RANGES[rangeKey] };
  }
  return FIXED_CORRELATION_RANGES[rangeKey] || null;
};

/**
 * Every input, and every stretch of the pressure table, that sits outside
 * the published range of a correlation the engine used.
 * @returns {Array<{key: string, method: string, variable: string, label: string, unit: string,
 *   family: ?string, value: number, low: number, high: number, scope: 'input'|'table', rows?: number, text: string}>}
 */
export function blackOilRangeFlags(fluid, methods, table = []) {
  // the gas at the table temperature: its pseudo-reduced temperature, and the pseudo-critical pressure that scales the rows
  const reduced = fluid.gasGravity > 0 && Number.isFinite(fluid.temp) ? pseudoReducedState(1, fluid.temp, fluid.gasGravity) : null;
  const values = { rs: fluid.rsb, temp: fluid.temp, api: fluid.api, gasGravity: fluid.gasGravity, salinity: fluid.salinity, tpr: reduced ? Number(reduced.tpr.toFixed(3)) : null };
  // one flag per (correlation range, variable), listing every property it reaches
  const groups = new Map();
  for (const m of methods || []) {
    const range = publishedRange(m.rangeKey);
    if (!range) continue;
    for (const [variable, bounds] of Object.entries(range)) {
      if (!bounds) continue;
      const id = `${m.rangeKey}:${variable}`;
      if (!groups.has(id)) groups.set(id, { id, rangeKey: m.rangeKey, variable, low: bounds[0], high: bounds[1], members: [] });
      groups.get(id).members.push(m);
    }
  }
  const nameOf = (rangeKey, members) => CORRELATION_RANGES[rangeKey]?.label
    || (rangeKey === 'sutton' ? 'Sutton pseudo-critical properties' : GAS_Z_METHODS[rangeKey]?.label || members[0].method);
  const out = [];
  for (const g of groups.values()) {
    const word = RANGE_VARIABLES[g.variable];
    const name = nameOf(g.rangeKey, g.members);
    const base = { id: g.id, key: g.members[0].key, method: name, variable: g.variable, label: word.label, unit: word.unit, family: word.family, low: g.low, high: g.high };
    const bounds = `${g.low} to ${g.high} ${word.unit}`;
    if (g.variable === 'ppr') {
      // the z-factor sweeps pseudo-reduced pressure with the table
      if (!reduced) continue;
      const rows = table.filter((r) => r.pressure / reduced.ppc > g.high);
      if (!rows.length) continue;
      const lo = Math.min(...rows.map((r) => r.pressure));
      const hi = Math.max(...rows.map((r) => r.pressure));
      out.push({
        ...base, scope: 'table', value: null, valueLow: lo, valueHigh: hi, rows: rows.length, properties: g.members.map((m) => m.label), family: null,
        text: `${name}: ${rows.length} table row${rows.length === 1 ? '' : 's'} (${lo === hi ? lo : `${lo} to ${hi}`} psia) above pseudo-reduced pressure ${g.high}, the end of the window the method was checked over.`,
      });
      continue;
    }
    if (g.variable !== 'pressure') {
      const v = Number(values[g.variable]);
      if (!Number.isFinite(v) || (v >= g.low && v <= g.high)) continue;
      out.push({
        ...base, scope: 'input', value: v, properties: g.members.map((m) => m.label),
        text: `${name}: ${word.label} ${v} ${word.unit} is outside its published range (${bounds}).`,
      });
      continue;
    }
    // the bubble point is one pressure: judge its own value
    const pbMember = g.members.find((m) => m.key === 'pb');
    if (pbMember && Number.isFinite(fluid.pb) && (fluid.pb < g.low || fluid.pb > g.high)) {
      out.push({
        ...base, id: `${g.id}:pb`, key: 'pb', scope: 'result', value: fluid.pb, properties: [pbMember.label],
        text: `${name}: the bubble point ${Math.round(fluid.pb)} psia is outside its published pressure range (${bounds}).`,
      });
    }
    // the table sweeps pressure: count the rows that leave the range
    const swept = g.members.filter((m) => m.key !== 'pb');
    if (!swept.length) continue;
    const undersatOnly = swept.every((m) => m.key === 'mu_o_undersaturated' || m.key === 'co');
    const rows = table.filter((r) => (r.pressure < g.low || r.pressure > g.high) && (!undersatOnly || r.phase === 'undersaturated'));
    if (!rows.length) continue;
    const lo = Math.min(...rows.map((r) => r.pressure));
    const hi = Math.max(...rows.map((r) => r.pressure));
    out.push({
      ...base, key: swept[0].key, scope: 'table', value: null, valueLow: lo, valueHigh: hi, rows: rows.length, properties: swept.map((m) => m.label),
      text: `${name}: ${rows.length} table row${rows.length === 1 ? '' : 's'} (${lo === hi ? lo : `${lo} to ${hi}`} psia) outside its published pressure range (${bounds}).`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fluid backbone (the ecosystem handoff object)
// ---------------------------------------------------------------------------

/**
 * The canonical "fluid backbone" other Petrolord apps consume. Keys are authored
 * to match the real Pipeline Sizer consumer contract (oil_gravity, gas_gravity,
 * gor, inlet_temperature, wat); richer PVT is carried for future consumers.
 */
export const buildBackbone = (fluid, pvt, separator) => ({
  // how the PVT below was computed, so a consumer can say so
  source: 'black-oil-correlations',
  correlations: correlationLabels(fluid),
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
  meta: { phase: 2, correlations: null, warnings: [message], batch: null },
  blending: null,
  flowAssurance: null,
  batchSummary: null,
});

/**
 * Batch sensitivity sweep: vary one Stream-A black-oil variable from min to max
 * over N steps and re-evaluate the engine at each. The per-run clone forces
 * batchRun.enabled=false so the inner analyzeFluidSystem never recurses.
 */
export const runBatch = (inputs) => {
  const cfg = inputs?.batchRun ?? {};
  const variable = BATCH_VARS[cfg.variable] ? cfg.variable : 'api';
  const unit = BATCH_VARS[variable].unit;
  let min = num(cfg.min);
  let max = num(cfg.max);
  if (max < min) {
    const t = min;
    min = max;
    max = t;
  }
  const steps = Math.max(2, Math.round(num(cfg.steps, 2)));

  const rows = [];
  for (let i = 0; i < steps; i += 1) {
    const value = min + (i / (steps - 1)) * (max - min); // endpoints exact
    const clone = {
      ...inputs,
      streamA: { ...inputs.streamA, blackOil: { ...inputs.streamA.blackOil, [variable]: value } },
      batchRun: { ...cfg, enabled: false }, // recursion guard
      // Sweep the un-blended Stream A fluid so the X-axis value is exactly the
      // swept property (blending would re-dilute it and mislabel the axis).
      blending: { ...(inputs.blending ?? {}), enabled: false },
    };
    const run = analyzeFluidSystem(clone);
    const k = run.pvt?.kpis;
    rows.push({
      input: Number(value.toFixed(4)),
      pb: k ? k.pb : null,
      bo_at_pb: k ? k.bo_at_pb : null,
      mu_o_at_pb: k ? k.mu_o_at_pb : null,
      wat: run.flowAssurance?.wat ?? null,
    });
  }
  return { rows, variable, unit, label: BATCH_VARS[variable].label };
};

/**
 * Analyze the full UI inputs into a Results object. Pure function of `inputs`
 * (so Load = setInputs and persistence never stores results). Short-circuits to
 * an empty result when required fluid properties are missing, so the page can
 * render its empty state instead of throwing.
 *
 * Order: blend splice -> guard -> Pb -> PVT -> separator -> backbone -> flow
 * assurance (fills backbone.wat) -> batch (recursion-guarded).
 */
export const analyzeFluidSystem = (inputs) => {
  const { fluid, blending } = resolveEffectiveFluid(inputs);

  const missing = !(fluid.api > 0) || !(fluid.rsb > 0) || !(fluid.gasGravity > 0) || !(fluid.temp > 0);
  if (missing) return emptyResult('Enter API, GOR, gas SG and temperature to run the analysis.');

  // how the bubble point was reached travels with the result (FLUID-U1)
  const pbDetail = fluid.pb != null ? enteredBubblePoint(fluid) : solveBubblePointDetail(fluid);
  const { pb } = pbDetail;
  const withPb = {
    ...fluid, pb, rsScale: pbDetail.rsScale ?? 1,
    ...(pbDetail.rsShift ? { rsShift: pbDetail.rsShift, ...(fluid.match?.rsLowP ? { rsLowP: fluid.match.rsLowP } : {}) } : {}),
  };

  const pvt = computePvtTable(withPb);
  const methods = blackOilMethods(withPb, pbDetail);
  const rangeFlags = blackOilRangeFlags(withPb, methods, pvt.table);
  const separator = flashSeparatorTrain(withPb, inputs?.separatorTrain?.stages, pb);
  const backbone = buildBackbone(withPb, pvt, separator);

  // Flow assurance: engaged only when the user supplies a P-T profile or WAT/wax
  // data. Fills backbone.wat when a WAT is known. FA-specific caveats live on the
  // FA card, not the global banner.
  const flowAssurance = computeFlowAssurance(withPb, inputs?.flowAssurance, inputs?.ptProfile?.raw, inputs?.ptProfile?.units);
  if (flowAssurance?.wat != null) backbone.wat = flowAssurance.wat;

  // Global warnings: cross-cutting caveats only.
  const warnings = [
    'Separator results use a black-oil staged-liberation approximation (a partition of the GOR by the Rs correlation). A compositional flash needs the compositional model.',
  ];
  const suspect = SUSPECT_CORRELATIONS[fluid.correlations.pb_rs_bo];
  if (suspect) warnings.push(suspect);
  warnings.push(...correlationRangeWarnings(fluid));
  const suspectVisc = SUSPECT_CORRELATIONS[fluid.correlations.viscosity];
  if (suspectVisc) warnings.push(suspectVisc);
  if (fluid.match) {
    warnings.push(`The correlations are matched to laboratory data${pbDetail.route === 'lab' ? `: the bubble point is the laboratory saturation pressure (${pbRsBoMethod(fluid).label} alone gives ${Math.round(pbDetail.correlationPb)} psia)` : ''}. The methods table of the report states the multiplier and shift of each property.`);
    if (pbDetail.route === 'lab' && num(inputs?.streamA?.blackOil?.pb) > 0) warnings.push('A bubble point is also typed in the inputs. The laboratory match takes its place while the match is applied.');
  }
  if (inputs?.labMatch?.applied && inputs?.blending?.enabled) {
    warnings.push('A correlation match to laboratory data is saved with this project. It is not applied to the blend, which is another fluid than the one the laboratory measured.');
  }
  if (pbDetail.route === 'entered' && inputs?.streamA?.blackOil?.pb && !inputs?.blending?.enabled) {
    warnings.push('Bubble point is user-specified; leave it blank to solve it from the GOR.');
    const scale = pbDetail.rsScale ?? 1;
    if (Math.abs(scale - 1) > 0.005) {
      warnings.push(`${pbRsBoMethod(fluid).label} alone puts the bubble point at ${Math.round(pbDetail.correlationPb)} psia. Its Rs is multiplied by ${scale.toFixed(3)} below the entered bubble point so that Rs, Bo and viscosity are continuous there.`);
    }
  }
  if (blending) {
    warnings.push('Blended fluid: API gravity is blended on a specific gravity (volume) basis; the salinity and temperature of the blend are estimates. See the Blending tab for compatibility.');
  }

  // Batch sensitivity (recursion-guarded inside runBatch).
  let batchSummary = null;
  let batchMeta = null;
  if (inputs?.batchRun?.enabled) {
    const batch = runBatch(inputs);
    batchSummary = batch.rows;
    batchMeta = { variable: batch.variable, unit: batch.unit, label: batch.label };
  }

  return {
    pvt,
    separator,
    backbone,
    blending,
    flowAssurance,
    batchSummary,
    meta: {
      phase: 2,
      correlations: fluid.correlations,
      warnings: [...new Set(warnings)],
      batch: batchMeta,
      // FLUID-U1: what the engine used, for the report and the pvt-1 contract
      fluid: withPb,
      blended: !!blending,
      methods,
      pbSource: pbDetail.route,
      pbDetail,
      rangeFlags,
      basis: BLACK_OIL_BASIS,
      standardConditions: BLACK_OIL_STANDARD_CONDITIONS,
    },
  };
};

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

/** Realistic default inputs (32°API volatile-ish oil) for the Sample button. */
export const sampleFluidStudioData = () => ({
  fluidModel: 'black-oil',
  streamA: {
    blackOil: { api: 32, gor: 650, gasSg: 0.75, temp: 200, pb: null, salinity: 35000 },
    // FS5 compositional sample: the "char-oil" fluid from the EOS validation
    // goldens, so switching the fluid model shows pre-validated numbers.
    composition: {
      model: 'pr78',
      zPct: { N2: 0, CO2: 2, H2S: 0, C1: 40, C2: 7, C3: 6, iC4: 0, nC4: 5, iC5: 0, nC5: 0, nC6: 6, 'C7+': 34 },
      plus: { mw: 190, sg: 0.84, tbF: null },
      pressure: 2500,
      temp: 200,
      envelope: { tMinF: 40, tMaxF: 400, nT: 15 },
    },
  },
  correlations: { pb_rs_bo: 'standing', viscosity: 'beggs_robinson', z_factor: 'dranchuk_abou_kassem' },
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
