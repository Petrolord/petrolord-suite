/**
 * Design system rollout batch 3F: the organisation data and admin pages
 * (data export, audit logs, teams, bulk import, app analytics) and the two
 * quote pages (quote dashboard, get quote) wrap themselves in <ThemedApp>.
 * describeAppTheme checks each page; the extra cases open the dialogs and
 * the later configurator steps. Supabase is a stand-in (accountTestKit), so
 * nothing reaches a network, Paystack, Stripe or a database.
 */
import '@testing-library/jest-dom';
import { screen, fireEvent, within } from '@testing-library/react';

jest.mock('@/lib/customSupabaseClient', () => {
  const { makeSupabase } = require('./accountTestKit');
  return {
    supabase: makeSupabase({
      org_export_jobs: [
        { id: 'j1', status: 'completed', created_at: '2026-09-20T10:00:00Z', total_rows: 1200, blob_count: 2, blob_bytes: 2048, expires_at: '2099-01-01T00:00:00Z', file_path: 'x.zip' },
        { id: 'j2', status: 'failed', created_at: '2026-09-19T10:00:00Z', error_message: 'Timed out' },
      ],
      org_closure_requests: [],
      organizations: [{ name: 'Test Org' }],
      organization_audit_logs: [
        { id: 'l1', created_at: '2026-09-20T10:00:00Z', action: 'member.invited', actor_id: 'abcdef123456', resource_type: 'invitation', details: { email: 'x@example.com' }, ip_address: '10.0.0.1', user_agent: 'jest' },
      ],
      organization_members: [
        { id: 'm1', user_id: 'u1', role: 'owner', organization_id: 'o1', email: 'ada@example.com', status: 'active', joined_at: '2026-01-01T00:00:00Z' },
        { id: 'm2', user_id: 'u2', role: 'member', organization_id: 'o1', email: 'grace@example.com', status: 'invited', joined_at: null },
      ],
      organization_apps: [{ seats_allocated: 5 }],
      master_apps: [{ id: 'a1', app_name: 'Seismolord' }],
      quotes: [{
        quote_id: 'q1', quote_number: 'PL-Q-0001', status: 'PENDING_PAYMENT', payment_verified: false,
        total_amount: 1234.5, currency: 'USD', billing_term: 'monthly', seats: 3,
        created_at: '2026-09-20T10:00:00Z', organization_id: 'o1',
        organizations: { name: 'Test Org', contact_email: 'admin@example.com' },
        selected_items: [{ item: 'Seismolord', type: 'app' }],
        paystack_link: 'https://paystack.example/pay', pricing_breakdown: { ngn_total: 1900000, ngn_per_usd: 1540 },
      }],
    }, {
      'get-active-apps': { apps: [{ id: 'a1', name: 'Seismolord', slug: 'seismolord', description: 'Seismic interpretation', price: 99, module_id: 'geoscience' }] },
    }),
  };
});

// appCategories is empty on main (the configurator reads it as is); the test
// gives it one module so the steps have something to select.
jest.mock('@/data/applications', () => ({
  appCategories: [{
    id: 'geoscience', name: 'Geoscience', description: 'Subsurface apps', icon: () => null, apps: [],
  }],
}));

jest.mock('@/lib/orgContext', () => ({
  getUserOrgRow: jest.fn(async () => ({ organization_id: 'o1', role: 'owner', status: 'active' })),
  resolveUserOrgId: jest.fn(async () => 'o1'),
}));

jest.mock('@/contexts/ImpersonationContext', () => ({
  useImpersonation: () => ({ isImpersonating: false, exitImpersonation: jest.fn() }),
}));

jest.mock('@/lib/portability/supabaseSource', () => ({
  makeSupabaseSource: () => ({ currentUser: async () => ({ id: 'u1', organization_id: 'o1' }) }),
}));

import {
  describeAppTheme, expectNoLegacyChrome, installDomShims,
} from '@/design/testing/themeAssertions';
import DataExport from '@/pages/DataExport';
import AuditLogs from '@/pages/admin/AuditLogs';
import TeamManagement from '@/pages/admin/TeamManagement';
import BulkImportEmployees from '@/pages/admin/BulkImportEmployees';
import AppAnalyticsDashboard from '@/pages/admin/AppAnalyticsDashboard';
import QuoteDashboard from '@/pages/QuoteDashboard';
import GetQuote from '@/pages/GetQuote';
import { renderAccountPage } from './accountTestKit';

const quoteOpts = { path: '/dashboard/quote/q1', pattern: '/dashboard/quote/:quoteId' };

