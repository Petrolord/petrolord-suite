/**
 * Design system rollout W4E: Audit & Findings Manager opts in to the
 * Petrolord theme. The shell mounts on the real hook over the in-memory
 * database and runs the shared four checks (opens light, the header toggle
 * goes to dark and back and stores the choice, no legacy console colour
 * outside data-canvas regions with a negative control, the route is
 * registered for the themed cold-load loaders). Every page is then walked
 * in light and dark, and the create forms and the delete confirmation are
 * opened and checked.
 */
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import {
  describeAppTheme, expectNoLegacyChrome, installDomShims, expectThemedPath,
} from '@/design/testing/themeAssertions';
import { makeFakeSupabase } from '../../shared/__tests__/fakeSupabase';
import {
  renderShell, settled, walkPages, expectConfirmOnRoles,
} from '../../__tests__/themeWalk';
import AuditManagerPageShell from '../AuditManagerPageShell';

let mockDb;
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (...args) => mockDb.client.from(...args),
    rpc: (...args) => mockDb.client.rpc(...args),
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  AuthContext: require('react').createContext(null),
  useAuth: () => ({ organization: { id: 'org-1' }, user: { id: 'user-1', email: 'me@example.com' } }),
}));

const ORG = 'org-1';
const BASE = '/dashboard/apps/assurance/audit-manager';
const seed = () => ({
  audit_programmes: [
    { id: 'p1', org_id: ORG, title: 'HSE programme 2026', programme_year: 2026, status: 'Draft' },
  ],
  audit_templates: [{ id: 't1', org_id: ORG, code: 'CL-1', title: 'Contractor', status: 'Active' }],
  audit_template_items: [
    { id: 'i1', template_id: 't1', item_no: '1.1', question: 'Permit displayed?', criticality: 'Critical', sequence: 1 },
  ],
  audit_records: [
    { id: 'a-rep', org_id: ORG, audit_code: 'AUD-2026-001', title: 'Rig 7', status: 'Reported', template_id: 't1', conclusion: 'Done', programme_id: 'p1' },
    { id: 'a-open', org_id: ORG, audit_code: 'AUD-2026-002', title: 'Rig 8', status: 'In progress', template_id: 't1', planned_end: '2026-01-01' },
  ],
  audit_responses: [
    { id: 'r1', audit_id: 'a-rep', item_id: 'i1', result: 'Conformant', examined_on: '2026-09-01' },
  ],
  audit_findings: [
    { id: 'f-open', org_id: ORG, finding_code: 'AF-2026-002', audit_id: 'a-open', title: 'Permit missing', finding_type: 'Major nonconformity', status: 'Open', raised_date: '2026-09-02', due_date: '2026-09-05', stop_work: true, correction: 'Stopped the job' },
    { id: 'f-err', org_id: ORG, finding_code: 'AF-2026-003', audit_id: 'a-open', title: 'Raised in error', finding_type: 'Observation', status: 'Open', raised_date: '2026-09-02' },
  ],
  audit_actions: [],
  audit_activity_log: [],
  organization_members: [],
});

beforeAll(installDomShims);
beforeEach(() => { mockDb = makeFakeSupabase(seed()); });

describeAppTheme({
  name: 'Audit & Findings Manager',
  route: BASE,
  renderApp: () => renderShell(AuditManagerPageShell, BASE),
  ready: settled,
  scopeTestId: 'audit-theme-scope',
});

const PAGES = [
  ['', null], ['/programmes', 'HSE programme 2026'], ['/checklists', 'Contractor'], ['/audits', 'AUD-2026-002'],
  ['/audits/a-open', /AUD-2026-002/], ['/audits/a-rep', /AUD-2026-001/], ['/findings', 'AF-2026-002'],
  ['/findings/f-open', /AF-2026-002/], ['/reports', null],
];

describe('Audit & Findings Manager themed pages', () => {
  it('every page reads in light with no legacy chrome', async () => {
    await walkPages(AuditManagerPageShell, BASE, PAGES, 'light');
  });

  it('every page reads in dark with no legacy chrome', async () => {
    await walkPages(AuditManagerPageShell, BASE, PAGES, 'dark');
  });

  it('the create forms stay on roles', async () => {
    renderShell(AuditManagerPageShell, BASE, '/programmes');
    await settled();
    fireEvent.click(await screen.findByRole('button', { name: /new programme/i }));
    expectNoLegacyChrome();
  });

  it('the plan-an-audit form stays on roles', async () => {
    renderShell(AuditManagerPageShell, BASE, '/audits');
    await settled();
    fireEvent.click(await screen.findByRole('button', { name: /plan an audit/i }));
    expectNoLegacyChrome();
  });

  it('the delete confirmation opens themed with its action on the danger role', async () => {
    renderShell(AuditManagerPageShell, BASE, '/findings');
    await settled();
    const bins = await screen.findAllByTitle('Delete a finding raised in error');
    fireEvent.click(bins[bins.length - 1]);
    await expectConfirmOnRoles();
  });

  it('registers every sub-page for the cold-load loaders', () => {
    PAGES.forEach(([sub]) => expectThemedPath(`${BASE}${sub}`));
  });
});
