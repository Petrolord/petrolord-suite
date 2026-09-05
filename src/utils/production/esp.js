/**
 * ESP Design Studio analytics (Production P5).
 *
 * The pump hydraulics, the gas split and the electrical side are engine
 * work and live in the validated package
 * (`utils/production/engine/esp*`, vendored from @petrolord/engines).
 * What lives here is everything that needs the well: the inflow, the
 * PVT at intake conditions, and the flowing traverse that says what
 * pressure the pump has to discharge into.
 *
 * The chain, in order:
 *
 *   IPR at the design rate            -> flowing bottomhole pressure
 *   less the annulus column           -> pump intake pressure
 *   PVT there                         -> free gas, in-situ rate, density
 *   separator split                   -> what the pump swallows
 *   traverse wellhead to pump depth   -> discharge pressure
 *   (discharge - intake) / gradient   -> total dynamic head
 *   stage curve                       -> stages, shaft power
 *
 * Two things this fixes from the predecessor Artificial Lift Designer,
 * both of them in that chain rather than in the pump maths:
 *
 *  1. Total dynamic head there was friction plus wellhead pressure, with
 *     the net vertical lift missing, which understated the stack by
 *     about an order of magnitude.
 *  2. The intake and discharge pressures were a static column with a
 *     single mixture gravity. Here the discharge pressure is a real
 *     multiphase traverse at the design rate, and the intake pressure
 *     comes off the IPR, so the gas that is actually in the tubing is
 *     the gas the separator did not take out.
 *
 * Pressures psia, depths ft, rates stb/d at surface and bbl/d in situ.
 */

// Relative imports (not the @/ alias) so this module also loads outside
// Vite: tools/validation/production-validation.ts exercises it directly.
import { computeTraverse } from '../nodal/traverse.js';
import { pwfAtRate, rateAtPwf } from '../nodal/ipr.js';
import { pvtAt } from '../nodal/pvt.js';
import { brentSolve, linspace, num } from '../nodal/numerics.js';
import {
  intakePressure, intakeStream, gasHandling, totalDynamicHead, tdhBreakdown,
  gradientFromDensity, sizePump, stackCurve, diagnoseOperation, PSI_PER_FT_SG,
  DEFAULT_GAS_LIMITS,
} from './engine/espDesign.js';
import { fitStageCurve, referenceStageCurve, stackPerformance } from './engine/espPump.js';
import { surfaceRequirement, selectCable } from './engine/espMotorCable.js';
import { referenceStage, CABLE_SIZES, motorFrame } from './engine/espCatalog.js';

/**
 * Measured depth at a true vertical depth. Shared shape with the gas
 * lift studio's helper; kept local so neither module depends on the
 * other.
 */
export const mdAtTvd = (trajectory, tvdFt) => {
  const pts = trajectory?.points || [];
  if (pts.length === 0) return 0;
  if (!(tvdFt > 0)) return pts[0].md;
  for (let i = 1; i < pts.length; i += 1) {
    if (pts[i].tvd >= tvdFt) {
      const span = pts[i].tvd - pts[i - 1].tvd;
      if (!(span > 0)) return pts[i].md;
      const f = (tvdFt - pts[i - 1].tvd) / span;
      return pts[i - 1].md + f * (pts[i].md - pts[i - 1].md);
    }
  }
  return pts[pts.length - 1].md;
};

/** True vertical depth at a measured depth (the same table, read back). */
export const tvdAtMdLocal = (trajectory, mdFt) => {
  const pts = trajectory?.points || [];
  if (pts.length === 0) return 0;
  if (!(mdFt > 0)) return pts[0].tvd;
  for (let i = 1; i < pts.length; i += 1) {
    if (pts[i].md >= mdFt) {
      const span = pts[i].md - pts[i - 1].md;
      if (!(span > 0)) return pts[i].tvd;
      const f = (mdFt - pts[i - 1].md) / span;
      return pts[i - 1].tvd + f * (pts[i].tvd - pts[i - 1].tvd);
    }
  }
  return pts[pts.length - 1].tvd;
};

