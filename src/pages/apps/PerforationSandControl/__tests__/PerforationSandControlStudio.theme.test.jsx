/**
 * Design system rollout batch 3D: Perforation & Sand Control Designer wraps
 * itself in <ThemedApp> (PerforationSandControlStudio.jsx), and so do its help guide and
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
} from '@/design/testing/themeAssertions';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import PerforationSandControlStudio from '../PerforationSandControlStudio';
import PerforationSandControlHarness from '../PerforationSandControlHarness';
import PerforationSandControlHelpGuide from '../PerforationSandControlHelpGuide';

const USER_ID = 'ps-theme-user';
const ROUTE = '/dashboard/apps/drilling/perforation-sand-control';
const AUTH = { user: { id: USER_ID }, organization: null };
const WAIT = { timeout: 5000 };

const renderApp = () => render(
  <AuthContext.Provider value={AUTH}>
    <MemoryRouter initialEntries={[ROUTE]}><PerforationSandControlStudio /></MemoryRouter>
  </AuthContext.Provider>,
);
const ready = () => screen.findByTestId('ps-d50', {}, WAIT);

describeAppTheme({
  name: 'Perforation & Sand Control Designer',
  route: ROUTE,
  renderApp,
  ready,
  scopeTestId: 'ps-theme-scope',
  userId: USER_ID,
});

describeAppTheme({
  name: 'Perforation & Sand Control Designer help guide',
  route: `${ROUTE}/help`,
  renderApp: () => render(
    <AuthContext.Provider value={AUTH}>
      <MemoryRouter><PerforationSandControlHelpGuide /></MemoryRouter>
    </AuthContext.Provider>,
  ),
  ready: () => screen.findByText('Perforation & Sand Control Help Guide'),
  scopeTestId: 'ps-help-theme-scope',
  userId: USER_ID,
});

describe('Perforation & Sand Control Designer theme: every tab and result', () => {
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
    const scope = getScopeRoot('ps-theme-scope');
    fireEvent.click(scope.querySelector('[data-testid="theme-toggle"]'));
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
  };

  test('each tab and result is free of legacy chrome in dark; charts stay white', async () => {
    renderApp();
    await ready();
    toDark();
    await waitFor(() => expect(screen.getByTestId('ps-psd-chart')).toHaveAttribute('data-canvas', 'chart'));
    expect(screen.getByTestId('ps-banner')).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.click(screen.getByTestId('ps-tab-perforating'));
    await screen.findByTestId('ps-clearance-status', {}, WAIT);
    expectNoLegacyChrome();

    fireEvent.click(screen.getByTestId('ps-tab-sandcontrol'));
    await screen.findByTestId('ps-advisor-indication', {}, WAIT);
    expectNoLegacyChrome();

    fireEvent.click(screen.getByTestId('ps-tab-sanding'));
    await waitFor(() => expect(screen.getByTestId('ps-cdp-chart')).toHaveAttribute('data-canvas', 'chart'));
    expect(screen.getByTestId('ps-cdp-chart').className).toContain('bg-white');
    expectNoLegacyChrome();
  });

  test('the dev harness carries the same scope', async () => {
    render(
      <AuthContext.Provider value={AUTH}>
        <MemoryRouter><PerforationSandControlHarness /></MemoryRouter>
      </AuthContext.Provider>,
    );
    await ready();
    expect(getScopeRoot('ps-theme-scope')).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });
});
