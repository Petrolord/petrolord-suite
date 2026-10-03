/**
 * PL5: a case as the release before MBAL-U1 stored it still opens, and the
 * app says the truth about its run (e2e/fixtures/material-balance/saved/).
 *
 * That release kept no study record, its run config carried no snapshot of
 * what the run was made on, and its result held fewer series. Opening it
 * must not throw; its result is shown as an earlier run (the app cannot
 * tell what it was made on); the report waits; and one new run makes the
 * case whole, with nothing typed again.
 */
import fs from 'fs';
import path from 'path';
import { assessRunStaleness, buildRunConfigInput, staleRunMessage } from '../lib/runStaleness';
import { readStudy } from '../lib/studyMeta';
import { buildMbalSeries } from '../lib/mbalSeries';
import { buildPlotModels } from '../lib/plotModels';
import { OILFIELD_UNITS } from '../lib/mbalUnits';
import { runEngineOnStore } from '../harness/engineStandIn';
import { buildMbalPdf } from '@/utils/mbalReportExport';
import { readPdf, flat, chartLogo } from '@/lib/reportKit/testKit';

const saved = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../../e2e/fixtures/material-balance/saved/case-2026-09-before-u1.json'), 'utf8'));
const open = (db) => {
  const caseData = { ...db.rb_cases[0], production_data: [...db.rb_production_data].sort((a, b) => a.timestep_index - b.timestep_index) };
  const defaultCfg = db.rb_run_configs.find((c) => !c.is_scenario);
  const run = [...db.rb_runs].reverse().find((r) => r.status === 'completed');
  const runConfig = db.rb_run_configs.find((c) => c.id === run.run_config_id);
  const result = db.rb_results.find((r) => r.run_id === run.id);
  return { caseData, defaultCfg, run, runConfig, result, study: readStudy(defaultCfg) };
};

test('the fixture is the earlier shape: no study record, no run snapshot, none of the added series', () => {
  const s = open(saved);
  expect(s.defaultCfg.pvt_correlations.study).toBeUndefined();
  expect(s.runConfig.pvt_correlations.run_snapshot).toBeUndefined();
  for (const key of ['Bo', 'Rs', 'observation_date', 'validation_tier', 'engine_version']) expect(s.result.plot_data).not.toHaveProperty(key);
  expect(s.result.estimated_ooip_stb / 1e6).toBeCloseTo(291.31, 2);
});

test('it opens: an empty study record, the series and every plot model, with no throw', () => {
  const s = open(saved);
  expect(s.study.identification.analyst).toBe('');
  expect(s.study.datum.datum_depth_ft).toBeNull();
  const series = buildMbalSeries({ result: s.result, runConfig: s.runConfig, caseData: s.caseData });
  expect(series.rows).toHaveLength(13);
  const models = buildPlotModels({ series, result: s.result, units: OILFIELD_UNITS });
  expect(models.map((m) => m.id)).toEqual(['regression', 'campbell', 'cole', 'pz', 'pressure', 'influx', 'drive']);
  expect(models.find((m) => m.id === 'regression').applies).toBe(true);
});

test('its result is an earlier run, the reason is said, and the report waits', async () => {
  const s = open(saved);
  const staleness = assessRunStaleness(s);
  expect(staleness.stale).toBe(true);
  expect(staleRunMessage(staleness)).toMatch(/made before the studio kept a record/);
  expect(() => buildMbalPdf({ ...s, staleness, organizationName: 'Lordsway Energy', build: 'test' }, { logo: chartLogo(), generatedAt: new Date('2026-10-02T09:00:00Z') })).toThrow(/earlier run|Run the analysis again/i);
});

test('one new run makes it whole: the same oil in place, a current result and a report', () => {
  const db = JSON.parse(JSON.stringify(saved));
  const before = open(db);
  db.rb_run_configs.push({ id: 'cfg-rerun', case_id: before.caseData.id, is_scenario: true, name: 'Run', ...buildRunConfigInput(before.caseData, before.defaultCfg) });
  const { error } = runEngineOnStore(db, { run_config_id: 'cfg-rerun' });
  expect(error).toBeNull();
  const s = open(db);
  expect(s.run.run_config_id).toBe('cfg-rerun');
  const staleness = assessRunStaleness(s);
  expect(staleness.stale).toBe(false);
  expect(s.result.estimated_ooip_stb).toBeCloseTo(before.result.estimated_ooip_stb, 3);
  expect(s.result.plot_data.Bo).toHaveLength(13);
  const { doc, pages } = buildMbalPdf({ ...s, staleness, organizationName: 'Lordsway Energy', build: 'test' }, { logo: chartLogo(), generatedAt: new Date('2026-10-02T09:00:00Z') });
  expect(pages).toBeGreaterThan(3);
  expect(flat(readPdf(doc).text)).toMatch(/Saved in September \(Ahmed 11-3\)/);
});
