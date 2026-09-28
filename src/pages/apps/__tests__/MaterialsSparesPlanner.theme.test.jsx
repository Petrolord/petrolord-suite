/**
 * Design system rollout batch 5D: Materials & Spares Planner wraps itself in <ThemedApp>.
 * The shared helpers check the standard four (light by default, toggle to
 * dark and back stored per user, no legacy colour outside data-canvas with
 * a negative control, the route registered); the extra cases walk
 * every tab, blank (engine refusals) and on the Ekene demo (results and charts) in both themes and open the documentation drawer and the
 * new-study dialog inside the scope.
 */
import React from 'react';
import '@testing-library/jest-dom';
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

import MaterialsSparesPlanner from '@/pages/apps/MaterialsSparesPlanner';
import { ekeneDemoInputs } from '@/utils/supplychain/materialsAdapters';

const TITLE = 'Materials & Spares Planner';
const SCOPE = 'materials-theme-scope';
const TABS = ['Criticality & ABC', 'EOQ & discounts', 'Safety stock', 'Insurance spares', 'Lead-time risk', 'Slow-moving', 'Register'];
const renderApp = (props = {}) => render(<MemoryRouter><MaterialsSparesPlanner {...props} /></MemoryRouter>);

describeAppTheme({
  name: TITLE,
  route: '/dashboard/apps/midstream-downstream/materials-spares-planner',
  renderApp: () => renderApp(),
  ready: () => screen.findAllByText(TITLE),
  scopeTestId: SCOPE,
});

describe(`${TITLE} themed states`, () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('every tab leaves no legacy colour, in light and in dark', async () => {
    renderApp();
    await screen.findAllByText(TITLE);
    const scope = screen.getByTestId(SCOPE);
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') fireEvent.click(screen.getByTestId('theme-toggle'));
      expect(scope).toHaveAttribute('data-pl-theme', theme);
      expectNoLegacyChrome();
      for (const tab of TABS) {
        fireEvent.mouseDown(screen.getByRole('tab', { name: tab }), { button: 0 });
        await waitFor(() => expect(screen.getByRole('tab', { name: tab })).toHaveAttribute('data-state', 'active'));
        expectNoLegacyChrome();
      }
    }
  }, 60000);

  it('on the Ekene demo every tab (results, ledgers and charts) leaves no legacy colour, in light and in dark', async () => {
    renderApp({ initialInputs: ekeneDemoInputs() });
    await screen.findAllByText(TITLE);
    await screen.findByTestId('register-grid');
    const scope = screen.getByTestId(SCOPE);
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') fireEvent.click(screen.getByTestId('theme-toggle'));
      expect(scope).toHaveAttribute('data-pl-theme', theme);
      expectNoLegacyChrome();
      for (const tab of TABS) {
        fireEvent.mouseDown(screen.getByRole('tab', { name: tab }), { button: 0 });
        await waitFor(() => expect(screen.getByRole('tab', { name: tab })).toHaveAttribute('data-state', 'active'));
        expectNoLegacyChrome();
      }
    }
  }, 90000);

  it('the charts sit on the white chart canvas', async () => {
    renderApp({ initialInputs: ekeneDemoInputs() });
    await screen.findAllByText(TITLE);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Criticality & ABC' }), { button: 0 });
    await screen.findByTestId('abc-results');
    const canvases = document.querySelectorAll('[data-canvas="chart"]');
    expect(canvases.length).toBeGreaterThan(0);
  });

  it('the documentation drawer carries the scope and stays clean', async () => {
    renderApp();
    await screen.findAllByText(TITLE);
    fireEvent.click(screen.getByTitle('Documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });

  it('the new-study dialog carries the scope and stays clean in dark', async () => {
    renderApp();
    await screen.findAllByText(TITLE);
    fireEvent.click(screen.getByTestId('theme-toggle'));
    fireEvent.click(screen.getByTitle('Create new saved study'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });
});
