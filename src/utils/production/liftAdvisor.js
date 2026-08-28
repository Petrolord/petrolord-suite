/**
 * Artificial lift advisor: the design pass (Production P9).
 *
 * Screening is a rules matrix and says so (`liftScreening`). This
 * module does the thing that matrix cannot: it takes the SHARED well
 * record and actually runs each lift method's validated design chain on
 * it, so the answer is not "an ESP suits high-rate wells" but "on this
 * well at 300 stb/d an ESP needs 162 stages against 4,183 ft of head,
 * and 31 percent of what the pump swallows is gas".
 *
 * This is the phase the shared well record (P6.5) existed for.
 * Comparing lift methods is meaningless if each studio holds its own
 * description of the well; with one record, the four engine-backed
 * methods are run against exactly the same trajectory, fluid, inflow
 * and completion.
 *
 * WHAT A DESIGN PASS HERE IS AND IS NOT. It is SCREENING GRADE. Every
 * method needs equipment chosen before it can be designed, and this
 * module chooses defaults from a short ladder rather than asking for
 * forty numbers. Those choices are reported with the answer, and every
 * result carries a link to the studio that designs the thing properly.
 * What the pass is good for is telling you which methods can work at
 * all on this well, and what each would cost you in equipment.
 *
 * WHEN SCREENING AND DESIGN DISAGREE, THE DESIGN WINS. It solved the
 * well; the matrix applied a rule. The advisor surfaces the
 * disagreement rather than hiding it, the same way P7 surfaces the
 * plunger rule of thumb disagreeing with the computed gas requirement.
 */

// Relative imports (not the @/ alias) so this module also loads outside
// Vite: tools/validation/production-validation.ts exercises it directly.
import { num } from '../nodal/numerics.js';
import { rateAtPwf } from '../nodal/ipr.js';
import { runEspDesign, mdAtTvd } from './esp.js';
import { runDesign as runRodDesign, liquidGravity } from './rodPump.js';
import {
  liftedTraverse, injectionPointFromTraverse, psigToPsia,
  solveLiftedOperatingPoint,
} from './gasLift.js';
import { linearTemperature } from './engine/gasLiftDesign.js';
import { REFERENCE_STAGES, MOTOR_FRAMES } from './engine/espCatalog.js';
import { screenPlungerLift } from './engine/plungerLift.js';
import { LIFT_METHODS } from './liftScreening.js';

/** Small equipment ladders, so a screening-grade pass has something to try. */
export const ROD_TRIALS = [
  { plungerDIn: 1.25, strokeIn: 48, spm: 6 },
  { plungerDIn: 1.5, strokeIn: 54, spm: 7 },
  { plungerDIn: 1.75, strokeIn: 64, spm: 9 },
  { plungerDIn: 2.0, strokeIn: 74, spm: 10 },
  { plungerDIn: 2.25, strokeIn: 86, spm: 11 },
  { plungerDIn: 2.75, strokeIn: 120, spm: 12 },
];

/**
 * How close to the target a screening-grade design has to get to count.
 * A method that designs cleanly but delivers a third of what was asked
 * has not solved the problem, and reporting it as workable would be the
 * single most misleading thing this advisor could do.
 */
export const RATE_TOLERANCE = 0.9;

/** The reference stage whose published range covers the duty, else nearest BEP. */
export const pickReferenceStage = (qBpd) => {
  const inRange = REFERENCE_STAGES.find((s) => qBpd >= s.qMin && qBpd <= s.qMax);
  if (inRange) return inRange;
  return REFERENCE_STAGES.reduce(
    (best, s) => (Math.abs(s.bepBpd - qBpd) < Math.abs(best.bepBpd - qBpd) ? s : best),
    REFERENCE_STAGES[0],
  );
};

/** The smallest motor frame that carries the shaft load with headroom. */
export const pickMotorFrame = (shaftHp) => MOTOR_FRAMES.find((m) => m.hp >= shaftHp * 1.25)
  || MOTOR_FRAMES[MOTOR_FRAMES.length - 1];

const outcome = (id, extra) => {
  const method = LIFT_METHODS.find((m) => m.id === id);
  return { id, label: method.label, studio: method.studio, hasEngine: true, ...extra };
};

/**
 * ESP. Run the real sizing chain with a reference stage picked for the
 * duty, then a motor picked for the shaft load it produces.
 */
