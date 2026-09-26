// Prospect volumes (ReservoirCalc Pro senior test T1, 2026-09-26). The
// Monte Carlo run reports STOIIP in STB (sm³ metric) and GIIP in scf
// (sm³ metric) under stats.stooip / stats.giip; the prospect inventory
// and Risked Reserves Valuation work in millions of barrels (or billions
// of cubic feet for gas). This module is the one place the handoff is
// scaled and labelled.

export const VOLUME_UNITS = Object.freeze({
  MMbbl: { label: 'MMSTB', toMMboe: 1 },
  MMsm3: { label: 'MMsm³', toMMboe: 6.289811 },
  Bcf: { label: 'Bscf', toMMboe: 1 / 6 },
  Bsm3: { label: 'Bsm³', toMMboe: 35.3147 / 6 },
});

/** The unit a run's headline volume is reported in, for a fluid and system. */
export function runVolumeUnit(fluidType, unitSystem) {
  const gas = fluidType === 'gas';
  if (unitSystem === 'metric') return gas ? 'Bsm3' : 'MMsm3';
  return gas ? 'Bcf' : 'MMbbl';
}

/**
 * The unrisked success-case distribution from a Monte Carlo result
 * ({raw, stats: {stooip, giip}}), scaled to the inventory unit.
 * @returns {{mean:number, p90:number, p50:number, p10:number, unit:string}|null}
 */
export function unriskedFromRun(probResults, fluidType = 'oil', unitSystem = 'field') {
  const stats = probResults?.stats;
  if (!stats) return null;
  const gas = fluidType === 'gas';
  const s = gas ? stats.giip : stats.stooip;
  if (!s || !Number.isFinite(s.mean) || !(s.mean > 0)) return null;
  const unit = runVolumeUnit(fluidType, unitSystem);
  const scale = gas ? 1e-9 : 1e-6;
  const f = (v) => (Number.isFinite(v) ? v * scale : null);
  return { mean: f(s.mean), p90: f(s.p90), p50: f(s.p50), p10: f(s.p10), unit };
}

/** A volume in a VOLUME_UNITS key as million barrels of oil equivalent (6 Mscf/boe). */
export function toMMboe(v, unit = 'MMbbl') {
  const u = VOLUME_UNITS[unit] || VOLUME_UNITS.MMbbl;
  return Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) * u.toMMboe : v;
}
