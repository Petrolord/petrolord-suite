// Pure hydraulics run orchestration: assemble engine inputs from a saved
// case + shared geometry + trajectory, plus display-unit helpers. NO '@/'
// aliases (e2e imports this file directly — the D1 precedent).
//
// Storage (jsonb, SI; the wp_* convention):
//   case.mud      {densityKgM3, fann: {theta600, theta300, theta6, theta3},
//                  model: 'auto'|'bingham'|'powerLaw'|'herschelBulkley'}
//                  ('auto' = Herschel-Bulkley, the RP 13D default)
//   case.string   D1 component shape (bottom-up)
//   case.flow     {flowRateM3s, nozzlesMm: [d..], surfaceLossPa}
//   case.trip     {mode: 'closed'|'open', maxSpeedMs}
//   case.cuttings {ropMs, dParticleM, rhoSolidKgM3}

import { fitModels } from '../engine/rheology';
import { computeHydraulics } from '../engine/hydraulics';
import { computeSurgeSwab, sweepTripSpeeds, maxTripSpeed } from '../engine/surgeSwab';
import { computeHoleCleaning, minFlowRate } from '../engine/holeCleaning';
import { buildEngineGeometry } from '../../TorqueDragStudio/services/tdRun';

export const HYD_ENGINE_VERSION = 'hydraulics-1.0.0';

const PSI = 6894.757;
const GPM = 6.30902e-5; // m3/s per US gal/min
const FT = 0.3048;
const PPG = 119.826; // kg/m3 per lb/gal

export function pressureLabel(depthUnit) { return depthUnit === 'ft' ? 'psi' : 'kPa'; }
export function pressureOut(pa, depthUnit) { return depthUnit === 'ft' ? pa / PSI : pa / 1e3; }
export function flowLabel(depthUnit) { return depthUnit === 'ft' ? 'gpm' : 'L/min'; }
export function flowOut(m3s, depthUnit) { return depthUnit === 'ft' ? m3s / GPM : m3s * 60000; }
export function flowIn(v, depthUnit) { return depthUnit === 'ft' ? v * GPM : v / 60000; }
export function emwLabel(depthUnit) { return depthUnit === 'ft' ? 'ppg' : 'g/cc'; }
export function emwOut(kgM3, depthUnit) { return depthUnit === 'ft' ? kgM3 / PPG : kgM3 / 1000; }
export function densityIn(v, depthUnit) { return depthUnit === 'ft' ? v * PPG : v; }
export function depthOut(m, depthUnit) { return depthUnit === 'ft' ? m / FT : m; }
export function depthLabel(depthUnit) { return depthUnit === 'ft' ? 'ft' : 'm'; }

export function nozzleTfaM2(nozzlesMm = []) {
  return nozzlesMm.reduce((a, d) => a + (Math.PI / 4) * (d / 1000) ** 2, 0);
}

export function mudModel(mudCfg) {
  if (!mudCfg?.fann) throw new Error('The mud needs Fann dial readings.');
  const fits = fitModels(mudCfg.fann);
  const pick = mudCfg.model && mudCfg.model !== 'auto' ? mudCfg.model : 'herschelBulkley';
  const model = fits[pick];
  if (!model) throw new Error(`Unknown rheology model choice '${pick}'.`);
  return { fits, model };
}

function engineArgs({ stations, caseRow, geometryRow }) {
  if (!Array.isArray(stations) || stations.length < 2) {
    throw new Error('No trajectory: the wellbore needs a definitive design with saved stations.');
  }
  if (!caseRow.string?.length) throw new Error('The drillstring is empty.');
  const geometry = buildEngineGeometry(geometryRow?.hole_sections, {});
  if (!geometry.length) throw new Error('No hole sections defined for this wellbore.');
  const { model } = mudModel(caseRow.mud);
  return {
    stations,
    string: caseRow.string,
    geometry,
    mud: { densityKgM3: caseRow.mud.densityKgM3, model },
  };
}

export function runHydraulics({ stations, caseRow, geometryRow }) {
  const args = engineArgs({ stations, caseRow, geometryRow });
  const flow = caseRow.flow || {};
  if (!(flow.flowRateM3s > 0)) throw new Error('Set a positive flow rate.');
  return computeHydraulics({
    ...args,
    flowRateM3s: flow.flowRateM3s,
    nozzleTfaM2: nozzleTfaM2(flow.nozzlesMm),
    params: { surfaceLossPa: flow.surfaceLossPa ?? 0 },
  });
}

export function runSurgeSwab({ stations, caseRow, geometryRow, speeds = null }) {
  const args = engineArgs({ stations, caseRow, geometryRow });
  const trip = caseRow.trip || {};
  const mode = trip.mode === 'open' ? 'open' : 'closed';
  const list = speeds
    || Array.from({ length: 10 }, (_, i) => +(0.1 * (i + 1)).toFixed(2));
  return {
    mode,
    sweep: sweepTripSpeeds({ ...args, speeds: list, mode }),
    at: (v) => computeSurgeSwab({ ...args, tripSpeedMs: v, mode }),
  };
}

export function safeTripSpeed({ stations, caseRow, geometryRow, poreEmwKgM3 = null, fracEmwKgM3 = null }) {
  const args = engineArgs({ stations, caseRow, geometryRow });
  const trip = caseRow.trip || {};
  return maxTripSpeed({
    ...args,
    mode: trip.mode === 'open' ? 'open' : 'closed',
    poreEmwKgM3,
    fracEmwKgM3,
    vMaxMs: trip.maxSpeedMs ?? 3,
  });
}

export function runHoleCleaning({ stations, caseRow, geometryRow }) {
  const args = engineArgs({ stations, caseRow, geometryRow });
  const flow = caseRow.flow || {};
  if (!(flow.flowRateM3s > 0)) throw new Error('Set a positive flow rate.');
  return computeHoleCleaning({
    ...args,
    flowRateM3s: flow.flowRateM3s,
    cuttings: caseRow.cuttings || {},
  });
}

export function requiredFlowRate({ stations, caseRow, geometryRow, targetTr = 0.5 }) {
  const args = engineArgs({ stations, caseRow, geometryRow });
  return minFlowRate({ ...args, cuttings: caseRow.cuttings || {}, targetTr });
}
