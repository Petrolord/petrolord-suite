/**
 * The tornado readout mounted on the Results Viewer (video programme,
 * 2026-10-14): a saved sensitivity run shows the sentence and the table.
 * Negative control: with no saved sensitivity run there is no table.
 * Supabase is mocked per table (the piaScreens.mount.test.jsx pattern).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import EpeResultsViewer from '../EpeResultsViewer';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
});

const BASE = 1980235.48;
const mountViewer = () => render(
  <MemoryRouter initialEntries={['/runs/r1']}>
    <Routes><Route path="/runs/:runId" element={<EpeResultsViewer />} /></Routes>
  </MemoryRouter>,
);
const seedRun = () => {
  DB.epe_runs = { id: 'r1', case_id: 'c1', user_id: 'u1', run_name: 'With Ekene-11', run_config_id: 'cfg1', status: 'complete', epe_cases: { case_name: 'Ekene' } };
  DB.epe_run_configs = [{ id: 'cfg1', fiscal_regime: 'PIA', pia_legacy_pre_audit: false }];
  DB.epe_results = { run_id: 'r1', kpis: { fiscal_regime: 'PIA', fiscal_framework: 'pia_only_then_nta_2025', nta_first_year: 2026, npv: BASE }, cash_flow_data: [{ year: 2026, net_cash_flow: 1 }] };
};

describe('tornado readout', () => {
  test('a saved sensitivity run shows the drivers sentence and the table', async () => {
    seedRun();
    DB.epe_sensitivity_runs = [{ id: 's1', base_run_id: 'r1', status: 'complete', base_npv: BASE }];
    DB.epe_sensitivity_results = [
      { variable: 'oil_price_usd_bbl', variable_label: 'Oil Price', low_value: 60, high_value: 90, low_factor: 0.8, high_factor: 1.2, base_npv: BASE, low_npv: BASE - 2730000, high_npv: BASE + 2560000, delta_low_npv: -2730000, delta_high_npv: 2560000 },
      { variable: '__capex_multiplier', variable_label: 'CAPEX', low_value: 9920000, high_value: 14880000, low_factor: 0.8, high_factor: 1.2, base_npv: BASE, low_npv: BASE + 1170000, high_npv: BASE - 1180000, delta_low_npv: 1170000, delta_high_npv: -1180000 },
    ];
    mountViewer();
    fireEvent.click(await screen.findByText('Sensitivity (Tornado)'));
    const table = await screen.findByTestId('epe-tornado-table', {}, { timeout: 8000 });
    expect(within(table).getByText('$60.0/bbl')).toBeInTheDocument();
    expect(within(table).getByText('-$750K')).toBeInTheDocument();
    expect(screen.getByTestId('epe-tornado-sentence')).toHaveTextContent('Oil Price and CAPEX move NPV the most');
    expect(screen.getByText(/Base NPV:/)).toHaveTextContent('Base NPV: $1.98M');
  });

  test('negative control: no saved sensitivity run, no table', async () => {
    seedRun();
    DB.epe_sensitivity_runs = [];
    DB.epe_sensitivity_results = [];
    mountViewer();
    fireEvent.click(await screen.findByText('Sensitivity (Tornado)'));
    await screen.findByText('Run Sensitivity Analysis', {}, { timeout: 8000 });
    expect(screen.queryByTestId('epe-tornado-table')).toBeNull();
  });
});
