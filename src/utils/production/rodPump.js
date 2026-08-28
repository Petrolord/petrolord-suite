/**
 * Rod Pump Design Studio analytics (Production P6).
 *
 * The mechanics, the wave equation and the unit kinematics are engine
 * work and live in the validated package (`utils/production/engine/rod*`
 * and `pumpingUnit`, vendored from @petrolord/engines). What lives here
 * is everything that needs the WELL: the inflow, the fluid column that
 * decides what the plunger has to lift, and how much of the barrel
 * actually fills once free gas is in the way.
 *
 * The chain, in order:
 *
 *   IPR at the design rate         -> flowing bottomhole pressure
 *   less the annulus column        -> pump intake pressure
 *   PVT there                      -> free gas at the pump, fillage
 *   tubing column above the pump   -> discharge pressure
 *   (discharge - intake) x area    -> the fluid load Fo
 *   wave equation                  -> plunger stroke, loads, torque
 *
 * Two things this fixes from the predecessor Artificial Lift Designer,
 * both of them here rather than in the mechanics:
 *
 *  1. Its fluid load SUBTRACTED the tubing pressure from the column
 *     instead of adding it, which lightened every design it produced.
 *  2. It had no inflow at all: the fluid level over the pump was never
 *     computed, so the submergence that decides both the load and the
 *     fillage was whatever the user happened to type.
 *
 * Pressures psia, depths ft, rates stb/d at surface, loads lb.
 */

// Relative imports (not the @/ alias) so this module also loads outside
// Vite: tools/validation/production-validation.ts exercises it directly.
import { pwfAtRate, rateAtPwf } from '../nodal/ipr.js';
import { pvtAt } from '../nodal/pvt.js';
import { num } from '../nodal/numerics.js';
import {
  buildRodString, naturalFrequency, designTaper,
} from './engine/rodString.js';
import {
  unitKinematics, surfacePositionFn, genericConventionalGeometry,
  conventionalGeometry, balanceUnit, parseUnitDesignation,
} from './engine/pumpingUnit.js';
import {
  runRodPumpDesign, displacementBpd, fluidLoadLb,
} from './engine/rodPumpDesign.js';
import { diagnoseCard, predictCard } from './engine/rodDynamics.js';
import { PLUNGER_SIZES, ROD_SIZES, ROD_GRADES } from './engine/rodCatalog.js';

/** Water gradient, psi/ft per unit specific gravity. */
export const PSI_PER_FT_SG = 0.433;

/**
 * Conditions at the pump intake for one design rate.
 *
 * `annulusGradPsiPerFt` is the gradient of the column standing between
 * the perforations and the intake, and it is a caller number for the
 * same reason as in the ESP studio: that column carries whatever gas
 * has broken out, and using the produced liquid gradient there
 * overstates the submergence.
 *
 * returns { pwfPsia, pipPsia, tempF, pvt, submergenceFt }
 */
export const intakeConditions = ({
  model, qoStbd, pumpTvdFt, perfTvdFt, annulusGradPsiPerFt,
}) => {
  const pwfPsia = pwfAtRate(model.ipr, qoStbd);
  const below = Math.max(perfTvdFt - pumpTvdFt, 0);
  const pipPsia = Math.max(pwfPsia - annulusGradPsiPerFt * below, 14.7);
  const tempF = model.tAt(pumpTvdFt);
  const pvt = pvtAt(model.fluidModel, Math.max(pipPsia, 14.7), tempF);
  return {
    pwfPsia,
    pipPsia,
    tempF,
    pvt,
    // Feet of fluid standing over the pump, which is what an operator
    // actually watches. Reported at the annulus gradient it was built on.
    submergenceFt: annulusGradPsiPerFt > 0 ? (pipPsia - 14.7) / annulusGradPsiPerFt : 0,
  };
};

/**
 * Specific gravity of the produced liquid, oil and water mixed.
 * Gas is not in this: what stands in the tubing above a rod pump is
 * liquid, and the free gas is vented up the annulus or handled by the
 * separator, which is what `gasFillage` below accounts for.
 */
export const liquidGravity = ({ api, wct }) => {
  const oilSg = 141.5 / (num(api, 32) + 131.5);
  return oilSg * (1 - wct) + 1.0 * wct;
};

