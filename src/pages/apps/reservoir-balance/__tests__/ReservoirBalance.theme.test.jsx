/**
 * Design system rollout batch 1A: Material Balance Studio opts in to the
 * Petrolord theme (the page wraps itself in <ThemedApp>). The shared
 * describeAppTheme block checks the empty studio: light by default, the
 * toggle round trip, no legacy console colour and the cold-load
 * registration. The walk below opens the seeded Ahmed Example 11-3 case on
 * the dev harness (in-memory rb_* tables, engine in the browser), runs the
 * material balance and repeats the legacy check on every tab, the aquifer
 * and run segments, the help drawer and the case dialog; the plot cards
 * keep the white chart standard in dark.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => {
  const empty = () => {
    const q = {
      select: () => q, eq: () => q, is: () => q, in: () => q, neq: () => q, order: () => q, limit: () => q,
      insert: () => q, upsert: () => q, update: () => q, delete: () => q,
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej),
    };
    return q;
  };
  const supabase = {
    from: empty,
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  };
  // The harness shadows `functions` with its own getter while mounted.
  Object.defineProperty(supabase, 'functions', {
    configurable: true,
    get: () => ({ invoke: async () => ({ data: null, error: { message: 'not mocked' } }) }),
  });
  return { supabase, customSupabaseClient: supabase, default: supabase };
});

import {
  describeAppTheme, expectNoLegacyChrome, expectThemedPath, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import ReservoirBalance from '@/pages/apps/reservoir-balance/ReservoirBalance';
import MbalHarness from '@/pages/apps/reservoir-balance/harness/MbalHarness';

describeAppTheme({
  name: 'Material Balance Studio',
  route: '/dashboard/apps/reservoir/material-balance-studio',
  renderApp: () => render(<MemoryRouter><ReservoirBalance /></MemoryRouter>),
  ready: () => screen.findByText('No case open'),
  scopeTestId: 'mbal-theme-scope',
});

const CASE = '/dev/material-balance-studio/cases/case-ahmed-11-3';
const renderCase = () => render(
  <MemoryRouter initialEntries={[CASE]}>
    <Routes>
      <Route path="/dev/material-balance-studio" element={<MbalHarness />} />
      <Route path="/dev/material-balance-studio/cases/:caseId" element={<MbalHarness />} />
    </Routes>
  </MemoryRouter>,
);
const openTab = (name) => fireEvent.mouseDown(screen.getByRole('tab', { name }));

describe('Material Balance Studio theme, the seeded case on every tab', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('every App.jsx slug of the studio is registered for the cold-load loaders', () => {
    [
      '/dashboard/apps/reservoir/material-balance-studio/cases/42',
      '/dashboard/apps/reservoir/reservoir-balance',
      '/dashboard/apps/reservoir/reservoir-balance/cases/42',
      '/dashboard/apps/reservoir/reservoir-balance-pro',
      '/dashboard/apps/reservoir/reservoir-balance-surveillance/cases/42',
    ].forEach(expectThemedPath);
  });

  it('no legacy colour across the tabs, before and after a run', async () => {
    renderCase();
    expect((await screen.findAllByText(/Ahmed Example 11-3/)).length).toBeGreaterThan(0);
    await screen.findByText('Data Hub');
    expectNoLegacyChrome();

    openTab('PVT');
    expect(await screen.findByText('PVT & Rock Properties')).toBeInTheDocument();
    expectNoLegacyChrome();

    openTab('Aquifer');
    expect(await screen.findByText('Aquifer model')).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.click(screen.getByRole('button', { name: 'Screening' }));
    expect(screen.getByRole('button', { name: 'Screening' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Aquifer parameters')).toBeInTheDocument();
    expectNoLegacyChrome();

    openTab('Run');
    fireEvent.click(await screen.findByRole('button', { name: /Run MBAL/i }));
    expect(await screen.findByText('Latest result', {}, { timeout: 10000 })).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.click(screen.getByRole('button', { name: 'History match' }));
    expectNoLegacyChrome();

    openTab('Plots');
    expect(await screen.findByText('Diagnostic Plots')).toBeInTheDocument();
    expect((await screen.findAllByText(/Havlena-Odeh/)).length).toBeGreaterThan(0);
    expectNoLegacyChrome();

    openTab('Forecast');
    await screen.findAllByText(/Forecast/);
    expectNoLegacyChrome();
    openTab('Contacts');
    await screen.findAllByText(/Contact/);
    expectNoLegacyChrome();
    openTab('Report');
    await screen.findAllByText(/Report/);
    expectNoLegacyChrome();
  }, 60000);

  it('the help drawer and the edit-case dialog carry the scope', async () => {
    renderCase();
    await screen.findByText('Data Hub');
    fireEvent.click(screen.getByTitle('Material Balance documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
    fireEvent.keyDown(drawer, { key: 'Escape' });

    fireEvent.click(screen.getByTestId('mbal-edit-case'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('data-pl-theme', 'light');
    expect(within(dialog).getAllByRole('textbox').length).toBeGreaterThan(0);
    expectNoLegacyChrome();
  }, 30000);

  it('the plot cards keep the white chart standard in dark', async () => {
    renderCase();
    await screen.findByText('Data Hub');
    const scope = getScopeRoot('mbal-theme-scope');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    openTab('Run');
    fireEvent.click(await screen.findByRole('button', { name: /Run MBAL/i }));
    await screen.findByText('Latest result', {}, { timeout: 10000 });
    openTab('Plots');
    await screen.findByText('Diagnostic Plots');
    const cards = [...scope.querySelectorAll('[data-canvas="chart"]')];
    expect(cards.length).toBeGreaterThan(0);
    cards.forEach((c) => expect(c.closest('[data-pl-theme]')).toHaveAttribute('data-pl-theme', 'dark'));
    expect(cards.some((c) => /\bbg-pl-chart-surface\b/.test(c.className))).toBe(true);
    expectNoLegacyChrome();
  }, 60000);
});
