/**
 * Design system rollout batch 1E: the subscription pages wrap themselves in
 * <ThemedApp>: Subscriptions (/dashboard/subscriptions), Renew
 * (/dashboard/subscriptions/renew/:moduleId), History and Usage analytics.
 * describeAppTheme checks each page; the extra cases open the seat details
 * with every seat status, the seat transfer dialog and the renewal term
 * select. The renew-subscription, seat and Paystack calls are not made.
 */
import '@testing-library/jest-dom';
import { screen, fireEvent } from '@testing-library/react';

jest.mock('@/lib/customSupabaseClient', () => {
  const { makeSupabase } = require('./accountTestKit');
  return {
    supabase: makeSupabase({
      purchased_modules: [
        { id: 'p1', app_id: 'a1', module_id: 'geoscience', module_name: 'Seismolord', expiry_date: '2027-01-01', seats_allocated: 3, current_seats_used: 2, organization_id: 'o1', status: 'active' },
      ],
      subscription_events: [
        { id: 'e1', event_date: '2026-09-01T10:00:00Z', module_id: 'geoscience', event_type: 'renewed', details: { months: 12 } },
      ],
      organization_members: [{ user_id: 'u2' }],
      user_profiles: [{ id: 'u2', full_name: 'Ada Lovelace' }],
    }, {
      'get-app-seat-usage': {
        used_seats: 2,
        total_seats: 3,
        assignments: [
          { id: 's1', seat_number: 1, user_name: 'Test Admin', user_id: 'u1', is_admin_seat: true, is_locked: false, can_reassign: true },
          { id: 's2', seat_number: 2, user_name: 'Ada Lovelace', user_id: 'u2', is_admin_seat: false, is_locked: true, can_reassign: false },
        ],
      },
    }),
  };
});
jest.mock('@/lib/orgContext', () => ({
  getUserOrgRow: jest.fn().mockResolvedValue({ organization_id: 'o1' }),
}));

import {
  describeAppTheme, expectNoLegacyChrome, installDomShims,
} from '@/design/testing/themeAssertions';
import SubscriptionManagement from '@/pages/SubscriptionManagement';
import RenewSubscription from '@/pages/RenewSubscription';
import SubscriptionHistory from '@/pages/SubscriptionHistory';
import SubscriptionUsageAnalytics from '@/pages/SubscriptionUsageAnalytics';
import { renderAccountPage } from './accountTestKit';

const renderRenew = () => renderAccountPage(RenewSubscription, {
  path: '/dashboard/subscriptions/renew/geoscience',
  pattern: '/dashboard/subscriptions/renew/:moduleId',
});
const subsReady = () => screen.findByText('Seismolord');
const renewReady = () => screen.findByText(/Renew Subscription: Seismolord/);

describeAppTheme({
  name: 'Subscriptions',
  route: '/dashboard/subscriptions',
  renderApp: () => renderAccountPage(SubscriptionManagement),
  ready: subsReady,
  scopeTestId: 'subscriptions-theme-scope',
  userId: 'u1',
});

describeAppTheme({
  name: 'Renew subscription',
  route: '/dashboard/subscriptions/renew/geoscience',
  renderApp: renderRenew,
  ready: renewReady,
  scopeTestId: 'renew-subscription-theme-scope',
  userId: 'u1',
});

describeAppTheme({
  name: 'Subscription history',
  route: '/dashboard/subscriptions/history',
  renderApp: () => renderAccountPage(SubscriptionHistory),
  ready: () => screen.findByText('renewed'),
  scopeTestId: 'subscription-history-theme-scope',
  userId: 'u1',
});

describeAppTheme({
  name: 'Subscription usage analytics',
  route: '/dashboard/subscriptions/analytics',
  renderApp: () => renderAccountPage(SubscriptionUsageAnalytics),
  ready: () => screen.findByText('Usage Analytics'),
  scopeTestId: 'subscription-usage-theme-scope',
  userId: 'u1',
});

describe('Subscription pages, details and dialogs', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('seat details show every seat status as a word, and the transfer dialog carries the scope', async () => {
    renderAccountPage(SubscriptionManagement);
    await subsReady();
    fireEvent.click(screen.getByRole('button', { name: 'Manage Seats' }));
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    ['Admin Seat', 'Member', 'Active', 'Locked'].forEach((w) => expect(screen.getByText(w)).toBeInTheDocument());
    expectNoLegacyChrome();

    fireEvent.click(screen.getByRole('button', { name: /Transfer My Seat/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('data-pl-theme', 'light');
    expect(screen.getByText(/You will lose access/)).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it('the renewal term select opens inside the scope', async () => {
    renderRenew();
    await renewReady();
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const listbox = await screen.findByRole('listbox');
    expect(listbox.closest('[data-pl-theme]')).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });
});
