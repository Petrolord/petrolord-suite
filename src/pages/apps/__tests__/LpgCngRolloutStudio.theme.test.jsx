/**
 * Design system rollout batch 5D: LPG & CNG Rollout Studio wraps itself in <ThemedApp>.
 * The shared helpers check the standard four (light by default, toggle to
 * dark and back stored per user, no legacy colour outside data-canvas with
 * a negative control, the route registered); the extra cases walk
 * every result tab in both themes and open the documentation drawer and the
 * new-study dialog inside the scope.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describeAppTheme, expectNoLegacyChrome, installDomShims, installDashboardScope, getScopeRoot } from '@/design/testing/themeAssertions';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
        eq: jest.fn(() => ({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) })),
      })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import LpgCngRolloutStudio from '@/pages/apps/LpgCngRolloutStudio';

const TITLE = 'LPG & CNG Rollout Studio';
const SCOPE = 'lpgcng-theme-scope';
const TABS = ['CNG', 'Conversion case', 'LPG'];
const renderApp = () => render(<MemoryRouter><LpgCngRolloutStudio /></MemoryRouter>);

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: TITLE,
  route: '/dashboard/apps/midstream-downstream/lpg-cng-rollout-studio',
  renderApp: () => renderApp(),
  ready: () => screen.findAllByText(TITLE),
  scopeTestId: SCOPE,
});

describe(`${TITLE} themed states`, () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('every tab leaves no legacy colour, in light and in dark', async () => {
    renderApp();
    await screen.findAllByText(TITLE);
    const scope = getScopeRoot(SCOPE);
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') fireEvent.click(screen.getByTestId('theme-toggle'));
      expect(scope).toHaveAttribute('data-pl-theme', theme);
      expectNoLegacyChrome();
      for (const tab of TABS) {
        fireEvent.mouseDown(screen.getByRole('tab', { name: tab }), { button: 0 });
        await waitFor(() => expect(screen.getByRole('tab', { name: tab })).toHaveAttribute('data-state', 'active'));
        expectNoLegacyChrome();
      }
    }
  }, 60000);

  it('the documentation drawer carries the scope and stays clean', async () => {
    renderApp();
    await screen.findAllByText(TITLE);
    fireEvent.click(screen.getByTitle('Documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });

  it('the new-study dialog carries the scope and stays clean in dark', async () => {
    renderApp();
    await screen.findAllByText(TITLE);
    fireEvent.click(screen.getByTestId('theme-toggle'));
    fireEvent.click(screen.getByTitle('Create new saved study'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });
});