/**
 * Conditions at the pump intake for one design rate.
 *
 * `annulusGradPsiPerFt` is the gradient of the column standing between
 * the perforations and the intake. It is a caller number because that
 * column carries whatever gas has broken out, and using the produced
 * liquid gradient there is a common way to overstate the intake
 * pressure and undersize the pump.
 *
 * returns { pwfPsia, pipPsia, tempF, pvt, stream, gas, gradientPsiPerFt,
 *           specificGravity }
 */
export const intakeConditions = ({
  model, qoStbd, wct, gorScfStb, pumpTvdFt, perfTvdFt,
  annulusGradPsiPerFt, separatorEfficiency = 0, gasLimits = DEFAULT_GAS_LIMITS,
}) => {
  const pwfPsia = pwfAtRate(model.ipr, qoStbd);
  const pipPsia = intakePressure({
    pwfPsia, perfTvdFt, pumpTvdFt, annulusGradPsiPerFt,
  });
  const tempF = model.tAt(pumpTvdFt);
  const pvt = pvtAt(model.fluidModel, Math.max(pipPsia, 14.7), tempF);
  const stream = intakeStream({ qoStbd, wct, gorScfStb, pvt });
  const gas = gasHandling({ stream, separatorEfficiency, limits: gasLimits });
  const gradientPsiPerFt = gradientFromDensity(gas.mixtureDensityLbFt3);
  return {
    pwfPsia,
    pipPsia,
    tempF,
    pvt,
    stream,
    gas,
    gradientPsiPerFt,
    specificGravity: gradientPsiPerFt / PSI_PER_FT_SG,
  };
};

/**
 * Gas-oil ratio of the stream the tubing carries above the pump: the
 * produced gas less whatever the separator sent up the annulus. This is
 * what makes the discharge traverse honest on a gassy well.
 */
export const tubingGor = ({ qoStbd, gorScfStb, stream, gas }) => {
  if (!(qoStbd > 0)) return gorScfStb;
  const ventedScfd = stream.freeGasResBpd > 0
    ? (gas.ventedResBpd / stream.freeGasResBpd) * stream.freeGasScfd
    : 0;
  return Math.max(gorScfStb - ventedScfd / qoStbd, 0);
};

/**
 * Discharge pressure: the tubing marched from the wellhead down to the
 * pump at the design rate, with the gas the separator left in the
 * stream. This is the number the predecessor app replaced with a static
 * column.
 */
export const dischargePressure = ({
  model, qoStbd, wct, gorTubingScfStb, pumpMd, whp,
}) => {
  const res = computeTraverse({
    fluidModel: model.fluidModel,
    trajectory: model.trajectory,
    tAt: model.tAt,
    idIn: model.vlp.idIn,
    roughnessIn: model.vlp.roughnessIn,
    correlation: model.vlp.correlation,
    stepFt: model.vlp.stepFt,
    rates: { qo: qoStbd, wct, gor: gorTubingScfStb },
    pStart: whp,
    mdStart: 0,
    mdEnd: pumpMd,
  });
  return { pDischargePsia: res.pEnd, ok: res.ok, warnings: res.warnings, points: res.points };
};

/**
 * The whole duty at one rate: intake, discharge, TDH and its
 * decomposition. Pure, and the building block of both the design run
 * and the system curve.
 */
