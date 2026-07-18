// supabase/functions/calculate-mbal/index.ts
//
// Reservoir Balance — calculate-mbal Edge Function
// =================================================
//
// Phase 2 deliverable. Wraps the validated math engine from
// _shared/mbal-engine.ts and bridges frontend ↔ database.
//
// Request:
//   POST /functions/v1/calculate-mbal
//   Body: { run_config_id: string,
//           mode?: 'regression' | 'history_match',       // MB5, default regression
//           history_match?: { fit_parameters?, initial_guesses?, bounds?,
//                             max_iterations? } }         // MB5 LM options
//   Auth: Bearer <user-jwt>  (RLS handles authorization)
//
// Behavior:
//   1. Authenticate request (Supabase auth from JWT)
//   2. Load rb_run_configs row by id (RLS enforces user ownership)
//   3. Load parent rb_cases row (initial conditions, fluid system, etc.)
//   4. Load rb_production_data rows for the case
//   5. Construct MBALInputs from loaded rows
//   6. Call computeMaterialBalance(inputs) — pure compute
//   7. Insert rb_runs row with status='completed' and timing
//   8. Insert rb_results row with scalar results + plot data JSONB
//   9. Return { run_id, result } to caller
//
// Error handling:
//   - On engine throw: insert rb_runs with status='failed', return 422
//   - On DB error: return 500
//   - On auth error: return 401
//   - On invalid body: return 400
//
// Pattern: mirrors EPE's calculate Edge Functions in this Suite.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  computeMaterialBalance,
  runHistoryMatch,
  type HistoryMatchOptions,
  type HistoryMatchParameterKey,
  type HistoryMatchResult,
  type MBALInputs,
  type ProductionDataPoint,
  type PerTimestepResult,
  type FluidSystem,
  type AquiferModel,
  type SolverMethod,
} from "../_shared/mbal-engine.ts";

