/**
 * Design system rollout batch 3C: Well Integrity & P&A Studio wraps itself
 * in <ThemedApp> (WellIntegrityPAStudio.jsx), and so do its help guide and
 * the dev harness. The shared describeAppTheme block checks light by
 * default, the toggle round trip, no legacy console colour and the
 * cold-load registration; the walk below opens the seeded golden case on
 * the in-memory backend, repeats the legacy check on every tab and every
 * annulus in light and in dark, and confirms the annulus chart keeps the
 * white chart standard.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// The studio runs on the in-memory backend (the dev harness seed) instead
// of Supabase: one site, one wellbore and the golden integrity case.
jest.mock('../services/wpBackend', () => ({
  makeWpBackend: () => jest.requireActual('../services/inMemoryBackend').makeInMemoryBackend(),
}));

import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import WellIntegrityPAStudio from '../WellIntegrityPAStudio';
import WellIntegrityPAHarness from '../WellIntegrityPAHarness';
import WellIntegrityPAHelpGuide from '../WellIntegrityPAHelpGuide';

const USER_ID = 'wi-theme-user';
const ROUTE = '/dashboard/apps/drilling/well-integrity-pa';
const AUTH = { user: { id: USER_ID }, organization: null };
const WAIT = { timeout: 5000 };

const renderApp = () => render(
  <AuthContext.Provider value={AUTH}>
    <MemoryRouter initialEntries={[ROUTE]}>
      <WellIntegrityPAStudio />
    </MemoryRouter>
  </AuthContext.Provider>,
);
const ready = () => screen.findByTestId('wi-elements-card', {}, WAIT);

describeAppTheme({
  name: 'Well Integrity & P&A Studio',
  route: ROUTE,
  renderApp,
  ready,
  scopeTestId: 'wi-theme-scope',
  userId: USER_ID,
});

describeAppTheme({
  name: 'Well Integrity & P&A Studio help guide',
  route: `${ROUTE}/help`,
  renderApp: () => render(
    <AuthContext.Provider value={AUTH}>
      <MemoryRouter><WellIntegrityPAHelpGuide /></MemoryRouter>
    </AuthContext.Provider>,
  ),
  ready: () => screen.findByText('Well Integrity & P&A Help Guide'),
  scopeTestId: 'wi-help-theme-scope',
  userId: USER_ID,
});

describe('Well Integrity & P&A Studio theme: every tab and annulus', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('every tab carries no legacy colour in light and in dark; the annulus chart stays white', async () => {
    renderApp();
    await ready();
    const scope = getScopeRoot('wi-theme-scope');
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') fireEvent.click(screen.getAllByTestId('theme-toggle')[0]);
      expect(scope).toHaveAttribute('data-pl-theme', theme);
      expect(screen.getByTestId('wi-category')).toBeInTheDocument();
      for (const [tab, marker] of [
        ['barriers', 'wi-elements-card'],
        ['annulus', 'wi-annulus-card'],
        ['plugs', 'wi-plugs-card'],
        ['program', 'wi-zones-card'],
      ]) {
        fireEvent.click(screen.getByTestId(`wi-tab-${tab}`));
        expect(await screen.findByTestId(marker, {}, WAIT)).toBeInTheDocument();
        expectNoLegacyChrome();
      }
      fireEvent.click(screen.getByTestId('wi-tab-annulus'));
      const chart = await screen.findByTestId('wi-annulus-chart', {}, WAIT);
      expect(chart).toHaveAttribute('data-canvas', 'chart');
      const annulusButtons = screen.getAllByTestId(/^wi-annulus-[A-Z]$/);
      for (const b of annulusButtons) {
        fireEvent.click(b);
        expectNoLegacyChrome();
      }
      fireEvent.click(screen.getByTestId('wi-tab-plugs'));
      fireEvent.click(await screen.findByTestId('wi-plug-0', {}, WAIT));
      expect(screen.getByTestId('wi-plug-editor')).toBeInTheDocument();
      expectNoLegacyChrome();
      fireEvent.click(screen.getByTestId('wi-tab-barriers'));
    }
  }, 60000);

  it('the dev harness gets the same scope', async () => {
    render(<MemoryRouter><WellIntegrityPAHarness /></MemoryRouter>);
    await screen.findByTestId('wi-elements-card', {}, WAIT);
    expect(getScopeRoot('wi-harness-theme-scope')).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  }, 60000);
});
