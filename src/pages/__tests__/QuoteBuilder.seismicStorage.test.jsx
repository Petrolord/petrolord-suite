/**
 * Seismic storage tiers on the quote (owner-approved 2026-10-06): the builder
 * offers Project and Survey, shows Basin as on request, prices the tier into
 * the summary and sends the tier key to generate-quote, which prices it again
 * (authoritative) and stores it for provisioning.
 */
import '@testing-library/jest-dom';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';

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
      'generate-quote': { success: false, error: 'stop here' },
    }),
  };
});
jest.mock('@/lib/orgContext', () => ({
  resolveUserOrgId: jest.fn().mockResolvedValue('11111111-1111-4111-8111-111111111111'),
  getUserOrgRow: jest.fn().mockResolvedValue({ organization_id: '11111111-1111-4111-8111-111111111111' }),
}));
jest.mock('@/utils/quotePdfGenerator', () => ({ generateQuotePDF: jest.fn() }));

import { supabase } from '@/lib/customSupabaseClient';
import { installDomShims } from '@/design/testing/themeAssertions';
import QuoteBuilder from '@/pages/QuoteBuilder';
import { renderAccountPage } from './accountTestKit';

window.scrollTo = () => {};

describe('Seismic storage on the quote', () => {
  beforeAll(installDomShims);

  it('offers the approved tiers, Basin on request, and prices the chosen one', async () => {
    renderAccountPage(QuoteBuilder, { path: '/dashboard/upgrade' });
    await screen.findByText('Configure your subscription package.', {}, { timeout: 30000 });
    const box = screen.getByTestId('quote-seismic-storage');
    const select = within(box).getByLabelText('Seismic storage');
    const options = [...select.querySelectorAll('option')];
    expect(options.map((o) => o.textContent)).toEqual([
      'Included: 20 GiB per seismic user',
      'Project: 250 GiB shared, $99/mo',
      'Survey: 1 TiB shared, $299/mo',
      'Basin: 5 TiB shared, $999/mo (on request)',
    ]);
    expect(options[3]).toBeDisabled();
    expect(within(box).getByText('Included')).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'survey' } });
    expect(within(box).getByText('$299.00/mo')).toBeInTheDocument();
    expect(within(box).getByText(/A QI study with prestack gathers/)).toBeInTheDocument();
    expect(screen.getAllByText('Seismic storage: Survey (1 TiB)').length).toBeGreaterThan(0);
  });

  it('sends the tier key to generate-quote', async () => {
    supabase.functions.invoke.mockClear();
    // a pre-selected app (the renewal hand-off), so the quote is not empty
    renderAccountPage(QuoteBuilder, { path: { pathname: '/dashboard/upgrade', state: { renewal: { modules: [], apps: [{ id: 'a1', seats: 1 }], billingTerm: 'monthly' } } } });
    await screen.findByText('Configure your subscription package.', {}, { timeout: 30000 });
    fireEvent.change(within(screen.getByTestId('quote-seismic-storage')).getByLabelText('Seismic storage'), { target: { value: 'project' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Generate & Pay' })[0]);
    await waitFor(() => expect(supabase.functions.invoke.mock.calls.some(([n]) => n === 'generate-quote')).toBe(true));
    const [, { body }] = supabase.functions.invoke.mock.calls.find(([n]) => n === 'generate-quote');
    expect(body.seismic_storage_tier).toBe('project');
  });
});
