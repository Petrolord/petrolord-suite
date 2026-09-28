/**
 * Design system rollout batch 5A: Heat Exchanger & Cooling Studio wraps itself in <ThemedApp>.
 * The shared helpers check the standard four (light by default, toggle to
 * dark and back stored per user, no legacy colour outside data-canvas with
 * a negative control, the route registered); the extra cases walk every
 * header tab and open the documentation drawer inside the scope.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describeAppTheme, expectNoLegacyChrome, installDomShims, installDashboardScope } from '@/design/testing/themeAssertions';

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

import HeatExchangerSizer from '@/pages/apps/HeatExchangerSizer';

const TITLE = 'Heat Exchanger & Cooling Studio';
const renderApp = () => render(<MemoryRouter><HeatExchangerSizer /></MemoryRouter>);

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: TITLE,
  route: '/dashboard/apps/facilities/heat-exchanger-sizer',
  renderApp,
  ready: () => screen.findAllByText(TITLE),
  scopeTestId: 'heatexchanger-theme-scope',
});

describe('Heat Exchanger & Cooling Studio themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('every header tab leaves no legacy colour', async () => {
    renderApp();
    await screen.findAllByText(TITLE);
    expectNoLegacyChrome();
    for (const tab of ['Rating', 'Air Cooler', 'Sizing']) {
      fireEvent.mouseDown(screen.getByRole('tab', { name: tab }));
      await waitFor(() => expect(screen.getByRole('tab', { name: tab })).toHaveAttribute('data-state', 'active'));
      expectNoLegacyChrome();
    }
  }, 60000);

  it('the documentation drawer carries the scope and stays clean', async () => {
    renderApp();
    await screen.findAllByText(TITLE);
    fireEvent.click(screen.getByTitle('Heat exchanger documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });
});
