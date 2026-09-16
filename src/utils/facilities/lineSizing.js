/**
 * Pipeline & Line Sizing Studio — composition layer (Facilities F1,
 * Facilities-ROADMAP.md §3 app 2).
 *
 * This module contains NO new physics. It wires together, in one
 * place, the engines that already carry the validation:
 *  - single-phase liquid and gas lines, wall thickness and pigging:
 *    the vendored facilities line-hydraulics engine
 *    (@petrolord/engines, engines/facilities/lineHydraulics)
 *  - multiphase pressure gradient: the Suite's golden-tested
 *    Beggs & Brill (src/utils/nodal/correlations/beggsBrill.js)
 *  - z-factor and gas density: the vendored production gasProperties
 *  - erosional velocity: the vendored RP 14E in chokePerformance
 *  - pipe geometry: the vendored, self-checking B36.10 subset
 *
 * Stated assumption, carried into the UI: liquid rates are taken at
 * line conditions (the dead-liquid case downstream of separation,
 * Bo ~ 1). A live-oil flowline upstream of separation belongs in the
 * Production module's flow assurance trace, which carries full PVT.
 *
 * REFUSAL POLICY (FC2-0). Every function here either returns a usable
 * answer or an object with a populated `error` key. Nothing substitutes
 * a placeholder for a quantity it could not compute, and nothing
 * returns a bare NaN in place of a number, because a caller's
 * `if (result.error)` check is the only thing standing between a failed
 * computation and a confident-looking screen. Where a quantity is
 * genuinely computable it is computed, not refused. Sweep rows are the
 * one deliberate exception to "refuse the whole call": a bore that
 * cannot do the duty is a FACT ABOUT THAT BORE, so it stays in the
 * table as a failing row carrying the reason in `note`, while an input
 * the whole sweep depends on (a temperature outside the z-factor's
 * correlation, say) refuses the sweep once instead of twelve times.
 */

import {
  liquidLineDrop, liquidLineTraverse,
  weymouthQ, panhandleAQ, panhandleBQ, generalFlowQ, gasOutletPressure,
  requiredWallIn, maopPsig,
  lineVolumeBbl, sweptLiquidBbl, pigRun, piggingInterval,
} from '@/utils/facilities/engine/lineHydraulics';
import { beggsBrillGradient } from '@/utils/nodal/correlations/beggsBrill';
import {
  dakZ, suttonPseudoCriticals, toRankine, AIR_MW, R_UNIVERSAL,
} from '@/utils/production/engine/gasProperties';
import { erosionalVelocityFtS, erosionalC, EROSIONAL_C } from '@/utils/production/engine/chokePerformance';
import { PIPE_SCHEDULE, ROUGHNESS_IN, roughnessOf, scheduleRow } from '@/utils/production/engine/pipeSchedule';

export {
  liquidLineDrop, liquidLineTraverse,
  weymouthQ, panhandleAQ, panhandleBQ, generalFlowQ, gasOutletPressure,
  requiredWallIn, maopPsig,
  lineVolumeBbl, sweptLiquidBbl, pigRun, piggingInterval,
  PIPE_SCHEDULE, ROUGHNESS_IN, roughnessOf, scheduleRow,
  EROSIONAL_C, erosionalC,
};

export const GAS_EQUATIONS = [
  { id: 'weymouth', label: 'Weymouth', fn: weymouthQ },
  { id: 'panhandleA', label: 'Panhandle A', fn: panhandleAQ },
  { id: 'panhandleB', label: 'Panhandle B', fn: panhandleBQ },
  { id: 'general', label: 'General Flow (Colebrook)', fn: generalFlowQ },
];

const CUFT_PER_BBL = (42 * 231) / 1728;
const S_PER_DAY = 86400;

export const oilDensityLbFt3 = (apiGravity) => (141.5 / (131.5 + apiGravity)) * 62.4;

/** Atmospheric pressure, psia: the floor a flowing line has to stay above. */
const ATMOSPHERIC_PSIA = 14.7;

