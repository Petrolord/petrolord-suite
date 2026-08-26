// Pure well-control orchestration: assemble engine inputs from a saved case
// + shared geometry + trajectory, plus display-unit helpers. NO '@/'
// aliases (e2e imports this file directly).
//
// Storage (jsonb, SI; the wp_* convention):
//   case.string  D1 component shape (bottom-up)
//   case.mud     {densityKgM3}
//   case.pump    {outputM3PerStroke, scr: [{spm, pressurePa}], scrIndex}
//   case.shoe    {mdM, fracEmwKgM3}
//   case.kick    {sidppPa, sicpPa, pitGainM3, influxDensityKgM3,
//                 kickIntensityKgM3}

import {
  wellVolumes, annulusCapAt, killSheet, kickTolerance, kickToleranceSweep,
  tvdAt,
} from '../engine/wellControl';
import { buildEngineGeometry } from '../../TorqueDragStudio/services/tdRun';

export const WC_ENGINE_VERSION = 'wellControl-1.0.0';

const PSI = 6894.757;
const BBL = 0.1589873;
const FT = 0.3048;
const PPG = 119.826;

export function pressureLabel(depthUnit) { return depthUnit === 'ft' ? 'psi' : 'kPa'; }
export function pressureOut(pa, depthUnit) { return depthUnit === 'ft' ? pa / PSI : pa / 1e3; }
export function pressureIn(v, depthUnit) { return depthUnit === 'ft' ? v * PSI : v * 1e3; }
export function volumeLabel(depthUnit) { return depthUnit === 'ft' ? 'bbl' : 'm3'; }
export function volumeOut(m3, depthUnit) { return depthUnit === 'ft' ? m3 / BBL : m3; }
export function volumeIn(v, depthUnit) { return depthUnit === 'ft' ? v * BBL : v; }
export function emwLabel(depthUnit) { return depthUnit === 'ft' ? 'ppg' : 'g/cc'; }
export function emwOut(kgM3, depthUnit) { return depthUnit === 'ft' ? kgM3 / PPG : kgM3 / 1000; }
export function emwIn(v, depthUnit) { return depthUnit === 'ft' ? v * PPG : v * 1000; }
export function depthOut(m, depthUnit) { return depthUnit === 'ft' ? m / FT : m; }
export function depthIn(v, depthUnit) { return depthUnit === 'ft' ? v * FT : v; }
export function depthLabel(depthUnit) { return depthUnit === 'ft' ? 'ft' : 'm'; }

function baseInputs({ stations, caseRow, geometryRow }) {
  if (!Array.isArray(stations) || stations.length < 2) {
    throw new Error('No trajectory: the wellbore needs a definitive design with saved stations.');
  }
  if (!caseRow.string?.length) throw new Error('The drillstring is empty.');
  const geometry = buildEngineGeometry(geometryRow?.hole_sections, {});
  if (!geometry.length) throw new Error('No hole sections defined for this wellbore.');
  const shoeMd = caseRow.shoe?.mdM;
  if (!(shoeMd > 0)) throw new Error('Set the casing shoe MD.');
  const vols = wellVolumes({
    stations, string: caseRow.string, geometry,
    pumpOutputM3PerStroke: caseRow.pump?.outputM3PerStroke ?? null,
  });
  if (shoeMd >= vols.bitMd) throw new Error('The shoe must sit above the bit.');
  return {
    geometry,
    vols,
    tvdBhM: tvdAt(stations, vols.bitMd),
    tvdShoeM: tvdAt(stations, shoeMd),
    capBitM2: annulusCapAt(vols.annulusRows, vols.bitMd - 1),
    capShoeM2: annulusCapAt(vols.annulusRows, shoeMd - 1),
  };
}

export function runVolumes({ stations, caseRow, geometryRow }) {
  const b = baseInputs({ stations, caseRow, geometryRow });
  return { ...b.vols, tvdBhM: b.tvdBhM, tvdShoeM: b.tvdShoeM };
}

export function scrPressurePa(caseRow) {
  const scr = caseRow.pump?.scr || [];
  if (!scr.length) throw new Error('Add at least one slow circulating rate pressure.');
  const idx = Math.min(caseRow.pump?.scrIndex ?? 0, scr.length - 1);
  return scr[idx].pressurePa;
}

export function runKillSheet({ stations, caseRow, geometryRow }) {
  const b = baseInputs({ stations, caseRow, geometryRow });
  const kick = caseRow.kick || {};
  if (!(kick.sidppPa >= 0)) throw new Error('Enter the SIDPP.');
  if (!(caseRow.pump?.outputM3PerStroke > 0)) throw new Error('Set the pump output per stroke.');
  return {
    result: killSheet({
      tvdBhM: b.tvdBhM,
      tvdShoeM: b.tvdShoeM,
      mudDensityKgM3: caseRow.mud?.densityKgM3,
      sidppPa: kick.sidppPa,
      sicpPa: kick.sicpPa ?? null,
      pitGainM3: kick.pitGainM3 ?? 0,
      scrPressurePa: scrPressurePa(caseRow),
      pumpOutputM3PerStroke: caseRow.pump.outputM3PerStroke,
      stringVolumeM3: b.vols.stringVolumeM3,
      annulusVolumeM3: b.vols.annulusVolumeM3,
      annulusCapNearBitM2: b.capBitM2,
    }),
    context: b,
  };
}

export function runKickTolerance({ stations, caseRow, geometryRow, sweepDensities = null }) {
  const b = baseInputs({ stations, caseRow, geometryRow });
  const shoe = caseRow.shoe || {};
  if (!(shoe.fracEmwKgM3 > 0)) throw new Error('Set the shoe fracture EMW (LOT).');
  const kick = caseRow.kick || {};
  const args = {
    tvdBhM: b.tvdBhM,
    tvdShoeM: b.tvdShoeM,
    mudDensityKgM3: caseRow.mud?.densityKgM3,
    fracEmwKgM3: shoe.fracEmwKgM3,
    kickIntensityKgM3: kick.kickIntensityKgM3 ?? 60,
    influxDensityKgM3: kick.influxDensityKgM3 ?? 240,
    annulusCapAtShoeM2: b.capShoeM2,
    annulusCapAtBitM2: b.capBitM2,
  };
  const result = kickTolerance(args);
  const rho = caseRow.mud?.densityKgM3 || 1200;
  const densities = sweepDensities
    || Array.from({ length: 9 }, (_, i) => Math.round(rho * (0.85 + 0.05 * i)));
  const { mudDensityKgM3: _drop, ...sweepBase } = args;
  const sweep = kickToleranceSweep({ mudDensities: densities, base: sweepBase });
  return { result, sweep, context: b };
}
