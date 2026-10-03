// Reads Petroleum Economics Studio runs and publishes each as the
// `epe-unit-value-1` contract (./epeUnitValue.js). The receiving app
// (Risked Reserves Valuation) calls these with its Supabase client; the
// reads are plain selects on the runs the signed-in user may read (their
// own, and those shared with their organisation), so no policy changes.

import { buildEpeUnitValue } from './epeUnitValue';

const CONFIG_COLUMNS = 'id, config_name, oil_price_usd_bbl, gas_price_usd_mscf, condensate_price_usd_bbl';

async function assemble(supabase, runs, build) {
  if (!runs.length) return [];
  const { data: results, error: rErr } = await supabase.from('epe_results').select('run_id, kpis, created_at').in('run_id', runs.map((r) => r.id));
  if (rErr) throw new Error(`Could not read Petroleum Economics Studio results: ${rErr.message}`);
  const configIds = [...new Set(runs.map((r) => r.run_config_id).filter(Boolean))];
  let configs = [];
  if (configIds.length) {
    const { data, error } = await supabase.from('epe_run_configs').select(CONFIG_COLUMNS).in('id', configIds);
    // the configuration names the price deck; a run still sends without it
    if (!error) configs = data || [];
  }
  return runs.map((run) => {
    const res = (results || []).find((x) => x.run_id === run.id) || null;
    const config = configs.find((c) => c.id === run.run_config_id) || null;
    const sent = buildEpeUnitValue({ run, caseName: run.epe_cases?.case_name ?? null, kpis: res?.kpis ?? null, config, resultsAt: res?.created_at ?? null, build });
    return { runId: run.id, runName: run.run_name ?? null, caseName: run.epe_cases?.case_name ?? null, runSavedAt: run.created_at ?? null, ...sent };
  });
}

/**
 * Every run the user may read, newest first, each as a contract or a refusal.
 * @returns {Promise<Array<{runId: string, runName: ?string, caseName: ?string, runSavedAt: ?string, ok: boolean, contract?: object, reason?: string}>>}
 */
export async function listEpeUnitValues(supabase, { limit = 100, build = null } = {}) {
  const { data, error } = await supabase.from('epe_runs').select('id, run_name, case_id, user_id, run_config_id, created_at, epe_cases(case_name)').order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(`Could not read your Petroleum Economics Studio runs: ${error.message}`);
  return assemble(supabase, data || [], build);
}

/** One run by id: its contract or refusal, or null when the run is gone (or no longer readable). */
export async function getEpeUnitValue(supabase, runId, { build = null } = {}) {
  const { data, error } = await supabase.from('epe_runs').select('id, run_name, case_id, user_id, run_config_id, created_at, epe_cases(case_name)').eq('id', runId).limit(1);
  if (error) throw new Error(`Could not read the Petroleum Economics Studio run: ${error.message}`);
  if (!data || !data.length) return null;
  return (await assemble(supabase, data, build))[0];
}
