/**
 * AS11 — the hub's read path.
 *
 * An app whose migration is not applied must read as UNAVAILABLE, never
 * as an app with nothing in it; any other failure is an ERROR the page
 * names; every parent query is scoped to the organization; and the hub
 * has exactly one fetcher per app.
 */
import fs from 'fs';
import path from 'path';

const mockCalls = [];
let mockFailures = {};

jest.mock('@/lib/customSupabaseClient', () => {
  const builder = (table) => {
    const q = { table, filters: [] };
    const result = () => {
      const f = mockFailures[table];
      if (f) return Promise.resolve({ data: null, error: f });
      return Promise.resolve({ data: [{ id: `${table}-1`, org_id: 'org-a' }], error: null });
    };
    const chain = {
      select: () => chain,
      eq: (col, val) => { q.filters.push(['eq', col, val]); return chain; },
      in: (col, vals) => { q.filters.push(['in', col, vals]); return chain; },
      then: (res, rej) => { mockCalls.push(q); return result().then(res, rej); },
    };
    return chain;
  };
  return { supabase: { from: (t) => builder(t) } };
});

jest.mock('@/contexts/SupabaseAuthContext', () => ({ useAuth: () => ({ organization: { id: 'org-a' } }) }));

// eslint-disable-next-line import/first
import { APP_STATE, HUB_FETCHER_KEYS, fetchApp } from '../useAssuranceHub';
// eslint-disable-next-line import/first
import { HUB_APP_KEYS } from '@/lib/assuranceHub';

beforeEach(() => { mockCalls.length = 0; mockFailures = {}; });

describe('useAssuranceHub fetchers', () => {
  it('has exactly one fetcher per hub app', () => {
    expect([...HUB_FETCHER_KEYS].sort()).toEqual([...HUB_APP_KEYS].sort());
  });

  it.each(HUB_APP_KEYS)('%s reads OK and scopes every parent query to the org', async (key) => {
    const res = await fetchApp(key, 'org-a');
    expect(res.state).toBe(APP_STATE.OK);
    const parents = mockCalls.filter((c) => c.filters.some(([k]) => k === 'eq'));
    expect(parents.length).toBeGreaterThan(0);
    parents.forEach((c) => expect(c.filters).toContainEqual(['eq', 'org_id', 'org-a']));
    // A child query is always bounded by parent ids, never unscoped.
    mockCalls.forEach((c) => expect(c.filters.length).toBeGreaterThan(0));
  });

  it.each([['42P01'], ['PGRST205'], ['PGRST200'], ['42703']])(
    'a missing table or column (%s) is UNAVAILABLE, with no rows',
    async (code) => {
      mockFailures.moc_records = { code, message: 'relation does not exist' };
      const res = await fetchApp('moc', 'org-a');
      expect(res.state).toBe(APP_STATE.UNAVAILABLE);
      expect(res.rows).toBeNull();
    },
  );

  it('a missing child table also makes the app UNAVAILABLE', async () => {
    mockFailures.audit_responses = { code: '42P01', message: 'relation does not exist' };
    const res = await fetchApp('audits', 'org-a');
    expect(res.state).toBe(APP_STATE.UNAVAILABLE);
  });

  it('any other failure is an ERROR with its message, and no rows', async () => {
    mockFailures.documents = { code: '42501', message: 'permission denied' };
    const res = await fetchApp('documents', 'org-a');
    expect(res).toEqual({ state: APP_STATE.ERROR, rows: null, message: 'permission denied' });
  });

  it('one app failing does not affect another', async () => {
    mockFailures.documents = { code: '42501', message: 'permission denied' };
    const res = await fetchApp('risk', 'org-a');
    expect(res.state).toBe(APP_STATE.OK);
  });

  it('never writes', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'useAssuranceHub.js'), 'utf8');
    expect(src).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
  });

  it('does not poll', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'useAssuranceHub.js'), 'utf8');
    expect(src).not.toMatch(/setInterval/);
  });
});
