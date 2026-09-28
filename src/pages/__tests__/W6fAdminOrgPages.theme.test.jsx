/**
 * Design system rollout batch 6F: the platform admin organisation pages
 * (list, detail, edit, send quote) and promo codes wrap themselves in
 * <ThemedApp> through the W1E account chrome. describeAppTheme checks each
 * page; the extra cases open every detail tab and the dialogs. Supabase is
 * a stand-in (accountTestKit), so nothing reaches a network or a database.
 */
import '@testing-library/jest-dom';
import { screen, fireEvent, within, act } from '@testing-library/react';

jest.mock('@/lib/customSupabaseClient', () => {
  const { makeSupabase } = require('./accountTestKit');
  const org = {
    id: 'o1', name: 'Acme Energy', contact_email: 'ops@acme.example', contact_phone: '+44 1',
    suite_status: 'PENDING_VERIFICATION', hse_status: 'ACTIVE', created_at: '2026-09-01T10:00:00Z',
    subscribed_modules: ['geoscience'], hse_enabled: true,
    subscriptions: [{ id: 's1', payment_status: 'PENDING', bank_transfer_proof_url: 'https://x.example/proofs/q1-1.pdf' }],
    subscription: [{ id: 's1', status: 'active', tier: 'growth', user_limit: 10, storage_limit: 500, amount: 1899, modules: ['geoscience'], apps: [] }],
    quotes: [{ quote_id: 'q1', status: 'PENDING' }],
  };
  return {
    supabase: makeSupabase({
      organizations: [org],
      organization_members: [
        { user_id: 'u1', email: 'ada@acme.example', role: 'admin', created_at: '2026-09-01T10:00:00Z' },
        { user_id: 'u2', email: 'grace@acme.example', role: 'viewer', created_at: '2026-09-02T10:00:00Z' },
      ],
      payments: [
        { id: 'p1', paystack_reference: 'PSK-001', amount: 1899, currency: 'USD', status: 'completed', created_at: '2026-09-03T10:00:00Z' },
        { id: 'p2', paystack_reference: 'PSK-002', amount: 1899, currency: 'USD', status: 'failed', created_at: '2026-09-04T10:00:00Z' },
      ],
      quotes: [
        { id: 'qq1', quote_id: 'PL-Q-0077', organization_id: 'o1', status: 'PENDING', total_amount: 2500, currency: 'USD', billing_term: 'annual', created_at: '2026-09-06T10:00:00Z', validity_period: '2026-10-06T10:00:00Z' },
      ],
      audit_logs: [{ id: 'a1', action: 'org.updated', actor_id: 'abcdef123456', details: { field: 'name' }, created_at: '2026-09-05T10:00:00Z' }],
      suite_promo_codes: [
        { id: 'c1', code: 'FOUNDING50', percent: 50, scope: 'all', redeemed_count: 2, max_redemptions: 10, expires_at: null, notes: 'founders', active: true },
      ],
      master_apps: [{ module: 'geoscience' }, { module: 'reservoir' }],
    }),
  };
});

jest.mock('@/hooks/useAppsFromDatabase', () => ({
  useAppsFromDatabase: () => ({
    apps: [
      { id: 'a1', slug: 'seismolord', app_name: 'Seismolord', module: 'geoscience', is_built: true, description: 'Seismic interpretation' },
      { id: 'a2', slug: 'future-app', app_name: 'Future App', module: 'geoscience', is_built: false, description: 'Not built yet' },
    ],
    loading: false,
    error: null,
  }),
}));

jest.mock('@/utils/quotePdfGenerator', () => ({ generateQuotePDF: jest.fn() }));

import {
  describeAppTheme, expectNoLegacyChrome, installDomShims,
} from '@/design/testing/themeAssertions';
import AdminOrganizations from '@/pages/admin/AdminOrganizations';
import OrgDetail from '@/pages/admin/OrgDetail';
import OrgEdit from '@/pages/admin/OrgEdit';
import OrgSendQuote from '@/pages/admin/OrgSendQuote';
import PromoCodes from '@/pages/admin/PromoCodes';
import { supabase } from '@/lib/customSupabaseClient';
import { renderAccountPage } from './accountTestKit';

const detailOpts = { path: '/admin/organizations/o1', pattern: '/admin/organizations/:orgId' };
const editOpts = { path: '/admin/organizations/o1/edit', pattern: '/admin/organizations/:orgId/edit' };
const quoteOpts = { path: '/admin/organizations/o1/send-quote', pattern: '/admin/organizations/:orgId/send-quote' };
const superAdmin = { isSuperAdmin: true };

const PAGES = [
  { name: 'Admin organizations', route: '/admin/organizations', Page: AdminOrganizations, scope: 'admin-organizations-theme-scope', ready: () => screen.findByText('Acme Energy'), opts: {} },
  { name: 'Admin organization detail', route: '/admin/organizations/o1', Page: OrgDetail, scope: 'org-detail-theme-scope', ready: () => screen.findByText('Total Members'), opts: detailOpts },
  { name: 'Admin organization edit', route: '/admin/organizations/o1/edit', Page: OrgEdit, scope: 'org-edit-theme-scope', ready: () => screen.findByDisplayValue('Acme Energy'), opts: editOpts },
  { name: 'Admin send quote', route: '/admin/organizations/o1/send-quote', Page: OrgSendQuote, scope: 'org-send-quote-theme-scope', ready: () => screen.findByText('Quote Configuration'), opts: quoteOpts },
  { name: 'Admin promo codes', route: '/admin/promo-codes', Page: PromoCodes, scope: 'promo-codes-theme-scope', ready: () => screen.findByText('FOUNDING50'), opts: {} },
];