export const designEsp = ({ model, targetRate, wctPct, gorScfStb, whp, facility }) => {
  const perfTvdFt = model.tvdMax;
  const pumpTvdFt = Math.round(perfTvdFt * 0.94);
  const baseForm = {
    designRateStbd: String(targetRate),
    wctPct: String(wctPct),
    gorScfStb: String(gorScfStb),
    pumpTvdFt: String(pumpTvdFt),
    perfTvdFt: String(perfTvdFt),
    annulusGradPsiPerFt: '0.4',
    separatorEfficiencyPct: String(num(facility?.separatorEfficiencyPct, 70)),
    whp: String(whp),
    hz: '60',
    motorEfficiencyPct: '85',
    powerFactor: '0.85',
    cableLengthFt: String(Math.round(pumpTvdFt * 1.03)),
    cableTempF: '180',
    maxDropPct: '5',
    curveSource: 'reference',
    curveRefHz: '60',
    curveText: '',
    nameplateHp: '250',
    nameplateVolts: '2400',
    nameplateAmps: '67',
  };

  // A first pass to learn the in-situ duty, then the stage that suits it.
  const probe = runEspDesign({
    form: { ...baseForm, referenceStageId: 'ref-540-2500' }, model,
  });
  if (!probe.ok) {
    return outcome('esp', { ok: false, reason: probe.errors[0], errors: probe.errors });
  }
  const stage = pickReferenceStage(probe.design.duty.pumpIntakeBpd);
  const sized = runEspDesign({ form: { ...baseForm, referenceStageId: stage.id }, model });
  if (!sized.ok) {
    return outcome('esp', { ok: false, reason: sized.errors[0], errors: sized.errors });
  }
  const motor = pickMotorFrame(sized.design.sized.shaftHp);
  const final = runEspDesign({
    form: {
      ...baseForm,
      referenceStageId: stage.id,
      nameplateHp: String(motor.hp),
      nameplateVolts: String(motor.volts),
      nameplateAmps: String(motor.amps),
    },
    model,
  });
  if (!final.ok) {
    return outcome('esp', { ok: false, reason: final.errors[0], errors: final.errors });
  }
  const d = final.design;
  return outcome('esp', {
    ok: true,
    rateStbd: targetRate,
    equipment: `${stage.label}, ${d.sized.stages} stages, ${motor.hp} hp motor`,
    figures: [
      { label: 'Stages', value: d.sized.stages },
      { label: 'Total dynamic head', value: `${Math.round(d.duty.tdhFt).toLocaleString()} ft` },
      { label: 'Intake pressure', value: `${Math.round(d.duty.intake.pipPsia).toLocaleString()} psia` },
      { label: 'Gas through the pump', value: `${(d.duty.intake.gas.gvfThroughPump * 100).toFixed(0)} %` },
      { label: 'Shaft power', value: `${d.sized.shaftHp.toFixed(1)} hp` },
      { label: 'Cable', value: d.electrical.cable ? d.electrical.cable.label : 'none qualifies' },
    ],
    warnings: d.warnings,
    design: d,
  });
};

/**
 * Gas lift. Find the deepest point the available surface pressure can
 * reach, then solve the well lifted at that point.
 */
