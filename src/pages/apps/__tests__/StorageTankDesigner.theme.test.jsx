/**
 * Design system rollout batch 5B: Storage Tank & Venting Designer wraps itself in <ThemedApp>.
 * The shared helpers check the standard four (light by default, toggle to
 * dark and back stored per user, no legacy colour outside data-canvas with
 * a negative control, the route registered); the extra cases walk every
 * header tab in both themes and open the documentation drawer inside the
 * scope.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describeAppTheme, expectNoLegacyChrome, installDomShims, installDashboardScope, getScopeRoot } from '@/design/testing/themeAssertions';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import StorageTankDesigner from '@/pages/apps/StorageTankDesigner';

const TITLE = 'Storage Tank & Venting Designer';
const SCOPE = 'tank-theme-scope';
const renderApp = () => render(<MemoryRouter><StorageTankDesigner /></MemoryRouter>);

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: TITLE,
  route: '/dashboard/apps/facilities/storage-tank-designer',
  renderApp,
  ready: () => screen.findAllByText(TITLE),
  scopeTestId: SCOPE,
});

describe('Storage Tank & Venting Designer themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('every header tab leaves no legacy colour, in light and in dark', async () => {
    renderApp();
    await screen.findAllByText(TITLE);
    const scope = getScopeRoot(SCOPE);
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') fireEvent.click(screen.getByTestId('theme-toggle'));
      expect(scope).toHaveAttribute('data-pl-theme', theme);
      expectNoLegacyChrome();
      for (const tab of ['Venting', 'Losses', 'Shell']) {
        fireEvent.mouseDown(screen.getByRole('tab', { name: tab }));
        await waitFor(() => expect(screen.getByRole('tab', { name: tab })).toHaveAttribute('data-state', 'active'));
        expectNoLegacyChrome();
      }
    }
  }, 60000);

  it('the documentation drawer carries the scope and stays clean', async () => {
    renderApp();
    await screen.findAllByText(TITLE);
    fireEvent.click(screen.getByTitle('Storage tank documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });
});
