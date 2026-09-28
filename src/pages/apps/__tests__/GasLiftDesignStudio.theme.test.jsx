/**
 * Design system rollout batch 2C: Gas Lift Design Studio wraps itself in <ThemedApp>. The shared helpers
 * check the standard four; the extra cases walk every tab, run the
 * performance curve (the white chart and its KPI tiles) and open the help
 * drawer.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describeAppTheme, expectNoLegacyChrome, installDomShims } from '@/design/testing/themeAssertions';

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

import GasLiftDesignStudio from '@/pages/apps/GasLiftDesignStudio';

const TITLE = 'Gas Lift Design Studio';
const renderApp = () => render(<MemoryRouter><GasLiftDesignStudio /></MemoryRouter>);
const openTab = (name) => fireEvent.mouseDown(screen.getByRole('tab', { name }));

describeAppTheme({
  name: TITLE,
  route: '/dashboard/apps/production/gas-lift-design-studio',
  renderApp,
  ready: () => screen.findByText(TITLE),
  scopeTestId: 'gaslift-theme-scope',
});

describe(`${TITLE} themed states`, () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('every tab, and the performance curve result, leave no legacy colour', async () => {
    renderApp();
    await screen.findByText(TITLE);
    expect(await screen.findByText(/Pressure against depth/i)).toBeInTheDocument();
    expectNoLegacyChrome();

    openTab('Unloading');
    await waitFor(() => expect(screen.getByText(/Unloading sequence/i)).toBeInTheDocument());
    expectNoLegacyChrome();

    openTab('Injection Point');
    await waitFor(() => expect(screen.getByText(/Deepest point of injection/i)).toBeInTheDocument());
    expectNoLegacyChrome();

    openTab('Performance');
    fireEvent.click(await screen.findByRole('button', { name: /Run curve/i }));
    await waitFor(() => expect(screen.getByText('Maximum rate')).toBeInTheDocument(), { timeout: 60000 });
    expectNoLegacyChrome();

    openTab('Well Model');
    await waitFor(() => expect(screen.getByText(/Production Spine/i)).toBeInTheDocument());
    expectNoLegacyChrome();
  }, 120000);

  it('the help drawer carries the scope and stays clean', async () => {
    renderApp();
    await screen.findByText(TITLE);
    fireEvent.click(screen.getByTitle('Gas lift documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });
});
