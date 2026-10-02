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
} from "../_shared/mbal-engine.ts";
import { buildEngineInputs, buildResultColumns } from "../_shared/mbal-run-mapping.ts";

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
  // Build MBALInputs from loaded rows (the mapping lives in
  // _shared/mbal-run-mapping.ts, shared with the /dev harness and the report's
  // completeness test)
  // ──────────────────────────────────────────────────────────────────────────
  const inputs: MBALInputs = buildEngineInputs(rbCase, runConfig, prodData);

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
  // Insert results. buildResultColumns builds the scalar columns and the
  // plot_data jsonb (per-timestep series for every plot and for the report).
  // ──────────────────────────────────────────────────────────────────────────
  const { data: resultRow, error: resultErr } = await supabaseUser
    .from("rb_results")
    .insert({
      run_id: runRow.id,
      case_id: rbCase.id,
      ...buildResultColumns(engineResult, inputs, historyMatch),
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
