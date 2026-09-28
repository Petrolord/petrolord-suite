/**
 * Design system rollout batch 2F: Decision Tree Builder opts in to the
 * Petrolord theme (the page wraps itself in <ThemedApp>). describeAppTheme
 * checks light by default, the toggle round trip, no legacy console colour
 * and the cold-load registration; the tests below repeat the legacy check
 * with the saved-decisions list and the EPE Monte Carlo picker open, and
 * prove the rolled-back tree draws on the white chart canvas in dark.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => {
  const makeQuery = () => {
    const q = {};
    const chain = () => q;
    ['select', 'eq', 'order', 'limit', 'insert', 'update', 'upsert', 'delete', 'in']
      .forEach((m) => { q[m] = jest.fn(chain); });
    q.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    q.then = (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject);
    return q;
  };
  return {
    supabase: {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
      from: jest.fn(() => makeQuery()),
    },
  };
});

import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import DecisionTreeBuilder from '@/pages/apps/DecisionTreeBuilder';

const renderApp = () => render(<MemoryRouter><DecisionTreeBuilder /></MemoryRouter>);
const ready = () => screen.findByRole('heading', { level: 1, name: 'Decision Tree Builder' });

describeAppTheme({
  name: 'Decision Tree Builder',
  route: '/dashboard/apps/economics/decision-tree-builder',
  renderApp,
  ready,
  scopeTestId: 'dtb-theme-scope',
});

describe('Decision Tree Builder theme, panels and dialog', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('the rolled-back tree sits on the white chart canvas in both themes', async () => {
    renderApp();
    await ready();
    const scope = getScopeRoot('dtb-theme-scope');
    const diagram = screen.getByRole('img', { name: 'Decision tree diagram' });
    expect(diagram.closest('[data-canvas="chart"]')).not.toBeNull();
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    expect(diagram.closest('[data-canvas="chart"]')).not.toBeNull();
    expectNoLegacyChrome();
  });

  it('no legacy colour with the saved list and the Monte Carlo picker open', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Open/ }));
    expect(await screen.findByText('Saved decisions')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Link EPE MC run/ })[0]);
    expect(await screen.findByRole('dialog', { name: 'Link an EPE Monte Carlo run' })).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expectNoLegacyChrome();
  });
});
