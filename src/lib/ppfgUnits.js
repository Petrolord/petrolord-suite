// Pressure and equivalent-mud-weight curves read by their declared unit
// (AppUpgrade PP-U1-005/006, 2026-10-01).
//
// Pore Pressure Studio publishes PP / FP / OBG in MPa. The Drilling readers
// (Well Design mud window, Casing & Tubing, Hydraulics, Geomechanics,
// Perforation & Sand Control, Stimulation) used to assume it: Well Design
// dropped every curve whose unit was not exactly MPA with nothing said, and
// the Geomechanics family multiplied any value by 1e6. A Drillworks or
// Predict LAS carries PP and FG as equivalent mud weight (ppg or sg), a
// service company table in psi or kPa. This module is the one door: a unit
// is a pressure (converts on its own) or a gradient / EMW (needs the TVD
// below the rotary table, the drilling convention), or it is refused with
// a reason the reader shows.
//
// Pure, no I/O.

const G = 9.80665;
const PA_PER_PSI = 6894.757293168361;
const M_PER_FT = 0.3048;
const KGM3_PER_PPG = 119.82642731689663; // 1 lb/US gal in kg/m3
const PSI_ATM = 14.695948775513449;

const norm = (u) => String(u || '').trim().toUpperCase().replace(/\s+/g, '');

/** unit -> MPa factor for absolute pressures. */
const PRESSURE = {
  MPA: 1, KPA: 1e-3, PA: 1e-6, BAR: 0.1, BARG: 0.1, PSI: PA_PER_PSI / 1e6, PSIG: PA_PER_PSI / 1e6,
  'KG/CM2': (G * 1e4) / 1e6, ATM: 0.101325,
};
/** unit -> kg/m3 for equivalent mud weights (density form). */
const EMW = {
  PPG: KGM3_PER_PPG, 'LB/GAL': KGM3_PER_PPG, 'LBM/GAL': KGM3_PER_PPG, 'LB/USGAL': KGM3_PER_PPG,
  SG: 1000, 'G/CC': 1000, 'G/CM3': 1000, 'G/C3': 1000, 'GM/CC': 1000, 'KG/M3': 1, 'K/M3': 1, 'KG/L': 1000,
};
/** unit -> MPa per metre for pressure gradients. */
const GRADIENT = {
  'PSI/FT': PA_PER_PSI / 1e6 / M_PER_FT, 'KPA/M': 1e-3, 'MPA/M': 1, 'MPA/KM': 1e-3, 'BAR/M': 0.1, 'PSI/M': PA_PER_PSI / 1e6,
};

/**
 * How a curve's declared unit becomes MPa.
 * @returns {{kind: 'pressure'|'emw'|'gradient', unit: string, needsTvd: boolean,
 *   toMpa: (v: number, tvdM?: number) => number}|null} null when the unit is not a pressure
 */
export function ppfgUnit(unit) {
  const u = norm(unit);
  if (u === 'PSIA') {
    return { kind: 'pressure', unit: 'psia', needsTvd: false, toMpa: (v) => ((v - PSI_ATM) * PA_PER_PSI) / 1e6 };
  }
  if (PRESSURE[u] != null) {
    const f = PRESSURE[u];
    return { kind: 'pressure', unit: u === 'MPA' ? 'MPa' : u === 'KPA' ? 'kPa' : u.toLowerCase(), needsTvd: false, toMpa: (v) => v * f };
  }
  if (EMW[u] != null) {
    const f = EMW[u];
    return { kind: 'emw', unit: u.toLowerCase(), needsTvd: true, toMpa: (v, tvdM) => (tvdM > 0 ? (v * f * G * tvdM) / 1e6 : NaN) };
  }
  if (GRADIENT[u] != null) {
    const f = GRADIENT[u];
    return { kind: 'gradient', unit: u.toLowerCase(), needsTvd: true, toMpa: (v, tvdM) => (tvdM > 0 ? v * f * tvdM : NaN) };
  }
  return null;
}

/** A reason a PPFG curve was not read, for the reader's note. */
export function unreadableUnitReason(log) {
  const unit = String(log?.unit || '').trim();
  return unit
    ? `${log?.mnemonic || 'curve'} is in ${unit}, which is not a pressure, a gradient or a mud weight, so it was not read.`
    : `${log?.mnemonic || 'curve'} has no unit, so it was not read (a pressure needs one: MPa, psi, ppg or sg).`;
}

/** EMW (kg/m3) from a pressure in MPa at a TVD below the rotary table. */
export const emwKgM3 = (mpa, tvdM) => (Number.isFinite(mpa) && tvdM > 0 ? (mpa * 1e6) / (G * tvdM) : NaN);
export const KG_M3_PER_PPG = KGM3_PER_PPG;