export const dutyAtRate = ({
  model, qoStbd, wct, gorScfStb, pumpTvdFt, pumpMd, perfTvdFt,
  annulusGradPsiPerFt, separatorEfficiency, whp, gasLimits,
}) => {
  const intake = intakeConditions({
    model, qoStbd, wct, gorScfStb, pumpTvdFt, perfTvdFt,
    annulusGradPsiPerFt, separatorEfficiency, gasLimits,
  });
  const gorTubingScfStb = tubingGor({
    qoStbd, gorScfStb, stream: intake.stream, gas: intake.gas,
  });
  const discharge = dischargePressure({
    model, qoStbd, wct, gorTubingScfStb, pumpMd, whp,
  });
  const tdh = totalDynamicHead({
    pIntakePsia: intake.pipPsia,
    pDischargePsia: discharge.pDischargePsia,
    gradientPsiPerFt: intake.gradientPsiPerFt,
  });
  // The familiar three-part reading of the same head, arranged so the
  // parts sum to the TDH exactly rather than approximately:
  //
  //   net lift   pump depth less the dynamic fluid level the intake
  //              pressure stands for
  //   wellhead   the wellhead pressure in feet of the pumped fluid
  //   remainder  tubing friction AND the fact that the column above the
  //              pump is lighter than the fluid in it once free gas is
  //              back in the stream
  //
  // The remainder is named for both effects instead of being called
  // friction, because on a gassy well the second one is the larger.
  const g = intake.gradientPsiPerFt;
  const netLiftFt = g > 0 ? pumpTvdFt - intake.pipPsia / g : NaN;
  const whpHeadFt = g > 0 ? whp / g : NaN;
  const frictionFt = Number.isFinite(tdh.tdhFt) && Number.isFinite(netLiftFt)
    ? tdh.tdhFt - netLiftFt - whpHeadFt
    : NaN;
  return {
    qoStbd,
    intake,
    gorTubingScfStb,
    discharge,
    tdhFt: tdh.tdhFt,
    dpPsi: tdh.dpPsi,
    breakdown: tdhBreakdown({
      netLiftFt: Number.isFinite(netLiftFt) ? netLiftFt : 0,
      frictionFt: Number.isFinite(frictionFt) ? frictionFt : 0,
      whpHeadFt: Number.isFinite(whpHeadFt) ? whpHeadFt : 0,
    }),
    pumpIntakeBpd: intake.gas.pumpIntakeBpd,
  };
};

/**
 * The system curve: head the well demands against rate, which is what a
 * pump curve is read against. Each point is an IPR lookup plus a
 * traverse, so this is an explicit run rather than a live recompute.
 */
export const systemCurve = ({
  model, rates, wct, gorScfStb, pumpTvdFt, pumpMd, perfTvdFt,
  annulusGradPsiPerFt, separatorEfficiency, whp, gasLimits,
}) => rates
  .filter((q) => q > 0)
  .map((qoStbd) => {
    const duty = dutyAtRate({
      model, qoStbd, wct, gorScfStb, pumpTvdFt, pumpMd, perfTvdFt,
      annulusGradPsiPerFt, separatorEfficiency, whp, gasLimits,
    });
    return {
      qoStbd,
      pumpIntakeBpd: duty.pumpIntakeBpd,
      tdhFt: duty.tdhFt,
      pipPsia: duty.intake.pipPsia,
      pwfPsia: duty.intake.pwfPsia,
      gvf: duty.intake.gas.gvfThroughPump,
    };
  });

/**
 * Where a fixed stack actually runs: the rate at which the head it
 * makes equals the head the well demands. Solved on the difference
 * between the two curves, which crosses once for a rising system curve
 * and a falling pump curve.
 *
 * returns { qoStbd, pumpIntakeBpd, tdhFt, headFt, bracketed } or null
 * when the two curves do not cross inside the rate range, which is a
 * real answer: the pump is too small or too large for this well.
 */
export const solveEspOperatingPoint = ({
  model, curve, stages, hz, wct, gorScfStb, pumpTvdFt, pumpMd, perfTvdFt,
  annulusGradPsiPerFt, separatorEfficiency, whp, gasLimits, qMaxStbd, nScan = 9,
}) => {
  const qMax = qMaxStbd ?? (model.ipr.qmax ?? rateAtPwf(model.ipr, 0));
  const scan = linspace(qMax * 0.05, qMax * 0.95, nScan);
  const excess = (qoStbd) => {
    const duty = dutyAtRate({
      model, qoStbd, wct, gorScfStb, pumpTvdFt, pumpMd, perfTvdFt,
      annulusGradPsiPerFt, separatorEfficiency, whp, gasLimits,
    });
    const stack = stackPerformance({
      curve, stages, qBpd: duty.pumpIntakeBpd, hz,
      specificGravity: duty.intake.specificGravity,
    });
    return { value: stack.headFt - duty.tdhFt, duty, stack };
  };

  let prev = { q: scan[0], ...excess(scan[0]) };
  for (let i = 1; i < scan.length; i += 1) {
    const here = { q: scan[i], ...excess(scan[i]) };
    if (Number.isFinite(prev.value) && Number.isFinite(here.value)
        && prev.value > 0 && here.value < 0) {
      // brentSolve reports { root, converged, iterations }; take the root.
      const solved = brentSolve((q) => excess(q).value, prev.q, here.q, { tol: 1e-3 });
      const qStar = solved.root;
      const at = excess(qStar);
      return {
        qoStbd: qStar,
        converged: solved.converged,
        pumpIntakeBpd: at.duty.pumpIntakeBpd,
        tdhFt: at.duty.tdhFt,
        headFt: at.stack.headFt,
        region: at.stack.region,
        efficiency: at.stack.efficiency,
        pipPsia: at.duty.intake.pipPsia,
        gvf: at.duty.intake.gas.gvfThroughPump,
        bracketed: true,
      };
    }
    prev = here;
  }
  return null;
};

