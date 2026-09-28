/**
 * Design system rollout batch 5C: Fuel Pricing & Supply Chain Studio wraps itself in <ThemedApp>.
 * The shared helpers check the standard four (light by default, toggle to
 * dark and back stored per user, no legacy colour outside data-canvas with
 * a negative control, the route registered); the extra cases walk every
 * results tab and open the documentation drawer inside the scope.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describeAppTheme, expectNoLegacyChrome, installDomShims, installDashboardScope } from '@/design/testing/themeAssertions';

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

import FuelPricingStudio from '@/pages/apps/FuelPricingStudio';

const TITLE = 'Fuel Pricing & Supply Chain Studio';
const renderApp = () => render(<MemoryRouter><FuelPricingStudio /></MemoryRouter>);
const ready = () => screen.findByRole('heading', { level: 1, name: TITLE });

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: TITLE,
  route: '/dashboard/apps/midstream-downstream/fuel-pricing-supply-chain',
  renderApp,
  ready,
  scopeTestId: 'fuel-pricing-theme-scope',
});

describe('Fuel Pricing & Supply Chain Studio themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('every tab leaves no legacy colour', async () => {
    renderApp();
    await ready();
    expectNoLegacyChrome();
    for (const name of ['Lane, fleet & station', 'Landed cost & pump price']) {
      fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });
      await waitFor(() => expect(screen.getByRole('tab', { name })).toHaveAttribute('data-state', 'active'));
      expectNoLegacyChrome();
    }
  }, 60000);

  it('the documentation drawer carries the scope and stays clean', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByTitle('Documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });

  it('every rate supplied, and a cap below the chain, keep the ledgers and status boxes clean', async () => {
    renderApp();
    await ready();
    await screen.findByText('Import charges');
    screen.getAllByLabelText(/ rate$/).forEach((el) => fireEvent.change(el, { target: { value: '1' } }));
    expect(await screen.findByText('Every rate supplied.')).toBeInTheDocument();
    const landed = screen.getByTestId('landed-cost-table');
    expect(landed.querySelector('th[scope="row"]')).not.toBeNull();
    expect(screen.getByTestId('pump-build-up-table')).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.change(screen.getByLabelText(/Regulated cap/i), { target: { value: '0.01' } });
    expect(await screen.findByText(/below what the chain costs/i)).toBeInTheDocument();
    expectNoLegacyChrome();
  }, 60000);
});
