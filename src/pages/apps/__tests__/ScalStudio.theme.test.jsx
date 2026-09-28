/**
 * Design system rollout batch 1D: SCAL Studio wraps itself in <ThemedApp>.
 * The shared helpers check the standard four; the extra cases walk every
 * tab (with the lab demo pair loaded) and the help drawer.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

import ScalStudio from '@/pages/apps/ScalStudio';

const renderApp = () => render(<MemoryRouter><ScalStudio /></MemoryRouter>);

describeAppTheme({
  name: 'SCAL Studio',
  route: '/dashboard/apps/reservoir/scal-studio',
  renderApp,
  ready: () => screen.findByText('SCAL Studio'),
  scopeTestId: 'scal-theme-scope',
});

describe('SCAL Studio themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('every tab and the lab demo pair leave no legacy colour', async () => {
    renderApp();
    await screen.findByText('SCAL Studio');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Gas-oil' }));
    expectNoLegacyChrome();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Lab Data' }));
    fireEvent.click(screen.getByRole('button', { name: /Demo pair/i }));
    fireEvent.click(await screen.findByText(/Demo core A/i));
    expect(await screen.findByText(/nw \(fit\)/i)).toBeInTheDocument();
    expectNoLegacyChrome();

    for (const tab of ['Capillary', 'Height & Saturation', 'Export']) {
      fireEvent.mouseDown(screen.getByRole('tab', { name: tab }));
      expectNoLegacyChrome();
    }
  }, 30000);

  it('the help drawer carries the scope and stays clean', async () => {
    renderApp();
    await screen.findByText('SCAL Studio');
    fireEvent.click(screen.getByTitle('SCAL Studio documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });
});
