// src/pages/apps/reservoir-balance/lib/api.js
//
// Reservoir Balance — API helper
// ===============================
//
// Phase 2 deliverable. Thin layer between React components and Supabase.
// All database reads/writes and Edge Function invocations for the Reservoir
// Balance app go through here.
//
// Return convention: matches Supabase JS client.
//   { data, error } where:
//     - data is the result on success, null on failure
//     - error is null on success, an Error-like object on failure
//
// Authorization: All calls go through the Supabase client which carries the
// user's JWT; RLS enforces ownership. The helper itself does no auth checks.
//
// Pattern: matches the data flow used by EPE in this Suite.

import { supabase } from '@/lib/customSupabaseClient';

// =============================================================================
// CASE CRUD (rb_cases)
// =============================================================================

/**
 * List all non-archived cases for the current user.
 * RLS filters to user_id = auth.uid().
 */
export async function listCases() {
  const { data, error } = await supabase
    .from('rb_cases')
    .select('*')
    .is('archived_at', null)
    .order('updated_at', { ascending: false });
  return { data, error };
}

/**
 * Get one case by id. Returns null data (no error) if not found.
 */
export async function getCase(caseId) {
  const { data, error } = await supabase
    .from('rb_cases')
    .select('*')
    .eq('id', caseId)
    .maybeSingle();
  return { data, error };
}

/**
 * Get one case with its production data joined.
 * Useful for the case detail page initial load.
 */
export async function getCaseWithProductionData(caseId) {
  const { data: caseData, error: caseErr } = await getCase(caseId);
  if (caseErr || !caseData) return { data: null, error: caseErr };
  const { data: prodData, error: prodErr } = await listProductionData(caseId);
  if (prodErr) return { data: null, error: prodErr };
  return {
    data: { ...caseData, production_data: prodData ?? [] },
    error: null,
  };
}

/**
 * Create a new case. Caller must supply: name, fluid_system (oil/gas), and the
 * initial conditions (initial_pressure_psia, reservoir_temperature_f,
 * initial_water_saturation). Other fields are optional.
 *
 * Returns the inserted row including its generated id.
 */
export async function createCase(input) {
  const { data, error } = await supabase
    .from('rb_cases')
    .insert(input)
    .select()
    .single();
  return { data, error };
}

/**
 * Update fields on an existing case.
 */
export async function updateCase(caseId, patch) {
  const { data, error } = await supabase
    .from('rb_cases')
    .update(patch)
    .eq('id', caseId)
    .select()
    .single();
  return { data, error };
}

/**
 * Soft-delete: set archived_at. Case stays in the database for recovery.
 */
export async function archiveCase(caseId) {
  return updateCase(caseId, { archived_at: new Date().toISOString() });
}

/**
 * Hard-delete: removes the case and all dependent rows (CASCADE).
 * Use with confirmation in the UI.
 */
export async function deleteCase(caseId) {
  const { error } = await supabase
    .from('rb_cases')
    .delete()
    .eq('id', caseId);
  return { data: error ? null : { id: caseId }, error };
}

// =============================================================================
// PRODUCTION DATA (rb_production_data)
// =============================================================================

/**
 * List all production data rows for a case, in time order.
 */
export async function listProductionData(caseId) {
  const { data, error } = await supabase
    .from('rb_production_data')
    .select('*')
    .eq('case_id', caseId)
    .order('timestep_index', { ascending: true });
  return { data, error };
}

/**
 * Atomic replace: delete all existing rows for the case, then insert the new
 * batch. Used after CSV upload or bulk paste.
 *
 * Note: Supabase doesn't have a single-call atomic replace. We do delete +
 * insert in sequence; if insert fails after delete succeeds, the user loses
 * their old data. For Phase 2 this is acceptable; future enhancement could use
 * a Postgres function (RPC) for true atomicity.
 *
 * rows must have shape:
 *   { timestep_index, pressure_psia, cum_oil_stb?, cum_gas_scf?, ... }
 * case_id is added to each row automatically.
 */
export async function replaceProductionData(caseId, rows) {
  // Step 1: delete existing rows
  const { error: delErr } = await supabase
    .from('rb_production_data')
    .delete()
    .eq('case_id', caseId);
  if (delErr) return { data: null, error: delErr };

  // Step 2: insert new rows with case_id stamped
  if (!rows || rows.length === 0) {
    return { data: [], error: null };
  }
  const stamped = rows.map((row) => ({ ...row, case_id: caseId }));
  const { data, error } = await supabase
    .from('rb_production_data')
    .insert(stamped)
    .select();
  return { data, error };
}