/**
 * The published validity window of the Dranchuk & Abou-Kassem fit to
 * the Standing-Katz chart: 1.0 <= Tpr <= 3.0, Ppr <= 30.
 *
 * The window matters because DAK's Newton iteration converges happily
 * OUTSIDE it and reports that it converged. At Tpr 0.65 it returns
 * z = 0.293 and at Ppr 75 it returns z = 5.32, both flagged converged,
 * and both are roots of a correlation evaluated off the surface it was
 * fitted to rather than compressibility factors. Reading the flag and
 * not the window would therefore catch neither.
 *
 * The fit's published LOWER pressure edge, Ppr 0.2, is deliberately not
 * a refusal: below it the gas is near-ideal and DAK tends to z = 1,
 * which is the physically right answer, and a 100 psia line is ordinary
 * rather than exotic.
 */
export const DAK_LIMITS = { tprMin: 1.0, tprMax: 3.0, pprMax: 30 };

/**
 * Gas density at line conditions from the validated z-factor.
 *
 * Refuses by name rather than falling back, and consults the z solver's
 * own `converged` flag instead of discarding it. Callers get either
 * `{ rhoLbFt3, z, ppr, tpr, zConverged }` or `{ error }`.
 */
export const gasDensityLbFt3 = ({ pPsia, tF, gasSg }) => {
  if (!(pPsia > 0)) return { error: 'gas density needs a positive line pressure' };
  if (!Number.isFinite(tF)) return { error: 'gas density needs a line temperature' };
  if (!(gasSg > 0)) return { error: 'gas density needs a positive gas gravity (air = 1)' };
  const tR = toRankine(tF);
  if (!(tR > 0)) return { error: 'gas density needs a line temperature above absolute zero' };

  const { tpcR, ppcPsia } = suttonPseudoCriticals(gasSg);
  const ppr = pPsia / ppcPsia;
  const tpr = tR / tpcR;
  if (!(ppr > 0) || !(tpr > 0)) {
    return { error: 'the pseudo-reduced conditions are not a number at these inputs' };
  }
  if (tpr < DAK_LIMITS.tprMin) {
    return {
      error: `z-factor refused: ${tF} degF at gas gravity ${gasSg} is pseudo-reduced temperature `
        + `${tpr.toFixed(3)}, below the ${DAK_LIMITS.tprMin.toFixed(1)} floor of the DAK correlation; `
        + 'the stream may not be a single-phase gas at these conditions',
    };
  }
  if (ppr > DAK_LIMITS.pprMax) {
    return {
      error: `z-factor refused: ${Math.round(pPsia)} psia at gas gravity ${gasSg} is pseudo-reduced `
        + `pressure ${ppr.toFixed(1)}, above the DAK correlation's published ceiling of ${DAK_LIMITS.pprMax}`,
    };
  }

  const solve = dakZ({ ppr, tpr });
  if (!solve.converged) {
    return {
      error: `z-factor refused: the DAK solve did not converge at pseudo-reduced pressure `
        + `${ppr.toFixed(3)} and temperature ${tpr.toFixed(3)}`,
    };
  }
  if (!(solve.z > 0)) return { error: 'z-factor refused: the DAK solve returned a non-positive z' };

  const rhoLbFt3 = (AIR_MW * gasSg * pPsia) / (solve.z * R_UNIVERSAL * tR);
  if (!(rhoLbFt3 > 0)) {
    return { error: 'gas density refused: the real-gas law did not return a positive density' };
  }
  const out = { rhoLbFt3, z: solve.z, ppr, tpr, zConverged: true };
  if (tpr > DAK_LIMITS.tprMax) {
    out.warning = `pseudo-reduced temperature ${tpr.toFixed(2)} is above the DAK fit's published `
      + `ceiling of ${DAK_LIMITS.tprMax.toFixed(1)}; z sits near 1 there, so the density is reported and flagged`;
  }
  return out;
};

