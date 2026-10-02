// calculate-mbal without a server: the canonical engine run on an in-memory
// copy of the rb_* tables, through the edge function's own row mapping
// (supabase/functions/_shared/mbal-run-mapping.ts). Used by the /dev harness
// and by the report tests, so what they exercise is the mapping production
// runs.
import { computeMaterialBalance, runHistoryMatch } from '../../../../../packages/engines/engines/mbal/mbalEngine';
import { buildEngineInputs, buildResultColumns } from '../../../../../supabase/functions/_shared/mbal-run-mapping';

let seq = 0;
const newId = (p) => `${p}-${Date.now()}-${++seq}`;

/**
 * Run one config of the store and write the run and its result into it.
 * @param {object} db { rb_cases, rb_production_data, rb_run_configs, rb_runs, rb_results }
 * @param {{run_config_id: string, mode?: string, history_match?: object}} body
 * @param {{now?: function(): string}} [o]
 * @returns {{data: ?object, error: ?object}} as supabase.functions.invoke answers
 */
export function runEngineOnStore(db, body, { now = () => new Date().toISOString() } = {}) {
  const mode = body.mode ?? 'regression';
  const cfg = db.rb_run_configs.find((r) => r.id === body.run_config_id);
  if (!cfg) return { data: null, error: { message: 'Run config not found or not accessible' } };
  const rbCase = db.rb_cases.find((r) => r.id === cfg.case_id);
  const prod = db.rb_production_data.filter((r) => r.case_id === cfg.case_id).sort((a, b) => a.timestep_index - b.timestep_index);
  if (prod.length < 2) return { data: null, error: { message: 'Insufficient production data' } };
  const started = Date.now();
  const run = {
    id: newId('run'), case_id: rbCase.id, run_config_id: cfg.id, status: 'running', started_at: now(),
    run_type: mode === 'history_match' ? 'history_match' : 'single', engine_version: 'harness',
  };
  db.rb_runs = [...db.rb_runs, run];
  const inputs = buildEngineInputs(rbCase, cfg, prod);
  let r; let hm = null;
  try {
    if (mode === 'history_match') { hm = runHistoryMatch(inputs, body.history_match || {}); r = hm.forward; } else r = computeMaterialBalance(inputs);
  } catch (e) {
    db.rb_runs = db.rb_runs.map((x) => (x.id === run.id ? { ...x, status: 'failed', error_message: e.message } : x));
    return { data: null, error: { message: 'Engine error', context: { json: async () => ({ error: 'Engine error', detail: e.message }) } } };
  }
  const result = { id: newId('res'), run_id: run.id, case_id: rbCase.id, ...buildResultColumns(r, inputs, hm), created_at: now() };
  db.rb_results = [...db.rb_results, result];
  const duration = Date.now() - started;
  db.rb_runs = db.rb_runs.map((x) => (x.id === run.id ? { ...x, status: 'completed', completed_at: now(), duration_ms: duration } : x));
  return {
    data: {
      run_id: run.id, result_id: result.id, duration_ms: duration,
      summary: {
        estimated_ooip_stb: result.estimated_ooip_stb, estimated_ogip_scf: result.estimated_ogip_scf, r_squared: r.r_squared,
        drive_mechanism: r.drive_mechanism, aquifer_strength: r.aquifer_strength, final_drive_index_sum: r.final_drive_index_sum,
        warnings: result.warnings,
        history_match: hm ? { matched_parameters: hm.matched_parameters, rms_error_psi: hm.rms_error_psi, iterations: hm.iterations, converged: hm.converged } : null,
      },
    },
    error: null,
  };
}