/** Build a stage curve from the studio form: vendor points or a model. */
export const buildStageCurve = (form) => {
  if (form.curveSource === 'vendor') {
    const points = parseCurvePoints(form.curveText);
    return fitStageCurve({ points, refHz: num(form.curveRefHz, 60) });
  }
  const spec = referenceStage(form.referenceStageId);
  return referenceStageCurve(spec);
};

/**
 * Vendor curve points as typed: "rate, head, efficiency" per line,
 * efficiency optional. Bad lines are dropped rather than guessed at,
 * and the count is reported so a mis-paste is visible.
 */
export const parseCurvePoints = (text) => {
  const rows = String(text || '').split('\n');
  const points = [];
  rows.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split(/[,\t;]+/).map((v) => parseFloat(v));
    if (!Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return;
    const point = { qBpd: parts[0], headFt: parts[1] };
    if (Number.isFinite(parts[2])) point.efficiencyPct = parts[2];
    if (Number.isFinite(parts[3])) point.bhpPerStage = parts[3];
    points.push(point);
  });
  return points;
};

/**
 * The design run from studio form values.
 *
 * Every number is coerced here and the run is refused with reasons
 * rather than defaulted, the same contract the gas lift studio uses.
 *
 * returns { ok, errors, design }
 */
export const runEspDesign = ({ form, model }) => {
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
  const perfTvdFt = n(form.perfTvdFt, 'Perforation depth', { min: 1 });
  const annulusGradPsiPerFt = n(form.annulusGradPsiPerFt, 'Annulus gradient', { min: 0, max: 1.5 });
  const separatorEfficiency = n(form.separatorEfficiencyPct, 'Separator efficiency', { min: 0, max: 100 }) / 100;
  const whp = n(form.whp, 'Wellhead pressure', { min: 0 });
  const hz = n(form.hz, 'Drive frequency', { min: 20, max: 90 });
  const nameplateHp = n(form.nameplateHp, 'Motor nameplate power', { min: 1 });
  const nameplateVolts = n(form.nameplateVolts, 'Motor nameplate voltage', { min: 1 });
  const nameplateAmps = n(form.nameplateAmps, 'Motor nameplate current', { min: 1 });
  const cableLengthFt = n(form.cableLengthFt, 'Cable length', { min: 1 });
  const cableTempF = n(form.cableTempF, 'Cable temperature', { min: -50, max: 500 });
  const maxDropPct = n(form.maxDropPct, 'Maximum cable voltage drop', { min: 0.1, max: 25 });

  if (Number.isFinite(pumpTvdFt) && Number.isFinite(perfTvdFt) && pumpTvdFt > perfTvdFt) {
    errors.push('The pump cannot be set below the perforations.');
  }
  if (!model) errors.push('The well model is incomplete.');

  const curve = buildStageCurve(form);
  if (!curve.ok) errors.push(...(curve.warnings || ['The stage curve could not be built.']));
  if (errors.length) return { ok: false, errors, design: null, curve };

  const qMax = model.ipr.qmax ?? rateAtPwf(model.ipr, 0);
  if (qoStbd >= qMax) {
    return {
      ok: false,
      curve,
      design: null,
      errors: [`The design rate is at or above this inflow's absolute open flow (${Math.round(qMax)} stb/d). Lower the rate or revisit the IPR.`],
    };
  }

  const gasLimits = {
    standardMax: num(form.gvfStandardMaxPct, DEFAULT_GAS_LIMITS.standardMax * 100) / 100,
    handlerMax: num(form.gvfHandlerMaxPct, DEFAULT_GAS_LIMITS.handlerMax * 100) / 100,
  };
  const pumpMd = mdAtTvd(model.trajectory, pumpTvdFt);

  const duty = dutyAtRate({
    model, qoStbd, wct, gorScfStb, pumpTvdFt, pumpMd, perfTvdFt,
    annulusGradPsiPerFt, separatorEfficiency, whp, gasLimits,
  });

  // A well whose inflow already delivers more pressure than the tubing
  // needs does not want a pump at this rate. That is a real answer, and
  // a far better one than a negative head turned into a stage count.
  if (!(duty.tdhFt > 0)) {
    return {
      ok: false,
      curve,
      design: null,
      errors: [
        `At ${Math.round(qoStbd)} stb/d this well flows on its own: the intake pressure (${Math.round(duty.intake.pipPsia)} psia) already exceeds the discharge pressure the tubing needs (${Math.round(duty.discharge.pDischargePsia)} psia), so the pump would have nothing to add. Raise the design rate, the wellhead pressure or the water cut, or check the inflow.`,
      ],
    };
  }

  const sized = sizePump({
    curve,
    qBpd: duty.pumpIntakeBpd,
    tdhFt: duty.tdhFt,
    hz,
    specificGravity: duty.intake.specificGravity,
    nameplateHp,
    motorEfficiency: num(form.motorEfficiencyPct, 85) / 100,
  });

  const electrical = selectCable({
    cables: CABLE_SIZES,
    maxDropPct,
    // Item 2. The electrical chain is sized on the power the pump
    // ABSORBS at the stage count selected, `motorSizingHp`, which is
    // the published sizing power. It used to be handed `shaftHp`, the
    // brake power at the head the duty requires, which is smaller by
    // the stage rounding margin and understates the amps, the cable
    // drop and the cable size in the non conservative direction. The
    // parameter is named `motorHp` in the engine for that reason.
    motorHp: sized.motorSizingHp,
    nameplateHp,
    nameplateAmps,
    nameplateVolts,
    powerFactor: num(form.powerFactor, 0.85),
    lengthFt: cableLengthFt,
    cableTempF,
  });

  const warnings = [...sized.warnings];
  if (!duty.discharge.ok) {
    warnings.push({
      code: 'traverse',
      message: `The tubing traverse did not reach the pump depth: ${duty.discharge.warnings.join(' ')}`,
    });
  }
  if (duty.intake.pipPsia < 100) {
    warnings.push({
      code: 'lowIntake',
      message: `Intake pressure is ${Math.round(duty.intake.pipPsia)} psia. A pump this starved will cavitate or gas lock long before it makes its curve.`,
    });
  }
  if (duty.intake.gas.verdict !== 'standard') {
    warnings.push({
      code: duty.intake.gas.verdict,
      message: duty.intake.gas.verdict === 'gasHandler'
        ? `Gas through the pump is ${(duty.intake.gas.gvfThroughPump * 100).toFixed(0)} percent by volume: a standard stage will not handle it, fit a gas handler or take more gas out at intake.`
        : `Gas through the pump is ${(duty.intake.gas.gvfThroughPump * 100).toFixed(0)} percent by volume. That is separator territory, and above it gas lift is usually the better lift method.`,
    });
  }
  if (!electrical.cable) {
    warnings.push({
      code: 'noCable',
      message: `No cable in the table both carries ${Math.round(electrical.candidates[0]?.requirement.amps || 0)} A and keeps the drop under ${maxDropPct} percent over ${Math.round(cableLengthFt)} ft. A larger conductor or a higher motor voltage is needed.`,
    });
  }

  return {
    ok: true,
    errors: [],
    curve,
    design: {
      qoStbd,
      wct,
      gorScfStb,
      hz,
      pumpTvdFt,
      pumpMd,
      perfTvdFt,
      duty,
      sized,
      electrical,
      gasLimits,
      nameplate: { hp: nameplateHp, volts: nameplateVolts, amps: nameplateAmps },
      warnings,
    },
  };
};

