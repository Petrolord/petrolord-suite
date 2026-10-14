/**
 * A run says when the case data it priced changed after it ran
 * (epeRunInputs.js): the Results Viewer banner and the Run History badge,
 * mounted with Supabase mocked per table (the piaScreens.mount pattern).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const DB = { epe_run_configs: [], epe_runs: null, epe_results: null, epe_cases: { id: 'c1', user_id: 'u1', case_name: 'Ekene' }, epe_production_volumes: [], epe_capex: [], epe_opex: [] };

const makeQuery = (table) => {
  const q = {};
  const chain = () => q;
  ['select', 'eq', 'order', 'limit', 'insert', 'update', 'upsert', 'delete', 'in', 'gte', 'lte', 'not', 'is', 'or']
    .forEach((m) => { q[m] = jest.fn(chain); });
  const one = () => {
    const v = DB[table];
    if (table === 'epe_results' && !v) return { data: null, error: { message: 'no rows' } };
    return { data: Array.isArray(v) ? (v[0] ?? null) : v, error: null };
  };
  q.single = jest.fn(() => Promise.resolve(one()));
  q.maybeSingle = jest.fn(() => Promise.resolve(one()));
  q.then = (resolve, reject) => Promise.resolve({ data: Array.isArray(DB[table]) ? DB[table] : [], error: null }).then(resolve, reject);
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
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'tester@example.com' }, session: null, loading: false }),
}));
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  const React = require('react');
  const ResponsiveContainer = ({ children }) => React.cloneElement(children, { width: 800, height: 360 });
  return { ...actual, ResponsiveContainer };
});

// eslint-disable-next-line import/first
import EpeResultsViewer from '../EpeResultsViewer';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
});

const mountViewer = () => render(
  <MemoryRouter initialEntries={['/runs/r1']}>
    <Routes><Route path="/runs/:runId" element={<EpeResultsViewer />} /></Routes>
  </MemoryRouter>,
);

const P2 = { id: 'p1', file_name: 'ekene-production-2p.csv', created_at: '2026-10-13T10:00:00Z', scenario_label: '2P' };
const CX = { id: 'c1', file_name: 'ekene-capex.csv', created_at: '2026-10-13T10:00:01Z' };
const OX = { id: 'o1', file_name: 'ekene-opex.csv', created_at: '2026-10-13T10:00:02Z' };
const inputs = [
  { table: 'epe_production_volumes', id: 'p1', file_name: P2.file_name, created_at: P2.created_at, scenario_label: '2P' },
  { table: 'epe_capex', id: 'c1', file_name: CX.file_name, created_at: CX.created_at, scenario_label: null },
  { table: 'epe_opex', id: 'o1', file_name: OX.file_name, created_at: OX.created_at, scenario_label: null },
];

const setRun = () => {
  DB.epe_runs = { id: 'r1', case_id: 'c1', user_id: 'u1', run_name: 'Ekene base', run_config_id: 'cfg1', status: 'complete', created_at: '2026-10-13T11:00:00Z', parameters: { source: 'EpeRunConsole', inputs }, epe_cases: { case_name: 'Ekene' } };
  DB.epe_run_configs = [{ id: 'cfg1', fiscal_regime: 'PIA', production_scenario: '2P' }];
  DB.epe_results = { run_id: 'r1', kpis: { fiscal_regime: 'PIA', fiscal_framework: 'pia_only_then_nta_2025', nta_first_year: 2026, npv: 1980235 }, cash_flow_data: [{ year: 2026, net_cash_flow: 1 }] };
  DB.epe_capex = [CX];
  DB.epe_opex = [OX];
};

describe('Results Viewer: the data behind a run', () => {
  test('a replaced production file shows the banner with both names and the re-run link', async () => {
    setRun();
    DB.epe_production_volumes = [{ id: 'p2', file_name: 'FSH - Ekene-11 low.generated', created_at: '2026-10-14T09:00:00Z', scenario_label: '2P' }];
    mountViewer();
    const banner = await screen.findByTestId('epe-run-inputs-changed', {}, { timeout: 8000 });
    expect(banner).toHaveTextContent('The case data changed after this run:');
    expect(banner).toHaveTextContent('Production: ekene-production-2p.csv was replaced by FSH - Ekene-11 low.generated.');
    expect(banner).toHaveTextContent('Re-run to price the current data.');
    expect(within(banner).getByText('Re-run with edits').closest('a')).toHaveAttribute('href', '/dashboard/apps/economics/epe/cases/c1/run?fromConfig=cfg1');
  });

  test('unchanged data shows no banner', async () => {
    setRun();
    DB.epe_production_volumes = [P2];
    mountViewer();
    expect(await screen.findByText('Computed under PIA 2021 to 2025 and NTA 2025 from 2026', {}, { timeout: 8000 })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('epe-run-inputs-changed')).toBeNull();
  });
});
