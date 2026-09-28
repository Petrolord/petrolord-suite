/**
 * Design system rollout batch 2C: Artificial Lift Advisor wraps itself in <ThemedApp>. The shared helpers
 * check the standard four; the extra cases run the design pass (the method
 * cards with their figures and verdicts), walk the Well Model tab, open the
 * help drawer, and check the alias route is registered too.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, expectThemedPath, installDomShims,
  installDashboardScope,
} from '@/design/testing/themeAssertions';

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

import ArtificialLiftAdvisor from '@/pages/apps/ArtificialLiftAdvisor';

const TITLE = 'Artificial Lift Advisor';
const renderApp = () => render(<MemoryRouter><ArtificialLiftAdvisor /></MemoryRouter>);
const openTab = (name) => fireEvent.mouseDown(screen.getByRole('tab', { name }));

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: TITLE,
  route: '/dashboard/apps/production/artificial-lift-advisor',
  renderApp,
  ready: () => screen.findByText(TITLE),
  scopeTestId: 'liftadvisor-theme-scope',
});

describe(`${TITLE} themed states`, () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('the screening, the design pass and the Well Model tab leave no legacy colour', async () => {
    renderApp();
    await screen.findByText(TITLE);
    expect(await screen.findByText(/Every method, on this one well/i)).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.click(screen.getByRole('button', { name: /Design them all/i }));
    await waitFor(() => expect(screen.getAllByText(/Designed with:/i).length).toBeGreaterThan(0), { timeout: 120000 });
    expectNoLegacyChrome();

    openTab('Well Model');
    await waitFor(() => expect(screen.getByText(/^Trajectory$/i)).toBeInTheDocument());
    expectNoLegacyChrome();
  }, 180000);

  it('the artificial-lift-designer alias route is themed too', () => {
    expectThemedPath('/dashboard/apps/production/artificial-lift-designer');
  });

  it('the help drawer carries the scope and stays clean', async () => {
    renderApp();
    await screen.findByText(TITLE);
    fireEvent.click(screen.getByTitle('Advisor documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });
});
