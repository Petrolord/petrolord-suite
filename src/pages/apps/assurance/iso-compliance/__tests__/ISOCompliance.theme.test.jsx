/**
 * Design system rollout W4E: ISO Compliance opts in to the Petrolord theme.
 * The shell mounts on the real hook over the in-memory database and runs
 * the shared four checks (opens light, the header toggle goes to dark and
 * back and stores the choice, no legacy console colour outside data-canvas
 * regions with a negative control, the route is registered for the themed
 * cold-load loaders). Every page is then walked in light and dark, and the
 * create forms and the delete confirmation are opened and checked.
 */
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import {
  describeAppTheme, expectNoLegacyChrome, installDomShims, expectThemedPath,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import { makeFakeSupabase } from '../../shared/__tests__/fakeSupabase';
import {
  renderShell, settled, walkPages, expectConfirmOnRoles,
} from '../../__tests__/themeWalk';
import ISOCompliancePageShell from '../ISOCompliancePageShell';

let mockDb;
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (...args) => mockDb.client.from(...args),
    rpc: (...args) => mockDb.client.rpc(...args),
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  AuthContext: require('react').createContext(null),
  useAuth: () => ({ organization: { id: 'org-1' }, user: { id: 'user-B' } }),
}));

const ORG = 'org-1';
const BASE = '/dashboard/apps/assurance/iso-compliance';
const seed = () => ({
  iso_standards: [{ id: 's1', org_id: ORG, code: 'ISO 9001', title: 'Quality management', cycle_years: 3, certificate_expires: '2027-01-01' }],
  iso_clauses: [
    { id: 'c1', org_id: ORG, standard_id: 's1', clause_ref: '7.1.5', title: 'Monitoring', status: 'Conformant', evidence_reference: 'QMS-9', assessed_date: '2026-01-10', assessed_by: 'user-A', applicability: 'Applicable', owner_name: 'Jane Doe' },
    { id: 'c2', org_id: ORG, standard_id: 's1', clause_ref: '8.5', title: 'Production', status: 'Not assessed', applicability: 'Applicable', owner_id: 'user-X', owner_name: 'Xavier' },
  ],
  iso_audits: [
    { id: 'a1', org_id: ORG, audit_code: 'IA-2026-001', title: 'Q3', audit_type: 'Internal', status: 'Planned', standard_id: 's1', lead_auditor_name: 'jane doe', planned_start: '2026-01-01', planned_end: '2026-01-05' },
  ],
  iso_audit_clauses: [],
  iso_findings: [
    { id: 'f1', org_id: ORG, finding_code: 'IF-2026-001', audit_id: 'a1', standard_id: 's1', title: 'Calibration gap', finding_type: 'Major nonconformity', status: 'Open', raised_date: '2026-09-01', due_date: '2026-09-10' },
  ],
  iso_actions: [],
  iso_activity_log: [],
  organization_members: [],
});

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

beforeAll(installDomShims);
beforeEach(() => {
  mockDb = makeFakeSupabase(seed());
});

describeAppTheme({
  name: 'ISO Compliance',
  route: BASE,
  renderApp: () => renderShell(ISOCompliancePageShell, BASE),
  ready: settled,
  scopeTestId: 'iso-theme-scope',
});

const PAGES = [
  ['', null], ['/standards', 'ISO 9001'], ['/clauses', 'Monitoring'], ['/audits', 'IA-2026-001'],
  ['/audits/a1', 'IA-2026-001'], ['/findings', 'IF-2026-001'], ['/findings/f1', /IF-2026-001/], ['/reports', null],
];

describe('ISO Compliance themed pages', () => {
  it('every page reads in light with no legacy chrome', async () => {
    await walkPages(ISOCompliancePageShell, BASE, PAGES, 'light');
  });

  it('every page reads in dark with no legacy chrome', async () => {
    await walkPages(ISOCompliancePageShell, BASE, PAGES, 'dark');
  });

  it('the create forms and the delete confirmation stay on roles', async () => {
    renderShell(ISOCompliancePageShell, BASE, '/standards');
    await settled();
    await screen.findAllByText('ISO 9001');
    fireEvent.click(screen.getByRole('button', { name: /add a standard/i }));
    expectNoLegacyChrome();
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    await expectConfirmOnRoles();
  });

  it('registers every sub-page for the cold-load loaders', () => {
    PAGES.forEach(([sub]) => expectThemedPath(`${BASE}${sub}`));
  });
});