/**
 * Upsert a single production data row (by case_id + timestep_index).
 */
export async function upsertProductionRow(caseId, row) {
  const stamped = { ...row, case_id: caseId };
  const { data, error } = await supabase
    .from('rb_production_data')
    .upsert(stamped, { onConflict: 'case_id,timestep_index' })
    .select()
    .single();
  return { data, error };
}

// =============================================================================
// RUN CONFIGS (rb_run_configs)
// =============================================================================

/**
 * List all run configs for a case (in update order, most recent first).
 */
export async function listRunConfigs(caseId) {
  const { data, error } = await supabase
    .from('rb_run_configs')
    .select('*')
    .eq('case_id', caseId)
    .order('updated_at', { ascending: false });
  return { data, error };
}

/**
 * Get one run config.
 */
export async function getRunConfig(configId) {
  const { data, error } = await supabase
    .from('rb_run_configs')
    .select('*')
    .eq('id', configId)
    .maybeSingle();
  return { data, error };
}

/**
 * Create a new run config. Required field: case_id.
 * Schema defaults handle name, pvt_correlations, etc. if not provided.
 */
export async function createRunConfig(caseId, input = {}) {
  const payload = {
    case_id: caseId,
    formation_compressibility_psi: input.formation_compressibility_psi ?? 6e-6,
    water_compressibility_psi: input.water_compressibility_psi ?? 3e-6,
    ...input,
  };
  const { data, error } = await supabase
    .from('rb_run_configs')
    .insert(payload)
    .select()
    .single();
  return { data, error };
}

/**
 * Update an existing run config.
 */
export async function updateRunConfig(configId, patch) {
  const { data, error } = await supabase
    .from('rb_run_configs')
    .update(patch)
    .eq('id', configId)
    .select()
    .single();
  return { data, error };
}

/**
 * Delete a run config.
 */
export async function deleteRunConfig(configId) {
  const { error } = await supabase
    .from('rb_run_configs')
    .delete()
    .eq('id', configId);
  return { data: error ? null : { id: configId }, error };
}

// =============================================================================
// RUNS (rb_runs)
// =============================================================================

/**
 * List all runs for a case.
 */
export async function listRuns(caseId) {
  const { data, error } = await supabase
    .from('rb_runs')
    .select('*')
    .eq('case_id', caseId)
    .order('started_at', { ascending: false });
  return { data, error };
}

/**
 * Get one run with its result joined.
 */
export async function getRunWithResult(runId) {
  const { data, error } = await supabase
    .from('rb_runs')
    .select('*, rb_results(*)')
    .eq('id', runId)
    .maybeSingle();
  return { data, error };
}

// =============================================================================
// RESULTS (rb_results)
// =============================================================================

/**
 * Get one result by run_id (run_id is unique on rb_results).
 */
export async function getResultByRunId(runId) {
  const { data, error } = await supabase
    .from('rb_results')
    .select('*')
    .eq('run_id', runId)
    .maybeSingle();
  return { data, error };
}

// =============================================================================
// EDGE FUNCTION: calculate-mbal
// =============================================================================

/**
 * Invoke the calculate-mbal Edge Function to run a material balance.
 *
 * Returns:
 *   On success: { data: { run_id, result_id, duration_ms, summary }, error: null }
 *   On failure: { data: null, error: { message, detail?, run_id? } }
 *
 * The Edge Function handles all the engine work; this is just the invocation.
 *
 * IMPORTANT: supabase.functions.invoke() wraps non-2xx responses in a
 * FunctionsHttpError whose .message is generic ("Edge Function returned a
 * non-2xx status code"). The actual error body is hidden in error.context
 * (a Response object). We extract it to surface engine-specific error
 * details ("Initial timestep must have zero cumulative production", etc.)
 * to the UI.
 */
