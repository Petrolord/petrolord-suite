/**
 * Case detail keeps its place (video programme, 2026-10-14): every data
 * reload (approve, lock, delete a run, an upload, an import) replaced the
 * page with a spinner, so the uncontrolled tabs remounted on Data Management
 * and a user approving a run in Run History was thrown back to the data.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const RUN = { id: 'r1', case_id: 'c1', user_id: 'u1', run_name: 'Sanction case', created_at: '2026-10-14T01:00:00Z', status: 'complete', locked: false, approved_at: null, run_config_id: 'cfg1' };
const DB = {
  epe_cases: { id: 'c1', user_id: 'u1', case_name: 'Ekene', organization_id: null },
  epe_production_volumes: [], epe_capex: [], epe_opex: [], epe_runs: [RUN], epe_results: [],
};
const calls = { update: 0 };
const makeQuery = (table) => {
  const q = {};
  const chain = () => q;
  ['select', 'eq', 'order', 'limit', 'insert', 'upsert', 'delete', 'in', 'gte', 'lte', 'not', 'is', 'or', 'neq'].forEach((m) => { q[m] = jest.fn(chain); });
  q.update = jest.fn(() => { calls.update += 1; return q; });
  const v = () => DB[table];
  q.single = jest.fn(() => new Promise((r) => setTimeout(r, 30)).then(() => ({ data: Array.isArray(v()) ? (v()[0] ?? null) : v(), error: null })));
  q.maybeSingle = q.single;
  // a real network round trip: the reload is visible to React between its start and end
  q.then = (resolve, reject) => new Promise((r) => setTimeout(r, 30)).then(() => ({ data: Array.isArray(v()) ? v() : (v() ? [v()] : []), error: null })).then(resolve, reject);
  return q;
};
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn((t) => makeQuery(t)),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    functions: { invoke: jest.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => {
  const user = { id: 'u1', email: 't@example.com' };
  return { useAuth: () => ({ user, session: null, loading: false }) };
});

// eslint-disable-next-line import/first
import EpeCaseDetail from '../EpeCaseDetail';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
});

const mount = (url = '/cases/c1') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/cases/:caseId" element={<EpeCaseDetail />} /></Routes>
  </MemoryRouter>,
);

test('approving a run keeps Run History open', async () => {
  mount();
  const runsTab = await screen.findByRole('tab', { name: 'Run History' });
  await userEvent.click(runsTab);
  expect(runsTab).toHaveAttribute('data-state', 'active');
  fireEvent.click(await screen.findByTitle('Approve this run'));
  await waitFor(() => expect(calls.update).toBe(1));
  // let the reload start and finish
  await new Promise((r) => setTimeout(r, 400));
  await screen.findByText('Sanction case');
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Run History' })).toHaveAttribute('data-state', 'active'));
  expect(screen.getByText('Sanction case')).toBeInTheDocument();
});

test('?tab=runs opens Run History', async () => {
  mount('/cases/c1?tab=runs');
  expect(await screen.findByRole('tab', { name: 'Run History' })).toHaveAttribute('data-state', 'active');
});
