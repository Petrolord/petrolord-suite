/**
 * Design system rollout batch 2C: Rod Pump Design Studio wraps itself in <ThemedApp>. The shared helpers
 * check the standard four; the extra cases walk every tab, run the speed
 * sweep, diagnose the design's own predicted card and open the help
 * drawer.
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

import RodPumpDesignStudio from '@/pages/apps/RodPumpDesignStudio';

const TITLE = 'Rod Pump Design Studio';
const renderApp = () => render(<MemoryRouter><RodPumpDesignStudio /></MemoryRouter>);
const openTab = (name) => fireEvent.mouseDown(screen.getByRole('tab', { name }));

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: TITLE,
  route: '/dashboard/apps/production/rod-pump-design-studio',
  renderApp,
  ready: () => screen.findByText(TITLE),
  scopeTestId: 'rodpump-theme-scope',
});

describe(`${TITLE} themed states`, () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('every tab, the speed sweep and a diagnosis leave no legacy colour', async () => {
    renderApp();
    await screen.findByText(TITLE);
    expect(await screen.findByText(/What the plunger lifts/i)).toBeInTheDocument();
    expectNoLegacyChrome();

    openTab('Dyno Cards');
    await waitFor(() => expect(screen.getByText(/Downhole card/i)).toBeInTheDocument());
    expectNoLegacyChrome();

    openTab('Rod String');
    await waitFor(() => expect(screen.getByText(/The taper, section by section/i)).toBeInTheDocument());
    expectNoLegacyChrome();

    openTab('Performance');
    fireEvent.click(await screen.findByRole('button', { name: /Run sweep/i }));
    await waitFor(() => expect(screen.getByText('Speed (spm)')).toBeInTheDocument(), { timeout: 90000 });
    expectNoLegacyChrome();

    openTab('Diagnostics');
    fireEvent.click(await screen.findByRole('button', { name: /Load the predicted card/i }));
    expectNoLegacyChrome();

    openTab('Well Model');
    await waitFor(() => expect(screen.getByText(/^Trajectory$/i)).toBeInTheDocument());
    expectNoLegacyChrome();
  }, 180000);

  it('the help drawer carries the scope and stays clean', async () => {
    renderApp();
    await screen.findByText(TITLE);
    fireEvent.click(screen.getByTitle('Rod pump documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });
});