// ─────────────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Parse body
  // ──────────────────────────────────────────────────────────────────────────
  let body: {
    run_config_id?: string;
    // MB5: mode 'history_match' runs the inverse-MBE LM parameter fit
    // instead of (in addition to) the plain regression. Default 'regression'.
    mode?: string;
    history_match?: {
      fit_parameters?: string[];
      initial_guesses?: Record<string, number>;
      bounds?: Record<string, [number, number]>;
      max_iterations?: number;
    };
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!body.run_config_id || typeof body.run_config_id !== "string") {
    return jsonResponse(
      { error: "Missing or invalid run_config_id" },
      400,
    );
  }

  const mode = body.mode ?? "regression";
  if (mode !== "regression" && mode !== "history_match") {
    return jsonResponse(
      { error: `Invalid mode "${mode}" (expected "regression" or "history_match")` },
      400,
    );
  }

  // Sanitize history-match options. max_iterations is capped at 60 to stay
  // well inside the Edge Function CPU budget (a 30-iteration match on the
  // benchmark datasets runs in ~0.5 s).
  let hmOptions: HistoryMatchOptions = {};
  if (mode === "history_match" && body.history_match) {
    const hm = body.history_match;
    hmOptions = {
      fit_parameters: Array.isArray(hm.fit_parameters)
        ? (hm.fit_parameters.filter((k) => typeof k === "string") as HistoryMatchParameterKey[])
        : undefined,
      initial_guesses: hm.initial_guesses && typeof hm.initial_guesses === "object"
        ? (hm.initial_guesses as HistoryMatchOptions["initial_guesses"])
        : undefined,
      bounds: hm.bounds && typeof hm.bounds === "object"
        ? (hm.bounds as HistoryMatchOptions["bounds"])
        : undefined,
      max_iterations: typeof hm.max_iterations === "number"
        ? Math.min(Math.max(1, Math.floor(hm.max_iterations)), 60)
        : undefined,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Auth: get user from JWT
  //
  // IMPORTANT (lesson from 2026-05-14): auth.getUser() with NO arguments looks
  // at the client's internal session, which doesn't exist in Edge Function
  // context — it throws "Auth session missing!". Must pass the token explicitly.
  // ──────────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token || token === authHeader) {
    return jsonResponse(
      { error: 'Authorization header must be in form "Bearer <jwt>"' },
      401,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Plain client for JWT validation
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const { data: userData, error: userErr } =
    await supabaseAuth.auth.getUser(token);
  if (userErr || !userData?.user) {
    return jsonResponse(
      {
        error: "Unauthorized",
        detail: userErr?.message ?? "JWT validation returned no user",
      },
      401,
    );
  }

  // Separate client scoped to the calling user for DB I/O — RLS applies
  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Load run_config (RLS will return null if not owned by caller)
  // ──────────────────────────────────────────────────────────────────────────
  const { data: runConfig, error: configErr } = await supabaseUser
    .from("rb_run_configs")
    .select("*")
    .eq("id", body.run_config_id)
    .maybeSingle();

  if (configErr) {
    return jsonResponse(
      { error: "Failed to load run_config", detail: configErr.message },
      500,
    );
  }
  if (!runConfig) {
    return jsonResponse(
      { error: "Run config not found or not accessible" },
      404,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Load parent case
  // ──────────────────────────────────────────────────────────────────────────
  const { data: rbCase, error: caseErr } = await supabaseUser
    .from("rb_cases")
    .select("*")
    .eq("id", runConfig.case_id)
    .maybeSingle();

  if (caseErr || !rbCase) {
    return jsonResponse(
      { error: "Failed to load case", detail: caseErr?.message },
      caseErr ? 500 : 404,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Load production data
  // ──────────────────────────────────────────────────────────────────────────
  const { data: prodData, error: prodErr } = await supabaseUser
    .from("rb_production_data")
    .select("*")
    .eq("case_id", runConfig.case_id)
    .order("timestep_index", { ascending: true });

  if (prodErr) {
    return jsonResponse(
      { error: "Failed to load production data", detail: prodErr.message },
      500,
    );
  }
  if (!prodData || prodData.length < 2) {
    return jsonResponse(
      {
        error: "Insufficient production data",
        detail: `Need ≥2 timesteps, got ${prodData?.length ?? 0}`,
      },
      422,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Create rb_runs record (status='running')
  // ──────────────────────────────────────────────────────────────────────────
  const startedAt = new Date();
  const { data: runRow, error: runInsertErr } = await supabaseUser
    .from("rb_runs")
    .insert({
      case_id: rbCase.id,
      run_config_id: runConfig.id,
      status: "running",
      started_at: startedAt.toISOString(),
      // 'history_match' requires migration 20260718235500 (run_type check).
      run_type: mode === "history_match" ? "history_match" : "single",
      engine_version: "1.0.0-phase1",
    })
    .select()
    .single();

  if (runInsertErr || !runRow) {
    return jsonResponse(
      { error: "Failed to create run record", detail: runInsertErr?.message },
      500,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Build MBALInputs from loaded rows
  // ──────────────────────────────────────────────────────────────────────────
  const production_data: ProductionDataPoint[] = prodData.map((row: any) => ({
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

  const inputs: MBALInputs = {
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
    pvt_correlations: runConfig.pvt_correlations,
    // Capsule 4C chunk (b): standalone PVT lab table. Optional; engine falls
    // back to correlations when absent. The column is added to rb_run_configs
    // via migration: 2026-05-15_rb_run_configs_pvt_lab_table.sql
    pvt_lab_table: runConfig.pvt_lab_table ?? undefined,
    solver_method: runConfig.solver_method as SolverMethod,
    excluded_timesteps: runConfig.excluded_timesteps ?? [],
    production_data,
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Run engine
  // ──────────────────────────────────────────────────────────────────────────
  let engineResult;
  let historyMatch: HistoryMatchResult | null = null;
  try {
    if (mode === "history_match") {
      historyMatch = runHistoryMatch(inputs, hmOptions);
      // Diagnostics (drive indices, We series, plots) come from the forward
      // run at the matched parameters.
      engineResult = historyMatch.forward;
    } else {
      engineResult = computeMaterialBalance(inputs);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;

    // Mark run as failed
    await supabaseUser
      .from("rb_runs")
      .update({
        status: "failed",
        error_message: message,
        error_detail: { stack: stack ?? null },
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt.getTime(),
      })
      .eq("id", runRow.id);

    return jsonResponse(
      { error: "Engine error", detail: message, run_id: runRow.id },
      422,
    );
  }

  const completedAt = new Date();
  const duration_ms = completedAt.getTime() - startedAt.getTime();

  // ──────────────────────────────────────────────────────────────────────────
  // Insert results
  // ──────────────────────────────────────────────────────────────────────────
  // Build plot_data JSONB from per_timestep arrays.
  //
  // Capsule 3B (2026-05-15) adds: cum_oil_stb, cum_gas_scf, cum_water_stb,
  // point_in_fit. These give the Plots tab everything it needs to render
  // Havlena-Odeh, p/z, Campbell, Cole, and drive-index plots without any
  // additional engine math.
  // ──────────────────────────────────────────────────────────────────────────
  const excludedSet = new Set<number>(runConfig.excluded_timesteps ?? []);
  const plot_data = {
    timestep_index: engineResult.per_timestep.map((p: PerTimestepResult) => p.timestep_index),
    pressure: engineResult.per_timestep.map((p: PerTimestepResult) => p.pressure_psia),
    delta_p: engineResult.per_timestep.map((p: PerTimestepResult) => p.delta_p_psi),
    F: engineResult.per_timestep.map((p: PerTimestepResult) => p.F_rb),
    Et: engineResult.per_timestep.map((p: PerTimestepResult) => p.Et_rb),
    Eo: engineResult.per_timestep.map((p: PerTimestepResult) => p.Eo_rb_stb ?? null),
    Eg_rb_mscf: engineResult.per_timestep.map((p: PerTimestepResult) => p.Eg_rb_mscf ?? null),
    // MB6: oil-side gas-cap expansion term (RB/STB, Pletcher Eq. 23) and Bw,
    // consumed by the Contacts tab (GOC descent = m·N·Eg_oil; OWC rise nets
    // Wp·Bw out of We). Null on results stored before MB6.
    Eg_oil: engineResult.per_timestep.map((p: PerTimestepResult) => p.Eg_rb_stb ?? null),
    Bw: engineResult.per_timestep.map((p: PerTimestepResult) => p.bw_rb_stb ?? null),
    Efw: engineResult.per_timestep.map((p: PerTimestepResult) => p.Efw_rb),
    We: engineResult.per_timestep.map((p: PerTimestepResult) => p.We_rb ?? null),
    p_over_z: engineResult.per_timestep.map((p: PerTimestepResult) => p.p_over_z ?? null),
    ddi: engineResult.per_timestep.map((p: PerTimestepResult) => p.ddi ?? null),
    gdi: engineResult.per_timestep.map((p: PerTimestepResult) => p.gdi ?? null),
    wdi: engineResult.per_timestep.map((p: PerTimestepResult) => p.wdi ?? null),
    cdi: engineResult.per_timestep.map((p: PerTimestepResult) => p.cdi ?? null),
    sdi: engineResult.per_timestep.map((p: PerTimestepResult) => p.sdi ?? null),
    drive_index_sum: engineResult.per_timestep.map((p: PerTimestepResult) => p.drive_index_sum ?? null),
    // Production cumulatives from input (passed through for plotting)
    cum_oil_stb: production_data.map((p: ProductionDataPoint) => p.cum_oil_stb ?? null),
    cum_gas_scf: production_data.map((p: ProductionDataPoint) => p.cum_gas_scf ?? null),
    cum_water_stb: production_data.map((p: ProductionDataPoint) => p.cum_water_stb ?? null),
    // Which points were used in the least-squares regression. true = in fit,
    // false = excluded (either user-excluded or the always-excluded initial timestep 0).
    point_in_fit: engineResult.per_timestep.map((p: PerTimestepResult) =>
      p.timestep_index > 0 && !excludedSet.has(p.timestep_index)
    ),
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

  const { data: resultRow, error: resultErr } = await supabaseUser
    .from("rb_results")
    .insert({
      run_id: runRow.id,
      case_id: rbCase.id,
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
      final_sdi: engineResult.final_sdi ?? null,
      final_cdi: engineResult.final_cdi ?? null,
      final_drive_index_sum: engineResult.final_drive_index_sum ?? null,
      drive_mechanism: engineResult.drive_mechanism,
      aquifer_strength: engineResult.aquifer_strength,
      warnings: historyMatch
        ? [...historyMatch.warnings, ...engineResult.warnings]
        : engineResult.warnings,
      plot_data,
    })
    .select()
    .single();

  if (resultErr || !resultRow) {
    // Engine succeeded but DB write failed — mark run failed for visibility
    await supabaseUser
      .from("rb_runs")
      .update({
        status: "failed",
        error_message: "Engine succeeded but result write failed",
        error_detail: { db_error: resultErr?.message },
        completed_at: completedAt.toISOString(),
        duration_ms,
      })
      .eq("id", runRow.id);

    return jsonResponse(
      {
        error: "Failed to persist results",
        detail: resultErr?.message,
        run_id: runRow.id,
      },
      500,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Mark run as completed
  // ──────────────────────────────────────────────────────────────────────────
  await supabaseUser
    .from("rb_runs")
    .update({
      status: "completed",
      completed_at: completedAt.toISOString(),
      duration_ms,
    })
    .eq("id", runRow.id);

  // ──────────────────────────────────────────────────────────────────────────
  // Success response
  // ──────────────────────────────────────────────────────────────────────────
  return jsonResponse(
    {
      run_id: runRow.id,
      result_id: resultRow.id,
      duration_ms,
      summary: {
        estimated_ooip_stb: historyMatch
          ? historyMatch.matched_ooip_stb
          : engineResult.estimated_ooip_stb,
        estimated_ogip_scf: historyMatch
          ? historyMatch.matched_ogip_scf
          : engineResult.estimated_ogip_scf,
        r_squared: engineResult.r_squared,
        drive_mechanism: engineResult.drive_mechanism,
        aquifer_strength: engineResult.aquifer_strength,
        final_drive_index_sum: engineResult.final_drive_index_sum,
        warnings: historyMatch
          ? [...historyMatch.warnings, ...engineResult.warnings]
          : engineResult.warnings,
        history_match: historyMatch
          ? {
              matched_parameters: historyMatch.matched_parameters,
              rms_error_psi: historyMatch.rms_error_psi,
              iterations: historyMatch.iterations,
              converged: historyMatch.converged,
            }
          : null,
      },
    },
    200,
  );
});
