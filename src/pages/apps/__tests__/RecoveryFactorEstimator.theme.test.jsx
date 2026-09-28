/**
 * Design system rollout batch 2A: Recovery Factor Estimator opts in to the
 * Petrolord theme (the page wraps itself in <ThemedApp>). describeAppTheme
 * checks light by default, the toggle round trip, no legacy console colour
 * and the cold-load registration; the walk below repeats the legacy check
 * for the gas phase with a correlation method open, direct entry, the help
 * drawer and the new-project dialog, and confirms the reserves chart keeps
 * the white chart standard in dark.
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
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import RecoveryFactorEstimator from '@/pages/apps/RecoveryFactorEstimator';

const renderApp = () => render(<MemoryRouter><RecoveryFactorEstimator /></MemoryRouter>);
const ready = () => screen.findByText('Recovery Factor Estimator');

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: 'Recovery Factor Estimator',
  route: '/dashboard/apps/reservoir/recovery-factor-estimator',
  renderApp,
  ready,
  scopeTestId: 'rf-theme-scope',
});

describe('Recovery Factor Estimator theme, inputs and overlays', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('no legacy colour for gas with a correlation method, and for direct entry', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'gas' }));
    fireEvent.click(screen.getByRole('button', { name: /p\/z depletion/i }));
    expect(screen.getByText(/Initial pi \(psia\)/i)).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.click(screen.getByRole('button', { name: /Enter directly/i }));
    fireEvent.change(screen.getByPlaceholderText('scf'), { target: { value: '5e10' } });
    expectNoLegacyChrome();
  });

  it('the help drawer and the new-project dialog carry the scope', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByTitle('Recovery Factor documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
    fireEvent.keyDown(drawer, { key: 'Escape' });

    fireEvent.click(screen.getByTitle('Create new project'));
    const create = await screen.findByRole('dialog');
    expect(create).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });

  it('the reserves chart keeps the white chart standard in dark', async () => {
    renderApp();
    await ready();
    const scope = getScopeRoot('rf-theme-scope');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    const frame = scope.querySelector('[data-canvas="chart"]');
    expect(frame).not.toBeNull();
    expect(frame.className).toMatch(/\bbg-white\b/);
    expectNoLegacyChrome();
  });
});
