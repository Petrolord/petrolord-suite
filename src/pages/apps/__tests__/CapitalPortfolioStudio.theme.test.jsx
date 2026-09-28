/**
 * Design system rollout batch 2E: Capital Portfolio Studio opts in to the
 * Petrolord theme (the page wraps itself in <ThemedApp>). describeAppTheme
 * checks light by default, the toggle round trip, no legacy console colour
 * and the cold-load registration. The walk below opens two saved portfolios
 * with four projects (one refused, one linked to an EPE Monte Carlo run),
 * runs the optimisation and repeats the legacy check on the workbench, the
 * optimal portfolio card (the frontier chart stays white in dark), the
 * project and portfolio dialogs, the delete confirmation, the comparison
 * dialog and the help guide.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockTables = { portfolio_projects: [], portfolios: [], epe_mc_runs: [] };
const makeQuery = (table) => {
  const q = {};
  const chain = () => q;
  ['select', 'eq', 'order', 'limit', 'update', 'upsert', 'delete', 'in', 'insert', 'not'].forEach((m) => { q[m] = jest.fn(chain); });
  q.then = (resolve, reject) => Promise.resolve({ data: mockTables[table] || [], error: null }).then(resolve, reject);
  return q;
};
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn((table) => makeQuery(table)),
  },
}));
// recharts has no layout in jsdom; give the responsive container a size
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  const R = require('react');
  const ResponsiveContainer = ({ children }) => R.cloneElement(children, { width: 800, height: 360 });
  return { ...actual, ResponsiveContainer };
});

import { AuthContext } from '@/contexts/SupabaseAuthContext';
import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import CapitalPortfolioStudio from '@/pages/apps/CapitalPortfolioStudio';

const SCOPE = 'portfolio-theme-scope';
const AUTH = { user: { id: 'u1' }, loading: false };
const renderApp = () => render(
  <AuthContext.Provider value={AUTH}>
    <MemoryRouter><CapitalPortfolioStudio /></MemoryRouter>
  </AuthContext.Provider>,
);
const ready = () => screen.findByText('Portfolios');

const seed = () => {
  mockTables.portfolios = [
    { id: 'pf1', name: 'Plan', capex_limit: 100 },
    { id: 'pf2', name: 'Stretch', capex_limit: 160 },
  ];
  mockTables.portfolio_projects = [
    { id: 'x1', name: 'Alpha', capex: 40, npv_p50: 120, npv_p90: 60, npv_p10: 200, pos: 0.6, fail_cost: 20 },
    { id: 'x2', name: 'Beta', capex: 50, npv_p50: -10, npv_p90: -30, npv_p10: 20, pos: 0.9, fail_cost: 5 },
    { id: 'x3', name: 'Gamma', capex: 30, npv_p50: 80, npv_p90: 40, npv_p10: 130, pos: 0.5, fail_cost: 10, source_type: 'epe_mc', source_label: 'Case A MC' },
    { id: 'x4', name: 'Refused', capex: 10, npv_p50: 100, pos: 1.4 },
  ];
};

describeAppTheme({
  name: 'Capital Portfolio Studio',
  route: '/dashboard/apps/economics/capital-portfolio-studio',
  renderApp,
  ready,
  scopeTestId: SCOPE,
  userId: 'u1',
});

describe('Capital Portfolio Studio theme, workbench, results and dialogs', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
    seed();
  });

  const openPlan = async () => {
    renderApp();
    await ready();
    fireEvent.click(await screen.findByText('Plan'));
    await screen.findByText('Alpha');
  };

  it('the workbench and the optimal portfolio read in light and dark; the frontier stays white', async () => {
    await openPlan();
    expect(screen.getByTestId('portfolio-refusals')).toBeInTheDocument();
    // the refused project is left out so the run goes through
    const refusedRow = screen.getByText('Refused').closest('tr');
    fireEvent.click(within(refusedRow).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Run Optimization/i }));
    expect(await screen.findByText('Optimal Portfolio')).toBeInTheDocument();

    const scope = getScopeRoot(SCOPE);
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') fireEvent.click(screen.getByTestId('theme-toggle'));
      expect(scope).toHaveAttribute('data-pl-theme', theme);
      expect(scope.querySelectorAll('section[data-canvas="chart"]').length).toBe(1);
      // a negative NPV reads in danger text beside its minus sign
      const beta = screen.getAllByText('Beta')[0].closest('tr');
      const npvCell = within(beta).getAllByText('-$10 MM')[0];
      expect(npvCell.className).toMatch(/text-pl-danger-text/);
      expect(npvCell.className).toMatch(/font-pl-mono/);
      expectNoLegacyChrome();
    }
  }, 20000);

  it('the project and portfolio dialogs and the delete confirmation stay themed', async () => {
    await openPlan();
    fireEvent.click(screen.getByRole('button', { name: /Add Project/i }));
    let dialog = await screen.findByRole('dialog');
    expect(dialog.closest('[data-pl-theme]')).not.toBeNull();
    expectNoLegacyChrome();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Create/i }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('CAPEX Limit ($MM)')).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Delete Plan' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm.closest('[data-pl-theme]')).not.toBeNull();
    expectNoLegacyChrome();
  });

  it('the portfolio comparison dialog stays themed with its chart white', async () => {
    mockTables.portfolio_projects = mockTables.portfolio_projects.filter((p) => p.id !== 'x4');
    renderApp();
    await ready();
    await screen.findByText('Plan');
    screen.getAllByRole('checkbox').forEach((box) => fireEvent.click(box));
    fireEvent.click(screen.getByRole('button', { name: /Compare \(2\)/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Portfolio Scenario Comparison')).toBeInTheDocument();
    expect(dialog.querySelectorAll('section[data-canvas="chart"]').length).toBe(1);
    expectNoLegacyChrome();
  });

  it('the help guide opens in the scope with no legacy colour', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByTitle('Documentation'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.closest('[data-pl-theme]')).not.toBeNull();
    expectNoLegacyChrome();
  });
});
