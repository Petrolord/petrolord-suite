/**
 * Design system rollout batch 2A: Forecast Scenario Hub opts in to the
 * Petrolord theme (the page and its help guide wrap themselves in
 * <ThemedApp>). describeAppTheme checks light by default, the toggle round
 * trip, no legacy console colour and the cold-load registration; the tests
 * below cover the load dialog, the help guide and the white rate chart in
 * dark.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => {
  const chain = {
    select: () => chain, order: () => Promise.resolve({ data: [{ id: 'p1', project_name: 'Base set', updated_at: '2026-09-01T00:00:00Z' }], error: null }),
    eq: () => chain, maybeSingle: () => Promise.resolve({ data: null, error: null }),
    insert: () => Promise.resolve({ error: null }), update: () => chain, delete: () => chain,
  };
  return { supabase: { auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) }, from: jest.fn(() => chain) } };
});

import {
  describeAppTheme, expectNoLegacyChrome, expectThemedPath, getScopeRoot, installDomShims,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import ForecastScenarioHub from '@/pages/apps/ForecastScenarioHub';
import ForecastScenarioHubHelpGuide from '@/pages/apps/ForecastScenarioHubHelpGuide';

const renderApp = () => render(<MemoryRouter><ForecastScenarioHub /></MemoryRouter>);
const ready = () => screen.findByText('Forecast Scenario Hub');

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: 'Forecast Scenario Hub',
  route: '/dashboard/apps/reservoir/forecast-scenario-hub',
  renderApp,
  ready,
  scopeTestId: 'fsh-theme-scope',
});

describe('Forecast Scenario Hub theme, dialog, chart and help', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('the load dialog carries the scope with no legacy colour', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Load/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('data-pl-theme', 'light');
    expect(await screen.findByText('Base set')).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it('the rate chart keeps the white chart standard in dark', async () => {
    renderApp();
    await ready();
    const scope = getScopeRoot('fsh-theme-scope');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    const panel = screen.getByText('Rate profiles').closest('[data-canvas="chart"]');
    expect(panel).not.toBeNull();
    expectNoLegacyChrome();
  });

  it('the help guide opens light in its own scope with no legacy colour', async () => {
    render(<MemoryRouter><ForecastScenarioHubHelpGuide /></MemoryRouter>);
    const root = getScopeRoot('fsh-help-root');
    expect(root).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
    expectThemedPath('/dashboard/apps/reservoir/forecast-scenario-hub/help');
  });
});
