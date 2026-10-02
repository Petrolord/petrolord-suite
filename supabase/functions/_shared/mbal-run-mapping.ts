// Material Balance: the row mapping of calculate-mbal, as pure functions.
//
// One place builds (a) the object handed to the engine from the rb_* rows and
// (b) the rb_results row from the engine result. The edge function uses it,
// the /dev harness uses it in place of a hand copy, and the report's
// completeness test reads buildEngineInputs to know every engine input
// (reviewer lens RL1: a new engine input cannot ship unprinted).
//
// No I/O, no Supabase, no Deno API: plain data in, plain data out.
//
// Added in the Material Balance round of the app upgrade programme
// (MBAL-U1). plot_data gained four things a reviewer asks for and the
// result row never stored: the PVT the engine used at each timestep, the
// observation dates, the validation tier of the engine path, and the engine
// version. All live in the plot_data jsonb, so no migration is needed. A
// result stored by the function as deployed before this change simply lacks
// them, and the report says so.
import type {
  AquiferModel,
  FluidSystem,
  HistoryMatchResult,
  MBALInputs,
  MBALResult,
  PerTimestepResult,
  ProductionDataPoint,
} from "./mbal-engine.ts";

/** The correlation choices the engine reads out of rb_run_configs.pvt_correlations. */
export const PVT_CORRELATION_KEYS = [
  "pb_rs_bo",
  "oil_viscosity",
  "z_factor",
  "gas_viscosity",
  "water",
] as const;

/** rb_production_data columns the engine reads (injection is listed apart, below). */
export const PRODUCTION_ENGINE_COLUMNS = [
  "timestep_index",
  "pressure_psia",
  "observation_date",
  "cum_oil_stb",
  "cum_gas_scf",
  "cum_water_stb",
  "bo_rb_stb",
  "rs_scf_stb",
  "bg_rb_mscf",
  "bw_rb_stb",
  "z_factor",
  "observed_we_rb",
] as const;

/**
 * Columns that are passed to the engine and that the engine does not use:
 * cumulative water and gas injection are in the input type, and the
 * withdrawal term F has no injection term in this engine version.
 */
export const PRODUCTION_UNUSED_COLUMNS = ["cum_water_inj_stb", "cum_gas_inj_scf"] as const;

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export function buildProductionData(prodRows: Row[]): ProductionDataPoint[] {
  return prodRows.map((row: Row) => ({
    timestep_index: row.timestep_index,
    pressure_psia: row.pressure_psia,
    // MB5 bugfix (2026-07-18): observation_date was never mapped from the DB
    // rows, so Fetkovich/Carter-Tracy runs threw the missing-date engine
    // error even when the Data tab had uploaded dates.
    observation_date: row.observation_date ?? undefined,
    cum_oil_stb: row.cum_oil_stb ?? 0,
    cum_gas_scf: row.cum_gas_scf ?? 0,
    cum_water_stb: row.cum_water_stb ?? 0,
    cum_water_inj_stb: row.cum_water_inj_stb ?? 0,
    cum_gas_inj_scf: row.cum_gas_inj_scf ?? 0,
    bo_rb_stb: row.bo_rb_stb ?? undefined,
    rs_scf_stb: row.rs_scf_stb ?? undefined,
    bg_rb_mscf: row.bg_rb_mscf ?? undefined,
    bw_rb_stb: row.bw_rb_stb ?? undefined,
    z_factor: row.z_factor ?? undefined,
    observed_we_rb: row.observed_we_rb ?? undefined,
  }));
}

/**
 * The engine reads five named correlation choices. The jsonb column also
 * carries records the studio keeps beside them (where a generated PVT table
 * came from, the study identification, the snapshot of a run), and those
 * are not handed to the engine.
 */
export function pickCorrelations(raw: Row | null | undefined): Row {
  const out: Row = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of PVT_CORRELATION_KEYS) if (raw[key] != null) out[key] = raw[key];
  return out;
}

