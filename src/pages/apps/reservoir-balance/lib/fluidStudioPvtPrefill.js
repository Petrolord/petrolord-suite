/**
 * Material Balance Studio, PVT tab (MB7) — lab-table prefill from the Fluid
 * Systems Studio client black-oil engine (src/utils/fluidStudioCalculations,
 * the Phase 1 Fluid Studio rebuild). Pure functions, jest guarded.
 *
 * The MBAL engine's lab-table path interpolates whatever table it is given;
 * this builds that table from correlations at the case's conditions so the
 * user starts from a physically consistent grid instead of an empty editor.
 * The generated rows are a starting point to review and overwrite with real
 * lab data where it exists; the engine's own correlated mode remains the
 * default for cases with no lab data at all.
 */
import {
  rsAt,
  solveBubblePoint,
  zFactor,
  bgAt,
  muGas,
  computePvtRow,
} from '@/utils/fluidStudioCalculations';

const DEFAULT_POINTS = 20;

/**
 * Build lab-table rows (numeric, keyed by the PvtRock lab-table schema,
 * ascending pressure) from Fluid Studio correlations.
 *
 * opts = {
 *   fluidSystem: 'oil' | 'gas' | 'oil_with_gas_cap',
 *   apiGravity, gasSg, temperatureF,
 *   bubblePointPsia (oil; null lets the engine solve it from the GOR),
 *   gorScfStb (oil; solution GOR Rsb — derived from Pb when omitted),
 *   maxPressurePsia (usually a bit above initial pressure),
 *   nPoints,
 * }
 * Returns { ok: true, rows, pb, derivedGor } or { ok: false, error }.
 */
export function buildPvtPrefillRows(opts) {
  const {
    fluidSystem, apiGravity, gasSg, temperatureF,
    bubblePointPsia, gorScfStb, maxPressurePsia,
    nPoints = DEFAULT_POINTS,
  } = opts ?? {};

  const isGas = fluidSystem === 'gas';
  if (!Number.isFinite(gasSg) || gasSg <= 0) {
    return { ok: false, error: 'Set the gas specific gravity on this tab first.' };
  }
  if (!Number.isFinite(temperatureF) || temperatureF <= 0) {
    return { ok: false, error: 'The case needs a reservoir temperature.' };
  }
  if (!Number.isFinite(maxPressurePsia) || maxPressurePsia <= 100) {
    return { ok: false, error: 'Set a maximum table pressure above 100 psia.' };
  }
  const n = Math.min(60, Math.max(8, Math.round(nPoints)));

  // Ascending pressure grid from a low anchor to just above initial pressure.
  const pMin = Math.max(100, 0.05 * maxPressurePsia);
  const grid = new Set();
  const step = (maxPressurePsia - pMin) / (n - 1);
  for (let i = 0; i < n; i++) grid.add(pMin + i * step);

  if (isGas) {
    const rows = [...grid].sort((a, b) => a - b).map((p) => {
      const z = zFactor(p, temperatureF, gasSg);
      return {
        pressure_psia: Math.round(p),
        z_factor: Number(z.toFixed(4)),
        bg_rb_mscf: Number((bgAt(p, temperatureF, z) * 1000).toFixed(4)),
        gas_viscosity_cp: Number(muGas(p, temperatureF, gasSg, z).toFixed(5)),
      };
    });
    return { ok: true, rows, pb: null, derivedGor: null };
  }

  if (!Number.isFinite(apiGravity) || apiGravity <= 0) {
    return { ok: false, error: 'Set the oil API gravity on this tab first.' };
  }

  // Solution GOR: explicit wins; otherwise derive it from the case bubble
  // point (Rs at Pb, uncapped). One of the two must exist.
  const fluidBase = {
    api: apiGravity,
    gasGravity: gasSg,
    temp: temperatureF,
    rsb: 0,
    salinity: 0,
    pb: null,
    correlations: { pb_rs_bo: 'standing', viscosity: 'beggs_robinson' },
  };
  let rsb = Number.isFinite(gorScfStb) && gorScfStb > 0 ? gorScfStb : null;
  let derivedGor = null;
  if (rsb == null) {
    if (!Number.isFinite(bubblePointPsia) || bubblePointPsia <= 0) {
      return {
        ok: false,
        error: 'Provide a solution GOR, or set a bubble point on the case so the GOR can be derived from it.',
      };
    }
    rsb = rsAt(bubblePointPsia, fluidBase);
    derivedGor = rsb;
  }
  if (!Number.isFinite(rsb) || rsb <= 0) {
    return { ok: false, error: 'Could not derive a positive solution GOR from these inputs.' };
  }

  const fluid = { ...fluidBase, rsb };
  const pb = Number.isFinite(bubblePointPsia) && bubblePointPsia > 0
    ? bubblePointPsia
    : solveBubblePoint(fluid);
  grid.add(pb); // exact node at the bubble point so the kink is captured

  const rows = [...grid]
    .filter((p) => p >= pMin - 1e-6 && p <= maxPressurePsia + 1e-6)
    .sort((a, b) => a - b)
    .map((p) => {
      const r = computePvtRow(p, fluid, pb);
      return {
        pressure_psia: Math.round(p),
        bo_rb_stb: r.Bo,
        rs_scf_stb: r.Rs,
        oil_viscosity_cp: r.mu_o,
        z_factor: r.Z,
        bg_rb_mscf: Number((r.Bg * 1000).toFixed(4)),
        gas_viscosity_cp: r.mu_g,
      };
    });

  return { ok: true, rows, pb, derivedGor };
}