/**
 * Marching controls for the multiphase integration.
 *
 * `targetFraction` is the most a single step is allowed to move the
 * pressure, as a fraction of the INLET pressure; the step count follows
 * from it and from a first estimate of the whole-line drop. The
 * integration is explicit Euler, which is first order, so the step
 * target is what buys the accuracy: at 0.25 percent per step, halving
 * the step again moves a long-line answer by under 0.2 percent (gated).
 */
export const MARCH = { targetFraction: 0.0025, minSteps: 8, maxSteps: 500 };

/**
 * Multiphase flowline pressure drop over the Suite's Beggs & Brill,
 * MARCHED along the line rather than evaluated once at the inlet.
 *
 * Rates: liquid bpd at line conditions with a water cut, gas scfd
 * converted to in-situ at the LOCAL P, T and z of each step. The pipe
 * angle comes from the stated elevation change over the stated length
 * and is the same for every step, so the route is a straight incline.
 *
 * WHY IT MARCHES (FC2-0). The gradient is not constant along a line
 * that carries gas: as the pressure falls the gas expands, the mixture
 * velocity rises and the gradient rises with it. Applying the inlet
 * gradient over the whole length therefore under-reports the drop, by
 * about 1 percent on a 5000 ft line and by 9 percent on a 50000 ft one.
 * That much would be a defensible stated simplification. What is not
 * defensible is the case it turns into a number: a gassy 40000 ft line
 * that the one-shot form reported ARRIVING AT 55 PSIA is a line whose
 * pressure, marched, reaches atmospheric halfway along. A simplification
 * that converts an undeliverable line into a deliverable-looking one
 * cannot be fixed by disclosing it, so it is computed instead.
 *
 * Reported quantities are labelled by where they hold: `pattern`,
 * `holdup`, `vm` and the rest are INLET values (unchanged in meaning
 * from before this repair), `outlet*` are the far-end values, and
 * `gradientPsiPerFt` is now the whole-line average, dp over length.
 * `avgHoldup` is the length-weighted holdup, which is the quantity a
 * swept-volume estimate actually wants.
 *
 * Refusals carry a `code`: 'input' for something wrong with the stated
 * line (the sweep refuses once), 'infeasible' for a line that cannot
 * reach its outlet (a fact about that bore, so the sweep keeps the row).
 */
