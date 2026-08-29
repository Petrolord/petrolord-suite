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
 */

import {
  liquidLineDrop, liquidLineTraverse,
  weymouthQ, panhandleAQ, panhandleBQ, generalFlowQ, gasOutletPressure,
  requiredWallIn, maopPsig,
  lineVolumeBbl, sweptLiquidBbl, pigRun, piggingInterval,
} from '@/utils/facilities/engine/lineHydraulics';
import { beggsBrillGradient } from '@/utils/nodal/correlations/beggsBrill';
import { naturalGasZ, toRankine } from '@/utils/production/engine/gasProperties';
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

/** Gas density at line conditions from the validated z-factor. */
export const gasDensityLbFt3 = ({ pPsia, tF, gasSg }) => {
  const z = naturalGasZ({ pPsia, tF, gasSg });
  if (!(z > 0)) return { error: 'z-factor did not converge at these conditions' };
  const tR = toRankine(tF);
  // rho = p M / (z R T) with M = 28.9625 sg, R = 10.7316
  return { rhoLbFt3: (28.9625 * gasSg * pPsia) / (z * 10.7316 * tR), z };
};

/**
 * Multiphase flowline pressure drop over the Suite's Beggs & Brill.
 * Rates: liquid bpd at line conditions with a water cut, gas scfd
 * converted to in-situ at line P, T and the computed z. The pipe angle
 * comes from the stated elevation change over the stated length.
 */
export const multiphaseLine = ({
  qLiquidBpd, wctPct = 0, qGasScfd = 0,
  pPsia, tF, idIn, lengthFt, elevChangeFt = 0, roughnessIn = 0.0018,
  oilApi = 35, waterSg = 1.02, gasSg = 0.65,
  muOilCp = 2, muWaterCp = 0.6, muGasCp = 0.012, sigmaLDynCm = 25,
}) => {
  if (!(qLiquidBpd >= 0) || !(idIn > 0) || !(lengthFt > 0) || !(pPsia > 14.7) || !Number.isFinite(tF)) {
    return { error: 'multiphase line needs a non-negative liquid rate, positive bore and length, and line conditions' };
  }
  if (!(qLiquidBpd > 0) && !(qGasScfd > 0)) {
    return { error: 'no flow: both phase rates are zero' };
  }
  if (Math.abs(elevChangeFt) > lengthFt) {
    return { error: 'elevation change cannot exceed line length' };
  }

  const areaFt2 = (Math.PI * idIn * idIn) / (4 * 144);
  const wct = Math.min(Math.max(wctPct / 100, 0), 1);

  const rhoO = oilDensityLbFt3(oilApi);
  const rhoW = waterSg * 62.4;
  const rhoL = rhoO * (1 - wct) + rhoW * wct;
  const muL = muOilCp * (1 - wct) + muWaterCp * wct;

  const gas = gasDensityLbFt3({ pPsia, tF, gasSg });
  if (gas.error) return gas;
  const tR = toRankine(tF);

  const vsl = (qLiquidBpd * CUFT_PER_BBL) / S_PER_DAY / areaFt2;
  const qGasAcfs = ((qGasScfd / S_PER_DAY) * (14.65 / pPsia) * (tR / 520)) * gas.z;
  const vsg = qGasAcfs / areaFt2;
  const vm = vsl + vsg;
  const lambdaL = vm > 0 ? vsl / vm : 1;

  const thetaDeg = (Math.asin(Math.min(Math.max(elevChangeFt / lengthFt, -1), 1)) * 180) / Math.PI;

  const grad = beggsBrillGradient({
    p: pPsia,
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

  const rhoMix = rhoL * lambdaL + gas.rhoLbFt3 * (1 - lambdaL);
  return {
    thetaDeg, z: gas.z, rhoL, rhoG: gas.rhoLbFt3, rhoMixLbFt3: rhoMix,
    vsl, vsg, vm, lambdaL,
    pattern: grad.pattern,
    holdup: grad.holdup,
    gradientPsiPerFt: grad.dpdz,
    dpTotalPsi: grad.dpdz * lengthFt,
    p2Psia: pPsia - grad.dpdz * lengthFt,
  };
};

/** RP 14E check of a mixture velocity, C stays an input. */
export const erosionalStatus = ({ vFtS, rhoMixLbFt3, cFactor = 100 }) => {
  const ve = erosionalVelocityFtS({ mixtureDensityLbFt3: rhoMixLbFt3, cFactor });
  if (!(ve > 0)) return { error: 'erosional limit needs a positive mixture density' };
  return { erosionalFtS: ve, ratio: vFtS / ve, exceeded: vFtS > ve };
};

/** Unique bores of the vendored schedule, one row per NPS+schedule. */
export const sweepCandidates = () => PIPE_SCHEDULE.map((r) => ({
  ...r, label: `${r.nps} in sch ${r.schedule}`,
}));

/**
 * The sizing sweep: the same line evaluated at every schedule bore,
 * with the velocity and RP 14E status of each, so choosing a size is
 * reading a table rather than trusting a single number. `mode` is
 * 'liquid' | 'gas' | 'multiphase'; inputs are that mode's inputs.
 */
export const sizeSweep = ({ mode, inputs, cFactor = 100, maxLiquidVFtS = 15 }) => {
  const rows = [];
  for (const cand of sweepCandidates()) {
    const idIn = cand.id;
    if (mode === 'liquid') {
      const r = liquidLineDrop({ ...inputs, idIn });
      if (r.error) return { error: r.error };
      const ero = erosionalStatus({ vFtS: r.vFtS, rhoMixLbFt3: inputs.rhoLbFt3, cFactor });
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
        const areaFt2 = (Math.PI * idIn * idIn) / (4 * 144);
        const tR = toRankine(inputs.tF ?? 80);
        const vGas = ((inputs.qScfd / S_PER_DAY) * (14.65 / pMean) * (tR / 520) * (gas.z || 1)) / areaFt2;
        const ero = erosionalStatus({ vFtS: vGas, rhoMixLbFt3: gas.rhoLbFt3 || 1, cFactor });
        rows.push({
          ...cand, idIn, dpPsi: inv.dpPsi, p2Psia: inv.p2Psia, vFtS: vGas,
          erosionalFtS: ero.erosionalFtS, pass: !ero.exceeded,
        });
      }
    } else if (mode === 'multiphase') {
      const r = multiphaseLine({ ...inputs, idIn });
      if (r.error) return { error: r.error };
      const ero = erosionalStatus({ vFtS: r.vm, rhoMixLbFt3: r.rhoMixLbFt3, cFactor });
      rows.push({
        ...cand, idIn, vFtS: r.vm, dpPsi: r.dpTotalPsi, holdup: r.holdup, pattern: r.pattern,
        erosionalFtS: ero.erosionalFtS, pass: !ero.exceeded && r.p2Psia > 14.7,
      });
    } else {
      return { error: `unknown sweep mode '${mode}'` };
    }
  }
  const recommended = rows.find((r) => r.pass) || null;
  return { rows, recommended };
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