PAGES.forEach(({ name, route, Page, scope, ready, opts }) => {
  describeAppTheme({
    name,
    route,
    renderApp: () => renderAccountPage(Page, { ...opts, auth: superAdmin }),
    ready,
    scopeTestId: scope,
    userId: 'u1',
  });
});

const expectDialogInScope = (dialog) => {
  expect(dialog.closest('[data-pl-theme]')).toHaveAttribute('data-pl-theme', 'light');
  expectNoLegacyChrome();
};

describe('W6F pages, statuses, tabs and dialogs', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('organizations list shows statuses as words and its dialogs are themed', async () => {
    renderAccountPage(AdminOrganizations, { auth: superAdmin });
    await screen.findByText('Acme Energy');
    expect(screen.getByText('PENDING_VERIFICATION')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.click(screen.getByRole('button', { name: /Verify/ }));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Verify Payment Proof')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Approve & Activate/ })).toBeInTheDocument();
    expectDialogInScope(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Acme Energy' }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete Organization?')).toBeInTheDocument();
    expectDialogInScope(dialog);
  });

  it('organization detail walks every tab with no legacy chrome', async () => {
    renderAccountPage(OrgDetail, { ...detailOpts, auth: superAdmin });
    await screen.findByText('Total Members');
    expect(screen.getByRole('button', { name: /Upgrade Suite/ }).className).toMatch(/\bbg-pl-accent\b/);
    expectNoLegacyChrome();
    const tabs = [
      ['team', 'grace@acme.example'],
      ['Access Matrix', 'Application Access Matrix'],
      ['subscription', 'Unified Login Information'],
      ['quotes', 'Quote Management'],
      ['payments', 'PSK-001'],
      ['Audit Log', 'org.updated'],
    ];
    for (const [tab, marker] of tabs) {
      fireEvent.mouseDown(screen.getByRole('tab', { name: tab }));
      // eslint-disable-next-line no-await-in-loop
      await screen.findByText(marker);
      expectNoLegacyChrome();
    }
    // Payment status words carry the status colour.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'payments' }));
    expect(await screen.findByText('completed')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  it('team tab invite dialog is themed', async () => {
    renderAccountPage(OrgDetail, { ...detailOpts, auth: superAdmin });
    await screen.findByText('Total Members');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'team' }));
    fireEvent.click(await screen.findByRole('button', { name: /Add Member/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Initial Role')).toBeInTheDocument();
    expectDialogInScope(dialog);
  });

  // W7F: the subscription tab lists the real subscriptions rows and has no
  // plan editor (it wrote a column that does not exist); the quotes tab reads
  // the quotes table and sends new quotes through the Send Quote page.
  // Negative control: on the old tabs the invented storage figure, invoices
  // and mock quotes are found and the real quote is not.
  it('subscription tab shows the loaded rows and nothing invented', async () => {
    renderAccountPage(OrgDetail, { ...detailOpts, auth: superAdmin });
    await screen.findByText('Total Members');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'subscription' }));
    await screen.findByText('Unified Login Information');
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByTestId('org-subscription-seats')).toHaveTextContent('2 members of 10 seats');
    expect(screen.queryByText(/INV-2023/)).toBeNull();
    expect(screen.queryByText('124')).toBeNull();
    expect(screen.queryByRole('button', { name: /Modify Plan/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Send Quote/ })).toHaveAttribute('href', '/admin/organizations/o1/send-quote');
    expectNoLegacyChrome();
  });

  it('quotes tab reads the quotes table and links to Send Quote', async () => {
    renderAccountPage(OrgDetail, { ...detailOpts, auth: superAdmin });
    await screen.findByText('Total Members');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'quotes' }));
    await screen.findByText('PL-Q-0077');
    expect(supabase.from).toHaveBeenCalledWith('quotes');
    expect(screen.getByText('$2,500.00')).toBeInTheDocument();
    expect(screen.queryByText(/QT-2023/)).toBeNull();
    expect(screen.queryByRole('button', { name: /New Quote/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Open quote PL-Q-0077/ })).toHaveAttribute('href', '/dashboard/quote/PL-Q-0077');
    const links = screen.getAllByRole('link', { name: /Send Quote/ });
    expect(links[links.length - 1]).toHaveAttribute('href', '/admin/organizations/o1/send-quote');
    expectNoLegacyChrome();
  });

  it('send quote keeps its estimate and the send action', async () => {
    renderAccountPage(OrgSendQuote, { ...quoteOpts, auth: superAdmin });
    await screen.findByText('Quote Configuration');
    // 5 users x 50 + 3 apps x 100 + cloud base 500 = 1050 a month, 12 months.
    expect(screen.getByText('$12600.00', { selector: 'span.text-3xl' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate & Send Quote/ })).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it('promo codes: form is themed and the share link still points at the upgrade page', async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    renderAccountPage(PromoCodes, { auth: superAdmin });
    await screen.findByText('FOUNDING50');
    fireEvent.click(screen.getByRole('button', { name: /New Promo Code/ }));
    expect(await screen.findByLabelText('Scope')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'reservoir module only' })).toBeInTheDocument();
    expectNoLegacyChrome();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Link/ }));
    });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/dashboard/upgrade?promo=FOUNDING50`);
    expect(supabase.from).toHaveBeenCalledWith('suite_promo_codes');
  });
});
