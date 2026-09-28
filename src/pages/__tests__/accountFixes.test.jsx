/**
 * Account page fixes (2026-09-28, after design rollout batch 1E):
 *  1. Renew routes into the normal quote-and-pay flow: no fixed amount, no
 *     simulated reference, and the quote builder receives the organisation's
 *     holdings as a pre-selection and sends them to generate-quote like any
 *     other order.
 *  2. Access requests: Approve and Reject each send their own decision.
 *  3. Module access: the Availability Overview lists the Suite modules.
 * Supabase is a stand-in (accountTestKit); nothing reaches a network.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => {
  const { makeSupabase } = require('./accountTestKit');
  const geo = { id: 'm-geo', name: 'Geoscience', slug: 'geoscience' };
  const res = { id: 'm-res', name: 'Reservoir', slug: 'reservoir' };
  return {
    supabase: makeSupabase({
      modules: [geo, res],
      master_apps: [
        { id: 'a1', app_name: 'Seismolord', slug: 'seismolord', price: 1490, status: 'active', module_id: 'm-geo', modules: geo },
        { id: 'a2', app_name: 'Well Test Analysis Studio', slug: 'well-test', price: 799, status: 'active', module_id: 'm-res', modules: res },
        { id: 'a3', app_name: 'Material Balance Studio', slug: 'mbal', price: 799, status: 'active', module_id: 'm-res', modules: res },
      ],
      purchased_modules: [
        { id: 'p1', app_id: 'a1', app_uuid: 'a1', module_id: 'm-geo', module_name: 'Geoscience', seats_allocated: 4, expiry_date: '2026-11-01', status: 'active', organization_id: 'o1' },
      ],
      subscriptions: [
        { modules: ['reservoir', 'hse_professional'], term: 'quarterly', end_date: '2026-11-01', status: 'active' },
      ],
      app_seat_assignments: [],
    }, {
      'generate-quote': { quote_id: 'QT-TEST-1' },
      'respond-to-access-request': { success: true },
    }),
  };
});
jest.mock('@/lib/orgContext', () => ({
  resolveUserOrgId: jest.fn().mockResolvedValue('o1'),
  getUserOrgRow: jest.fn().mockResolvedValue({ organization_id: 'o1' }),
}));
jest.mock('@/utils/quotePdfGenerator', () => ({ generateQuotePDF: jest.fn() }));

import { supabase } from '@/lib/customSupabaseClient';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import { installDomShims } from '@/design/testing/themeAssertions';
import RenewSubscription from '@/pages/RenewSubscription';
import QuoteBuilder from '@/pages/QuoteBuilder';
import ModuleAccess from '@/pages/ModuleAccess';
import RespondToRequestModal from '@/components/RespondToRequestModal';
import { TEST_USER, renderAccountPage } from './accountTestKit';

window.scrollTo = () => {};

const auth = { user: TEST_USER, organization: { id: 'o1', name: 'Test Org' }, isSuperAdmin: false, loading: false };

function StateProbe() {
  const loc = useLocation();
  return <pre data-testid="probe">{JSON.stringify({ path: loc.pathname, state: loc.state })}</pre>;
}

const renderAt = (entry, routes) => render(
  <AuthContext.Provider value={auth}>
    <MemoryRouter initialEntries={[entry]}>
      <Routes>{routes}</Routes>
    </MemoryRouter>
  </AuthContext.Provider>,
);

beforeAll(installDomShims);
beforeEach(() => {
  supabase.functions.invoke.mockClear();
  try { window.localStorage.clear(); } catch { /* storage unavailable */ }
});

describe('1. Renew goes through quote and pay', () => {
  it('shows no fixed price, calls no payment or renewal function, and hands the holdings to the quote builder', async () => {
    renderAt('/dashboard/subscriptions/renew/geoscience', [
      <Route key="r" path="/dashboard/subscriptions/renew/:moduleId" element={<RenewSubscription />} />,
      <Route key="u" path="/dashboard/upgrade" element={<StateProbe />} />,
    ]);
    expect(await screen.findByTestId('renewal-holdings')).toHaveTextContent('1 module licence, 1 app, 4 seats');
    expect(document.body.textContent).not.toMatch(/15,000|\$/);
    expect(document.body.textContent).not.toMatch(/REF-/);

    fireEvent.click(screen.getByRole('button', { name: /Continue to quote and payment/ }));
    const probe = JSON.parse((await screen.findByTestId('probe')).textContent);
    expect(probe.path).toBe('/dashboard/upgrade');
    expect(probe.state.renewal).toEqual({ modules: ['reservoir'], apps: [{ id: 'a1', seats: 4 }], billingTerm: 'quarterly' });
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('the quote builder pre-selects the holdings and sends them to generate-quote as a normal order', async () => {
    renderAt(
      { pathname: '/dashboard/upgrade', state: { renewal: { modules: ['reservoir'], apps: [{ id: 'a1', seats: 4 }], billingTerm: 'quarterly' } } },
      [<Route key="u" path="/dashboard/upgrade" element={<QuoteBuilder />} />],
    );
    expect(await screen.findByTestId('renewal-note')).toHaveTextContent(/Renewing your subscription/);
    expect(screen.getByText('1 Modules, 3 Apps Selected')).toBeInTheDocument();
    expect(screen.getAllByText(/Seismolord .* 4 seats/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: /Generate & Pay/ })[0]);
    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalledWith('generate-quote', expect.anything()));
    const [, { body }] = supabase.functions.invoke.mock.calls.find(([n]) => n === 'generate-quote');
    expect(body.modules).toEqual(['reservoir']);
    expect(body.apps).toEqual([{ id: 'a2', seats: 1 }, { id: 'a3', seats: 1 }, { id: 'a1', seats: 4 }]);
    expect(body.seats).toBe(6);
    expect(body.billing_term).toBe('quarterly');
    // the client sends a configuration; generate-quote prices it
    expect(body).not.toHaveProperty('total_amount');
    expect(body).not.toHaveProperty('amount');
  });

  it('the quote builder opens with nothing selected when no renewal is passed', async () => {
    renderAt('/dashboard/upgrade', [<Route key="u" path="/dashboard/upgrade" element={<QuoteBuilder />} />]);
    expect(await screen.findByText('0 Modules, 0 Apps Selected')).toBeInTheDocument();
    expect(screen.queryByTestId('renewal-note')).not.toBeInTheDocument();
  });
});

describe('2. Access request Approve and Reject submit their own action', () => {
  const request = { id: 'r1', app_id: 'seismolord', reason: 'Need it', member: { full_name: 'Ada', email: 'ada@example.com' } };

  it.each([['Approve', 'approved'], ['Reject', 'rejected']])('%s sends approval_status %s', async (label, status) => {
    const onSuccess = jest.fn();
    render(<RespondToRequestModal request={request} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    fireEvent.change(await screen.findByLabelText(/Admin Response/), { target: { value: 'ok' } });
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalledTimes(1));
    expect(supabase.functions.invoke).toHaveBeenCalledWith('respond-to-access-request', {
      body: { request_id: 'r1', approval_status: status, admin_response: 'ok' },
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });
});

describe('3. Module access Availability Overview', () => {
  it('lists the Suite modules and marks the held ones active', async () => {
    renderAccountPage(ModuleAccess);
    await screen.findByText('Seismolord');
    const geo = screen.getByTestId('availability-geoscience');
    expect(geo).toHaveTextContent('Geoscience');
    expect(geo.querySelector('[aria-label="Active"]')).not.toBeNull();
    expect(screen.getByTestId('availability-drilling').querySelector('[aria-label="Not subscribed"]')).not.toBeNull();
  });
});
