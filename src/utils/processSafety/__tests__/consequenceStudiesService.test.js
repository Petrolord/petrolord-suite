/**
 * ps_consequence_studies persistence (PS2): organization scoped, author kept.
 */
const mockCalls = [];
let mockResult = { data: [], error: null };
const mockQ = new Proxy({}, {
  get(_t, prop) {
    if (prop === 'then') return (res) => res(mockResult);
    return (...args) => { mockCalls.push([prop, ...args]); return mockQ; };
  },
});
jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: (...a) => { mockCalls.push(['from', ...a]); return mockQ; } } }));

import { createConsequenceStudiesService, NO_ORG_MESSAGE } from '@/utils/processSafety/consequenceStudiesService';

beforeEach(() => { mockCalls.length = 0; mockResult = { data: [], error: null }; });

describe('ps_consequence_studies service', () => {
  it('lists only the current organization, newest first', async () => {
    mockResult = { data: [{ id: 'a', name: 'A', created_at: 't0', updated_at: 't1', created_by: 'u1' }], error: null };
    const list = await createConsequenceStudiesService(() => 'org-1').list();
    expect(mockCalls).toContainEqual(['from', 'ps_consequence_studies']);
    expect(mockCalls).toContainEqual(['eq', 'organization_id', 'org-1']);
    expect(mockCalls).toContainEqual(['order', 'updated_at', { ascending: false }]);
    expect(list).toEqual([{ id: 'a', name: 'A', createdAt: 't0', updatedAt: 't1', createdBy: 'u1' }]);
  });

  it('saves under the organization and never sends the author, which the database owns', async () => {
    mockResult = { error: null };
    await createConsequenceStudiesService(() => 'org-1').save('s1', { name: '  Unit 3  ', study: {} });
    const upsert = mockCalls.find((c) => c[0] === 'upsert');
    expect(upsert[1]).toMatchObject({ id: 's1', organization_id: 'org-1', name: 'Unit 3' });
    expect(upsert[1]).not.toHaveProperty('created_by');
    expect(upsert[1]).not.toHaveProperty('created_at');
    expect(upsert[1]).toHaveProperty('schema_version', 1);
  });

  it('refuses to save without an organization', async () => {
    await expect(createConsequenceStudiesService(() => null).save('s1', { name: 'x' })).rejects.toThrow(NO_ORG_MESSAGE);
  });

  it('reports a delete the policy refused instead of claiming success', async () => {
    mockResult = { data: [], error: null };
    await expect(createConsequenceStudiesService(() => 'org-1').remove('s1'))
      .rejects.toThrow(/Only the author of a study or an organization owner or admin/);
    mockResult = { data: [{ id: 's1' }], error: null };
    await expect(createConsequenceStudiesService(() => 'org-1').remove('s1')).resolves.toEqual({ success: true });
  });

  it('opens a stamped row through the state versioning and returns its payload', async () => {
    mockResult = { data: { id: 's1', payload: { name: 'A', study: { scenarios: [] } }, schema_version: 1 }, error: null };
    const p = await createConsequenceStudiesService(() => 'org-1').load('s1');
    expect(p).toEqual({ name: 'A', study: { scenarios: [] } });
    expect(mockCalls).toContainEqual(['eq', 'organization_id', 'org-1']);
  });
});

describe('ps_consequence_studies identity', () => {
  it('has its own table, state kind and migration, apart from the LOPA studies', async () => {
    const svc = await import('@/utils/processSafety/consequenceStudiesService');
    expect(svc.CONSEQUENCE_STUDIES_TABLE).toBe('ps_consequence_studies');
    expect(svc.CONSEQUENCE_STUDY_KIND).toBe('ps-consequence-study');
    expect(svc.CONSEQUENCE_STUDIES_MIGRATION).toBe('20260919234000_ps2_consequence_studies');
  });
});