export const multiphaseLine = ({
  qLiquidBpd, wctPct = 0, qGasScfd = 0,
  pPsia, tF, idIn, lengthFt, elevChangeFt = 0, roughnessIn = 0.0018,
  oilApi = 35, waterSg = 1.02, gasSg = 0.65,
  muOilCp = 2, muWaterCp = 0.6, muGasCp = 0.012, sigmaLDynCm = 25,
  marchSteps,
}) => {
  if (!(qLiquidBpd >= 0) || !(idIn > 0) || !(lengthFt > 0) || !(pPsia > ATMOSPHERIC_PSIA) || !Number.isFinite(tF)) {
    return {
      error: 'multiphase line needs a non-negative liquid rate, positive bore and length, and line conditions',
      code: 'input',
    };
  }
  if (!(qLiquidBpd > 0) && !(qGasScfd > 0)) {
    return { error: 'no flow: both phase rates are zero', code: 'input' };
  }
  if (Math.abs(elevChangeFt) > lengthFt) {
    return { error: 'elevation change cannot exceed line length', code: 'input' };
  }

  const areaFt2 = (Math.PI * idIn * idIn) / (4 * 144);
  const wct = Math.min(Math.max(wctPct / 100, 0), 1);

  const rhoO = oilDensityLbFt3(oilApi);
  const rhoW = waterSg * 62.4;
  const rhoL = rhoO * (1 - wct) + rhoW * wct;
  const muL = muOilCp * (1 - wct) + muWaterCp * wct;
  const tR = toRankine(tF);
  const thetaDeg = (Math.asin(Math.min(Math.max(elevChangeFt / lengthFt, -1), 1)) * 180) / Math.PI;

  /** The whole local state of the line at one station pressure. */
  const stationAt = (p) => {
    const gas = gasDensityLbFt3({ pPsia: p, tF, gasSg });
    if (gas.error) return { error: gas.error };
    const vsl = (qLiquidBpd * CUFT_PER_BBL) / S_PER_DAY / areaFt2;
    const qGasAcfs = ((qGasScfd / S_PER_DAY) * (14.65 / p) * (tR / 520)) * gas.z;
    const vsg = qGasAcfs / areaFt2;
    const vm = vsl + vsg;
    const lambdaL = vm > 0 ? vsl / vm : 1;
    const grad = beggsBrillGradient({
      p,
      thetaDeg,
      dIn: idIn,
      rough: roughnessIn / idIn,
      flows: {
        vsl, vsg, vm, lambdaL,
        rhoL, muL, sigmaL: sigmaLDynCm,
        rhoNs: rhoL * lambdaL + gas.rhoLbFt3 * (1 - lambdaL),
        muNs: muL * lambdaL + muGasCp * (1 - lambdaL),
      },
      pvt: { rhoG: gas.rhoLbFt3, muG: muGasCp },
    });
    if (!Number.isFinite(grad.dpdz)) {
      return { error: 'the Beggs & Brill gradient is not a number at these conditions' };
    }
    return {
      gas, vsl, vsg, vm, lambdaL, grad,
      rhoMix: rhoL * lambdaL + gas.rhoLbFt3 * (1 - lambdaL),
    };
  };

  const inlet = stationAt(pPsia);
  // An inlet that cannot be evaluated is a statement about the stated
  // conditions, not about this bore, so it refuses as an input.
  if (inlet.error) return { error: inlet.error, code: 'input' };

  const dpEstimate = Math.abs(inlet.grad.dpdz * lengthFt);
  const steps = Number.isFinite(marchSteps) && marchSteps >= 1
    ? Math.min(Math.floor(marchSteps), MARCH.maxSteps)
    : Math.min(
      MARCH.maxSteps,
      Math.max(MARCH.minSteps, Math.ceil(dpEstimate / (MARCH.targetFraction * pPsia))),
    );
  const stepFt = lengthFt / steps;

  let p = pPsia;
  let station = inlet;
  let maxVmFtS = inlet.vm;
  let holdupIntegral = 0;
  // Where the RP 14E limit BINDS. The limit is Ve = C / sqrt(rho_m), so
  // the ratio v / Ve is v * sqrt(rho_m) / C: the binding station is the
  // one that maximises v * sqrt(rho_m), and that is independent of C,
  // so it can be found once here and checked against any C factor.
  // It is not simply the fastest station, and not simply the outlet.
  const severity = (s) => s.vm * Math.sqrt(s.rhoMix);
  let binding = { vm: inlet.vm, rhoMix: inlet.rhoMix, atFt: 0, sev: severity(inlet) };
  for (let i = 0; i < steps; i += 1) {
    if (i > 0) {
      const next = stationAt(p);
      if (next.error) {
        return {
          error: `${next.error} (about ${Math.round(i * stepFt)} ft along the ${Math.round(lengthFt)} ft run)`,
          code: 'infeasible',
        };
      }
      station = next;
    }
    holdupIntegral += station.grad.holdup * stepFt;
    maxVmFtS = Math.max(maxVmFtS, station.vm);
    const sev = severity(station);
    if (sev > binding.sev) {
      binding = { vm: station.vm, rhoMix: station.rhoMix, atFt: i * stepFt, sev };
    }
    p -= station.grad.dpdz * stepFt;
    if (!(p > ATMOSPHERIC_PSIA)) {
      return {
        error: 'the line does not deliver: marching Beggs & Brill, the pressure reaches atmospheric about '
          + `${Math.round((i + 1) * stepFt)} ft along the ${Math.round(lengthFt)} ft run`,
        code: 'infeasible',
        diedAtFt: (i + 1) * stepFt,
      };
    }
  }

  const outlet = stationAt(p);
  if (outlet.error) return { error: outlet.error, code: 'infeasible' };
  const outletSev = severity(outlet);
  if (outletSev > binding.sev) {
    binding = { vm: outlet.vm, rhoMix: outlet.rhoMix, atFt: lengthFt, sev: outletSev };
  }

  const dpTotalPsi = pPsia - p;
  return {
    marched: true, steps, stepFt,
    thetaDeg, z: inlet.gas.z, rhoL, rhoG: inlet.gas.rhoLbFt3, rhoMixLbFt3: inlet.rhoMix,
    vsl: inlet.vsl, vsg: inlet.vsg, vm: inlet.vm, lambdaL: inlet.lambdaL,
    pattern: inlet.grad.pattern,
    holdup: inlet.grad.holdup,
    avgHoldup: holdupIntegral / lengthFt,
    outletPattern: outlet.grad.pattern,
    outletHoldup: outlet.grad.holdup,
    outletVmFtS: outlet.vm,
    maxVmFtS: Math.max(maxVmFtS, outlet.vm),
    outletRhoMixLbFt3: outlet.rhoMix,
    bindingVmFtS: binding.vm,
    bindingRhoMixLbFt3: binding.rhoMix,
    bindingAtFt: binding.atFt,
    inletGradientPsiPerFt: inlet.grad.dpdz,
    outletGradientPsiPerFt: outlet.grad.dpdz,
    gradientPsiPerFt: dpTotalPsi / lengthFt,
    dpTotalPsi,
    p2Psia: p,
  };
};

