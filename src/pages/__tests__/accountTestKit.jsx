// TEST-ONLY kit for the account and billing theme tests (design-system
// rollout batch 1E). Not a test file itself (no .test. in the name).
//
// makeSupabase(tables, fns) returns a stand-in Supabase client: every
// from(table) query chain resolves to { data: tables[table] }, single() and
// maybeSingle() to its first row, functions.invoke(name) to fns[name], rpc
// to a success status, and the realtime channel is inert. Nothing reaches a
// network or a database.
import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '@/contexts/SupabaseAuthContext';

export function makeSupabase(tables = {}, fns = {}) {
  const query = (table) => {
    const rows = tables[table] ?? [];
    const result = { data: rows, error: null };
    const first = { data: Array.isArray(rows) ? (rows[0] ?? null) : rows, error: null };
    const q = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') return (res, rej) => Promise.resolve(result).then(res, rej);
        if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(first);
        return () => q;
      },
    });
    return q;
  };
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    from: jest.fn(query),
    rpc: jest.fn().mockResolvedValue({ data: { status: 'success' }, error: null }),
    functions: { invoke: jest.fn((name) => Promise.resolve({ data: fns[name] ?? null, error: null })) },
    channel: jest.fn(() => channel),
    removeChannel: jest.fn(),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    },
  };
}

export const TEST_USER = {
  id: 'u1',
  email: 'admin@example.com',
  user_metadata: { full_name: 'Test Admin', organization_name: 'Test Org' },
};

/** Mount a page under a signed-in AuthContext at `path` (route pattern `pattern`). */
export function renderAccountPage(Page, { path = '/', pattern = '*', auth = {} } = {}) {
  const value = {
    user: TEST_USER,
    organization: { id: 'o1', name: 'Test Org' },
    isSuperAdmin: false,
    loading: false,
    ...auth,
  };
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={pattern} element={<Page />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}