export const designGasLift = ({ model, targetRate, wctPct, gorScfStb, whp, facility }) => {
  const operatingPsig = num(facility?.injectionPsig, 900);
  const qgiMscfd = num(facility?.injectionMscfd, 500);
  const vlp = {
    ...model.vlp,
    whp,
    rates: { wct: wctPct / 100, gor: gorScfStb },
  };

  let traverse;
  try {
    traverse = liftedTraverse({
      ...vlp, qo: targetRate, injectionMd: vlp.nodeMd, qgiMscfd,
    });
  } catch (e) {
    return outcome('gasLift', { ok: false, reason: `The lifted traverse could not be built: ${e.message}` });
  }
  if (!traverse?.points?.length) {
    return outcome('gasLift', { ok: false, reason: 'The lifted traverse produced no points to place an injection point against.' });
  }

  const point = injectionPointFromTraverse({
    traversePoints: traverse.points,
    pSurfPsia: psigToPsia(operatingPsig),
    gasSg: num(facility?.injGasSg, 0.65),
    tempAtDepthF: linearTemperature({
      whtF: model.tAt(0), bhtF: model.tAt(model.tvdMax), refDepthFt: model.tvdMax,
    }),
    dpTransferPsi: 50,
    maxDepthFt: model.tvdMax,
  });
  if (!point || !(point.depthFt > 0)) {
    return outcome('gasLift', {
      ok: false,
      reason: `At ${operatingPsig} psig the injection line never gets below the flowing gradient, so there is nowhere to put gas in. More surface pressure, or a lighter design rate.`,
    });
  }

  const injectionMd = mdAtTvd(model.trajectory, point.depthFt);
  let lifted;
  try {
    lifted = solveLiftedOperatingPoint({
      ipr: model.ipr, vlp, injectionMd, qgiMscfd, nGrid: 25,
    });
  } catch (e) {
    return outcome('gasLift', { ok: false, reason: `The lifted operating point could not be solved: ${e.message}` });
  }
  // solveLiftedOperatingPoint reports { q, pwf, status }; a node that
  // never crossed comes back as status 'dead' with a zero rate.
  if (!lifted || lifted.status !== 'flowing' || !(lifted.q > 0)) {
    return outcome('gasLift', {
      ok: false,
      reason: `Injecting ${Math.round(qgiMscfd).toLocaleString()} Mscf/d at ${Math.round(point.depthFt).toLocaleString()} ft still does not lighten the column enough for this well to flow. More gas, more injection pressure to reach deeper, or a lower wellhead pressure.`,
    });
  }

  return outcome('gasLift', {
    ok: true,
    rateStbd: lifted.q,
    equipment: `${Math.round(qgiMscfd).toLocaleString()} Mscf/d injected at ${Math.round(point.depthFt).toLocaleString()} ft, ${operatingPsig} psig at surface`,
    figures: [
      { label: 'Rate lifted', value: `${Math.round(lifted.q).toLocaleString()} stb/d` },
      { label: 'Injection depth', value: `${Math.round(point.depthFt).toLocaleString()} ft` },
      { label: 'Injection rate', value: `${Math.round(qgiMscfd).toLocaleString()} Mscf/d` },
      { label: 'Flowing bottomhole', value: `${Math.round(lifted.pwf).toLocaleString()} psia` },
      {
        label: 'Limited by',
        value: point.limitedBy === 'depth' ? 'the packer or the traverse, not the pressure' : 'the available injection pressure',
      },
    ],
    warnings: [],
    design: { point, lifted, qgiMscfd, operatingPsig },
  });
};

/**
 * Rod pump. Walk a short equipment ladder and take the first that
 * designs without overloading the rods or the unit.
 */
