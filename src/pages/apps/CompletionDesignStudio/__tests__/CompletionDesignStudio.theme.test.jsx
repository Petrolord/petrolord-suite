/**
 * Design system rollout batch 3C: Completion Design Studio wraps itself in
 * <ThemedApp> (CompletionDesignStudio.jsx), and so do its help guide and
 * the dev harness. The shared describeAppTheme block checks light by
 * default, the toggle round trip, no legacy console colour and the
 * cold-load registration; the walk below opens the seeded golden case on
 * the in-memory backend, repeats the legacy check on every tab in light
 * and in dark, in the add-component dialog (catalog and custom rows), and
 * confirms the schematic keeps the white chart standard.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// The studio runs on the in-memory backend (the dev harness seed) instead
// of Supabase: one site, one wellbore and the golden completion case.
jest.mock('../services/wpBackend', () => ({
  makeWpBackend: () => jest.requireActual('../services/inMemoryBackend').makeInMemoryBackend(),
}));

import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import CompletionDesignStudio from '../CompletionDesignStudio';
import CompletionDesignHarness from '../CompletionDesignHarness';
import CompletionDesignHelpGuide from '../CompletionDesignHelpGuide';

const USER_ID = 'cd-theme-user';
const ROUTE = '/dashboard/apps/drilling/completion-design-studio';
const AUTH = { user: { id: USER_ID }, organization: null };
const WAIT = { timeout: 5000 };

const renderApp = () => render(
  <AuthContext.Provider value={AUTH}>
    <MemoryRouter initialEntries={[ROUTE]}>
      <CompletionDesignStudio />
    </MemoryRouter>
  </AuthContext.Provider>,
);
const ready = () => screen.findByTestId('cd-comp-0', {}, WAIT);

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: USER_ID });

describeAppTheme({
  name: 'Completion Design Studio',
  route: ROUTE,
  renderApp,
  ready,
  scopeTestId: 'cd-theme-scope',
  userId: USER_ID,
});

describeAppTheme({
  name: 'Completion Design Studio help guide',
  route: `${ROUTE}/help`,
  renderApp: () => render(
    <AuthContext.Provider value={AUTH}>
      <MemoryRouter><CompletionDesignHelpGuide /></MemoryRouter>
    </AuthContext.Provider>,
  ),
  ready: () => screen.findByText('Completion Design Studio Help Guide'),
  scopeTestId: 'cd-help-theme-scope',
  userId: USER_ID,
});

describe('Completion Design Studio theme: every tab and the dialog', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('every tab carries no legacy colour in light and in dark; the schematic stays a white chart', async () => {
    renderApp();
    await ready();
    const scope = getScopeRoot('cd-theme-scope');
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') fireEvent.click(screen.getAllByTestId('theme-toggle')[0]);
      expect(scope).toHaveAttribute('data-pl-theme', theme);
      for (const [tab, marker] of [
        ['builder', 'cd-bom'],
        ['schematic', 'cd-schematic'],
        ['checks', 'cd-clearance-rows'],
        ['sizing', 'cd-sizing-rows'],
      ]) {
        fireEvent.click(screen.getByTestId(`cd-tab-${tab}`));
        expect(await screen.findByTestId(marker, {}, WAIT)).toBeInTheDocument();
        expectNoLegacyChrome();
      }
      expect(screen.queryByTestId('cd-sizing-rows')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('cd-tab-schematic'));
      expect(screen.getByTestId('cd-schematic')).toHaveAttribute('data-canvas', 'chart');
    }
  }, 60000);

  it('the add-component dialog, catalog and custom rows, opens inside the scope with no legacy colour', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByTestId('cd-add-component'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.closest('[data-pl-theme]')).not.toBeNull();
    expectNoLegacyChrome();
    fireEvent.click(screen.getByTestId('cd-add-row-custom'));
    expect(await screen.findByTestId('cd-add-custom-name')).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  }, 60000);

  it('the dev harness gets the same scope', async () => {
    render(<MemoryRouter><CompletionDesignHarness /></MemoryRouter>);
    await screen.findByTestId('cd-comp-0', {}, WAIT);
    expect(getScopeRoot('cd-harness-theme-scope')).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  }, 60000);
});