export async function runMBAL(runConfigId) {
  if (!runConfigId) {
    return {
      data: null,
      error: { message: 'Missing run_config_id' },
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke('calculate-mbal', {
      body: { run_config_id: runConfigId },
    });

    if (error) {
      // Edge Function returned non-2xx — extract the response body for real detail
      let detail = null;
      let serverError = null;
      let runId = null;
      try {
        if (error.context && typeof error.context.json === 'function') {
          const body = await error.context.json();
          serverError = body?.error ?? null;
          detail = body?.detail ?? null;
          runId = body?.run_id ?? null;
        } else if (error.context && typeof error.context.text === 'function') {
          detail = await error.context.text();
        }
      } catch {
        // Body wasn't JSON or already consumed — fall back to message
      }
      return {
        data: null,
        error: {
          message: serverError || error.message || 'Edge Function error',
          detail,
          run_id: runId,
        },
      };
    }
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: {
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

// =============================================================================
// EDGE FUNCTION: generate-pvt-preview  (Phase 3)
// =============================================================================

/**
 * Invoke the generate-pvt-preview Edge Function for PVT preview rows.
 *
 * STATELESS — no DB writes. Use freely to refresh the preview as the user
 * tunes parameters.
 *
 * Inputs match the engine's PvtPreviewInputs type. Minimum required:
 *   { fluid_system: 'oil' | 'gas' | 'oil_with_gas_cap',
 *     reservoir_temperature_f: number }
 *
 * Returns:
 *   On success: { data: { rows: [...], metadata: {...}, warnings: [...] }, error: null }
 *   On failure: { data: null, error: { message, detail? } }
 *
 * Common callers: PvtRock.jsx when user clicks "Recalculate PVT Table".
 */
export async function getPvtPreview(inputs) {
  if (!inputs || typeof inputs !== 'object') {
    return {
      data: null,
      error: { message: 'inputs must be an object' },
    };
  }
  if (!inputs.fluid_system || !inputs.reservoir_temperature_f) {
    return {
      data: null,
      error: {
        message:
          'Missing required field: fluid_system and reservoir_temperature_f are both required',
      },
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke(
      'generate-pvt-preview',
      { body: inputs },
    );

    if (error) {
      let detail = null;
      let serverError = null;
      try {
        if (error.context && typeof error.context.json === 'function') {
          const body = await error.context.json();
          serverError = body?.error ?? null;
          detail = body?.detail ?? null;
        }
      } catch {
        // ignore
      }
      return {
        data: null,
        error: {
          message: serverError || error.message || 'Edge Function error',
          detail,
        },
      };
    }
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: {
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

// =============================================================================
// CASE DEFAULT CONFIG (Phase 3)
// =============================================================================
//
// A "case default config" is the rb_run_configs row with is_scenario=false
// that holds the user's preferred PVT, aquifer, and solver settings for a
// case. When the user clicks "Run MBAL", we read from this default to populate
// the actual run config. Saved scenarios (is_scenario=true) live alongside it.
//
// If no default exists for a case, the first save creates one.
// If multiple non-scenario rows exist (legacy data), the most recent wins.

/**
 * Load the case-default run config (the most recent is_scenario=false row).
 * Returns null data (no error) if no default exists yet for this case.
 */
export async function getCaseDefaultConfig(caseId) {
  if (!caseId) {
    return { data: null, error: { message: 'Missing caseId' } };
  }
  const { data, error } = await supabase
    .from('rb_run_configs')
    .select('*')
    .eq('case_id', caseId)
    .eq('is_scenario', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data, error };
}

/**
 * Upsert the case-default run config.
 *
 * Behavior:
 *   - If a default config exists for this case: UPDATE it with the patch
 *   - If none exists: INSERT a new default config with the supplied fields
 *
 * Fields the patch may include (all optional):
 *   - oil_gravity_api, gas_specific_gravity, water_salinity_ppm
 *   - formation_compressibility_psi, water_compressibility_psi
 *   - pvt_source, pvt_correlations, pvt_lab_table
 *   - aquifer_model, aquifer_params, aquifer_history_match
 *   - gas_cap_ratio_m, solver_method, excluded_timesteps
 *
 * NOT atomic — read-then-write. Acceptable for single-user editing.
 */
export async function upsertCaseDefaultConfig(caseId, patch) {
  if (!caseId) {
    return { data: null, error: { message: 'Missing caseId' } };
  }
  if (!patch || typeof patch !== 'object') {
    return { data: null, error: { message: 'patch must be an object' } };
  }

  // Step 1: find the current default (if any)
  const { data: existing, error: readErr } = await getCaseDefaultConfig(caseId);
  if (readErr) return { data: null, error: readErr };

  if (existing) {
    // Update path
    return updateRunConfig(existing.id, patch);
  }

  // Insert path — stamp case_id + is_scenario=false + name
  const payload = {
    case_id: caseId,
    is_scenario: false,
    name: 'Default Config',
    ...patch,
  };
  const { data, error } = await supabase
    .from('rb_run_configs')
    .insert(payload)
    .select()
    .single();
  return { data, error };
}

/**
 * Convenience: PVT-only patch builder for upsertCaseDefaultConfig.
 *
 * Takes user-friendly PvtRock state and produces the rb_run_configs patch shape.
 *
 * Example:
 *   await savePvtConfig(caseId, {
 *     oil_gravity_api: 35,
 *     gas_specific_gravity: 0.75,
 *     correlations: { pb_rs_bo: 'standing', oil_viscosity: 'beggs_robinson' }
 *   });
 */
export async function savePvtConfig(caseId, pvtFields) {
  if (!pvtFields || typeof pvtFields !== 'object') {
    return { data: null, error: { message: 'pvtFields must be an object' } };
  }

  const patch = {
    pvt_source: pvtFields.pvt_source ?? 'correlated',
  };
  if (pvtFields.oil_gravity_api !== undefined) {
    patch.oil_gravity_api = pvtFields.oil_gravity_api;
  }
  if (pvtFields.gas_specific_gravity !== undefined) {
    patch.gas_specific_gravity = pvtFields.gas_specific_gravity;
  }
  if (pvtFields.water_salinity_ppm !== undefined) {
    patch.water_salinity_ppm = pvtFields.water_salinity_ppm;
  }
  if (pvtFields.correlations !== undefined) {
    patch.pvt_correlations = pvtFields.correlations;
  }
  if (pvtFields.pvt_lab_table !== undefined) {
    patch.pvt_lab_table = pvtFields.pvt_lab_table;
  }
  if (pvtFields.formation_compressibility_psi !== undefined) {
    patch.formation_compressibility_psi =
      pvtFields.formation_compressibility_psi;
  }
  if (pvtFields.water_compressibility_psi !== undefined) {
    patch.water_compressibility_psi = pvtFields.water_compressibility_psi;
  }

  return upsertCaseDefaultConfig(caseId, patch);
}

// =============================================================================
// CONVENIENCE: end-to-end "create case → seed data → run MBAL"
// =============================================================================

/**
 * Convenience flow for the Phase 2 smoke test:
 *   1. Create case
 *   2. Insert production data
 *   3. Create default run config
 *   4. Invoke calculate-mbal
 *   5. Return { case, runConfig, run, result }
 *
 * Used by the smoke test and potentially by a future "quick run" UI flow.
 * Stops at the first error and returns what it has so far.
 */
export async function createCaseAndRun({
  caseInput,
  productionRows,
  runConfigInput = {},
}) {
  // 1. Create case
  const { data: caseData, error: caseErr } = await createCase(caseInput);
  if (caseErr) return { data: null, error: caseErr, stage: 'create_case' };

  // 2. Insert production data
  const { error: prodErr } = await replaceProductionData(
    caseData.id,
    productionRows,
  );
  if (prodErr) {
    return {
      data: { case: caseData },
      error: prodErr,
      stage: 'production_data',
    };
  }

  // 3. Create run config
  const { data: configData, error: configErr } = await createRunConfig(
    caseData.id,
    runConfigInput,
  );
  if (configErr) {
    return {
      data: { case: caseData },
      error: configErr,
      stage: 'create_run_config',
    };
  }

  // 4. Run MBAL
  const { data: mbalResp, error: mbalErr } = await runMBAL(configData.id);
  if (mbalErr) {
    return {
      data: { case: caseData, runConfig: configData },
      error: mbalErr,
      stage: 'run_mbal',
    };
  }

  // 5. Fetch the result row
  const { data: result, error: resultErr } = await getResultByRunId(
    mbalResp.run_id,
  );

  return {
    data: {
      case: caseData,
      runConfig: configData,
      run: { id: mbalResp.run_id, duration_ms: mbalResp.duration_ms },
      result,
      summary: mbalResp.summary,
    },
    error: resultErr,
    stage: resultErr ? 'fetch_result' : null,
  };
}
