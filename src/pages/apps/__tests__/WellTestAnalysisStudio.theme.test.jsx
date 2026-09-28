/**
 * Design system rollout batch 1A: Well Test Analysis Studio opts in to the
 * Petrolord theme (the page wraps itself in <ThemedApp>). The shared
 * describeAppTheme block checks light by default, the toggle round trip, no
 * legacy console colour and the cold-load registration of both slugs; the
 * walk below repeats the legacy check on every tab with the sample buildup
 * loaded, in the help drawer and the new-project dialog, and confirms the
 * charts keep the white chart standard in dark.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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

import {
  describeAppTheme, expectNoLegacyChrome, expectThemedPath, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import WellTestAnalysisStudio from '@/pages/apps/WellTestAnalysisStudio';

const renderApp = () => render(<MemoryRouter><WellTestAnalysisStudio /></MemoryRouter>);
const ready = () => screen.findByText('Well Test Analysis Studio');

describeAppTheme({
  name: 'Well Test Analysis Studio',
  route: '/dashboard/apps/reservoir/well-test-analysis-studio',
  renderApp,
  ready,
  scopeTestId: 'wts-theme-scope',
});

describe('Well Test Analysis Studio theme, every tab and overlay', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('the retired-mock slug is registered too', () => {
    expectThemedPath('/dashboard/apps/reservoir/well-test-analyzer');
  });

  it('no legacy colour on any tab with the sample buildup loaded', async () => {
    renderApp();
    await ready();
    expectNoLegacyChrome();
    fireEvent.click(screen.getByRole('button', { name: /Sample/i }));
    expect(await screen.findByText(/Points used/i)).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Diagnostics' }));
    expect((await screen.findAllByText(/decades\)/)).length).toBeGreaterThan(0);
    expectNoLegacyChrome();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Match' }));
    expect(await screen.findByRole('button', { name: /Auto-fit model/i })).toBeEnabled();
    expectNoLegacyChrome();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Specialized' }));
    expect(await screen.findByText(/Horner plot/i)).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'RTA' }));
    expect((await screen.findAllByText(/No production data loaded/i)).length).toBeGreaterThan(0);
    expectNoLegacyChrome();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Report' }));
    expect(await screen.findByText(/Straight-line analyses/i)).toBeInTheDocument();
    expectNoLegacyChrome();
  }, 30000);

  it('the help drawer and the new-project dialog carry the scope', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByTitle('Well Test Analysis documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
    fireEvent.keyDown(drawer, { key: 'Escape' });

    fireEvent.click(screen.getByTitle('Create new project'));
    const create = await screen.findByRole('dialog');
    expect(create).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });

  it('the charts keep the white chart standard in dark', async () => {
    renderApp();
    await ready();
    const scope = getScopeRoot('wts-theme-scope');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    fireEvent.click(screen.getByRole('button', { name: /Sample/i }));
    await screen.findByText(/Points used/i);
    const frame = scope.querySelector('[data-canvas="chart"]');
    expect(frame).not.toBeNull();
    expect(frame.className).toMatch(/\bbg-white\b/);
    expectNoLegacyChrome();
  });
});
