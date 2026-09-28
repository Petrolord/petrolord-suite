/**
 * Promo share links (/dashboard/upgrade?promo=CODE, copied from the admin
 * Promo codes page) pre-fill the promo box and run the same verify-promo-code
 * check as the Apply button, once. An invalid code shows the existing error.
 */
import '@testing-library/jest-dom';
import { screen, waitFor } from '@testing-library/react';

jest.mock('@/lib/customSupabaseClient', () => {
  const { makeSupabase } = require('./accountTestKit');
  const geo = { id: 'm-geo', name: 'Geoscience', slug: 'geoscience' };
  return {
    supabase: makeSupabase({
      modules: [geo],
      master_apps: [
        { id: 'a1', app_name: 'Seismolord', slug: 'seismolord', price: 1490, status: 'active', module_id: 'm-geo', modules: geo, description: 'Seismic interpretation' },
      ],
    }, {
      'verify-promo-code': { found: false },
    }),
  };
});
jest.mock('@/lib/orgContext', () => ({
  resolveUserOrgId: jest.fn().mockResolvedValue('o1'),
  getUserOrgRow: jest.fn().mockResolvedValue({ organization_id: 'o1' }),
}));
jest.mock('@/utils/quotePdfGenerator', () => ({ generateQuotePDF: jest.fn() }));

import { supabase } from '@/lib/customSupabaseClient';
import { installDomShims } from '@/design/testing/themeAssertions';
import QuoteBuilder from '@/pages/QuoteBuilder';
import { renderAccountPage } from './accountTestKit';

window.scrollTo = () => {};

const promoCalls = () => supabase.functions.invoke.mock.calls.filter(([name]) => name === 'verify-promo-code');

describe('Upgrade page promo share link', () => {
  beforeAll(installDomShims);
  beforeEach(() => supabase.functions.invoke.mockClear());

  it('visiting /dashboard/upgrade?promo=ABC fills the box and verifies ABC once', async () => {
    renderAccountPage(QuoteBuilder, { path: '/dashboard/upgrade?promo=ABC' });
    await screen.findByText('Configure your subscription package.');
    expect(screen.getByPlaceholderText('e.g. FOUNDING50')).toHaveValue('ABC');
    await waitFor(() => expect(promoCalls()).toHaveLength(1));
    expect(promoCalls()[0][1]).toEqual({ body: { code: 'ABC' } });
    // The mocked verify says the code is unknown: the existing error shows.
    expect(await screen.findByRole('alert')).toHaveTextContent('Code not recognized. Check the code and try again.');
    expect(promoCalls()).toHaveLength(1);
  });

  it('without ?promo= nothing is verified on load', async () => {
    renderAccountPage(QuoteBuilder, { path: '/dashboard/upgrade' });
    await screen.findByText('Configure your subscription package.');
    expect(screen.getByPlaceholderText('e.g. FOUNDING50')).toHaveValue('');
    expect(promoCalls()).toHaveLength(0);
  });
});
