/**
 * Design system rollout batch 5C: Refinery Planning & Scheduling Studio wraps itself in <ThemedApp>.
 * The shared helpers check the standard four (light by default, toggle to
 * dark and back stored per user, no legacy colour outside data-canvas with
 * a negative control, the route registered); the extra cases walk every
 * results tab and open the documentation drawer inside the scope.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

import RefineryPlanningStudio from '@/pages/apps/RefineryPlanningStudio';

const TITLE = 'Refinery Planning & Scheduling Studio';
const renderApp = () => render(<MemoryRouter><RefineryPlanningStudio /></MemoryRouter>);
const ready = () => screen.findByRole('heading', { level: 1, name: TITLE });

describeAppTheme({
  name: TITLE,
  route: '/dashboard/apps/midstream-downstream/refinery-planning-scheduling',
  renderApp,
  ready,
  scopeTestId: 'refinery-planning-theme-scope',
});

describe('Refinery Planning & Scheduling Studio themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('every tab leaves no legacy colour', async () => {
    renderApp();
    await ready();
    expectNoLegacyChrome();
    for (const name of ['Schedule', 'Actuals & variance', 'Plan']) {
      fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });
      await waitFor(() => expect(screen.getByRole('tab', { name })).toHaveAttribute('data-state', 'active'));
      expectNoLegacyChrome();
    }
  }, 60000);

  it('the documentation drawer carries the scope and stays clean', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByTitle('Documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });

  it('a recorded actual shows the variance ledger as a NumericTable, still clean', async () => {
    renderApp();
    await ready();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Actuals & variance' }), { button: 0 });
    const card = (await screen.findByText('Record what happened')).closest('div');
    const [material] = within(card).getAllByRole('combobox');
    fireEvent.click(material);
    fireEvent.keyDown(material, { key: 'ArrowDown' });
    const listbox = await screen.findByRole('listbox');
    expect(listbox.closest('[data-pl-theme]')).toHaveAttribute('data-pl-theme', 'light');
    fireEvent.click(screen.getAllByRole('option')[0]);
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    const numbers = within(card).getAllByRole('spinbutton');
    fireEvent.change(numbers[0], { target: { value: '1000' } });
    fireEvent.change(numbers[1], { target: { value: '50000' } });
    fireEvent.click(within(card).getByRole('button', { name: /Record/ }));
    const table = await screen.findByTestId('variance-table');
    expect(table.querySelector('th[scope="row"]')).not.toBeNull();
    expectNoLegacyChrome();
  }, 60000);
});
