/**
 * Design system rollout batch 2D: Gas Well Performance Studio wraps itself in <ThemedApp>.
 * The shared helpers check the standard four (light by default, toggle to
 * dark and back stored per user, no legacy colour outside data-canvas with
 * a negative control, the route registered); the extra cases walk every
 * header tab and open the documentation drawer inside the scope.
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

import GasWellPerformanceStudio from '@/pages/apps/GasWellPerformanceStudio';

const TITLE = 'Gas Well Performance Studio';
const renderApp = () => render(<MemoryRouter><GasWellPerformanceStudio /></MemoryRouter>);

describeAppTheme({
  name: TITLE,
  route: '/dashboard/apps/production/gas-well-performance-studio',
  renderApp,
  ready: () => screen.findAllByText(TITLE),
  scopeTestId: 'gaswell-theme-scope',
});

describe('Gas Well Performance Studio themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('every header tab leaves no legacy colour', async () => {
    renderApp();
    await screen.findAllByText(TITLE);
    expectNoLegacyChrome();
    for (const tab of ['Liquid Loading', 'Forecast', 'Plunger Lift', 'Well Model', 'Deliverability']) {
      fireEvent.mouseDown(screen.getByRole('tab', { name: tab }));
      await waitFor(() => expect(screen.getByRole('tab', { name: tab })).toHaveAttribute('data-state', 'active'));
      expectNoLegacyChrome();
    }
  }, 60000);

  it('the documentation drawer carries the scope and stays clean', async () => {
    renderApp();
    await screen.findAllByText(TITLE);
    fireEvent.click(screen.getByTitle('Gas well documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });
});