const PAGES = [
  { name: 'Data export', route: '/dashboard/data-export', Page: DataExport, scope: 'data-export-theme-scope', ready: () => screen.findByText('Timed out') },
  { name: 'Audit logs', route: '/dashboard/audit-logs', Page: AuditLogs, scope: 'audit-logs-theme-scope', ready: () => screen.findByText('member.invited') },
  { name: 'Teams', route: '/dashboard/teams', Page: TeamManagement, scope: 'team-management-theme-scope', ready: () => screen.findByText('grace@example.com') },
  { name: 'Bulk import', route: '/dashboard/bulk-import', Page: BulkImportEmployees, scope: 'bulk-import-theme-scope', ready: () => screen.findByText('Upload CSV') },
  { name: 'App analytics', route: '/dashboard/analytics', Page: AppAnalyticsDashboard, scope: 'app-analytics-theme-scope', ready: () => screen.findByText('No usage data recorded yet') },
  { name: 'Quote dashboard', route: '/dashboard/quote/q1', Page: QuoteDashboard, scope: 'quote-dashboard-theme-scope', ready: () => screen.findByText('PL-Q-0001'), opts: quoteOpts },
  { name: 'Get quote', route: '/dashboard/get-quote', Page: GetQuote, scope: 'get-quote-theme-scope', ready: () => screen.findByText('Select Modules') },
];

PAGES.forEach(({ name, route, Page, scope, ready, opts }) => {
  describeAppTheme({
    name,
    route,
    renderApp: () => renderAccountPage(Page, opts),
    ready,
    scopeTestId: scope,
    userId: 'u1',
  });
});

describe('W3F pages, loaded states and dialogs', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('data export shows each job status as a word and the closure dialog opens in the scope', async () => {
    renderAccountPage(DataExport);
    await screen.findByText('Timed out');
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByTestId('pld-backup-panel')).toBeInTheDocument();
    expect(screen.getByTestId('pld-restore-panel')).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.click(screen.getByRole('button', { name: 'Close organization account' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Schedule account closure')).toBeInTheDocument();
    expect(dialog.closest('[data-pl-theme]')).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });

  it('audit log details open in a themed dialog', async () => {
    renderAccountPage(AuditLogs);
    await screen.findByText('member.invited');
    fireEvent.click(screen.getByRole('button', { name: 'View log details' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Log Details')).toBeInTheDocument();
    expect(dialog.closest('[data-pl-theme]')).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });

  it('teams shows member status as a word', async () => {
    renderAccountPage(TeamManagement);
    await screen.findByText('grace@example.com');
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('invited')).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it('app analytics shows an honest empty state and no invented figures', async () => {
    renderAccountPage(AppAnalyticsDashboard);
    await screen.findByText('No usage data recorded yet');
    const scope = screen.getByTestId('app-analytics-theme-scope');
    // The old placeholders: 124 users, 450 sessions, 18m 30s, Geoscience Hub at 45%.
    ['124', '450', '18m 30s', 'Geoscience Hub', '45%', '+12%'].forEach((fake) => {
      expect(scope).not.toHaveTextContent(fake);
    });
    expect(scope.textContent).not.toMatch(/\d/);
    expectNoLegacyChrome();
  });

  it('quote dashboard keeps its payment choices and the transfer proof dialog is themed', async () => {
    renderAccountPage(QuoteDashboard, quoteOpts);
    await screen.findByText('PL-Q-0001');
    expect(screen.getByText('PENDING PAYMENT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pay with Card \(USD\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pay ₦1,900,000 with Paystack/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /I Have Paid \(Verify\)/ })).toBeInTheDocument();
    expect(screen.getByText('$1,234.50')).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.click(screen.getByRole('button', { name: /Upload Payment Proof/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.closest('[data-pl-theme]')).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });

  it('get quote walks to the cost step and the review step with no legacy chrome', async () => {
    renderAccountPage(GetQuote);
    await screen.findByText('Select Modules');
    fireEvent.click(screen.getAllByText(/Starts at/)[0]);
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await screen.findByText('Select Applications');
    fireEvent.click(await screen.findByText('Seismic interpretation'));
    expectNoLegacyChrome();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await screen.findByText('Estimated Cost');
    expect(screen.getByText('Monthly Subtotal')).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await screen.findByText('Ready to Generate Quote');
    expect(screen.getByRole('button', { name: /Generate Official Quote/ })).toBeInTheDocument();
    expectNoLegacyChrome();
  });
});
