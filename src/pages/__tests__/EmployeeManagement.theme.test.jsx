/**
 * Design system rollout batch 1E: Employees (/dashboard/employees) and
 * Access requests (/dashboard/access-requests) wrap themselves in
 * <ThemedApp>. describeAppTheme checks each page; the extra cases open the
 * invite dialog, the member actions menu and the request review dialog, and
 * show every status badge.
 */
import '@testing-library/jest-dom';
import { screen, fireEvent } from '@testing-library/react';

jest.mock('@/lib/customSupabaseClient', () => {
  const { makeSupabase } = require('./accountTestKit');
  return {
    supabase: makeSupabase({
      organization_members: [
        { id: 'm1', full_name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin', status: 'active', joined_at: '2026-01-02' },
        { id: 'm2', full_name: 'Grace Hopper', email: 'grace@example.com', role: 'engineer', status: 'invited', joined_at: null },
        { id: 'm3', full_name: 'Alan Turing', email: 'alan@example.com', role: 'viewer', status: 'inactive', joined_at: '2025-05-05' },
      ],
      subscriptions: [{ user_limit: 10 }],
      access_requests: [
        { id: 'r1', member: { full_name: 'Ada Lovelace', email: 'ada@example.com' }, app_id: 'seismolord', requested_at: '2026-09-01', status: 'pending', reason: 'Interpretation work' },
        { id: 'r2', member: { full_name: 'Grace Hopper', email: 'grace@example.com' }, app_id: 'well-test', requested_at: '2026-08-01', status: 'approved', reason: 'Tests' },
        { id: 'r3', member: { full_name: 'Alan Turing', email: 'alan@example.com' }, app_id: 'mbal', requested_at: '2026-07-01', status: 'rejected', reason: 'Curious' },
      ],
    }),
  };
});
jest.mock('@/lib/orgContext', () => ({
  getUserOrgRow: jest.fn().mockResolvedValue({ organization_id: 'o1' }),
}));

import {
  describeAppTheme, expectNoLegacyChrome, installDomShims,
} from '@/design/testing/themeAssertions';
import EmployeeManagement from '@/pages/EmployeeManagement';
import AccessRequests from '@/pages/admin/AccessRequests';
import { renderAccountPage } from './accountTestKit';

const employeesReady = () => screen.findByText('Ada Lovelace');
const requestsReady = () => screen.findByText('seismolord');

describeAppTheme({
  name: 'Employees',
  route: '/dashboard/employees',
  renderApp: () => renderAccountPage(EmployeeManagement),
  ready: employeesReady,
  scopeTestId: 'employees-theme-scope',
  userId: 'u1',
});

describeAppTheme({
  name: 'Access requests',
  route: '/dashboard/access-requests',
  renderApp: () => renderAccountPage(AccessRequests),
  ready: requestsReady,
  scopeTestId: 'access-requests-theme-scope',
  userId: 'u1',
});

describe('Employees and access requests, dialogs and menus', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('every member status reads as a word, and the invite dialog carries the scope', async () => {
    renderAccountPage(EmployeeManagement);
    await employeesReady();
    ['Active', 'Invited', 'Inactive'].forEach((w) => expect(screen.getByText(w)).toBeInTheDocument());
    expectNoLegacyChrome();

    fireEvent.click(screen.getByRole('button', { name: /Invite Member/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('data-pl-theme', 'light');
    expect(screen.getByRole('button', { name: 'Send Invite' })).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it('the member actions menu carries the scope', async () => {
    renderAccountPage(EmployeeManagement);
    await employeesReady();
    const trigger = screen.getByRole('button', { name: 'Manage Grace Hopper' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    expect(menu.closest('[data-pl-theme]')).toHaveAttribute('data-pl-theme', 'light');
    expect(screen.getByText('Resend Invite')).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it('every request status shows under All, and the review dialog carries the scope', async () => {
    renderAccountPage(AccessRequests);
    await requestsReady();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(await screen.findByText('Approved', { selector: 'div' })).toBeInTheDocument();
    expect(screen.getByText('Rejected', { selector: 'div' })).toBeInTheDocument();
    expect(screen.getByText('Pending', { selector: 'div' })).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('data-pl-theme', 'light');
    expect(screen.getByText(/Interpretation work/)).toBeInTheDocument();
    expectNoLegacyChrome();
  });
});
