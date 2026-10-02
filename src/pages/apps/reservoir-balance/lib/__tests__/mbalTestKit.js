// Test side of the Material Balance report: the three published sample
// cases, run by the canonical engine through the edge function's own row
// mapping, as the studio context would hold them after a run.
import { seedSampleStore, SAMPLE_CASE_IDS } from '../../harness/sampleCases';
import { runEngineOnStore } from '../../harness/engineStandIn';
import { buildRunConfigInput, assessRunStaleness } from '../runStaleness';
import { readStudy } from '../studyMeta';
import { createMbalUnits, MBAL_METRIC_VIEW } from '../mbalUnits';

export { SAMPLE_CASE_IDS };
export const AT = new Date('2026-10-02T09:00:00Z');
export const NOW = '2026-10-02T08:00:00.000Z';
export const METRIC_UNITS = createMbalUnits(MBAL_METRIC_VIEW);

let seq = 0;

/**
 * Make a run of one sample case the way the Run tab does: a scenario config
 * built by buildRunConfigInput, then the engine.
 * @param {string} caseId one of SAMPLE_CASE_IDS
 * @param {{mode?: string, historyMatch?: object, patchDefault?: object, patchCase?: object,
 *   mutateStore?: function(object): void}} [o]
 * @returns the studio state: { db, caseData, defaultCfg, runConfig, run, result, staleness, study }
 */
export function runSample(caseId, { mode = 'regression', historyMatch = null, patchDefault = null, patchCase = null, mutateStore = null } = {}) {
  const db = seedSampleStore(NOW);
  if (patchCase) db.rb_cases = db.rb_cases.map((c) => (c.id === caseId ? { ...c, ...patchCase } : c));
  if (patchDefault) db.rb_run_configs = db.rb_run_configs.map((c) => (c.case_id === caseId && !c.is_scenario ? { ...c, ...patchDefault } : c));
  if (mutateStore) mutateStore(db);
  const rbCase = db.rb_cases.find((c) => c.id === caseId);
  const production_data = db.rb_production_data.filter((r) => r.case_id === caseId).sort((a, b) => a.timestep_index - b.timestep_index);
  const caseData = { ...rbCase, production_data };
  const defaultCfg = db.rb_run_configs.find((c) => c.case_id === caseId && !c.is_scenario);
  const runConfig = { id: `rc-${++seq}`, case_id: caseId, is_scenario: true, name: 'Run', created_at: NOW, updated_at: NOW, ...buildRunConfigInput(caseData, defaultCfg) };
  db.rb_run_configs = [...db.rb_run_configs, runConfig];
  const { data, error } = runEngineOnStore(db, { run_config_id: runConfig.id, mode, history_match: historyMatch || undefined }, { now: () => NOW });
  if (error) throw new Error(`engine stand-in: ${error.message}`);
  const run = db.rb_runs.find((r) => r.id === data.run_id);
  const result = db.rb_results.find((r) => r.run_id === data.run_id);
  const staleness = assessRunStaleness({ caseData, defaultCfg, run, runConfig, result });
  return { db, caseData, defaultCfg, runConfig, run, result, staleness, study: readStudy(defaultCfg) };
}

/** The arguments the Report tab hands to the report builder. */
export const reportArgs = (state, over = {}) => ({
  caseData: state.caseData,
  result: state.result,
  runConfig: state.runConfig,
  run: state.run,
  study: state.study,
  staleness: state.staleness,
  organizationName: 'Lordsway Energy',
  build: 'Petrolord Suite test',
  ...over,
});
