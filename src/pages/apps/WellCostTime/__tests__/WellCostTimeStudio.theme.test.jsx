/**
 * Design system rollout batch 3C: Well Cost & Time Estimator wraps itself
 * in <ThemedApp> (WellCostTimeStudio.jsx), and so do its help guide and the
 * dev harness. The shared describeAppTheme block checks light by default,
 * the toggle round trip, no legacy console colour and the cold-load
 * registration; the walk below opens the seeded golden case on the
 * in-memory backend, repeats the legacy check on every tab in light and in
 * dark (with Full precision on, so the cumulative cost table shows), runs
 * the seeded Monte Carlo for the risk charts, and confirms the charts keep
 * the white chart standard.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// The studio runs on the in-memory backend (the dev harness seed) instead
// of Supabase: one site, one wellbore and the golden estimate.
jest.mock('../services/wpBackend', () => ({
  makeWpBackend: () => jest.requireActual('../services/inMemoryBackend').makeInMemoryBackend(),
}));

import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import WellCostTimeStudio from '../WellCostTimeStudio';
import WellCostTimeHarness from '../WellCostTimeHarness';
import WellCostTimeHelpGuide from '../WellCostTimeHelpGuide';

const USER_ID = 'wct-theme-user';
const ROUTE = '/dashboard/apps/drilling/well-cost-time';
const AUTH = { user: { id: USER_ID }, organization: null };
const WAIT = { timeout: 5000 };

const renderApp = () => render(
  <AuthContext.Provider value={AUTH}>
    <MemoryRouter initialEntries={[ROUTE]}>
      <WellCostTimeStudio />
    </MemoryRouter>
  </AuthContext.Provider>,
);
const ready = () => screen.findByTestId('wct-activities-card', {}, WAIT);

describeAppTheme({
  name: 'Well Cost & Time Estimator',
  route: ROUTE,
  renderApp,
  ready,
  scopeTestId: 'wct-theme-scope',
  userId: USER_ID,
});

describeAppTheme({
  name: 'Well Cost & Time Estimator help guide',
  route: `${ROUTE}/help`,
  renderApp: () => render(
    <AuthContext.Provider value={AUTH}>
      <MemoryRouter><WellCostTimeHelpGuide /></MemoryRouter>
    </AuthContext.Provider>,
  ),
  ready: () => screen.findByText('Well Cost & Time Help Guide'),
  scopeTestId: 'wct-help-theme-scope',
  userId: USER_ID,
});

describe('Well Cost & Time Estimator theme: every tab, full precision and the risk run', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('every tab carries no legacy colour in light and in dark; charts stay white', async () => {
    renderApp();
    await ready();
    const scope = getScopeRoot('wct-theme-scope');
    // Full precision on: the Cost tab adds the cumulative cost table
    fireEvent.click(screen.getByRole('switch', { name: 'Full precision' }));
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') fireEvent.click(screen.getAllByTestId('theme-toggle')[0]);
      expect(scope).toHaveAttribute('data-pl-theme', theme);
      for (const [tab, marker] of [
        ['program', 'wct-schedule-card'],
        ['cost', 'wct-curve-table'],
        ['risk', 'wct-uncertainties-card'],
        ['report', 'wct-summary-card'],
      ]) {
        fireEvent.click(screen.getByTestId(`wct-tab-${tab}`));
        expect(await screen.findByTestId(marker, {}, WAIT)).toBeInTheDocument();
        expectNoLegacyChrome();
      }
      fireEvent.click(screen.getByTestId('wct-tab-program'));
      expect(screen.getByTestId('wct-timedepth-chart')).toHaveAttribute('data-canvas', 'chart');
      fireEvent.click(screen.getByTestId('wct-tab-cost'));
      expect(screen.getByTestId('wct-costtime-chart')).toHaveAttribute('data-canvas', 'chart');
      expect(screen.getByTestId('wct-total-usd')).toHaveTextContent(/USD$/);
    }
  }, 60000);

  it('the risk tab after a seeded Monte Carlo run carries no legacy colour', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByTestId('wct-tab-risk'));
    fireEvent.click(await screen.findByTestId('wct-run-mc', {}, WAIT));
    expect(await screen.findByTestId('wct-mc-card', {}, { timeout: 30000 })).toBeInTheDocument();
    expect(screen.getByTestId('wct-histogram-chart')).toHaveAttribute('data-canvas', 'chart');
    expectNoLegacyChrome();
    fireEvent.click(screen.getByTestId('wct-tab-report'));
    expect(await screen.findByTestId('wct-report-mc', {}, WAIT)).toBeInTheDocument();
    expectNoLegacyChrome();
  }, 60000);

  it('the dev harness gets the same scope', async () => {
    render(<MemoryRouter><WellCostTimeHarness /></MemoryRouter>);
    await screen.findByTestId('wct-activities-card', {}, WAIT);
    expect(getScopeRoot('wct-harness-theme-scope')).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  }, 60000);
});