/** The object the engine is called with, from the case, the run config and the data rows. */
export function buildEngineInputs(rbCase: Row, runConfig: Row, prodRows: Row[]): MBALInputs {
  return {
    fluid_system: rbCase.fluid_system as FluidSystem,
    has_aquifer: rbCase.has_aquifer,
    has_gas_cap: rbCase.has_gas_cap,
    initial_pressure_psia: rbCase.initial_pressure_psia,
    reservoir_temperature_f: rbCase.reservoir_temperature_f,
    initial_water_saturation: rbCase.initial_water_saturation,
    bubble_point_psia: rbCase.bubble_point_psia ?? undefined,
    oil_gravity_api: runConfig.oil_gravity_api ?? undefined,
    gas_specific_gravity: runConfig.gas_specific_gravity ?? undefined,
    water_salinity_ppm: runConfig.water_salinity_ppm ?? undefined,
    formation_compressibility_psi: runConfig.formation_compressibility_psi,
    water_compressibility_psi: runConfig.water_compressibility_psi,
    aquifer_model: (runConfig.aquifer_model ?? "none") as AquiferModel,
    aquifer_params: runConfig.aquifer_params ?? undefined,
    gas_cap_ratio_m: runConfig.gas_cap_ratio_m ?? undefined,
    pvt_source: runConfig.pvt_source,
    // deno-lint-ignore no-explicit-any
    pvt_correlations: pickCorrelations(runConfig.pvt_correlations) as any,
    // Capsule 4C chunk (b): standalone PVT lab table. Optional; engine falls
    // back to correlations when absent.
    pvt_lab_table: runConfig.pvt_lab_table ?? undefined,
    // solver_method is deliberately NOT forwarded. The engine never branched on
    // it and now reports what it actually ran as solver_method_used (engines
    // #168); passing the stored value would only raise a mismatch warning on
    // cases the config's coarse gas/oil guess gets wrong. rb_run_configs keeps
    // the column as a record of intent.
    excluded_timesteps: runConfig.excluded_timesteps ?? [],
    production_data: buildProductionData(prodRows),
  };
}

/**
 * The plot_data jsonb of an rb_results row: the per-timestep series every
 * plot and the report read, with what the run was made on echoed beside
 * them.
 */
export function buildPlotData(
  engineResult: MBALResult,
  inputs: MBALInputs,
  historyMatch: HistoryMatchResult | null = null,
): Row {
  const steps = engineResult.per_timestep;
  const col = <T>(f: (p: PerTimestepResult) => T): T[] => steps.map(f);
  const production_data = inputs.production_data;
  const excludedSet = new Set<number>(inputs.excluded_timesteps ?? []);
  return {
    timestep_index: col((p) => p.timestep_index),
    pressure: col((p) => p.pressure_psia),
    delta_p: col((p) => p.delta_p_psi),
    F: col((p) => p.F_rb),
    Et: col((p) => p.Et_rb),
    Eo: col((p) => p.Eo_rb_stb ?? null),
    Eg_rb_mscf: col((p) => p.Eg_rb_mscf ?? null),
    // MB6: oil-side gas-cap expansion term (RB/STB, Pletcher Eq. 23) and Bw,
    // consumed by the Contacts tab (GOC descent = m·N·Eg_oil; OWC rise nets
    // Wp·Bw out of We). Null on results stored before MB6.
    Eg_oil: col((p) => p.Eg_rb_stb ?? null),
    Bw: col((p) => p.bw_rb_stb ?? null),
    Efw: col((p) => p.Efw_rb),
    We: col((p) => p.We_rb ?? null),
    p_over_z: col((p) => p.p_over_z ?? null),
    ddi: col((p) => p.ddi ?? null),
    gdi: col((p) => p.gdi ?? null),
    wdi: col((p) => p.wdi ?? null),
    // cdi is the rock and connate water expansion on BOTH fluid systems since
    // engines #167. `sdi` is a DEPRECATED MIRROR of it, written only so a front
    // end deployed before this function keeps rendering oil results; nothing in
    // this repo reads it any more. Safe to drop once no stale client remains.
    cdi: col((p) => (p as Row).cdi ?? null),
    sdi: col((p) => (p as Row).cdi ?? null),
    drive_index_sum: col((p) => p.drive_index_sum ?? null),
    // Production cumulatives from input (passed through for plotting)
    cum_oil_stb: production_data.map((p: ProductionDataPoint) => p.cum_oil_stb ?? null),
    cum_gas_scf: production_data.map((p: ProductionDataPoint) => p.cum_gas_scf ?? null),
    cum_water_stb: production_data.map((p: ProductionDataPoint) => p.cum_water_stb ?? null),
    // Which points were used in the least-squares regression. true = in fit,
    // false = excluded (either user-excluded or the always-excluded initial timestep 0).
    point_in_fit: col((p) => p.timestep_index > 0 && !excludedSet.has(p.timestep_index)),
    // Which regression actually ran, straight from the engine (engines #168).
    // Lives here rather than in a new rb_results column so no migration is
    // needed; the report prefers it over the run config's stored intent.
    solver_method_used: engineResult.solver_method_used ?? null,
    // ── MBAL-U1: what a reviewer needs and the row never stored ──
    // The PVT the engine used at each timestep, whatever its source (per-row
    // lab value, table interpolation or correlation).
    Bo: col((p) => p.bo_rb_stb ?? null),
    Rs: col((p) => p.rs_scf_stb ?? null),
    Bg_rb_mscf: col((p) => p.bg_rb_mscf ?? null),
    z: col((p) => p.z_factor ?? null),
    // The dates of the observations and the cumulative injection read in
    // (injection is echoed so the report can state that F does not use it).
    observation_date: production_data.map((p: ProductionDataPoint) => p.observation_date ?? null),
    cum_water_inj_stb: production_data.map((p: ProductionDataPoint) => p.cum_water_inj_stb ?? null),
    cum_gas_inj_scf: production_data.map((p: ProductionDataPoint) => p.cum_gas_inj_scf ?? null),
    // The validation tier of the engine path that ran, with its reference.
    // The result row has no column for it, so until now it reached the
    // studio only on a history match.
    validation_tier: engineResult.validation_tier ?? null,
    validation_reference: engineResult.validation_reference ?? null,
    validation_tolerance_pct: engineResult.validation_tolerance_pct ?? null,
    engine_version: engineResult.engine_version ?? null,
    // On a history match the headline in-place volume is the matched one,
    // while the drive indices and the regression line belong to the forward
    // run at the matched aquifer parameters. Its own in-place estimate is
    // kept so the two can be told apart.
    regression_ooip_stb: engineResult.estimated_ooip_stb ?? null,
    regression_ogip_scf: engineResult.estimated_ogip_scf ?? null,
    // MB5: history-match block (null on regression runs). Feeds the
    // pressure-match plot and the matched-parameter card in the studio.
    history_match: historyMatch
      ? {
          observed_pressure_psia: historyMatch.observed_pressure_psia,
          simulated_pressure_psia: historyMatch.simulated_pressure_psia,
          residual_psi: historyMatch.residual_psi,
          point_in_fit: historyMatch.point_in_fit,
          rms_error_psi: historyMatch.rms_error_psi,
          max_abs_error_psi: historyMatch.max_abs_error_psi,
          ssr_psi2: historyMatch.ssr_psi2,
          iterations: historyMatch.iterations,
          converged: historyMatch.converged,
          matched_parameters: historyMatch.matched_parameters,
          validation_tier: historyMatch.validation_tier,
          validation_reference: historyMatch.validation_reference ?? null,
          observation_date: production_data.map(
            (p: ProductionDataPoint) => p.observation_date ?? null,
          ),
        }
      : null,
  };
}