/**
 * Discharge pressure at the pump: the liquid column in the tubing plus
 * the wellhead pressure. A rod pump lifts liquid, so this is a liquid
 * column rather than a multiphase traverse — which is the honest
 * difference from the ESP chain and is stated rather than assumed.
 */
export const dischargePressure = ({ pumpTvdFt, liquidSg, whp }) =>
  num(whp, 0) + PSI_PER_FT_SG * liquidSg * pumpTvdFt;

/**
 * How much of the barrel fills.
 *
 * Free gas at intake conditions competes with liquid for the barrel.
 * What a gas separator (a gas anchor) takes out goes up the annulus;
 * what is left occupies barrel volume that liquid would otherwise have
 * had, and that IS the fillage. No fillage correlation is invented: it
 * falls out of the black-oil PVT and the separator efficiency the user
 * gives, exactly as the ESP gas split does.
 *
 * returns { fillage, freeGasResBpd, liquidResBpd, gasThroughPumpResBpd }
 */
export const gasFillage = ({
  qoStbd, wct, gorScfStb, pvt, separatorEfficiency = 0,
}) => {
  const wc = Math.min(Math.max(wct, 0), 0.999);
  const qwStbd = wc > 0 ? (qoStbd * wc) / (1 - wc) : 0;
  const liquidResBpd = qoStbd * pvt.bo + qwStbd * pvt.bw;
  const freeGasScfd = Math.max(0, qoStbd * (gorScfStb - pvt.rs));
  const freeGasResBpd = freeGasScfd * pvt.bg;
  const eff = Math.min(Math.max(separatorEfficiency, 0), 1);
  const gasThroughPumpResBpd = freeGasResBpd * (1 - eff);
  const total = liquidResBpd + gasThroughPumpResBpd;
  return {
    fillage: total > 0 ? liquidResBpd / total : 1,
    liquidResBpd,
    freeGasScfd,
    freeGasResBpd,
    gasThroughPumpResBpd,
    separatorEfficiency: eff,
  };
};

/** Build the rod string the studio's sections describe. */
export const buildStringFromForm = ({ sections, liquidSg, gradeId }) =>
  buildRodString({
    sections: (sections || []).filter((s) => s && s.size),
    fluidSg: liquidSg,
    gradeId,
  });

/**
 * The pumping unit the studio is designing against: either a generic
 * linkage scaled to the stroke, or the dimensions the user typed off a
 * real unit's drawing.
 */
export const buildUnit = (form) => {
  if (form.unitSource === 'dimensions') {
    const geom = conventionalGeometry({
      aIn: num(form.aIn, NaN),
      cIn: num(form.cIn, NaN),
      pIn: num(form.pIn, NaN),
      crankBehindIn: num(form.crankBehindIn, NaN),
      crankBelowIn: num(form.crankBelowIn, NaN),
      rIn: num(form.rIn, NaN),
    });
    const kin = unitKinematics(geom, { steps: 360 });
    return { ok: kin.ok, error: kin.error, geometry: geom, kin, generic: false };
  }
  const g = genericConventionalGeometry({ strokeIn: num(form.strokeIn, NaN) });
  if (!g.ok) return { ok: false, error: g.error, generic: true };
  const kin = unitKinematics(g.geometry, { steps: 360 });
  return { ok: kin.ok, error: kin.error, geometry: g.geometry, kin, generic: true, note: g.note };
};

/** Rod string sections as typed: "size, length" per line. */
export const parseSections = (text) => {
  const rows = String(text || '').split('\n');
  const sections = [];
  rows.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split(/[,;\t]+/).map((v) => v.trim());
    if (parts.length < 2) return;
    const lengthFt = parseFloat(parts[1]);
    if (!Number.isFinite(lengthFt) || lengthFt <= 0) return;
    sections.push({ size: parts[0], lengthFt });
  });
  return sections;
};

/**
 * The design run from studio form values.
 *
 * Every number is coerced here and the run is refused with reasons
 * rather than defaulted, the same contract the gas lift and ESP
 * studios use.
 *
 * returns { ok, errors, design }
 */