export const designRodPump = ({ model, targetRate, wctPct, gorScfStb, whp }) => {
  const perfTvdFt = model.tvdMax;
  const pumpTvdFt = Math.round(perfTvdFt * 0.96);
  const liquidSg = liquidGravity({ api: model.fluidModel?.api ?? 32, wct: wctPct / 100 });
  const attempts = [];
  const workable = [];

  for (const trial of ROD_TRIALS) {
    const form = {
      designRateStbd: String(targetRate),
      wctPct: String(wctPct),
      whp: String(whp),
      pumpTvdFt: String(pumpTvdFt),
      annulusGradPsiPerFt: '0.38',
      separatorEfficiencyPct: '60',
      pumpEfficiencyPct: '90',
      strokeIn: String(trial.strokeIn),
      spm: String(trial.spm),
      plungerDIn: String(trial.plungerDIn),
      unitSource: 'generic',
      unitDesignation: '',
      structuralUnbalanceLb: '0',
      crankOffsetDeg: '0',
      dampingRatio: '0.1',
      gradeId: 'D',
      serviceFactor: '1',
      // A taper proportioned for the depth, heaviest at the top.
      sectionsText: `7/8, ${Math.round(pumpTvdFt * 0.55)}\n3/4, ${pumpTvdFt - Math.round(pumpTvdFt * 0.55)}`,
      api: String(model.fluidModel?.api ?? 32),
      gorScfStb: String(gorScfStb),
    };
    const res = runRodDesign({ form, model });
    if (!res.ok) {
      attempts.push({ trial, reason: res.errors[0] });
      continue;
    }
    const d = res.design;
    const loading = d.worstSection ? d.worstSection.loadingPct : NaN;
    if (loading > 100) {
      attempts.push({ trial, reason: `the ${d.worstSection.label} rods run at ${Math.round(loading)} percent of their allowable` });
      continue;
    }
    workable.push({ trial, design: d, loading });
  }

  // The smallest workable unit that MEETS the target, or failing that
  // the one that gets closest to it. Taking the first that merely
  // designs would report a third of the asked-for rate as a success.
  const meets = workable.filter((x) => x.design.producedBpd >= targetRate * RATE_TOLERANCE);
  const best = meets.length
    ? meets[0]
    : workable.reduce(
      (a, x) => (!a || x.design.producedBpd > a.design.producedBpd ? x : a),
      null,
    );

  if (best && meets.length) {
    const { trial, design: d, loading } = best;
    return outcome('rodPump', {
      ok: true,
      rateStbd: d.producedBpd,
      equipment: `${trial.plungerDIn} in plunger, ${trial.strokeIn} in stroke at ${trial.spm} spm, ${liquidSg.toFixed(2)} gravity liquid`,
      figures: [
        { label: 'Production', value: `${d.producedBpd.toFixed(0)} bbl/d` },
        { label: 'Plunger stroke', value: `${d.plungerStrokeIn.toFixed(1)} in of ${trial.strokeIn}` },
        { label: 'Peak rod load', value: `${Math.round(d.pprlLb).toLocaleString()} lb` },
        { label: 'Peak torque', value: d.balance ? `${Math.round(d.balance.peakTorqueInLb).toLocaleString()} in-lb` : '--' },
        { label: 'Rod loading', value: `${loading.toFixed(0)} % of Goodman` },
        { label: 'Barrel fillage', value: `${(d.gas.fillage * 100).toFixed(0)} %` },
      ],
      warnings: d.warnings,
      design: d,
      attempts,
      triedCount: ROD_TRIALS.length,
    });
  }

  if (best) {
    return outcome('rodPump', {
      ok: false,
      reason: `The largest unit tried (${best.trial.plungerDIn} in plunger, ${best.trial.strokeIn} in stroke at ${best.trial.spm} spm) makes ${best.design.producedBpd.toFixed(0)} bbl/d against a target of ${Math.round(targetRate).toLocaleString()}. Rod pumping is rate-limited by the plunger it can swing at this depth, and this well is past it.`,
      shortfall: { achievedBpd: best.design.producedBpd, targetBpd: targetRate },
      design: best.design,
      attempts,
      triedCount: ROD_TRIALS.length,
    });
  }

  return outcome('rodPump', {
    ok: false,
    reason: attempts.length
      ? `None of the ${attempts.length} equipment combinations tried works. The last failed because ${attempts[attempts.length - 1].reason}.`
      : 'No equipment combination could be designed for this well.',
    attempts,
    triedCount: ROD_TRIALS.length,
  });
};

/**
 * Plunger lift. The gas-liquid ratio the well makes against the ratio a
 * cycle actually needs, which is computed rather than screened.
 */
export const designPlunger = ({ model, targetRate, wctPct, gorScfStb, whp, facility }) => {
  const depthFt = model.tvdMax;
  const liquidSg = liquidGravity({ api: model.fluidModel?.api ?? 32, wct: wctPct / 100 });
  const wctFrac = Math.min(Math.max(wctPct / 100, 0), 0.999);
  const liquidBpd = wctFrac > 0 ? targetRate / (1 - wctFrac) : targetRate;
  // The well makes gas per barrel of LIQUID, which is what a plunger
  // cycle has to lift.
  const wellGlr = liquidBpd > 0 ? (gorScfStb * targetRate) / liquidBpd : gorScfStb;

  const res = screenPlungerLift({
    depthFt,
    idIn: model.vlp.idIn,
    linePressurePsia: whp,
    casingPressurePsia: num(facility?.casingPressurePsia, whp * 2.5),
    slugLengthFt: num(facility?.slugLengthFt, 150),
    liquidSg,
    plungerWeightLb: num(facility?.plungerWeightLb, 6),
    gasSg: model.fluidModel?.gasSg ?? 0.65,
    avgTempR: (model.tAt(0) + model.tAt(depthFt)) / 2 + 460,
    z: 0.9,
    wellGlrScfBbl: wellGlr,
    afterflowMin: 20,
    shutInMin: 30,
  });
  if (!res.ok) {
    return outcome('plunger', { ok: false, reason: res.errors[0], errors: res.errors });
  }
  const d = res.design;
  if (!d.feasible) {
    const why = d.warnings.map((w) => w.message).join(' ');
    return outcome('plunger', { ok: false, reason: why, design: d, warnings: d.warnings });
  }
  return outcome('plunger', {
    ok: true,
    rateStbd: d.liquidPerDayBbl,
    equipment: `${Math.round(num(facility?.slugLengthFt, 150))} ft slug, ${Math.round(d.timing.cyclesPerDay)} trips a day`,
    figures: [
      { label: 'Liquid lifted', value: `${d.liquidPerDayBbl.toFixed(1)} bbl/d` },
      { label: 'Gas-liquid ratio needed', value: `${Math.round(d.requiredGlrScfBbl).toLocaleString()} scf/bbl` },
      { label: 'This well makes', value: `${Math.round(wellGlr).toLocaleString()} scf/bbl` },
      { label: 'Pressure to lift', value: `${Math.round(d.lift.requiredPsia).toLocaleString()} psia` },
      { label: 'Cycle', value: `${d.timing.totalMin.toFixed(0)} min` },
    ],
    warnings: d.warnings,
    design: d,
  });
};