/** The columns of the rb_results row, without run_id and case_id. */
export function buildResultColumns(
  engineResult: MBALResult,
  inputs: MBALInputs,
  historyMatch: HistoryMatchResult | null = null,
): Row {
  return {
    // History match: headline in-place values are the MATCHED ones (the
    // forward regression estimates remain available inside plot_data).
    estimated_ooip_stb: historyMatch
      ? historyMatch.matched_ooip_stb ?? null
      : engineResult.estimated_ooip_stb ?? null,
    estimated_ogip_scf: historyMatch
      ? historyMatch.matched_ogip_scf ?? null
      : engineResult.estimated_ogip_scf ?? null,
    r_squared: engineResult.r_squared,
    regression_slope: engineResult.regression_slope,
    regression_intercept: engineResult.regression_intercept,
    n_data_points: engineResult.n_data_points,
    aquifer_owip_rb: engineResult.aquifer_owip_rb ?? null,
    aquifer_cumulative_we_rb: engineResult.aquifer_cumulative_we_rb ?? null,
    aquifer_fit_quality: engineResult.aquifer_fit_quality ?? null,
    final_ddi: engineResult.final_ddi ?? null,
    final_gdi: engineResult.final_gdi ?? null,
    final_wdi: engineResult.final_wdi ?? null,
    // Deprecated mirror, see plot_data above. The rb_results column stays
    // populated so older rows and this one read the same way.
    final_sdi: engineResult.final_cdi ?? null,
    final_cdi: engineResult.final_cdi ?? null,
    final_drive_index_sum: engineResult.final_drive_index_sum ?? null,
    drive_mechanism: engineResult.drive_mechanism,
    aquifer_strength: engineResult.aquifer_strength,
    warnings: historyMatch
      ? [...historyMatch.warnings, ...engineResult.warnings]
      : engineResult.warnings,
    plot_data: buildPlotData(engineResult, inputs, historyMatch),
  };
}
