// PP3a: root candidates for the export dialog aggregate across the saved
// project tables and never throw on a broken table.

const canned = {};
const mockFrom = jest.fn((table) => {
  const result = canned[table] || { data: [], error: null };
  const chain = {
    select: () => chain,
    order: () => chain,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
});
jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: (...a) => mockFrom(...a) } }));

import { listRootCandidates, appLabel } from '@/lib/portability/rootsCatalog';
import { SAVED_PROJECT_TABLES } from '@/lib/portability/familiesCore';

beforeEach(() => {
  for (const k of Object.keys(canned)) delete canned[k];
  mockFrom.mockClear();
});

test('appLabel strips the convention prefix and suffix', () => {
  expect(appLabel('saved_well_test_projects')).toBe('well test');
  expect(appLabel('saved_choke_projects')).toBe('choke');
});

test('saved_project aggregates across every table, newest first, and tolerates a broken table', async () => {
  canned.saved_choke_projects = { data: [{ id: 'c1', project_name: 'Choke A', updated_at: '2026-09-01T00:00:00Z' }], error: null };
  canned.saved_well_test_projects = { data: [{ id: 'w1', project_name: 'WT B', updated_at: '2026-09-02T00:00:00Z' }], error: null };
  canned.saved_dca_projects = { data: null, error: { code: '42P01', message: 'relation does not exist' } };
  const items = await listRootCandidates('saved_project');
  expect(mockFrom).toHaveBeenCalledTimes(SAVED_PROJECT_TABLES.length);
  expect(items).toEqual([
    { id: 'w1', name: 'WT B', table: 'saved_well_test_projects', subtitle: 'well test' },
    { id: 'c1', name: 'Choke A', table: 'saved_choke_projects', subtitle: 'choke' },
  ]);
});

test('single-table kinds map their columns; errors yield an empty list', async () => {
  canned.po_fields = { data: [{ id: 'f1', name: 'Keta', organization_id: 'org' }], error: null };
  canned.epe_cases = { data: [{ id: 'e1', case_name: 'FDP', description: null }], error: null };
  canned.epe_assumption_sets = { data: [{ id: 'a1', name: 'Brent deck' }], error: null };
  canned.sim_cases = { data: null, error: { message: 'boom' } };
  expect(await listRootCandidates('po_field')).toEqual([{ id: 'f1', name: 'Keta', organization_id: 'org' }]);
  expect(await listRootCandidates('epe_case')).toEqual([{ id: 'e1', name: 'FDP', subtitle: 'economics case' }]);
  expect(await listRootCandidates('epe_assumption_set')).toEqual([{ id: 'a1', name: 'Brent deck', subtitle: 'assumption set' }]);
  expect(await listRootCandidates('sim_case')).toEqual([]);
  expect(await listRootCandidates('nope')).toEqual([]);
});

test('wp_site lists sites with a sharing subtitle; errors yield an empty list', async () => {
  canned.wp_sites = { data: [{ id: 's1', name: 'Keta pad', organization_id: null }, { id: 's2', name: null, organization_id: 'org' }], error: null };
  expect(await listRootCandidates('wp_site')).toEqual([
    { id: 's1', name: 'Keta pad', subtitle: 'private' },
    { id: 's2', name: 'Site s2', subtitle: 'shared with organization' },
  ]);
  canned.wp_sites = { data: null, error: { message: 'boom' } };
  expect(await listRootCandidates('wp_site')).toEqual([]);
});
