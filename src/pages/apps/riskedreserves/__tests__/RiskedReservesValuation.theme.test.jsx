/**
 * Design system rollout batch 3E: Risked Reserves Valuation opts in to the
 * Petrolord theme. The route page mounts the real workstation (on the
 * in-memory ReservoirCalc Pro inventory in place of the registry, so no
 * Supabase is needed) and runs the shared four checks: opens light, the
 * toolbar toggle goes to dark and back and stores the choice, no legacy
 * console colour outside the data-canvas regions (with a negative
 * control), and the route is registered for the themed cold-load loaders.
 * An imported prospect with its readout and white expectation chart, and
 * the help guide, are checked below.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, expectThemedPath, getScopeRoot, installDomShims,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import { themeStorageKey } from '@/design/ThemeProvider';
import RiskedReservesValuation from '@/pages/apps/RiskedReservesValuation';
import RiskedReservesHelpGuide from '@/pages/apps/RiskedReservesHelpGuide';

jest.mock('@/pages/apps/ReservoirCalcPro/services/prospectsService', () => {
  const actual = jest.requireActual('@/pages/apps/ReservoirCalcPro/services/prospectsService');
  return {
    ...actual,
    makeRegistryProspectsBackend: () => actual.makeInMemoryProspectsBackend([
      { name: 'North', pg_factors: {}, inputs: {}, risked: { pg: 0.3, success: { p90: 12, p50: 30, p10: 75 } } },
    ]),
  };
});
jest.mock('recharts', () => {
  const R = jest.requireActual('recharts');
  return { ...R, ResponsiveContainer: ({ children }) => <div style={{ width: 600, height: 300 }}>{children}</div> };
});

const ROUTE = '/dashboard/apps/reservoir/risked-reserves-valuation';
const renderApp = () => render(<MemoryRouter><RiskedReservesValuation /></MemoryRouter>);
const ready = () => screen.findByTestId('rrv-empty');

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: 'Risked Reserves Valuation',
  route: ROUTE,
  renderApp,
  ready,
  scopeTestId: 'rrv-theme-scope',
});

describe('Risked Reserves Valuation themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  const importNorth = async () => {
    renderApp();
    await ready();
    await waitFor(() => expect(screen.getByTestId('rrv-import')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('rrv-import'));
    return screen.findByTestId('rrv-expectation-chart');
  };

  it('an imported prospect: table, readout and status on roles, the expectation chart on white chart paper', async () => {
    const chart = await importNorth();
    expect(chart).toHaveAttribute('data-canvas', 'chart');
    expect(screen.getByTestId('rrv-readout')).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it('the same prospect in dark for a user who chose dark', async () => {
    window.localStorage.setItem(themeStorageKey(null), 'dark');
    await importNorth();
    expect(getScopeRoot('rrv-theme-scope')).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });

  it('the help guide opens light in its own scope with no legacy colour', () => {
    render(<MemoryRouter><RiskedReservesHelpGuide /></MemoryRouter>);
    expect(getScopeRoot('rrv-help-theme-scope')).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
    expectThemedPath(`${ROUTE}/help`);
  });
});