/** Pump and system curves on one rate axis, for the design plot. */
export const pumpVsSystem = ({ design, curve, model, form, rates }) => {
  const wct = num(form.wctPct, 0) / 100;
  const sys = systemCurve({
    model,
    rates,
    wct,
    gorScfStb: num(form.gorScfStb, 0),
    pumpTvdFt: design.pumpTvdFt,
    pumpMd: design.pumpMd,
    perfTvdFt: design.perfTvdFt,
    annulusGradPsiPerFt: num(form.annulusGradPsiPerFt, 0),
    separatorEfficiency: num(form.separatorEfficiencyPct, 0) / 100,
    whp: num(form.whp, 0),
    gasLimits: design.gasLimits,
  });
  return sys.map((row) => {
    const stack = stackPerformance({
      curve,
      stages: design.sized.stages,
      qBpd: row.pumpIntakeBpd,
      hz: design.hz,
      specificGravity: design.duty.intake.specificGravity,
    });
    // Item 5. Past a tenth of the tested rate span the stage curve has
    // no head to report, and a cubic fit outside the points it was
    // fitted to is not a pump. The row still carries the SYSTEM head,
    // which is a property of the well, and the pump line breaks there
    // rather than being drawn through an extrapolation.
    if (stack.ok === false) {
      return {
        ...row,
        pumpHeadFt: null,
        region: stack.region,
        pumpOutsideCurve: true,
        pumpRefusal: stack.code,
      };
    }
    return {
      ...row, pumpHeadFt: stack.headFt, region: stack.region, pumpOutsideCurve: false,
    };
  });
};

