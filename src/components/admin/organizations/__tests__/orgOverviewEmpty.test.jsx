// W8: the Overview tab used to invent a subscription when an organisation had
// none: a 10 seat limit, an "Active" status and a "Free Tier" plan. Negative
// control: on the old tab the first test fails (it prints "3 / 10 seats used",
// "Active" and "Free Tier", and has none of the test ids).
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
let mockOrg;
jest.mock('@/contexts/AdminOrganizationContext', () => ({ useAdminOrg: () => ({ selectedOrg: mockOrg, updateOrganization: jest.fn() }) }));

import OrgOverview from '../OrgOverview';

const users = [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }];
const renderTab = () => render(<MemoryRouter><OrgOverview orgUsers={users} /></MemoryRouter>);

test('no subscriptions rows reads as an honest empty state', () => {
  // OrgDetail flattens an empty embed to {}; that is not a subscription.
  mockOrg = { id: 'o1', name: 'Acme', subscription: {}, subscriptionRows: [], subscribed_modules: [] };
  renderTab();
  expect(screen.getByTestId('org-overview-plan')).toHaveTextContent('No subscription');
  expect(screen.getByTestId('org-overview-status')).toHaveTextContent('None on record');
  expect(screen.getByTestId('org-overview-seats')).toHaveTextContent('No subscription sets a seat limit');
  expect(screen.getByTestId('org-overview-mrr')).toHaveTextContent('Not recorded');
  expect(screen.queryByText(/Free Tier/i)).toBeNull();
  expect(screen.queryByText(/\/ 10 seats/)).toBeNull();
  expect(screen.getByTestId('org-overview-status')).not.toHaveTextContent(/active/i);
});

test('an active subscription row shows its own plan, status, seats and amount', () => {
  mockOrg = {
    id: 'o1',
    name: 'Acme',
    subscriptionRows: [
      { id: 's0', status: 'expired', user_limit: 2, tier: 'old' },
      { id: 's1', status: 'active', user_limit: 12, tier: 'enterprise', amount: 500 },
    ],
    subscribed_modules: [],
  };
  renderTab();
  expect(screen.getByTestId('org-overview-plan')).toHaveTextContent('enterprise');
  expect(screen.getByTestId('org-overview-status')).toHaveTextContent('active');
  expect(screen.getByTestId('org-overview-seats')).toHaveTextContent('3 / 12 seats used (25%)');
  expect(screen.getByTestId('org-overview-mrr')).not.toHaveTextContent('Not recorded');
});

test('a row without a seat limit or plan says so', () => {
  mockOrg = { id: 'o1', name: 'Acme', subscriptionRows: [{ id: 's1', status: 'pending' }], subscribed_modules: [] };
  renderTab();
  expect(screen.getByTestId('org-overview-plan')).toHaveTextContent('Plan not recorded');
  expect(screen.getByTestId('org-overview-seats')).toHaveTextContent('No seat limit recorded');
  expect(screen.getByTestId('org-overview-mrr')).toHaveTextContent('Not recorded');
});
