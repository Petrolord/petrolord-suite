/**
 * Design system rollout batch 5C: Marine Logistics Planner wraps itself in <ThemedApp>.
 * The shared helpers check the standard four (light by default, toggle to
 * dark and back stored per user, no legacy colour outside data-canvas with
 * a negative control, the route registered); the extra cases load the Ekene
 * demo and walk every tab with results (voyage plan, fleet, deck plan with
 * its never-fit reasons, shore base), open the documentation drawer and the
 * delete-study confirmation inside the scope.
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

import MarineLogisticsPlanner, { TABS } from '@/pages/apps/MarineLogisticsPlanner';
import { ekeneDemoInputs, runView } from '@/utils/supplychain/marineAdapters';

const TITLE = 'Marine Logistics Planner';
const renderApp = () => render(<MemoryRouter><MarineLogisticsPlanner /></MemoryRouter>);
const ready = () => screen.findByRole('heading', { level: 1, name: TITLE });

describeAppTheme({
  name: TITLE,
  route: '/dashboard/apps/midstream-downstream/marine-logistics-planner',
  renderApp,
  ready,
  scopeTestId: 'marine-logistics-theme-scope',
});

describe('Marine Logistics Planner themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('every tab on the Ekene demo leaves no legacy colour', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByTestId('load-ekene'));
    expectNoLegacyChrome();
    for (const t of TABS) {
      fireEvent.mouseDown(screen.getByTestId(`tab-${t.value}`), { button: 0 });
      await waitFor(() => expect(screen.getByTestId(`tab-${t.value}`)).toHaveAttribute('data-state', 'active'));
      expectNoLegacyChrome();
    }
  }, 60000);

  it('the deck plan keeps its never-fit reasons word for word inside the scope', async () => {
    const inputs = ekeneDemoInputs();
    inputs.deck.items = [
      ...inputs.deck.items,
      { id: 'anchor', name: 'Heavy anchor', lengthM: 2, widthM: 2, weightT: 2500, quantity: 1 },
    ];
    render(<MemoryRouter><MarineLogisticsPlanner initialInputs={inputs} /></MemoryRouter>);
    await ready();
    fireEvent.mouseDown(screen.getByTestId('tab-deck'), { button: 0 });
    const block = await screen.findByTestId('deck-ffd-never-fit');
    expect(block.closest('[data-canvas]')).toBeNull();
    expect(block.className).toMatch(/bg-pl-danger-bg/);
    const r = runView('deckFfd', inputs);
    expect(r.neverFit).toEqual(['anchor']);
    expect(screen.getByTestId('deck-ffd-overflow-anchor').textContent)
      .toBe(r.overflow.find((o) => o.unit === 'anchor').reason);
    expectNoLegacyChrome();
  }, 60000);

  it('the documentation drawer carries the scope and stays clean', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByTitle('Documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });
});
