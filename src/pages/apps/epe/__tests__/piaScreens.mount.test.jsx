/**
 * EC7 (engines 3.12.0): the Run Console and the Results Viewer mounted, so a
 * broken import, an undefined helper or a panel that throws is caught before
 * a user meets it. Supabase is mocked per table.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const DB = { epe_run_configs: [], epe_runs: null, epe_results: null, epe_cases: { id: 'c1', user_id: 'u1', case_name: 'Ekene' } };

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
import EpeRunConsole from '../EpeRunConsole';
// eslint-disable-next-line import/first
import EpeResultsViewer from '../EpeResultsViewer';
// eslint-disable-next-line import/first
import { LEGACY_NOTICE, LEGACY_TOGGLE_LABEL } from '../epePiaCompliance';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
});

const mountConsole = (url = '/cases/c1/run') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/cases/:caseId/run" element={<EpeRunConsole />} /></Routes>
  </MemoryRouter>,
);
const mountViewer = () => render(
  <MemoryRouter initialEntries={['/runs/r1']}>
    <Routes><Route path="/runs/:runId" element={<EpeResultsViewer />} /></Routes>
  </MemoryRouter>,
);

describe('Run Console', () => {
  beforeEach(() => { DB.epe_run_configs = []; });

  test('PIA: a new-acreage PML asks for the HCT rate, flags the refusal and offers the legacy toggle', async () => {
    mountConsole();
    fireEvent.click(await screen.findByText('PIA 2021 (Nigeria)'));
    expect(screen.queryByTestId('pia-required-inputs')).toBeNull();
    expect(screen.queryByTestId('pia-compliance-panel')).toBeNull();
    // no Marginal Field terrain on the compliant engine
    expect(screen.queryByText(/Marginal Field/)).toBeNull();
    fireEvent.click(screen.getByText('New'));
    const req = screen.getByTestId('pia-required-inputs');
    expect(within(req).getByText(/New lease hydrocarbon tax rate/)).toBeInTheDocument();
    expect(within(req).getByText(/PIA s.267 \(NTA s.72\)/)).toBeInTheDocument();
    const panel = screen.getByTestId('pia-compliance-panel');
    expect(within(panel).getByText('State the hydrocarbon tax rate of the new lease')).toBeInTheDocument();
    expect(within(panel).getByText(LEGACY_TOGGLE_LABEL)).toBeInTheDocument();
    // the one-click fix clears it
    fireEvent.click(within(panel).getByText('HCT 30%'));
    expect(screen.queryByTestId('pia-compliance-panel')).toBeNull();
  });

  test('a saved PIA config stamped legacy opens with the toggle ticked and the legacy terrain available', async () => {
    DB.epe_run_configs = [{ id: 'cfg1', case_id: 'c1', fiscal_regime: 'PIA', pia_legacy_pre_audit: true, pia_terrain: 'marginal_field', pia_tet_rate_pct: 2.5, config_name: 'old' }];
    mountConsole('/cases/c1/run?fromConfig=cfg1');
    const panel = await screen.findByTestId('pia-compliance-panel');
    const box = within(panel).getByRole('checkbox');
    expect(box).toHaveAttribute('data-state', 'checked');
    expect(screen.getByText('Marginal Field (legacy)')).toBeInTheDocument();
    // clearing the toggle shows the engine's refusal of the marginal terrain with its fixes
    fireEvent.click(box);
    expect(await screen.findByText('Marginal field is no longer a terrain')).toBeInTheDocument();
    expect(screen.getByText('Shallow water marginal field')).toBeInTheDocument();
  });
});

describe('Results Viewer', () => {
  test('a legacy PIA run shows the notice; a default-path run shows its notes and the per-year badge', async () => {
    DB.epe_runs = { id: 'r1', case_id: 'c1', user_id: 'u1', run_name: 'Legacy run', run_config_id: 'cfg1', status: 'complete', epe_cases: { case_name: 'Ekene' } };
    DB.epe_run_configs = [{ id: 'cfg1', fiscal_regime: 'PIA', pia_legacy_pre_audit: true }];
    DB.epe_results = { run_id: 'r1', kpis: { fiscal_regime: 'PIA', fiscal_framework: 'pia_only', npv: 1, engine_version: '3.11.0' }, cash_flow_data: [{ year: 2025, net_cash_flow: 1 }] };
    const { unmount } = mountViewer();
    expect(await screen.findByText(LEGACY_NOTICE)).toBeInTheDocument();
    unmount();

    DB.epe_run_configs = [{ id: 'cfg1', fiscal_regime: 'PIA', pia_legacy_pre_audit: false }];
    DB.epe_results = { run_id: 'r1', kpis: { fiscal_regime: 'PIA', fiscal_framework: 'pia_only_then_nta_2025', nta_first_year: 2026, npv: 1, pia_notes: ['Note one.', 'Note two.'] }, cash_flow_data: [{ year: 2025, net_cash_flow: 1 }] };
    mountViewer();
    expect(await screen.findByText('Computed under PIA 2021 to 2025 and NTA 2025 from 2026')).toBeInTheDocument();
    expect(screen.getByTestId('pia-notes')).toHaveTextContent('Note two.');
    expect(screen.queryByText(LEGACY_NOTICE)).toBeNull();
  });

  test('a refused run shows the engine message with fix and legacy links', async () => {
    DB.epe_runs = {
      id: 'r1', case_id: 'c1', user_id: 'u1', run_name: 'Refused', run_config_id: 'cfg9', status: 'failed',
      error_message: 'pia_capex_recovery_years is 7, but the PIA Fifth Schedule para 17(1) and NTA First Schedule Part II para 14(1) fix the capital allowance at five years.',
      epe_cases: { case_name: 'Ekene' },
    };
    DB.epe_run_configs = [];
    DB.epe_results = null;
    mountViewer();
    const panel = await screen.findByTestId('pia-refusal');
    expect(within(panel).getByText('Capital allowance life is five years')).toBeInTheDocument();
    expect(within(panel).getByText('Fix the inputs in the Run Console').closest('a')).toHaveAttribute('href', '/dashboard/apps/economics/epe/cases/c1/run?fromConfig=cfg9');
    expect(within(panel).getByText('Run as legacy (pre-2026-09-26 engine)').closest('a')).toHaveAttribute('href', '/dashboard/apps/economics/epe/cases/c1/run?fromConfig=cfg9&legacy=1');
  });
});