/** RP 14E check of a mixture velocity, C stays an input. */
export const erosionalStatus = ({ vFtS, rhoMixLbFt3, cFactor = 100 }) => {
  const ve = erosionalVelocityFtS({ mixtureDensityLbFt3: rhoMixLbFt3, cFactor });
  if (!(ve > 0)) return { error: 'erosional limit needs a positive mixture density' };
  return { erosionalFtS: ve, ratio: vFtS / ve, exceeded: vFtS > ve };
};

/**
 * RP 14E check of a MARCHED multiphase line, made where the limit
 * binds rather than at the inlet.
 *
 * Erosional velocity is an integrity limit: it exists to stop a line
 * eroding, so the question it answers is whether the line exceeds it
 * ANYWHERE, not whether it exceeds it at the inlet. The inlet is the
 * slowest point of a line that carries gas, because the gas expands as
 * the pressure falls and the mixture accelerates toward the outlet, so
 * checking there reports a line that erodes at its far end as passing.
 *
 * The binding station is not always the outlet. On a DESCENDING line
 * the pressure recovers, the gas is compressed, the mixture slows, and
 * the fastest point is the inlet; a line whose profile falls and then
 * rises binds somewhere in the middle. `multiphaseLine` therefore finds
 * the station that maximises v * sqrt(rho_m) while it marches, which is
 * the ratio's own maximum for every C factor, and this reads it.
 *
 * `inletRatio` is kept alongside so the app can show the reader what
 * the inlet alone would have said.
 */
export const erosionalStatusAlongLine = ({ line, cFactor = 100 }) => {
  if (!line || line.error) return { error: line?.error || 'no line to check' };
  if (!Number.isFinite(line.bindingVmFtS) || !Number.isFinite(line.bindingRhoMixLbFt3)) {
    // An unmarched line (nothing else returns this shape today) is
    // checked where it stands rather than silently assumed to be flat.
    return erosionalStatus({ vFtS: line.vm, rhoMixLbFt3: line.rhoMixLbFt3, cFactor });
  }
  const at = erosionalStatus({
    vFtS: line.bindingVmFtS, rhoMixLbFt3: line.bindingRhoMixLbFt3, cFactor,
  });
  if (at.error) return at;
  const inlet = erosionalStatus({ vFtS: line.vm, rhoMixLbFt3: line.rhoMixLbFt3, cFactor });
  return {
    ...at,
    bindingVFtS: line.bindingVmFtS,
    bindingAtFt: line.bindingAtFt,
    bindsAtInlet: line.bindingAtFt <= 0,
    inletRatio: inlet.error ? undefined : inlet.ratio,
    inletVFtS: line.vm,
  };
};

/**
 * Unique bores of the vendored schedule, one row per NPS+schedule.
 * `order` is the row's position in the published table, kept only so a
 * tie between two otherwise identical candidates resolves the same way
 * every time rather than on sort stability.
 */
