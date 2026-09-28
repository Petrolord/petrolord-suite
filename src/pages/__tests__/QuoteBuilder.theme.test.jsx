/**
 * Design system rollout batch 1E: the upgrade page (quote builder) wraps
 * itself in <ThemedApp>. describeAppTheme checks light by default, the header
 * toggle round trip, no legacy console colour and the cold-load
 * registration; the walk below repeats the legacy check with apps selected,
 * a promo code applied, the sales discount shown, the details tab and the
 * contact sales dialog open. Pricing, generate-quote and Paystack code are
 * untouched; this test only drives the visible states.
 */
import '@testing-library/jest-dom';
import { screen, fireEvent, within } from '@testing-library/react';

jest.mock('@/lib/customSupabaseClient', () => {
  const { makeSupabase } = require('./accountTestKit');
  const geo = { id: 'm-geo', name: 'Geoscience', slug: 'geoscience' };
  return {
    supabase: makeSupabase({
      modules: [geo, { id: 'm-empty', name: 'Empty Module', slug: 'empty' }],
      master_apps: [
        { id: 'a1', app_name: 'Seismolord', slug: 'seismolord', price: 1490, status: 'active', module_id: 'm-geo', modules: geo, description: 'Seismic interpretation' },
        { id: 'a2', app_name: 'Future App', slug: 'future-app', price: 500, status: 'Coming Soon', module_id: 'm-geo', modules: geo, description: 'Soon' },
        { id: 'a3', app_name: 'Beta App', slug: 'beta-app', price: 300, status: 'beta', module_id: 'm-geo', modules: geo, description: 'Beta' },
      ],
    }, {
      'verify-promo-code': { found: true, status: 'valid', code: 'FOUNDING50', percent: 50, scope: 'all' },
      'verify-bridge-code': { found: true, status: 'valid', code: 'PLB-1', discount_pct: 20, suite_module: 'reservoir', holder: 'Ada', certificate_number: 'C-1' },
    }),
  };
});
jest.mock('@/lib/orgContext', () => ({
  resolveUserOrgId: jest.fn().mockResolvedValue('o1'),
  getUserOrgRow: jest.fn().mockResolvedValue({ organization_id: 'o1' }),
}));
jest.mock('@/utils/quotePdfGenerator', () => ({ generateQuotePDF: jest.fn() }));

import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import QuoteBuilder from '@/pages/QuoteBuilder';
import { renderAccountPage } from './accountTestKit';

// framer-motion measures the page on expand; jsdom has no scrollTo.
window.scrollTo = () => {};

const ready = () => screen.findByText('Configure your subscription package.');

describeAppTheme({
  name: 'Upgrade (quote builder)',
  route: '/dashboard/upgrade',
  renderApp: () => renderAccountPage(QuoteBuilder, { path: '/dashboard/upgrade' }),
  ready,
  scopeTestId: 'quote-builder-theme-scope',
  userId: 'u1',
});

describe('Upgrade page theme, every visible state', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('no legacy colour with apps selected, codes applied and the sales discount shown, in both themes', async () => {
    renderAccountPage(QuoteBuilder, { path: '/dashboard/upgrade', auth: { isSuperAdmin: true } });
    await ready();
    expectNoLegacyChrome();

    fireEvent.click(screen.getByText('Seismolord'));
    fireEvent.click(screen.getByText('Beta App'));
    expect(await screen.findByLabelText('More seats for Seismolord')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('More seats for Seismolord'));
    expect(screen.getAllByText(/Seismolord .* 2 seats/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Monthly'));
    expectNoLegacyChrome();

    fireEvent.change(screen.getByPlaceholderText('e.g. FOUNDING50'), { target: { value: 'FOUNDING50' } });
    fireEvent.click(within(screen.getByText('Promo code').parentElement).getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText(/50% off your subscription/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('PLB-XXXXXXXXXX'), { target: { value: 'PLB-1' } });
    fireEvent.click(within(screen.getByText('NextGen Expert code').parentElement).getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText(/Add a reservoir app to the quote/)).toBeInTheDocument();

    expect(screen.getByLabelText('Sales discount (%)')).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(getScopeRoot('quote-builder-theme-scope')).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });

  it('the details tab and the contact sales dialog carry the scope', async () => {
    renderAccountPage(QuoteBuilder, { path: '/dashboard/upgrade' });
    await ready();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Details & Terms' }));
    expect(await screen.findByText('Quote Reference')).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.click(screen.getByRole('button', { name: /Contact Sales/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });
});
