/**
 * Design system rollout batch 5C: Energy & Utilities Efficiency Studio wraps itself in <ThemedApp>.
 * The shared helpers check the standard four (light by default, toggle to
 * dark and back stored per user, no legacy colour outside data-canvas with
 * a negative control, the route registered); the extra cases walk every
 * results tab and open the documentation drawer inside the scope.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describeAppTheme, expectNoLegacyChrome, installDomShims } from '@/design/testing/themeAssertions';

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

import EnergyEfficiencyStudio from '@/pages/apps/EnergyEfficiencyStudio';

const TITLE = 'Energy & Utilities Efficiency Studio';
const renderApp = () => render(<MemoryRouter><EnergyEfficiencyStudio /></MemoryRouter>);
const ready = () => screen.findByRole('heading', { level: 1, name: TITLE });

describeAppTheme({
  name: TITLE,
  route: '/dashboard/apps/midstream-downstream/energy-utilities-efficiency',
  renderApp,
  ready,
  scopeTestId: 'energy-efficiency-theme-scope',
});

describe('Energy & Utilities Efficiency Studio themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('every tab leaves no legacy colour', async () => {
    renderApp();
    await ready();
    expectNoLegacyChrome();
    for (const name of ['Steam, intensity & register', 'Heat integration', 'Combustion & heaters']) {
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

  it('with the refused inputs supplied, the results on every tab stay clean', async () => {
    renderApp();
    await ready();
    fireEvent.change(screen.getByLabelText(/Radiation loss/i), { target: { value: '1.5' } });
    fireEvent.change(screen.getByLabelText(/Minimum safe O2/i), { target: { value: '2' } });
    await screen.findByText(/% efficient on LHV/i);
    for (const name of ['Steam, intensity & register', 'Heat integration', 'Combustion & heaters']) {
      fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });
      await waitFor(() => expect(screen.getByRole('tab', { name })).toHaveAttribute('data-state', 'active'));
      expectNoLegacyChrome();
    }
  }, 60000);
});
