/**
 * Design system rollout batch 2F: AFE Cost Control Manager opts in to the
 * Petrolord theme (the page wraps itself in <ThemedApp>). describeAppTheme
 * checks light by default, the toggle round trip, no legacy console colour
 * and the cold-load registration; the tests below open an AFE and repeat
 * the legacy check on every tab (dashboard charts stay white in dark; the
 * cost, invoice, change and partner ledgers are NumericTables), on the
 * status filter popover and on the wizard, cost item and invoice dialogs.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => {
  const rows = {
    afes: [{
      id: 'a1', afe_number: 'AFE-26-001', afe_name: 'Ekene-11 drilling', budget: 12000000, currency: 'USD',
      status: 'Approved', class: 'Control', start_date: '2026-01-01', end_date: '2026-12-31', user_id: 'u1',
    }],
    projects: [],
    afe_cost_items: [
      { id: 'c1', afe_id: 'a1', code: 'D1', wbs_code: '1.1', category: 'Drilling', description: 'Rig spread', budget: 6000000, actual: 6600000, progress: 80, vendor: 'Rigco' },
      { id: 'c2', afe_id: 'a1', code: 'C1', wbs_code: '2.1', category: 'Completion', description: 'Completion string', budget: 3000000, actual: 1000000, progress: 30 },
    ],
    afe_invoices: [
      { id: 'i1', afe_id: 'a1', cost_item_id: 'c1', vendor: 'Rigco', invoice_number: 'INV-7', amount: 600000, invoice_date: '2026-03-01', status: 'Received' },
    ],
    afe_changes: [
      { id: 'x1', afe_id: 'a1', description: 'Extra casing run', reason: 'Hole conditions', amount: -250000, status: 'Pending', created_at: '2026-03-02T10:00:00Z' },
    ],
    afe_partners: [
      { id: 'p1', afe_id: 'a1', name: 'Partner A', working_interest: 30, partner_type: 'Non-Operator', created_at: '2026-01-02' },
    ],
  };
  const makeQuery = (table) => {
    const q = {};
    const chain = () => q;
    ['select', 'eq', 'order', 'limit', 'insert', 'update', 'upsert', 'delete', 'in']
      .forEach((m) => { q[m] = jest.fn(chain); });
    q.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    q.single = jest.fn().mockResolvedValue({ data: null, error: null });
    q.then = (resolve, reject) => Promise.resolve({ data: rows[table] || [], error: null }).then(resolve, reject);
    return q;
  };
  return {
    supabase: {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
      from: jest.fn((table) => makeQuery(table)),
    },
  };
});

import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import AfeCostControlManager from '@/pages/apps/AfeCostControlManager';

const USER = { id: 'u1', email: 'tester@example.com' };
const renderApp = () => render(
  <MemoryRouter>
    <AuthContext.Provider value={{ user: USER, session: null, loading: false }}>
      <AfeCostControlManager />
    </AuthContext.Provider>
  </MemoryRouter>,
);
const ready = () => screen.findByText('AFE-26-001');

describeAppTheme({
  name: 'AFE Cost Control Manager',
  route: '/dashboard/apps/economics/afe-cost-control',
  renderApp,
  ready,
  scopeTestId: 'afe-theme-scope',
  userId: 'u1',
});

describe('AFE Cost Control Manager theme, tabs and dialogs', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  const tab = (name) => {
    const t = screen.getByRole('tab', { name: new RegExp(name) });
    fireEvent.mouseDown(t);
    fireEvent.click(t);
  };

  it('every tab of an open AFE is themed; the dashboard charts stay white in dark', async () => {
    renderApp();
    fireEvent.click(await ready());
    expect(await screen.findByText('Cumulative Spend (S-Curve)')).toBeInTheDocument();
    const scope = getScopeRoot('afe-theme-scope');
    expect(scope.querySelectorAll('[data-canvas="chart"]').length).toBe(3);
    expectNoLegacyChrome();

    for (const [name, marker, row] of [
      ['Cost Breakdown', 'afe-cost-table', 'Rig spread'],
      ['Invoices', 'afe-invoice-table', 'INV-7'],
      ['Changes', 'afe-changes-table', 'Extra casing run'],
      ['Partners', 'afe-partner-table', 'Partner A'],
    ]) {
      tab(name);
      const table = await screen.findByTestId(marker);
      expect(await within(table).findByText(row)).toBeInTheDocument();
      expectNoLegacyChrome();
    }
    tab('Reports');
    expect(await screen.findByText('Reporting Engine')).toBeInTheDocument();
    expectNoLegacyChrome();
    tab('Integrations');
    expect(await screen.findByText('No integrations are connected')).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });

  it('a negative change reads in the danger text beside its minus sign', async () => {
    renderApp();
    fireEvent.click(await ready());
    tab('Changes');
    const table = await screen.findByTestId('afe-changes-table');
    const cell = await within(table).findByText('-250,000');
    expect(cell).toHaveClass('text-pl-danger-text');
  });

  it('no legacy colour on the filter popover and the wizard, cost item and invoice dialogs', async () => {
    renderApp();
    fireEvent.click(await ready());
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    expect(await screen.findByLabelText('Approved')).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.keyDown(document.activeElement || document.body, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: /New AFE/ }));
    expect(await screen.findByText(/Create New AFE - Step 1 of 3/)).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    tab('Cost Breakdown');
    fireEvent.click(await screen.findByRole('button', { name: /Add Item/ }));
    expect(await screen.findByText('New Cost Item')).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    tab('Invoices');
    fireEvent.click(await screen.findByRole('button', { name: /Log Invoice/ }));
    expect(await screen.findByText('Log New Invoice')).toBeInTheDocument();
    expectNoLegacyChrome();
  });
});
