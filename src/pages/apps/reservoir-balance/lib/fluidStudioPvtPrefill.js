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
  CORRELATION_RANGES,
  VISCOSITY_CORRELATION_LABELS,
} from '@/utils/fluidStudioCalculations';
import { MBAL_CORRELATION_LABELS } from './pvtSource';

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
 *   correlations (the PVT tab's selection: pb_rs_bo, oil_viscosity, z_factor),
 * }
 * Returns { ok: true, rows, pb, derivedGor, origin } or { ok: false, error }.
 * `origin` names every method the table was built with (H5): it is what the
 * report prints in place of "lab_table".
 */

// The Fluid Systems engine computes Z and gas viscosity one way only.
const Z_METHOD = { key: 'papay', label: 'Papay with Sutton pseudo-criticals' };
const GAS_VISCOSITY_METHOD = { key: 'lee_gonzalez_eakin', label: 'Lee-Gonzalez-Eakin' };

/**
 * Map the PVT tab's selection onto what the Fluid Systems engine can run,
 * and say where it could not follow the selection.
 */
export function resolvePrefillMethods(correlations, isGas) {
  const sel = correlations ?? {};
  const substitutions = [];
  const pbKey = CORRELATION_RANGES[sel.pb_rs_bo] ? sel.pb_rs_bo : 'standing';
  // Beal-Standing (a dead-oil baseline in the Material Balance engine) has
  // no live-oil equivalent in the Fluid Systems engine.
  const viscKey = VISCOSITY_CORRELATION_LABELS[sel.oil_viscosity] ? sel.oil_viscosity : 'beggs_robinson';
  if (!isGas && sel.oil_viscosity && sel.oil_viscosity !== viscKey) {
    substitutions.push(`Oil viscosity uses ${VISCOSITY_CORRELATION_LABELS[viscKey]}: the table builder has no ${MBAL_CORRELATION_LABELS[sel.oil_viscosity] ?? sel.oil_viscosity}.`);
  }
  if (sel.z_factor) {
    substitutions.push(`Z uses ${Z_METHOD.label}: the table builder does not run ${MBAL_CORRELATION_LABELS[sel.z_factor] ?? sel.z_factor}.`);
  }
  const methods = {
    ...(isGas ? {} : {
      pb_rs_bo: { key: pbKey, label: CORRELATION_RANGES[pbKey].label },
      oil_viscosity: { key: viscKey, label: VISCOSITY_CORRELATION_LABELS[viscKey] },
    }),
    z_factor: Z_METHOD,
    gas_viscosity: GAS_VISCOSITY_METHOD,
  };
  return { methods, substitutions, engineCorrelations: { pb_rs_bo: pbKey, viscosity: viscKey } };
}

const originOf = (resolved) => ({
  kind: 'correlation_prefill',
  engine: 'Fluid Systems Studio black-oil correlations',
  methods: resolved.methods,
  substitutions: resolved.substitutions,
  generated_at: new Date().toISOString(),
  edited: false,
});

export function buildPvtPrefillRows(opts) {
  const {
    fluidSystem, apiGravity, gasSg, temperatureF,
    bubblePointPsia, gorScfStb, maxPressurePsia,
    nPoints = DEFAULT_POINTS, correlations,
  } = opts ?? {};

  const isGas = fluidSystem === 'gas';
  const resolved = resolvePrefillMethods(correlations, isGas);
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
    return { ok: true, rows, pb: null, derivedGor: null, origin: originOf(resolved) };
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
    // H5: the PVT tab's selection, where the engine has it. This was fixed
    // at Standing and Beggs-Robinson whatever the tab had selected.
    correlations: resolved.engineCorrelations,
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

  return { ok: true, rows, pb, derivedGor, origin: originOf(resolved) };
}
