/**
 * Design system rollout batch 2F: Decision Studio opts in to the Petrolord
 * theme (the page wraps itself in <ThemedApp>). describeAppTheme checks
 * light by default, the toggle round trip, no legacy console colour and
 * the cold-load registration on the dev harness (real Monte Carlo runs, a
 * decision tree and a portfolio on an in-memory Supabase). The tests below
 * repeat the legacy check with two cases compared: the comparison money
 * table (NumericTable) and the NPV S-curves on a white ChartPanel in dark.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import DecisionStudioHarness from '@/components/decisionstudio/harness/DecisionStudioHarness';

// The harness passes its own user (userOverride); the page still calls
// useAuth(), so give it a signed-out context as the dev route has.
const renderApp = () => render(
  <MemoryRouter>
    <AuthContext.Provider value={{ user: null, session: null, loading: false }}>
      <DecisionStudioHarness />
    </AuthContext.Provider>
  </MemoryRouter>,
);
const ready = () => screen.findByText('Compare economics cases (pick up to 4)');

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: 'Decision Studio',
  route: '/dashboard/apps/economics/decision-studio',
  renderApp,
  ready,
  scopeTestId: 'ds-theme-scope',
});

describe('Decision Studio theme, comparison and help', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('two cases compared: money table themed, S-curves on white in dark', async () => {
    renderApp();
    await ready();
    const chipRow = screen.getByText('Compare economics cases (pick up to 4)').closest('div').parentElement;
    const chips = within(chipRow).getAllByRole('button', { pressed: false });
    fireEvent.click(chips[0]);
    fireEvent.click(chips[1]);
    const table = await screen.findByTestId('ds-compare-table');
    expect(within(table).getByText('NPV P50')).toBeInTheDocument();
    expect(screen.getByText('NPV S-curves').closest('[data-canvas="chart"]')).not.toBeNull();
    expectNoLegacyChrome();
    const scope = getScopeRoot('ds-theme-scope');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });

  it('no legacy colour with a source picked and the help guide open', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByText('Ekene-11: drill or farm out'));
    fireEvent.click(screen.getByTitle('Documentation'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expectNoLegacyChrome();
  });
});
