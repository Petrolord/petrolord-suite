/**
 * Design system rollout batch 3D: Cementing Studio wraps
 * itself in <ThemedApp> (CementingStudio.jsx), and so do its help guide and
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
import CementingStudio from '../CementingStudio';
import CementingHarness from '../CementingHarness';
import CementingHelpGuide from '../CementingHelpGuide';

const USER_ID = 'cmt-theme-user';
const ROUTE = '/dashboard/apps/drilling/cementing-studio';
const AUTH = { user: { id: USER_ID }, organization: null };
const WAIT = { timeout: 5000 };

const renderApp = () => render(
  <AuthContext.Provider value={AUTH}>
    <MemoryRouter initialEntries={[ROUTE]}><CementingStudio /></MemoryRouter>
  </AuthContext.Provider>,
);
const ready = () => screen.findByTestId('cmt-compute', {}, WAIT);

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: USER_ID });

describeAppTheme({
  name: 'Cementing Studio',
  route: ROUTE,
  renderApp,
  ready,
  scopeTestId: 'cmt-theme-scope',
  userId: USER_ID,
});

describeAppTheme({
  name: 'Cementing Studio help guide',
  route: `${ROUTE}/help`,
  renderApp: () => render(
    <AuthContext.Provider value={AUTH}>
      <MemoryRouter><CementingHelpGuide /></MemoryRouter>
    </AuthContext.Provider>,
  ),
  ready: () => screen.findByText('Cementing Studio Help Guide'),
  scopeTestId: 'cmt-help-theme-scope',
  userId: USER_ID,
});

describe('Cementing Studio theme: every tab and result', () => {
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
    const scope = getScopeRoot('cmt-theme-scope');
    fireEvent.click(scope.querySelector('[data-testid="theme-toggle"]'));
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
  };

  test('each tab, run and result is free of legacy chrome in dark; charts stay white', async () => {
    renderApp();
    await ready();
    toDark();
    expectNoLegacyChrome();

    fireEvent.click(screen.getByTestId('cmt-compute'));
    await screen.findByTestId('cmt-slurry', {}, WAIT);
    expectNoLegacyChrome();

    fireEvent.click(screen.getByTestId('cmt-tab-placement'));
    fireEvent.click(screen.getByTestId('cmt-run'));
    await screen.findByTestId('cmt-pump-end', {}, WAIT);
    expect(screen.getByTestId('cmt-checklist')).toBeInTheDocument();
    for (const id of ['cmt-placement-chart', 'cmt-ecd-chart']) {
      expect(screen.getByTestId(id)).toHaveAttribute('data-canvas', 'chart');
      expect(screen.getByTestId(id).className).toContain('bg-white');
    }
    expectNoLegacyChrome();

    fireEvent.click(screen.getByTestId('cmt-tab-centralization'));
    await screen.findByTestId('cmt-min-standoff', {}, WAIT);
    expect(screen.getByTestId('cmt-standoff-chart')).toHaveAttribute('data-canvas', 'chart');
    expectNoLegacyChrome();
  });

  test('the dev harness carries the same scope', async () => {
    render(
      <AuthContext.Provider value={AUTH}>
        <MemoryRouter><CementingHarness /></MemoryRouter>
      </AuthContext.Provider>,
    );
    await ready();
    expect(getScopeRoot('cmt-theme-scope')).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });
});