export const sweepCandidates = () => PIPE_SCHEDULE.map((r, order) => ({
  ...r, order, label: `${r.nps} in sch ${r.schedule}`,
}));

/**
 * What the studio means by "the recommended size", stated once so the
 * table, the summary rail and the help guide can quote it.
 *
 * SMALLEST PASSING BORE, not the first passing row in table order. The
 * published schedule is ordered by nominal size and then by schedule,
 * and that order is NOT monotonic in bore: a heavier schedule is a
 * SMALLER bore at the same nominal size and sits after the lighter one,
 * so 4 in sch 80 (3.826 in) follows 4 in sch 40 (4.026 in). Ties break
 * on the thinner wall and then the smaller outside diameter, because at
 * equal bore the two lines are hydraulically identical and the smaller,
 * lighter pipe is the cheaper one; whether that wall is thick enough
 * for the pressure is the Wall tab's question, not the sweep's.
 */
export const RECOMMENDATION_RULE = 'the smallest bore that passes every stated limit; '
  + 'ties break on the thinner wall, then the smaller outside diameter';

/** Order two passing candidates: smallest bore first. */
const bySmallestBore = (a, b) => (a.idIn - b.idIn)
  || (a.wall - b.wall)
  || (a.od - b.od)
  || (a.order - b.order);

/**
 * The sizing sweep: the same line evaluated at every schedule bore,
 * with the velocity and RP 14E status of each, so choosing a size is
 * reading a table rather than trusting a single number. `mode` is
 * 'liquid' | 'gas' | 'multiphase'; inputs are that mode's inputs.
 */
