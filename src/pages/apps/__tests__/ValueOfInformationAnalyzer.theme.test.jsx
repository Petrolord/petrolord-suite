/**
 * Design system rollout batch 2F: Value of Information Analyzer opts in to
 * the Petrolord theme (the page wraps itself in <ThemedApp>).
 * describeAppTheme checks light by default, the toggle round trip, no
 * legacy console colour and the cold-load registration; the tests below
 * repeat the legacy check with the default study analysed (KPI tiles,
 * guidance and the decision tree on its white chart canvas), with the help
 * guide open, and on the withheld state.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import ValueOfInformationAnalyzer from '@/pages/apps/ValueOfInformationAnalyzer';

const renderApp = () => render(<MemoryRouter><ValueOfInformationAnalyzer /></MemoryRouter>);
const ready = () => screen.findByRole('heading', { level: 1, name: 'Value of Information Analyzer' });

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: 'Value of Information Analyzer',
  route: '/dashboard/apps/economics/voi-analyzer',
  renderApp,
  ready,
  scopeTestId: 'voi-theme-scope',
});

describe('Value of Information Analyzer theme, results and help', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('no legacy colour with the default study analysed; the tree stays on white in dark', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Analyze & Simulate/ }));
    await waitFor(() => expect(screen.getByTestId('voi-kpi-netVoi')).toBeInTheDocument());
    expectNoLegacyChrome();
    const scope = getScopeRoot('voi-theme-scope');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    const diagram = screen.getByRole('img', { name: 'Decision tree diagram' });
    expect(diagram.closest('[data-canvas="chart"]')).not.toBeNull();
    expectNoLegacyChrome();
  });

  it('no legacy colour on the withheld state and with the help guide open', async () => {
    renderApp();
    await ready();
    // P(success | positive) 60 to 90 implies a success chance that
    // contradicts the stated 30 percent, so the engine withholds the value.
    const conditional = screen.getAllByRole('spinbutton').find((el) => el.value === '60');
    fireEvent.change(conditional, { target: { value: '90' } });
    const other = screen.getAllByRole('spinbutton').find((el) => el.value === '40' && el !== conditional
      && el.closest('.space-y-2'));
    fireEvent.change(other, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /Analyze & Simulate/ }));
    await waitFor(() => expect(screen.getAllByText('Withheld').length).toBeGreaterThan(0));
    expectNoLegacyChrome();
    fireEvent.click(screen.getByTitle('Documentation'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expectNoLegacyChrome();
  });
});
