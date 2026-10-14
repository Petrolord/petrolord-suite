import {
  setProjectScope, getProjectScope, scopeToProject, rowInScope, stampProject, insertWithProject,
  beginProjectScopeLoad, endProjectScopeLoad, whenProjectScopeReady, isProjectColumnError, currentProjectId, _resetProjectScope,
} from '@/lib/projects/projectScope';
import { groupProjectsByClient, projectLabel, INTERNAL_LABEL } from '@/lib/projects/projectGrouping';

const q = () => {
  const calls = [];
  const api = { eq: (...a) => { calls.push(['eq', ...a]); return api; }, or: (...a) => { calls.push(['or', ...a]); return api; }, calls };
  return api;
};

afterEach(() => _resetProjectScope());

describe('projectScope', () => {
  test('off by default: no filter, no stamp (the Suite before P1)', () => {
    const b = q();
    expect(scopeToProject(b)).toBe(b);
    expect(b.calls).toEqual([]);
    const row = { name: 'W' };
    expect(stampProject(row)).toBe(row);
    expect(currentProjectId()).toBeNull();
  });

  test('a client project filters by equality', () => {
    setProjectScope({ enabled: true, projectId: 'p1', defaultProjectId: 'd' });
    const b = q();
    scopeToProject(b);
    expect(b.calls).toEqual([['eq', 'suite_project_id', 'p1']]);
    expect(rowInScope({ suite_project_id: 'p1' })).toBe(true);
    expect(rowInScope({ suite_project_id: null })).toBe(false);
  });

  test('the default project also keeps rows with no project', () => {
    setProjectScope({ enabled: true, projectId: 'd', defaultProjectId: 'd' });
    const b = q();
    scopeToProject(b);
    expect(b.calls).toEqual([['or', 'suite_project_id.eq.d,suite_project_id.is.null']]);
    expect(rowInScope({ suite_project_id: null })).toBe(true);
  });

  test('allProjects skips the filter (backups)', () => {
    setProjectScope({ enabled: true, projectId: 'p1', defaultProjectId: 'd' });
    const b = q();
    scopeToProject(b, { allProjects: true });
    expect(b.calls).toEqual([]);
  });

  test('stamp adds the current project and keeps an explicit one', () => {
    setProjectScope({ enabled: true, projectId: 'p1', defaultProjectId: 'd' });
    expect(stampProject({ a: 1 })).toEqual({ a: 1, suite_project_id: 'p1' });
    expect(stampProject({ a: 1, suite_project_id: 'p2' })).toEqual({ a: 1, suite_project_id: 'p2' });
    expect(stampProject([{ a: 1 }, { a: 2 }])).toEqual([{ a: 1, suite_project_id: 'p1' }, { a: 2, suite_project_id: 'p1' }]);
  });

  test('a database without the column: retried without it, projects switch off', async () => {
    setProjectScope({ enabled: true, projectId: 'p1', defaultProjectId: 'd' });
    const seen = [];
    const run = async (p) => {
      seen.push(p);
      return 'suite_project_id' in p ? { error: { code: 'PGRST204', message: "Could not find the 'suite_project_id' column of 'geo_wells' in the schema cache" } } : { data: p, error: null };
    };
    const res = await insertWithProject({ name: 'W' }, run);
    expect(res.data).toEqual({ name: 'W' });
    expect(seen).toHaveLength(2);
    expect(getProjectScope().enabled).toBe(false);
  });

  test('other insert errors are not retried', async () => {
    setProjectScope({ enabled: true, projectId: 'p1', defaultProjectId: 'd' });
    const run = jest.fn(async () => ({ error: { code: '42501', message: 'new row violates row-level security policy' } }));
    const res = await insertWithProject({ name: 'W' }, run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(res.error.code).toBe('42501');
    expect(isProjectColumnError(res.error)).toBe(false);
  });

  test('reads wait for the provider, then go', async () => {
    beginProjectScopeLoad();
    let done = false;
    const p = whenProjectScopeReady().then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    endProjectScopeLoad();
    await p;
    expect(done).toBe(true);
  });
});

describe('projectGrouping', () => {
  const clients = [{ id: 'c2', name: 'Zeta Oil' }, { id: 'c1', name: 'Breeze Energy', colour: '#112233' }];
  const projects = [
    { id: 'd', name: 'Default', is_default: true, client_id: null },
    { id: 'i', name: 'Admin', client_id: null },
    { id: 'b2', name: 'OML 42', client_id: 'c1' },
    { id: 'b1', name: 'Field A', client_id: 'c1' },
    { id: 'z1', name: 'Survey', client_id: 'c2' },
  ];
  test('clients by name with their projects, then Internal with Default first', () => {
    const g = groupProjectsByClient(projects, clients);
    expect(g.map((x) => x.label)).toEqual(['Breeze Energy', 'Zeta Oil', INTERNAL_LABEL]);
    expect(g[0].projects.map((p) => p.name)).toEqual(['Field A', 'OML 42']);
    expect(g[2].projects.map((p) => p.name)).toEqual(['Default', 'Admin']);
  });
  test('label is "Client › Project", or the project alone', () => {
    expect(projectLabel(projects[2], clients[1])).toBe('Breeze Energy › OML 42');
    expect(projectLabel(projects[0], null)).toBe('Default');
    expect(projectLabel(null, null)).toBe('');
  });
});
