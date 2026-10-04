// The Material Balance rows the Recovery Factor e2e seeds into the harness
// (e2e/fixtures/recovery-factor/mbal-rows.json): a run of the canonical
// engine on the published Ahmed Example 11-3 case, so the mbal-1 record the
// harness reads by id is a real one. UPDATE_REPORT_GOLDENS=1 rewrites it.
import fs from 'fs';
import path from 'path';
import { DEV_USER } from '@/dev/InMemorySupabase';
import { buildMbalRecord } from '@/lib/mbalCaseSource';
import { runSample, SAMPLE_CASE_IDS } from '@/pages/apps/reservoir-balance/lib/__tests__/mbalTestKit';

const FILE = path.join(process.cwd(), 'e2e', 'fixtures', 'recovery-factor', 'mbal-rows.json');

function rows() {
  const a = runSample(SAMPLE_CASE_IDS.ahmed);
  const id = SAMPLE_CASE_IDS.ahmed;
  const own = (r) => ({ ...r, user_id: DEV_USER.id });
  return {
    rb_cases: [own({ ...a.db.rb_cases.find((c) => c.id === id), archived_at: null })],
    rb_runs: [own(a.run)],
    rb_results: [a.result],
    rb_run_configs: [a.runConfig],
    expected: { value: a.result.estimated_ooip_stb, record: buildMbalRecord({ caseData: a.db.rb_cases.find((c) => c.id === id), result: a.result, run: a.run, runConfig: a.runConfig }).record.in_place },
  };
}

it('the Material Balance rows of the e2e carry a completed run with an OOIP', () => {
  const r = JSON.parse(JSON.stringify(rows()));
  expect(r.rb_runs[0].status).toBe('completed');
  expect(r.expected.value).toBeGreaterThan(0);
  if (process.env.UPDATE_REPORT_GOLDENS === '1' || !fs.existsSync(FILE)) fs.writeFileSync(FILE, `${JSON.stringify(r)}\n`);
  expect(JSON.parse(fs.readFileSync(FILE, 'utf8'))).toEqual(r);
});
