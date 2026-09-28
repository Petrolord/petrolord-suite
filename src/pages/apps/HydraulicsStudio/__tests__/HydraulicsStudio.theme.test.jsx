/**
 * Design system rollout batch 3D: Drilling Fluids & Hydraulics Studio wraps
 * itself in <ThemedApp> (HydraulicsStudio.jsx), and so do its help guide and
 * the dev harness. The shared describeAppTheme block checks light by
 * default, the toggle round trip, no legacy console colour and the
 * cold-load registration; the walk below opens the seeded golden case on
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
import HydraulicsStudio from '../HydraulicsStudio';
import HydraulicsHarness from '../HydraulicsHarness';
import HydraulicsHelpGuide from '../HydraulicsHelpGuide';

const USER_ID = 'hyd-theme-user';
const ROUTE = '/dashboard/apps/drilling/drilling-fluids-hydraulics';
const AUTH = { user: { id: USER_ID }, organization: null };
const WAIT = { timeout: 5000 };

const renderApp = () => render(
  <AuthContext.Provider value={AUTH}>
    <MemoryRouter initialEntries={[ROUTE]}><HydraulicsStudio /></MemoryRouter>
  </AuthContext.Provider>,
);
const ready = () => screen.findByTestId('hyd-density', {}, WAIT);

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: USER_ID });

describeAppTheme({
  name: 'Drilling Fluids & Hydraulics Studio',
  route: ROUTE,
  renderApp,
  ready,
  scopeTestId: 'hyd-theme-scope',
  userId: USER_ID,
});

describeAppTheme({
  name: 'Drilling Fluids & Hydraulics Studio help guide',
  route: `${ROUTE}/help`,
  renderApp: () => render(
    <AuthContext.Provider value={AUTH}>
      <MemoryRouter><HydraulicsHelpGuide /></MemoryRouter>
    </AuthContext.Provider>,
  ),
  ready: () => screen.findByText('Drilling Fluids & Hydraulics Studio Help Guide'),
  scopeTestId: 'hyd-help-theme-scope',
  userId: USER_ID,
});

describe('Drilling Fluids & Hydraulics Studio theme: every tab and result', () => {
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
    const scope = getScopeRoot('hyd-theme-scope');
    fireEvent.click(scope.querySelector('[data-testid="theme-toggle"]'));
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
  };

  test('each tab, run and result is free of legacy chrome in dark; charts stay white', async () => {
    renderApp();
    await ready();
    toDark();
    expectNoLegacyChrome();

    fireEvent.click(screen.getByTestId('hyd-tab-hydraulics'));
    fireEvent.click(screen.getByTestId('hyd-run'));
    await screen.findByTestId('hyd-pump', {}, WAIT);
    expectNoLegacyChrome();
    const ecd = screen.getByTestId('hyd-ecd-chart');
    expect(ecd).toHaveAttribute('data-canvas', 'chart');
    expect(ecd.className).toContain('bg-white');

    fireEvent.click(screen.getByTestId('hyd-tab-surge'));
    fireEvent.click(screen.getByTestId('hyd-surge-run'));
    await screen.findByTestId('hyd-surge-05', {}, WAIT);
    expectNoLegacyChrome();
    expect(screen.getByTestId('hyd-surge-chart')).toHaveAttribute('data-canvas', 'chart');

    fireEvent.click(screen.getByTestId('hyd-tab-cleaning'));
    fireEvent.click(screen.getByTestId('hyd-clean-run'));
    await screen.findByTestId('hyd-min-tr', {}, WAIT);
    expectNoLegacyChrome();

    fireEvent.click(screen.getByTestId('hyd-tab-mud'));
    await waitFor(() => expect(screen.getByTestId('hyd-rheogram')).toHaveAttribute('data-canvas', 'chart'));
    expectNoLegacyChrome();
  });

  test('the dev harness carries the same scope', async () => {
    render(
      <AuthContext.Provider value={AUTH}>
        <MemoryRouter><HydraulicsHarness /></MemoryRouter>
      </AuthContext.Provider>,
    );
    await ready();
    expect(getScopeRoot('hyd-theme-scope')).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });
});