/** The stack's own head curve, for plotting beside the system curve. */
export const stackHeadCurve = ({ curve, stages, hz, specificGravity, nPoints }) =>
  stackCurve({ curve, stages, hz, specificGravity, nPoints });

/** Diagnostics passthrough, so the studio imports one module. */
export const diagnose = diagnoseOperation;

/**
 * Legacy import: the Artificial Lift Designer's ESP tab was removed at
 * P0 for staging roughly ten times short, but its saved inputs were
 * kept. Only fields that mean the same thing are carried; the pump
 * model name is deliberately NOT carried, because those catalog entries
 * were invented curves under vendor-sounding names and there is nothing
 * honest to map them to.
 */
export const importLegacyEspInputs = (legacy) => {
  if (!legacy || typeof legacy !== 'object') return { patch: {}, mapped: [], unmapped: [] };
  const patch = {};
  const mapped = [];
  const take = (from, to, label) => {
    const v = num(legacy[from], NaN);
    if (Number.isFinite(v)) { patch[to] = String(v); mapped.push(label); }
  };
  take('targetRate', 'designRateStbd', 'Target rate');
  take('wellDepth', 'perfTvdFt', 'Well depth');
  take('pumpDepth', 'pumpTvdFt', 'Pump setting depth');
  take('whp', 'whp', 'Wellhead pressure');
  take('waterCut', 'wctPct', 'Water cut');
  take('gor', 'gorScfStb', 'Producing gas-oil ratio');
  take('oilApi', 'api', 'Oil API');
  take('gasGravity', 'gasSg', 'Gas gravity');
  take('tubingID', 'tubingIdIn', 'Tubing ID');
  take('casingID', 'casingIdIn', 'Casing ID');
  take('frequency', 'hz', 'Drive frequency');

  const unmapped = [];
  if (legacy.pumpModel) {
    unmapped.push(
      `Pump model "${legacy.pumpModel}": the old catalog carried invented curves under vendor-sounding names, so there is nothing to import it as. Enter the vendor curve points for the pump you are actually running.`,
    );
  }
  return { patch, mapped, unmapped };
};

/** Rate ladder for the system curve run. */
export const rateLadder = ({ qMaxStbd, nPoints = 9 }) =>
  linspace(Math.max(num(qMaxStbd, 0) * 0.1, 1), num(qMaxStbd, 0) * 0.95, Math.max(2, Math.round(num(nPoints, 9))));