export const runDesign = ({ form, model }) => {
  const errors = [];
  const n = (value, label, { min = -Infinity, max = Infinity } = {}) => {
    const v = num(value, NaN);
    if (!Number.isFinite(v)) { errors.push(`${label} is required.`); return NaN; }
    if (v < min || v > max) errors.push(`${label} is outside the range this design can use.`);
    return v;
  };

  const qoStbd = n(form.designRateStbd, 'Design oil rate', { min: 0.001 });
  const wct = n(form.wctPct, 'Water cut', { min: 0, max: 99.9 }) / 100;
  const gorScfStb = n(form.gorScfStb, 'Producing gas-oil ratio', { min: 0 });
  const pumpTvdFt = n(form.pumpTvdFt, 'Pump setting depth', { min: 1 });
  const strokeIn = n(form.strokeIn, 'Stroke length', { min: 1 });
  const spm = n(form.spm, 'Pumping speed', { min: 0.1, max: 40 });
  const plungerDIn = n(form.plungerDIn, 'Plunger diameter', { min: 0.5, max: 6 });
  const whp = n(form.whp, 'Wellhead pressure', { min: 0 });
  const annulusGradPsiPerFt = n(form.annulusGradPsiPerFt, 'Annulus gradient', { min: 0, max: 1.5 });
  const separatorEfficiency = n(form.separatorEfficiencyPct, 'Gas anchor efficiency', { min: 0, max: 100 }) / 100;
  const pumpEfficiency = n(form.pumpEfficiencyPct, 'Pump volumetric efficiency', { min: 1, max: 100 }) / 100;
  const serviceFactor = n(form.serviceFactor, 'Rod service factor', { min: 0.1, max: 1.5 });
  // Left undefined when the form has no value, so the engine's own
  // default applies. NOT `num(form.dampingRatio, undefined)`: that
  // helper's fallback defaults to 0 when handed undefined, which is
  // zero damping — a string that never settles and reports a plunger
  // stroke longer than the surface stroke. The engine refuses that
  // now, but the studio should never be asking for it.
  const typedDamping = num(form.dampingRatio, NaN);
  const dampingRatio = Number.isFinite(typedDamping) && typedDamping > 0
    ? typedDamping
    : undefined;

  if (!model) errors.push('The well model is incomplete.');
  const perfTvdFt = model ? model.tvdMax : NaN;
  if (Number.isFinite(pumpTvdFt) && Number.isFinite(perfTvdFt) && pumpTvdFt > perfTvdFt) {
    errors.push('The pump cannot be set below the perforations.');
  }

  const sections = parseSections(form.sectionsText);
  const liquidSg = liquidGravity({ api: form.api, wct: Number.isFinite(wct) ? wct : 0 });
  const string = buildStringFromForm({ sections, liquidSg, gradeId: form.gradeId });
  if (!string.ok) errors.push(...string.errors);
  else if (Number.isFinite(pumpTvdFt) && Math.abs(string.lengthFt - pumpTvdFt) > 1) {
    errors.push(`The rod string is ${Math.round(string.lengthFt)} ft but the pump is set at ${Math.round(pumpTvdFt)} ft. A rod string reaches its pump.`);
  }

  const unit = buildUnit(form);
  if (!unit.ok) errors.push(unit.error || 'The pumping unit geometry could not be resolved.');

  if (errors.length) return { ok: false, errors, design: null, string, unit };

  const qMax = model.ipr.qmax ?? rateAtPwf(model.ipr, 0);
  if (qoStbd >= qMax) {
    return {
      ok: false,
      string,
      unit,
      design: null,
      errors: [`The design rate is at or above this inflow's absolute open flow (${Math.round(qMax)} stb/d). Lower the rate or revisit the IPR.`],
    };
  }

  const intake = intakeConditions({
    model, qoStbd, pumpTvdFt, perfTvdFt, annulusGradPsiPerFt,
  });
  const gas = gasFillage({
    qoStbd, wct, gorScfStb, pvt: intake.pvt, separatorEfficiency,
  });
  const pDischargePsi = dischargePressure({ pumpTvdFt, liquidSg, whp });
  const frequency = naturalFrequency({ string });

  // The unit's own motion, and the counterbalance that levels it. The
  // balance needs a card, and the card needs a load, so the design is
  // run once unbalanced to get the card and the balance is solved on it.
  const surfacePosition = surfacePositionFn(unit.kin);
  const first = runRodPumpDesign({
    string,
    frequency,
    kin: unit.kin,
    surfacePosition,
    strokeIn,
    spm,
    plungerDIn,
    pDischargePsi,
    pIntakePsi: intake.pipPsia,
    fillage: gas.fillage,
    pumpEfficiency,
    dampingRatio,
    serviceFactor,
    structuralUnbalanceLb: num(form.structuralUnbalanceLb, 0),
    crankOffsetDeg: num(form.crankOffsetDeg, 0),
    unitRating: parseUnitDesignation(form.unitDesignation),
  });
  if (!first.ok) return { ok: false, errors: first.errors, design: null, string, unit };

  const card = first.design.dynamics.surfaceCard;
  const cardLoadAt = (f) => {
    const i = Math.min(card.length - 1, Math.max(0, Math.round(f * card.length) % card.length));
    return card[i].loadLb;
  };
  const balance = balanceUnit({
    kin: unit.kin,
    cardLoadAt,
    structuralUnbalanceLb: num(form.structuralUnbalanceLb, 0),
    crankOffsetDeg: num(form.crankOffsetDeg, 0),
    aIn: unit.geometry.aIn,
  });

  // Re-run with the balance in hand so the torque group and the
  // gearbox check are computed against a balanced unit rather than an
  // unbalanced one.
  const res = runRodPumpDesign({
    string,
    frequency,
    kin: unit.kin,
    surfacePosition,
    strokeIn,
    spm,
    plungerDIn,
    pDischargePsi,
    pIntakePsi: intake.pipPsia,
    fillage: gas.fillage,
    pumpEfficiency,
    dampingRatio,
    serviceFactor,
    structuralUnbalanceLb: num(form.structuralUnbalanceLb, 0),
    crankOffsetDeg: num(form.crankOffsetDeg, 0),
    unitRating: parseUnitDesignation(form.unitDesignation),
    balance,
  });
  if (!res.ok) return { ok: false, errors: res.errors, design: null, string, unit };

  const warnings = [...res.design.warnings];
  if (intake.submergenceFt < 100) {
    warnings.push({
      code: 'lowSubmergence',
      message: `There is only ${Math.round(intake.submergenceFt)} ft of fluid over the pump. A pump this close to being pumped off will pound; slow the unit down or set the pump deeper.`,
    });
  }
  if (gas.fillage < 0.7) {
    warnings.push({
      code: 'gasInterference',
      message: `Free gas takes ${((1 - gas.fillage) * 100).toFixed(0)} percent of the barrel at intake conditions. A gas anchor, a deeper setting below the perforations, or gas lift instead all address this; a bigger plunger does not.`,
    });
  }

  return {
    ok: true,
    errors: [],
    string,
    unit,
    design: {
      ...res.design,
      qoStbd,
      wct,
      gorScfStb,
      spm,
      strokeIn,
      plungerDIn,
      pumpTvdFt,
      perfTvdFt,
      liquidSg,
      intake,
      gas,
      pDischargePsi,
      frequency,
      balance,
      warnings,
    },
  };
};

