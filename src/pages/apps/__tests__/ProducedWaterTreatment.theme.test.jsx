/**
 * Design system rollout batch 5B: Produced Water Treatment Studio wraps itself in <ThemedApp>.
 * The shared helpers check the standard four (light by default, toggle to
 * dark and back stored per user, no legacy colour outside data-canvas with
 * a negative control, the route registered); the extra cases walk every
 * header tab in both themes and open the documentation drawer inside the
 * scope.
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

import ProducedWaterTreatment from '@/pages/apps/ProducedWaterTreatment';

const TITLE = 'Produced Water Treatment Studio';
const SCOPE = 'pwt-theme-scope';
const renderApp = () => render(<MemoryRouter><ProducedWaterTreatment /></MemoryRouter>);

describeAppTheme({
  name: TITLE,
  route: '/dashboard/apps/facilities/produced-water-treatment',
  renderApp,
  ready: () => screen.findAllByText(TITLE),
  scopeTestId: SCOPE,
});

describe('Produced Water Treatment Studio themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('every header tab leaves no legacy colour, in light and in dark', async () => {
    renderApp();
    await screen.findAllByText(TITLE);
    const scope = screen.getByTestId(SCOPE);
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') fireEvent.click(screen.getByTestId('theme-toggle'));
      expect(scope).toHaveAttribute('data-pl-theme', theme);
      expectNoLegacyChrome();
      for (const tab of ['Droplets', 'Treatment Train']) {
        fireEvent.mouseDown(screen.getByRole('tab', { name: tab }));
        await waitFor(() => expect(screen.getByRole('tab', { name: tab })).toHaveAttribute('data-state', 'active'));
        expectNoLegacyChrome();
      }
    }
  }, 60000);

  it('the documentation drawer carries the scope and stays clean', async () => {
    renderApp();
    await screen.findAllByText(TITLE);
    fireEvent.click(screen.getByTitle('Produced water documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });
});
