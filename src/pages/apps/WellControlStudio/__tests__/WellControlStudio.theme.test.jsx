/**
 * Design system rollout batch 3D: Well Control Studio wraps
 * itself in <ThemedApp> (WellControlStudio.jsx), and so do its help guide and
 * the dev harness. The shared describeAppTheme block checks light by
 * default, the toggle round trip, no legacy console colour and the
 * cold-load registration; the walk below opens the seeded case on
 * the in-memory backend, runs every tab and repeats the legacy check, and
 * confirms the chart cards keep the white chart standard in dark.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// The registry backend talks to Supabase; the page mounts the same
// workstation on the seeded in-memory backend here.
jest.mock('../services/wpBackend', () => {
  const { makeInMemoryBackend } = jest.requireActual('../services/inMemoryBackend');
  return { makeWpBackend: () => makeInMemoryBackend() };
});

import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import WellControlStudio from '../WellControlStudio';
import WellControlHarness from '../WellControlHarness';
import WellControlHelpGuide from '../WellControlHelpGuide';

const USER_ID = 'wc-theme-user';
const ROUTE = '/dashboard/apps/drilling/well-control-studio';
const AUTH = { user: { id: USER_ID }, organization: null };
const WAIT = { timeout: 5000 };

const renderApp = () => render(
  <AuthContext.Provider value={AUTH}>
    <MemoryRouter initialEntries={[ROUTE]}><WellControlStudio /></MemoryRouter>
  </AuthContext.Provider>,
);
const ready = () => screen.findByTestId('wc-compute-volumes', {}, WAIT);

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: USER_ID });

describeAppTheme({
  name: 'Well Control Studio',
  route: ROUTE,
  renderApp,
  ready,
  scopeTestId: 'wc-theme-scope',
  userId: USER_ID,
});

describeAppTheme({
  name: 'Well Control Studio help guide',
  route: `${ROUTE}/help`,
  renderApp: () => render(
    <AuthContext.Provider value={AUTH}>
      <MemoryRouter><WellControlHelpGuide /></MemoryRouter>
    </AuthContext.Provider>,
  ),
  ready: () => screen.findByText('Well Control Studio Help Guide'),
  scopeTestId: 'wc-help-theme-scope',
  userId: USER_ID,
});

describe('Well Control Studio theme: every tab and result', () => {
  beforeAll(() => {
    installDomShims();
    // recharts warns about the zero-size jsdom layout; the charts only have to mount
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterAll(() => { console.warn.mockRestore(); });
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  const toDark = () => {
    const scope = getScopeRoot('wc-theme-scope');
    fireEvent.click(scope.querySelector('[data-testid="theme-toggle"]'));
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
  };

  test('each tab, run and result is free of legacy chrome in dark; charts stay white', async () => {
    renderApp();
    await ready();
    toDark();
    expectNoLegacyChrome();

    fireEvent.click(screen.getByTestId('wc-compute-volumes'));
    await screen.findByTestId('wc-cap-table', {}, WAIT);
    expectNoLegacyChrome();

    fireEvent.click(screen.getByTestId('wc-tab-killsheet'));
    fireEvent.click(screen.getByTestId('wc-run'));
    await screen.findByTestId('wc-kmw', {}, WAIT);
    expectNoLegacyChrome();
    const chart = screen.getByTestId('wc-schedule-chart');
    expect(chart).toHaveAttribute('data-canvas', 'chart');
    expect(chart.className).toContain('bg-white');

    fireEvent.click(screen.getByTestId('wc-tab-kicktol'));
    await screen.findByTestId('wc-kt', {}, WAIT);
    expect(screen.getByTestId('wc-kt-chart')).toHaveAttribute('data-canvas', 'chart');
    expectNoLegacyChrome();
  });

  test('the dev harness carries the same scope', async () => {
    render(
      <AuthContext.Provider value={AUTH}>
        <MemoryRouter><WellControlHarness /></MemoryRouter>
      </AuthContext.Provider>,
    );
    await ready();
    expect(getScopeRoot('wc-theme-scope')).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });
});