/**
 * What the well would make at a range of speeds, at a fixed stroke.
 *
 * Every point is a full wave-equation solve, so this is an explicit run
 * rather than a live recompute. It is the curve a designer actually
 * uses: production against pumping speed, with the rod loading beside
 * it, because the fastest speed is rarely the right one.
 */
export const speedSweep = ({ form, model, spms }) => spms.map((spm) => {
  const res = runDesign({ form: { ...form, spm: String(spm) }, model });
  if (!res.ok) return { spm, ok: false, reason: res.errors[0] };
  const d = res.design;
  return {
    spm,
    ok: true,
    producedBpd: d.producedBpd,
    plungerStrokeIn: d.plungerStrokeIn,
    pprlLb: d.pprlLb,
    mprlLb: d.mprlLb,
    peakTorqueInLb: d.balance ? d.balance.peakTorqueInLb : NaN,
    prhp: d.prhp,
    loadingPct: d.worstSection ? d.worstSection.loadingPct : NaN,
  };
});

/** Read a measured surface dynamometer card as typed: "position, load". */
export const parseMeasuredCard = (text) => {
  const rows = String(text || '').split('\n');
  const card = [];
  rows.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split(/[,;\t\s]+/).map((v) => parseFloat(v));
    if (!Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return;
    card.push({ positionIn: parts[0], loadLb: parts[1] });
  });
  return card.map((p, i) => ({ ...p, tFrac: i / card.length }));
};

