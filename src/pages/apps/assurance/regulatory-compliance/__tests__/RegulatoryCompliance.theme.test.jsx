/**
 * Design system rollout W4E: Regulatory Compliance opts in to the Petrolord
 * theme. The shell mounts on the real hook over the in-memory database and
 * runs the shared four checks (opens light, the header toggle goes to dark
 * and back and stores the choice, no legacy console colour outside
 * data-canvas regions with a negative control, the route is registered for
 * the themed cold-load loaders). Every page is then walked in light and
 * dark, and the delete confirmation is opened and checked. The main action
 * sits on the primary role; amber is kept for status.
 */
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import {
  describeAppTheme, installDomShims, expectThemedPath,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import { makeFakeSupabase } from '../../shared/__tests__/fakeSupabase';
import {
  renderShell, settled, walkPages, expectConfirmOnRoles,
} from '../../__tests__/themeWalk';
import RegulatoryCompliancePageShell from '../RegulatoryCompliancePageShell';

let mockDb;
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (...args) => mockDb.client.from(...args),
    rpc: (...args) => mockDb.client.rpc(...args),
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  AuthContext: require('react').createContext(null),
  useAuth: () => ({ organization: { id: 'org-1' }, user: { id: 'user-1' } }),
}));

const ORG = 'org-1';
const BASE = '/dashboard/apps/assurance/regulatory-compliance';
const authority = { id: 'au1', org_id: ORG, name: 'Nigerian Upstream Petroleum Regulatory Commission', acronym: 'NUPRC', email: 'desk@example.com' };
const seed = () => ({
  regulatory_obligations: [
    {
      id: 'o1', org_id: ORG, obligation_code: 'REG-2026-001', title: 'Discharge return', due_date: '2026-01-31',
      frequency: 'Annual', lifecycle: 'Active', lead_time_days: 30, regime: 'Environmental', authority_id: 'au1', authority,
    },
    {
      id: 'o2', org_id: ORG, obligation_code: 'REG-2026-002', title: 'Flare permit', due_date: '2027-06-30', expiry_date: '2027-06-30',
      frequency: 'Annual', lifecycle: 'Active', lead_time_days: 30, regime: 'Permits', authority_id: 'au1', authority,
    },
  ],
  regulatory_authorities: [authority],
  regulatory_evidence: [],
  organization_members: [],
});

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

beforeAll(installDomShims);
beforeEach(() => { mockDb = makeFakeSupabase(seed()); });

describeAppTheme({
  name: 'Regulatory Compliance',
  route: BASE,
  renderApp: () => renderShell(RegulatoryCompliancePageShell, BASE),
  ready: settled,
  scopeTestId: 'regulatory-theme-scope',
});

const PAGES = [
  ['', null], ['/register', 'REG-2026-001'], ['/directory', 'NUPRC'], ['/reports', null],
  ['/new', null], ['/o1', /REG-2026-001/], ['/o1/edit', null],
];

describe('Regulatory Compliance themed pages', () => {
  it('every page reads in light with no legacy chrome', async () => {
    await walkPages(RegulatoryCompliancePageShell, BASE, PAGES, 'light');
  });

  it('every page reads in dark with no legacy chrome', async () => {
    await walkPages(RegulatoryCompliancePageShell, BASE, PAGES, 'dark');
  });

  it('the add action is on the primary role, and the delete confirmation opens themed', async () => {
    renderShell(RegulatoryCompliancePageShell, BASE, '/register');
    await settled();
    const add = screen.getAllByRole('button', { name: /add obligation/i })[0];
    expect(add.className).toMatch(/\bbg-pl-primary\b/);
    const bins = await screen.findAllByRole('button', { name: 'Delete' });
    fireEvent.click(bins[0]);
    await expectConfirmOnRoles();
  });

  it('registers every sub-page for the cold-load loaders', () => {
    PAGES.forEach(([sub]) => expectThemedPath(`${BASE}${sub}`));
  });
});
