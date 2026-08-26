// Pure cement-job orchestration: assemble engine inputs from a saved case +
// shared geometry + trajectory, plus display-unit helpers. NO '@/' aliases
// (e2e imports this file directly).
//
// Storage (jsonb, SI; the wp_* convention):
//   case.casing        {odM, idM, weightKgM, grade, shoeMd, floatCollarMd}
//   case.fluids        {mudInHole: {densityKgM3, fann?|pvPaS/ypPa?},
//                       program: [{kind, densityKgM3, fann?|pvPaS/ypPa?,
//                                  volumeM3?}]}  (volumeM3 null = auto for
//                       lead/tail/displacement from the job volumes)
//   case.job           {tocMd, excessOpenHolePct, leadTailSplitMd,
//                       pumpRateM3s, slurryYieldM3PerSack, fracEmwKgM3}
//   case.centralizers  {type, spacingM, restoringForceN, bladeOdM}

import {
  jobVolumes, simulatePlacement, standoffProfile, requiredSpacing,
  placementChecklist,
} from '../engine/cementing';
import { fitModels } from '../engine/rheology';

export const CMT_ENGINE_VERSION = 'cementing-1.0.0';

const PSI = 6894.757;
const BBL = 0.1589873;
const FT = 0.3048;
const PPG = 119.826;

export function pressureLabel(depthUnit) { return depthUnit === 'ft' ? 'psi' : 'kPa'; }
export function pressureOut(pa, depthUnit) { return depthUnit === 'ft' ? pa / PSI : pa / 1e3; }
export function volumeLabel(depthUnit) { return depthUnit === 'ft' ? 'bbl' : 'm3'; }
export function volumeOut(m3, depthUnit) { return depthUnit === 'ft' ? m3 / BBL : m3; }
export function volumeIn(v, depthUnit) { return depthUnit === 'ft' ? v * BBL : v; }
export function emwLabel(depthUnit) { return depthUnit === 'ft' ? 'ppg' : 'g/cc'; }
export function emwOut(kgM3, depthUnit) { return depthUnit === 'ft' ? kgM3 / PPG : kgM3 / 1000; }
export function emwIn(v, depthUnit) { return depthUnit === 'ft' ? v * PPG : v * 1000; }
export function depthOut(m, depthUnit) { return depthUnit === 'ft' ? m / FT : m; }
export function depthIn(v, depthUnit) { return depthUnit === 'ft' ? v * FT : v; }
export function depthLabel(depthUnit) { return depthUnit === 'ft' ? 'ft' : 'm'; }

// Rheology model for a stored fluid: Fann fit (HB) > PV/YP (Bingham) > none.
export function fluidModel(f) {
  if (f?.fann?.theta600 > 0 && f?.fann?.theta300 > 0) return fitModels(f.fann).herschelBulkley;
  if (f?.pvPaS > 0) return { type: 'bingham', pvPaS: f.pvPaS, ypPa: f.ypPa ?? 0 };
  return null;
}

function baseInputs({ stations, caseRow, geometryRow }) {
  if (!Array.isArray(stations) || stations.length < 2) {
    throw new Error('No trajectory: the wellbore needs a definitive design with saved stations.');
  }
  const holeSections = geometryRow?.hole_sections || [];
  if (!holeSections.length) throw new Error('No hole sections defined for this wellbore.');
  const casing = caseRow.casing || {};
  if (!(casing.odM > 0) || !(casing.idM > 0)) throw new Error('Define the casing being cemented.');
  if (!(casing.shoeMd > 0)) throw new Error('Set the casing shoe MD.');
  const job = caseRow.job || {};
  if (!(job.tocMd >= 0)) throw new Error('Set the target TOC.');
  return { holeSections, casing, job };
}

