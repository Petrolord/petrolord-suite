// In-place volume display (ReservoirCalc Pro upgrade U1, RCP-U1-001 and
// RCP-U1-009, 2026-09-30). The engines report STOIIP in STB (field) or sm3
// (metric) and GIIP in scf (field) or sm3 (metric). Every Monte Carlo view
// used to pick its own divisor and label, and several disagreed with the
// numbers: GIIP in sm3 divided by 1e9 was labelled MMsm3 (1000x), the
// Detailed Statistics table divided GIIP by 1e6 under a Bscf header
// (1000x), and a metric STOIIP read MMstb. This module is the one place a
// stream's divisor and label come from, and a run carries the unit system
// and fluid it was computed under (MonteCarloEngine meta), so toggling the
// workspace after a run no longer relabels its numbers. Pure.

/** Divisor and label for one stream ('oil' | 'gas') of a unit system. */
export function inPlaceScale(stream, unitSystem = 'field') {
  const metric = unitSystem === 'metric';
  if (stream === 'gas') return { denom: 1e9, label: metric ? 'Bsm³' : 'Bscf', base: metric ? 'sm³' : 'scf' };
  return { denom: 1e6, label: metric ? 'MMsm³' : 'MMSTB', base: metric ? 'sm³' : 'STB' };
}

/** The headline stream of a fluid type: gas for a gas reservoir, else oil. */
export const headlineStream = (fluidType) => (fluidType === 'gas' ? 'gas' : 'oil');

/**
 * The unit system and fluid a Monte Carlo result was computed under. Runs
 * made before U1 carry no meta; they fall back to the live workspace
 * (the old behaviour) and say so through `stamped: false`.
 */
export function runContext(probResults, state = {}) {
  const m = probResults?.meta || {};
  return {
    unitSystem: m.unitSystem || state.unitSystem || 'field',
    fluidType: m.fluidType || state.inputs?.fluidType || 'oil',
    stamped: !!(m.unitSystem && m.fluidType),
  };
}

/** Scale a raw value to the stream's display unit (null stays null). */
export function scaled(v, stream, unitSystem) {
  const { denom } = inPlaceScale(stream, unitSystem);
  return Number.isFinite(v) ? v / denom : null;
}

/**
 * The inputs that shape a Monte Carlo run, as a string: a later change to
 * any of them makes the run stale (RCP-U1-028).
 */
export function runSignature(state = {}) {
  const i = state.inputs || {};
  return JSON.stringify([
    state.unitSystem, state.inputMethod, i.fluidType, i.topSurfaceId || null, i.baseSurfaceId || null,
    i.thickness, i.area, i.ntg, i.porosity, i.sw, i.fvf, i.bg, i.owc, i.goc, i.gasCapFraction ?? null,
    i.recovery, i.recoveryGas, state.activeAoiId || null,
    // U2-001: the area/depth table and its spill point
    i.areaDepth ? JSON.stringify(i.areaDepth) : null,
  ]);
}
