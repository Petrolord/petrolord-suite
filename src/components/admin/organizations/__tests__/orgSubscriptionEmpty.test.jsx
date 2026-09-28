// W7F: an organisation with no subscriptions rows used to show an invented
// "growth" plan at $1,899 a month. Negative control: on the old tab the
// empty state is missing and "growth" is shown.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
let mockOrg;
jest.mock('@/contexts/AdminOrganizationContext', () => ({ useAdminOrg: () => ({ selectedOrg: mockOrg, updateOrganization: jest.fn() }) }));

import OrgSubscription, { subscriptionRowsOf } from '../OrgSubscription';

test('no subscriptions rows reads as an empty state', () => {
  // OrgDetail flattens an empty embed to {}; that is not a subscription.
  mockOrg = { id: 'o1', subscription: {}, subscriptionRows: [] };
  render(<MemoryRouter><OrgSubscription memberCount={3} /></MemoryRouter>);
  expect(screen.getByTestId('org-subscription-empty')).toBeInTheDocument();
  expect(screen.queryByText(/growth/i)).toBeNull();
  expect(screen.queryByText(/1,899/)).toBeNull();
  expect(screen.getByTestId('org-subscription-seats')).toHaveTextContent('3 members; no active subscription sets a seat limit');
});

test('row shapes', () => {
  expect(subscriptionRowsOf(null)).toEqual([]);
  expect(subscriptionRowsOf({ subscription: {} })).toEqual([]);
  expect(subscriptionRowsOf({ subscription: { id: 's' } })).toEqual([{ id: 's' }]);
  expect(subscriptionRowsOf({ subscriptionRows: [{ id: 'a' }, { id: 'b' }], subscription: { id: 'a' } })).toHaveLength(2);
});
