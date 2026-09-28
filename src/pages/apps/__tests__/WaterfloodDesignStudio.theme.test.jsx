/**
 * Design system rollout batch 1D: Waterflood Design Studio wraps itself in
 * <ThemedApp>. The shared helpers check the standard four (light by default,
 * toggle round trip, no legacy console colour outside canvases with a
 * negative control, cold-load registration); the extra cases walk every tab,
 * the surveillance sample (the retired Waterflood Dashboard panels), the
 * alias route and the dialogs.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, expectThemedPath, installDomShims,
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

import WaterfloodDesignStudio from '@/pages/apps/WaterfloodDesignStudio';

const renderApp = () => render(<MemoryRouter><WaterfloodDesignStudio /></MemoryRouter>);

describeAppTheme({
  name: 'Waterflood Design Studio',
  route: '/dashboard/apps/reservoir/waterflood-design-studio',
  renderApp,
  ready: () => screen.findByText('Waterflood Design Studio'),
  scopeTestId: 'wds-theme-scope',
});

describe('Waterflood Design Studio themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('the alias route (retired Fractional Flow slug) is registered too', () => {
    expectThemedPath('/dashboard/apps/reservoir/fractional-flow-calculator');
  });

  it('every tab, including the surveillance sample, leaves no legacy colour', async () => {
    renderApp();
    await screen.findByText('Waterflood Design Studio');
    expectNoLegacyChrome();

    for (const tab of ['Layered Sweep', 'Pattern Forecast', 'Uncertainty']) {
      fireEvent.mouseDown(screen.getByRole('tab', { name: tab }));
      expectNoLegacyChrome();
    }

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Surveillance' }));
    expectNoLegacyChrome();
    fireEvent.click(screen.getByRole('button', { name: /Sample/i }));
    expect(await screen.findByText(/Key Performance Indicators/i)).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Scenarios' }));
    expectNoLegacyChrome();
  }, 30000);

  it('the kr table dialog and the help drawer carry the scope and stay clean', async () => {
    renderApp();
    await screen.findByText('Waterflood Design Studio');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Tabular' }));
    fireEvent.click(screen.getByRole('button', { name: /Paste kr table/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Tabular relative permeability' });
    expect(dialog).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Waterflood Design documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });

  it('the charts keep the white chart standard in dark', async () => {
    const { container } = renderApp();
    await screen.findByText('Waterflood Design Studio');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    const frames = container.querySelectorAll('[data-canvas="chart"]');
    expect(frames.length).toBeGreaterThan(0);
    expect(frames[0].closest('[data-pl-theme]')).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });
});