/**
 * Diagnose a measured card: what the pump is doing down there.
 *
 * This is the absorbed diagnostic half of the studio, and it is the
 * Gibbs solution from the engine. The verdict it draws is deliberately
 * conservative: pump fillage and the load range are measurements, and
 * naming the fault is left to the shapes an engineer recognises rather
 * than to a classifier that would be guessing.
 */
export const diagnoseMeasured = ({ string, card, spm, dampingRatio }) => {
  if (!string?.ok) return { ok: false, error: 'The rod string has to be defined before a card can be read.' };
  if (!card || card.length < 16) {
    return { ok: false, error: 'A dynamometer card needs at least sixteen evenly spaced samples.' };
  }
  const d = diagnoseCard({ string, surfaceCard: card, spm, dampingRatio, harmonics: 24 });
  if (!d.ok) return d;
  const loads = d.pumpCard.map((p) => p.loadLb);
  const span = Math.max(...loads) - Math.min(...loads);
  // Fillage read off the pump card: the fraction of the plunger stroke
  // for which the load is up on the rods.
  const threshold = Math.min(...loads) + 0.5 * span;
  const carrying = d.pumpCard.filter((p) => p.loadLb > threshold).length;
  return {
    ...d,
    ok: true,
    surfaceCard: card,
    fluidLoadLb: span,
    fillageEstimate: d.pumpCard.length > 0 ? carrying / d.pumpCard.length : NaN,
  };
};

/** Suggest a taper for a depth and a plunger, from the API sizes given. */
export const suggestTaper = ({ pumpTvdFt, sizes, plungerDIn, pDischargePsi, pIntakePsi, liquidSg }) =>
  designTaper({
    lengthFt: num(pumpTvdFt, 0),
    sizes,
    plungerAreaIn2: (Math.PI * num(plungerDIn, 0) ** 2) / 4,
    fluidLoadLb: fluidLoadLb({ plungerDIn: num(plungerDIn, 0), pDischargePsi, pIntakePsi }),
    fluidSg: liquidSg,
  });

/**
 * Legacy import: the Artificial Lift Designer's rod pump tab was
 * removed at P0. Its "Mills method" was neither Mills nor API RP 11L —
 * the dynamic factor, the torque factor and the minimum load were all
 * invented expressions — but the WELL numbers a user typed are still
 * worth carrying. The rod string is deliberately NOT carried: that tab
 * parsed "7/8" as 7.8 inches, so any string saved through it describes
 * rods that do not exist.
 */
export const importLegacyRodInputs = (legacy) => {
  if (!legacy || typeof legacy !== 'object') return { patch: {}, mapped: [], unmapped: [] };
  const patch = {};
  const mapped = [];
  const take = (from, to, label) => {
    const v = num(legacy[from], NaN);
    if (Number.isFinite(v)) { patch[to] = String(v); mapped.push(label); }
  };
  take('pumpDepth', 'pumpTvdFt', 'Pump depth');
  take('liquidRate', 'designRateStbd', 'Liquid rate');
  take('tubingPressure', 'whp', 'Tubing pressure');
  take('waterCut', 'wctPct', 'Water cut');
  take('oilApi', 'api', 'Oil API');
  take('strokeLength', 'strokeIn', 'Stroke length');
  take('pumpingSpeed', 'spm', 'Pumping speed');
  take('pumpDiameter', 'plungerDIn', 'Plunger diameter');

  const unmapped = [];
  if (legacy.rodString) {
    unmapped.push(
      `Rod string "${legacy.rodString}": the old designer read a size like 7/8 as 7.8 inches, so the string it stored describes rods roughly eighty times too stiff. Enter the taper again.`,
    );
  }
  return { patch, mapped, unmapped };
};

export {
  displacementBpd, fluidLoadLb, predictCard, PLUNGER_SIZES, ROD_SIZES, ROD_GRADES,
};
