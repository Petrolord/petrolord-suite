/**
 * Design system rollout batch 2C: ESP Design Studio wraps itself in <ThemedApp>. The shared helpers check
 * the standard four; the extra cases walk every tab, run the system curve
 * (the operating point tiles) and open the help drawer.
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
jest.mock('@/lib/productionSpine', () => ({
  listFields: jest.fn().mockResolvedValue([]),
  listPoWells: jest.fn().mockResolvedValue([]),
  listFieldWellTests: jest.fn().mockResolvedValue([]),
  getWellModel: jest.fn().mockResolvedValue(null),
  upsertWellModel: jest.fn().mockResolvedValue({}),
}));

import EspDesignStudio from '@/pages/apps/EspDesignStudio';

const TITLE = 'ESP Design Studio';
const renderApp = () => render(<MemoryRouter><EspDesignStudio /></MemoryRouter>);
const openTab = (name) => fireEvent.mouseDown(screen.getByRole('tab', { name }));

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: TITLE,
  route: '/dashboard/apps/production/esp-design-studio',
  renderApp,
  ready: () => screen.findByText(TITLE),
  scopeTestId: 'esp-theme-scope',
});

describe(`${TITLE} themed states`, () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('every tab, and the system curve result, leave no legacy colour', async () => {
    renderApp();
    await screen.findByText(TITLE);
    expect((await screen.findAllByText(/Total dynamic head/i)).length).toBeGreaterThan(0);
    expectNoLegacyChrome();

    openTab('Pump Curve');
    await waitFor(() => expect(screen.getByText(/The duty on the stage curve/i)).toBeInTheDocument());
    expectNoLegacyChrome();

    openTab('Performance');
    fireEvent.click(await screen.findByRole('button', { name: /Run system curve/i }));
    await waitFor(() => expect(screen.getByText('Settles at')).toBeInTheDocument(), { timeout: 60000 });
    expectNoLegacyChrome();

    openTab('Electrical');
    await waitFor(() => expect(screen.getByText(/Cable candidates/i)).toBeInTheDocument());
    expectNoLegacyChrome();

    openTab('Diagnostics');
    await waitFor(() => expect(screen.getByText(/What the installation is doing/i)).toBeInTheDocument());
    expectNoLegacyChrome();

    openTab('Well Model');
    await waitFor(() => expect(screen.getByText(/^Trajectory$/i)).toBeInTheDocument());
    expectNoLegacyChrome();
  }, 120000);

  it('the help drawer carries the scope and stays clean', async () => {
    renderApp();
    await screen.findByText(TITLE);
    fireEvent.click(screen.getByTitle('ESP documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });
});