const DESIGNERS = {
  esp: designEsp,
  gasLift: designGasLift,
  rodPump: designRodPump,
  plunger: designPlunger,
};

/**
 * Run every engine-backed method against one well.
 *
 * returns { ok, results: [...], errors }
 * Methods without an engine are not here at all: they belong to the
 * screening layer and the advisor keeps the two apart on purpose.
 */
export const runDesignPass = ({ model, targetRate, wctPct, gorScfStb, whp, facility }) => {
  if (!model) return { ok: false, results: [], errors: ['The well model is incomplete.'] };
  if (model.phase !== 'oil') {
    return {
      ok: false,
      results: [],
      errors: ['This pass designs lift for an oil well. The well record says gas; the Gas Well Performance Studio is where a gas well is worked.'],
    };
  }
  const qMax = model.ipr.qmax ?? rateAtPwf(model.ipr, 0);
  if (!(targetRate > 0)) {
    return { ok: false, results: [], errors: ['A target rate is needed before anything can be designed.'] };
  }
  if (targetRate >= qMax) {
    return {
      ok: false,
      results: [],
      errors: [`The target of ${Math.round(targetRate).toLocaleString()} stb/d is at or above this inflow's absolute open flow (${Math.round(qMax).toLocaleString()} stb/d). No lift method makes a well produce more than it can deliver.`],
    };
  }

  const args = { model, targetRate, wctPct, gorScfStb, whp, facility };
  const results = Object.keys(DESIGNERS).map((id) => {
    try {
      return DESIGNERS[id](args);
    } catch (e) {
      console.error(e);
      const method = LIFT_METHODS.find((m) => m.id === id);
      return {
        id, label: method.label, studio: method.studio, hasEngine: true,
        ok: false, reason: `The design chain failed: ${e.message}`,
      };
    }
  });
  return { ok: true, results, errors: [] };
};

/**
 * Put the screening and the design side by side, and say where they
 * disagree.
 *
 * The disagreement is the interesting output. A method the matrix likes
 * that the engine refuses is a rule of thumb meeting a well it does not
 * fit; a method the matrix is lukewarm about that designs cleanly is
 * worth a second look. In both cases the design is the one that solved
 * the well.
 */
export const reconcile = ({ screening, designPass }) => {
  const byId = new Map((designPass?.results || []).map((r) => [r.id, r]));
  const rows = (screening || []).map((s) => {
    const design = byId.get(s.id) || null;
    let verdict = 'screened';
    let note = null;
    if (!s.hasEngine) {
      verdict = 'noEngine';
      note = 'Screened only. This Suite has no validated engine for this method, so nothing here is a design.';
    } else if (!design) {
      verdict = 'notRun';
    } else if (design.ok && s.recommended) {
      verdict = 'agreeYes';
      note = 'The screening and the design agree: this method works on this well.';
    } else if (design.ok && !s.recommended) {
      verdict = 'designYes';
      note = 'The screening was lukewarm but the design runs cleanly. The design solved the well; the matrix applied a rule.';
    } else if (!design.ok && s.recommended) {
      verdict = 'designNo';
      note = 'The screening liked this method and the design refuses it. The design is the one that solved the well.';
    } else {
      verdict = 'agreeNo';
      note = 'Screening and design agree that this method does not suit this well.';
    }
    return { ...s, design, verdict, note };
  });

  const workable = rows.filter((r) => r.design?.ok);
  return {
    rows,
    workable,
    disagreements: rows.filter((r) => r.verdict === 'designYes' || r.verdict === 'designNo'),
    // Ranked by what the design actually achieved, then by the score,
    // because a method that demonstrably works outranks one that merely
    // scores well.
    ranked: [...rows].sort((a, b) => {
      const ao = a.design?.ok ? 1 : 0;
      const bo = b.design?.ok ? 1 : 0;
      if (ao !== bo) return bo - ao;
      return b.score - a.score;
    }),
  };
};
