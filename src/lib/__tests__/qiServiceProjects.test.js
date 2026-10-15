/**
 * The worker job and file lists follow the current Suite project (QI
 * upgrade, migration 20261015160000), and fall back to the unscoped list
 * while the database has no project column. Negative control: with projects
 * off the query carries no project filter.
 */
const mockCalls = [];
let mockMissing = false;
jest.mock('@/lib/customSupabaseClient', () => {
  const builder = (table) => {
    const q = { table, filters: [] };
    const self = {
      select: () => self, neq: () => self, order: () => self, limit: () => self,
      eq: (c, v) => { q.filters.push(`eq ${c} ${v}`); return self; },
      or: (f) => { q.filters.push(`or ${f}`); return self; },
      then: (res) => {
        mockCalls.push(q);
        const scoped = q.filters.some((f) => f.includes('suite_project_id'));
        if (scoped && mockMissing) return res({ data: null, error: { code: '42703', message: 'column qi_jobs.suite_project_id does not exist' } });
        return res({ data: [{ id: `${table}-1`, scoped }], error: null });
      },
    };
    return self;
  };
  return { supabase: { from: (t) => builder(t) } };
});

/* eslint-disable import/first */
import { listJobs, listDatasets } from '../qiService';
import { setProjectScope, _resetProjectScope } from '../projects/projectScope';
/* eslint-enable import/first */

beforeEach(() => { mockCalls.length = 0; mockMissing = false; _resetProjectScope(); });

test('in a project the lists carry the project filter (the default also takes rows with none)', async () => {
  setProjectScope({ enabled: true, projectId: 'P2', defaultProjectId: 'P1' });
  expect((await listJobs())[0].scoped).toBe(true);
  expect(mockCalls[0].filters).toEqual(['eq suite_project_id P2']);
  setProjectScope({ enabled: true, projectId: 'P1', defaultProjectId: 'P1' });
  await listDatasets();
  expect(mockCalls[1].filters).toEqual(['or suite_project_id.eq.P1,suite_project_id.is.null']);
  expect((await listDatasets({ allProjects: true }))[0].scoped).toBe(false);
});

test('before the migration the list is read unscoped once more', async () => {
  setProjectScope({ enabled: true, projectId: 'P2', defaultProjectId: 'P1' });
  mockMissing = true;
  const rows = await listJobs();
  expect(rows[0].scoped).toBe(false);
  expect(mockCalls).toHaveLength(2);
});

test('negative control: projects off, no filter', async () => {
  await listJobs();
  expect(mockCalls[0].filters).toEqual([]);
});