export function runVolumes({ stations, caseRow, geometryRow }) {
  const { holeSections, casing, job } = baseInputs({ stations, caseRow, geometryRow });
  const program = caseRow.fluids?.program || [];
  const spacer = program.find((f) => f.kind === 'spacer');
  return jobVolumes({
    stations, holeSections, casing,
    tocMd: job.tocMd,
    excessOpenHolePct: job.excessOpenHolePct ?? 0,
    spacerVolM3: spacer?.volumeM3 ?? 0,
    slurryYieldM3PerSack: job.slurryYieldM3PerSack ?? null,
    leadTailSplitMd: job.leadTailSplitMd ?? null,
    pumpRateM3s: job.pumpRateM3s ?? null,
  });
}

// Resolve the pumped program with auto volumes from the job volumes.
export function resolveProgram({ caseRow, vols }) {
  const program = caseRow.fluids?.program || [];
  if (!program.length) throw new Error('Add fluids to the pump program.');
  const hasSplit = caseRow.job?.leadTailSplitMd != null;
  return program.map((f) => {
    let volumeM3 = f.volumeM3;
    if (!(volumeM3 > 0)) {
      if (f.kind === 'lead') volumeM3 = hasSplit ? vols.leadM3 : 0;
      else if (f.kind === 'tail') volumeM3 = hasSplit ? vols.tailM3 : vols.slurryM3;
      else if (f.kind === 'displacement') volumeM3 = vols.displacementM3;
    }
    if (!(volumeM3 > 0)) throw new Error(`Fluid '${f.kind}' needs a volume.`);
    return { kind: f.kind, densityKgM3: f.densityKgM3, volumeM3, rheology: fluidModel(f) };
  });
}

export function runPlacement({ stations, caseRow, geometryRow }) {
  const { holeSections, casing, job } = baseInputs({ stations, caseRow, geometryRow });
  if (!(job.pumpRateM3s > 0)) throw new Error('Set a positive pump rate.');
  const mudCfg = caseRow.fluids?.mudInHole;
  if (!mudCfg || !(mudCfg.densityKgM3 > 0)) throw new Error('Set the in-hole mud.');
  const vols = runVolumes({ stations, caseRow, geometryRow });
  const fluids = resolveProgram({ caseRow, vols });
  const mudInHole = { kind: 'mud', densityKgM3: mudCfg.densityKgM3, rheology: fluidModel(mudCfg) };
  const placement = simulatePlacement({
    stations, holeSections, casing, mudInHole, fluids,
    pumpRateM3s: job.pumpRateM3s,
    tocMd: job.tocMd,
    excessOpenHolePct: job.excessOpenHolePct ?? 0,
    fracEmwKgM3: job.fracEmwKgM3 ?? null,
  });
  return { vols, fluids, mudInHole, placement };
}

export function runStandoff({ stations, caseRow, geometryRow }) {
  const { holeSections, casing } = baseInputs({ stations, caseRow, geometryRow });
  const cent = caseRow.centralizers || {};
  if (!(cent.spacingM > 0)) throw new Error('Set the centralizer spacing.');
  const mudRho = caseRow.fluids?.mudInHole?.densityKgM3;
  if (!(mudRho > 0)) throw new Error('Set the in-hole mud.');
  const profile = standoffProfile({
    stations, holeSections, casing, mudDensityKgM3: mudRho, centralizer: cent,
  });
  const required = requiredSpacing({
    stations, holeSections, casing, mudDensityKgM3: mudRho, centralizer: cent,
  });
  return { profile, requiredSpacingM: required };
}

export function runChecklist({ stations, caseRow, geometryRow }) {
  const { placement, fluids, mudInHole, vols } = runPlacement({ stations, caseRow, geometryRow });
  const { profile } = runStandoff({ stations, caseRow, geometryRow });
  return placementChecklist({
    placement,
    standoff: profile,
    mudInHole,
    fluids,
    pumpRateM3s: caseRow.job?.pumpRateM3s,
    annulusRowsList: vols.annulusRows,
  });
}