export const sizeSweep = ({ mode, inputs, cFactor = 100, maxLiquidVFtS = 15 }) => {
  if (!['liquid', 'gas', 'multiphase'].includes(mode)) {
    return { error: `unknown sweep mode '${mode}'` };
  }

  // The gas rows need a density for their velocity and their RP 14E
  // limit, and that density depends on the gas and the conditions
  // rather than on the bore. Asking for it once, up front, turns what
  // would be twelve identical row notes into one named refusal -- and
  // it is the check that used to be skipped, leaving the sweep to
  // substitute 1 lb/ft3 and report a verdict against it.
  if (mode === 'gas') {
    const probe = gasDensityLbFt3({
      pPsia: inputs.p1Psia, tF: inputs.tF ?? 80, gasSg: inputs.sg,
    });
    if (probe.error) {
      return { error: `${probe.error}; without it the sweep cannot state a velocity or an RP 14E limit` };
    }
  }

  const rows = [];
  for (const cand of sweepCandidates()) {
    const idIn = cand.id;
    if (mode === 'liquid') {
      const r = liquidLineDrop({ ...inputs, idIn });
      if (r.error) return { error: r.error };
      const ero = erosionalStatus({ vFtS: r.vFtS, rhoMixLbFt3: inputs.rhoLbFt3, cFactor });
      if (ero.error) return { error: ero.error };
      rows.push({
        ...cand, idIn, vFtS: r.vFtS, dpPsi: r.dpTotalPsi,
        erosionalFtS: ero.erosionalFtS,
        pass: !ero.exceeded && r.vFtS <= maxLiquidVFtS,
      });
    } else if (mode === 'gas') {
      const inv = gasOutletPressure({ ...inputs, idIn });
      if (inv.error) {
        rows.push({ ...cand, idIn, dpPsi: NaN, pass: false, note: 'cannot carry the rate' });
      } else {
        // actual velocity at mean pressure for the limit check
        const pMean = (inputs.p1Psia + inv.p2Psia) / 2;
        const gas = gasDensityLbFt3({ pPsia: pMean, tF: inputs.tF ?? 80, gasSg: inputs.sg });
        if (gas.error) {
          rows.push({
            ...cand, idIn, dpPsi: inv.dpPsi, p2Psia: inv.p2Psia,
            pass: false, note: gas.error,
          });
        } else {
          const areaFt2 = (Math.PI * idIn * idIn) / (4 * 144);
          const tR = toRankine(inputs.tF ?? 80);
          const vGas = ((inputs.qScfd / S_PER_DAY) * (14.65 / pMean) * (tR / 520) * gas.z) / areaFt2;
          const ero = erosionalStatus({ vFtS: vGas, rhoMixLbFt3: gas.rhoLbFt3, cFactor });
          if (ero.error) {
            rows.push({
              ...cand, idIn, dpPsi: inv.dpPsi, p2Psia: inv.p2Psia, vFtS: vGas,
              pass: false, note: ero.error,
            });
          } else {
            rows.push({
              ...cand, idIn, dpPsi: inv.dpPsi, p2Psia: inv.p2Psia, vFtS: vGas,
              erosionalFtS: ero.erosionalFtS, pass: !ero.exceeded,
            });
          }
        }
      }
    } else {
      const r = multiphaseLine({ ...inputs, idIn });
      if (r.error) {
        // A bore the line cannot be delivered through is a fact about
        // that bore: it stays in the table as a failing row with the
        // reason. Anything wrong with the stated line refuses the sweep.
        if (r.code === 'input') return { error: r.error };
        rows.push({ ...cand, idIn, dpPsi: NaN, pass: false, note: r.error });
      } else {
        // Checked where the limit binds, not at the inlet: `vFtS` is
        // the velocity the verdict is about, so the table's velocity
        // and its RP 14E column describe the same station.
        const ero = erosionalStatusAlongLine({ line: r, cFactor });
        if (ero.error) {
          rows.push({ ...cand, idIn, dpPsi: r.dpTotalPsi, pass: false, note: ero.error });
        } else {
          rows.push({
            ...cand, idIn, vFtS: ero.bindingVFtS, dpPsi: r.dpTotalPsi,
            holdup: r.holdup, pattern: r.pattern,
            inletVFtS: ero.inletVFtS, bindingAtFt: ero.bindingAtFt, bindsAtInlet: ero.bindsAtInlet,
            p2Psia: r.p2Psia, steps: r.steps,
            erosionalFtS: ero.erosionalFtS,
            pass: !ero.exceeded && r.p2Psia > ATMOSPHERIC_PSIA,
          });
        }
      }
    }
  }

  // The recommendation is the SMALLEST passing bore. It used to be the
  // first passing row in table order, which is a different row whenever
  // a heavier schedule of the same nominal size also passes.
  const passing = rows.filter((r) => r.pass);
  const recommended = passing.length ? passing.slice().sort(bySmallestBore)[0] : null;
  return { rows, recommended, recommendationRule: RECOMMENDATION_RULE };
};

/**
 * Gas line marched along an elevation profile, segment by segment,
 * with the published elevation adjustment applied per segment; returns
 * stations for the gradient chart.
 */
export const gasLineTraverse = ({
  equation = 'weymouth', p1Psia, qScfd, idIn, sg, tAvgR, zAvg, efficiency = 1,
  muCp, roughnessIn, profile,
}) => {
  if (!Array.isArray(profile) || profile.length === 0) {
    return { error: 'a traverse needs at least one profile segment' };
  }
  const stations = [{ distanceFt: 0, elevFt: 0, pPsia: p1Psia }];
  let p = p1Psia; let x = 0; let z = 0;
  for (const seg of profile) {
    const inv = gasOutletPressure({
      equation, qScfd, p1Psia: p, idIn, sg, tAvgR, zAvg, efficiency, muCp, roughnessIn,
      lengthMi: seg.lengthFt / 5280,
      elevChangeFt: seg.elevChangeFt || 0,
    });
    if (inv.error) return { error: `${inv.error} (segment ending at ${(x + seg.lengthFt).toFixed(0)} ft)` };
    p = inv.p2Psia;
    x += seg.lengthFt;
    z += seg.elevChangeFt || 0;
    stations.push({ distanceFt: x, elevFt: z, pPsia: p });
  }
  return { stations, p2Psia: p, dpTotalPsi: p1Psia - p };
};
