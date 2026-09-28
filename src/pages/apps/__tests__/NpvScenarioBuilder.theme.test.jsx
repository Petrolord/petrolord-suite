/**
 * Design system rollout batch 2E: NPV Scenario Builder opts in to the
 * Petrolord theme (the page wraps itself in <ThemedApp>). describeAppTheme
 * checks light by default, the toggle round trip, no legacy console colour
 * and the cold-load registration. The walk below computes the default Quick
 * case and repeats the legacy check on every results tab (dashboard, the
 * cash-flow ledger, scenarios, sensitivity, risk), with Full precision on
 * (Monte Carlo settings and the sensitivity sweep table), in Expert mode and
 * in the help centre dialog; the chart cards stay white in dark. The charts
 * are stubbed (recharts has no layout in jsdom); ChartPanel still carries
 * data-canvas="chart" around each one.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
        eq: jest.fn(() => ({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) })),
      })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));
jest.mock('jspdf', () => jest.fn());
jest.mock('jspdf-autotable', () => ({}));
jest.mock('@/components/npv/charts/WaterfallChart', () => () => <div data-testid="npv-chart-stub" />);
jest.mock('@/components/npv/charts/TornadoChart', () => () => <div data-testid="npv-chart-stub" />);
jest.mock('@/components/npv/charts/StackedCashflowChart', () => () => <div data-testid="npv-chart-stub" />);
jest.mock('@/components/npv/charts/SpiderChart', () => () => <div data-testid="npv-chart-stub" />);
jest.mock('@/components/npv/charts/RiskCharts', () => ({
  HistogramChart: () => <div data-testid="npv-chart-stub" />,
  SCurveChart: () => <div data-testid="npv-chart-stub" />,
}));

import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import NpvScenarioBuilder from '@/pages/apps/NpvScenarioBuilder';

const SCOPE = 'npv-theme-scope';
const renderApp = () => render(<MemoryRouter><NpvScenarioBuilder /></MemoryRouter>);
const ready = () => screen.findByText('Saved scenario');

describeAppTheme({
  name: 'NPV Scenario Builder',
  route: '/dashboard/apps/economics/npv-scenario-builder',
  renderApp,
  ready,
  scopeTestId: SCOPE,
});

const openTab = (name) => {
  const tab = screen.getByRole('tab', { name });
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
};

describe('NPV Scenario Builder theme, results, modes and help', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('no legacy colour on any results tab, in light and dark; charts stay white', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Calculate Economics/i }));
    expect(await screen.findByText('Net Present Value', {}, { timeout: 8000 })).toBeInTheDocument();
    expectNoLegacyChrome();

    const scope = getScopeRoot(SCOPE);
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') fireEvent.click(screen.getByTestId('theme-toggle'));
      expect(scope).toHaveAttribute('data-pl-theme', theme);
      openTab('Dashboard');
      expect(scope.querySelectorAll('[data-canvas="chart"]').length).toBe(1);
      expectNoLegacyChrome();

      openTab('Cashflow');
      const ledger = screen.getByTestId('npv-cashflow-table');
      // right-aligned mono figures; costs print with their minus in danger text
      const firstRow = ledger.querySelector('tbody tr');
      const cells = [...firstRow.querySelectorAll('td')];
      cells.forEach((td) => expect(td.className).toMatch(/text-right/));
      cells.forEach((td) => expect(td.className).toMatch(/font-pl-mono/));
      expect(cells[1].textContent.startsWith('-')).toBe(true);
      expect(cells[1].className).toMatch(/text-pl-danger-text/);
      expectNoLegacyChrome();

      openTab('Scenarios');
      expect(screen.getByText('Scenario Comparison Matrix')).toBeInTheDocument();
      expectNoLegacyChrome();

      openTab('Sensitivity');
      expect(scope.querySelectorAll('[data-canvas="chart"]').length).toBe(2);
      expectNoLegacyChrome();

      openTab('Risk');
      expect(screen.getAllByTestId('npv-risk-case')).toHaveLength(3);
      expect(scope.querySelectorAll('[data-canvas="chart"]').length).toBe(2);
      expectNoLegacyChrome();
    }
  }, 20000);

  it('with Full precision on, the Monte Carlo settings and the sweep table stay themed', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByRole('switch', { name: 'Full precision' }));
    fireEvent.click(screen.getByRole('button', { name: /Calculate Economics/i }));
    expect(await screen.findByText('Net Present Value', {}, { timeout: 8000 })).toBeInTheDocument();
    openTab('Cashflow');
    expect(screen.getByTestId('npv-cashflow-full')).toBeInTheDocument();
    expectNoLegacyChrome();
    openTab('Sensitivity');
    expect(screen.getByTestId('npv-sensitivity-table')).toBeInTheDocument();
    expectNoLegacyChrome();
    openTab('Risk');
    expect(screen.getByTestId('npv-mc-settings')).toBeInTheDocument();
    expectNoLegacyChrome();
  }, 20000);

  it('Expert mode, its input tabs and the fiscal select stay themed', async () => {
    renderApp();
    await ready();
    const expert = screen.getByText(/Expert Mode/i).closest('button');
    fireEvent.mouseDown(expert, { button: 0 });
    fireEvent.click(expert);
    expect(await screen.findByRole('tab', { name: 'Production' })).toBeInTheDocument();
    expectNoLegacyChrome();
    openTab('Fiscal Terms');
    expect(screen.getByText('Fiscal System')).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it('the help centre dialog opens in the scope with no legacy colour', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Help & Training/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('NPV Scenario Builder Help Center')).toBeInTheDocument();
    expect(dialog.closest('[data-pl-theme]')).not.toBeNull();
    expectNoLegacyChrome();
    fireEvent.click(within(dialog).getByRole('button', { name: /FAQ/ }));
    expectNoLegacyChrome();
    fireEvent.click(within(dialog).getByRole('button', { name: /Video Tutorials/ }));
    expectNoLegacyChrome();
  });
});
