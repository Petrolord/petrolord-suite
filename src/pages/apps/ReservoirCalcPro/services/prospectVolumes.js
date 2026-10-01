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
  // U1 (RCP-U1-025): oil and a gas cap together, at 6 Mscf per boe
  MMboe: { label: 'MMboe', toMMboe: 1 },
});

/** The unit a run's headline volume is reported in, for a fluid and system. */
export function runVolumeUnit(fluidType, unitSystem) {
  if (fluidType === 'oil_gas') return 'MMboe';
  const gas = fluidType === 'gas';
  if (unitSystem === 'metric') return gas ? 'Bsm3' : 'MMsm3';
  return gas ? 'Bcf' : 'MMbbl';
}

/**
 * The unrisked success-case distribution from a Monte Carlo result,
 * scaled to the inventory unit.
 *
 * RCP-U1-003: Prospect Risking and Risked Reserves Valuation work on
 * RECOVERABLE volumes (PRMS prospective resources; the valuation
 * multiplies them by an NPV per barrel and compares them with a minimum
 * economic field size). The handoff used to send STOIIP, the in-place
 * volume, so a 25% recovery factor valued four times the oil. Runs made
 * since U1 carry recoverable statistics per realization; an older run
 * comes back as in-place with `basis: 'in-place'` so the panel can say so.
 * RCP-U1-025: oil with a gas cap is handed over as oil equivalent
 * (MMboe), not as the oil leg alone.
 * The run's own unit system and fluid (meta) win over the arguments.
 * @returns {{mean, p90, p50, p10, unit: string, basis: 'recoverable'|'in-place'}|null}
 */
export function unriskedFromRun(probResults, fluidType = 'oil', unitSystem = 'field') {
  const stats = probResults?.stats;
  if (!stats) return null;
  const ft = probResults?.meta?.fluidType || fluidType;
  const us = probResults?.meta?.unitSystem || unitSystem;
  const gas = ft === 'gas';
  const pick = (s, scale, unit, basis) => {
    if (!s || !Number.isFinite(s.mean) || !(s.mean > 0)) return null;
    const f = (v) => (Number.isFinite(v) ? v * scale : null);
    return { mean: f(s.mean), p90: f(s.p90), p50: f(s.p50), p10: f(s.p10), unit, basis };
  };
  const hasRec = stats.recoverableOil?.mean !== undefined || stats.recoverableGas?.mean !== undefined;
  if (hasRec) {
    if (ft === 'oil_gas') {
      // boe are barrels in any unit system (the engine converts metric)
      return pick(stats.recoverableBoe, 1e-6, 'MMboe', 'recoverable');
    }
    return pick(gas ? stats.recoverableGas : stats.recoverableOil, gas ? 1e-9 : 1e-6, runVolumeUnit(ft, us), 'recoverable');
  }
  // a run from before U1: in-place only, said as such
  const legacyUnit = gas ? (us === 'metric' ? 'Bsm3' : 'Bcf') : (us === 'metric' ? 'MMsm3' : 'MMbbl');
  return pick(gas ? stats.giip : stats.stooip, gas ? 1e-9 : 1e-6, legacyUnit, 'in-place');
}

/** A volume in a VOLUME_UNITS key as million barrels of oil equivalent (6 Mscf/boe). */
export function toMMboe(v, unit = 'MMbbl') {
  const u = VOLUME_UNITS[unit] || VOLUME_UNITS.MMbbl;
  return Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) * u.toMMboe : v;
}

/**
 * Portfolio totals in one unit (RCP-U1-005): the inventory roll-up used to
 * add MMSTB, Bscf and MMsm3 rows as if they were one number. Each row is
 * converted to MMboe; a row with no stated unit is left out and counted.
 * @param {Array<{inputs?: {mean?, unit?}, risked?: {risked_mean?}, pg?: number}>} rows
 */
export function portfolioInMMboe(rows, pgOf = (r) => r.pg) {
  let riskedMean = 0;
  let successMean = 0;
  let expectedDiscoveries = 0;
  let pNone = 1;
  let unstated = 0;
  let counted = 0;
  for (const r of rows || []) {
    const unit = r.inputs?.unit;
    const pg = Number(pgOf(r)) || 0;
    if (!unit || !VOLUME_UNITS[unit]) { unstated += 1; continue; }
    const mean = Number(r.inputs?.mean) || 0;
    const rm = Number.isFinite(Number(r.risked?.risked_mean)) ? Number(r.risked.risked_mean) : pg * mean;
    riskedMean += toMMboe(rm, unit);
    successMean += toMMboe(mean, unit);
    expectedDiscoveries += pg;
    pNone *= 1 - pg;
    counted += 1;
  }
  return {
    count: counted, unstated, expectedRiskedVolume: riskedMean, successCaseMeanTotal: successMean,
    expectedDiscoveries, pAtLeastOneDiscovery: counted ? 1 - pNone : 0, unit: 'MMboe',
  };
}
