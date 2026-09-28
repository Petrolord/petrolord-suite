/**
 * Design system rollout batch 4F: Document Control, Peer Review Manager,
 * Management of Change and Quality Assurance Plan opt in to the Petrolord
 * theme. Each app's own shell wraps itself in <ThemedApp> (QA Plan once, in
 * the page shell that holds its nested routes) and carries the header toggle.
 *
 * describeAppTheme checks light by default, the toggle round trip, no legacy
 * console colour outside canvases (with a negative control) and the
 * cold-load registration. The tests below open every page of each app in
 * light and in dark against a seeded in-memory database, so the status
 * badges, the register rows, the detail pages and the white report charts
 * are all on screen when the check runs.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import { makeSchemaFake } from '../shared/__tests__/fakeSupabaseSchema';
import { createFakeSupabase } from './fakeSupabase';

let mockDb;
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (...args) => mockDb.client.from(...args),
    rpc: (...args) => mockDb.client.rpc(...args),
    get storage() { return mockDb.client.storage; },
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ organization: { id: 'org-1' }, user: { id: 'u1' } }),
  AuthContext: require('react').createContext(null),
}));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

/* eslint-disable import/first */
import DocDashboard from '../document-control/Dashboard';
import DocLibrary from '../document-control/Library';
import DocNew from '../document-control/NewDocument';
import DocApprovals from '../document-control/ApprovalQueue';
import DocReports from '../document-control/Reports';
import DocDetail from '../document-control/DocumentDetail';
import PrDashboard from '../peer-review/Dashboard';
import PrRegister from '../peer-review/ReviewRegister';
import PrNew from '../peer-review/NewReview';
import PrReports from '../peer-review/Reports';
import PrDetail from '../peer-review/ReviewDetail';
import MocDashboard from '../moc/Dashboard';
import MocRegister from '../moc/Register';
import MocNew from '../moc/NewMOC';
import MocApprovals from '../moc/Approvals';
import MocReports from '../moc/Reports';
import MocDetail from '../moc/MOCDetail';
import QAPlanPageShell from '../qa-plan/QAPlanPageShell';
/* eslint-enable import/first */

const T = '2026-09-18T08:00:00.000Z';
const TABLES = () => ({
  documents: [
    {
      id: 'd1', org_id: 'org-1', document_number: 'HSE-001', title: 'Permit to work procedure',
      status: 'Published', current_revision: '01', review_period_months: 24,
      next_review_date: '2026-01-01', confidentiality: 'Internal', updated_at: T, created_at: T,
    },
    {
      id: 'd2', org_id: 'org-1', document_number: 'HSE-002', title: 'Lifting plan',
      status: 'Draft', current_revision: '01', review_period_months: 24, confidentiality: 'Confidential',
      updated_at: T, created_at: T,
    },
  ],
  doc_revisions: [
    { id: 'r1', document_id: 'd1', revision_number: '01', status: 'Published', is_current: true, created_at: T },
    { id: 'r2', document_id: 'd2', revision_number: '01', status: 'Draft', is_current: true, created_at: T },
  ],
  doc_categories: [],
  doc_workflows: [],
  doc_activity_log: [],
  organization_members: [],
  moc_records: [
    {
      id: 'm1', org_id: 'org-1', moc_code: 'MOC-2026-001', title: 'Temporary clamp on line 4',
      type: 'Temporary', stage: 'Approval', risk_level: 'High', expiry_date: '2026-12-31',
      originator_id: 'u2', created_at: T, updated_at: T,
    },
  ],
  moc_approvals: [],
  moc_actions: [],
  moc_impacts: [],
  moc_activity_log: [],
  peer_reviews: [
    {
      id: 'p1', org_id: 'org-1', review_code: 'PR-2026-001', title: 'Well plan', stage: 'In Review',
      review_type: 'Technical', due_date: '2026-10-01', created_by: 'u2', created_at: T, updated_at: T,
    },
  ],
  peer_review_comments: [
    { id: 'c1', review_id: 'p1', org_id: 'org-1', severity: 'Major', status: 'Open', comment: 'Check casing', created_at: T },
  ],
  peer_review_participants: [],
  peer_review_audit: [],
  qa_plans: [
    { id: 'q1', org_id: 'org-1', plan_code: 'QAP-001', title: 'Pipeline tie-in QA', status: 'Active', created_at: T, updated_at: T },
  ],
  qa_checkpoints: [],
  qa_ncrs: [
    {
      id: 'n1', org_id: 'org-1', ncr_code: 'NCR-001', title: 'Weld defect', status: 'Open',
      severity: 'Major', qa_plan_id: 'q1', created_at: T, updated_at: T,
    },
  ],
  qa_capas: [],
  qa_activity_log: [],
});
// The schema fake has storage and schema errors; the plain fake has .range(),
// which the peer review audit trail pages with.
const seed = () => makeSchemaFake(TABLES());
const seedPlain = () => ({ client: createFakeSupabase(TABLES()) });

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

beforeAll(installDomShims);
beforeEach(() => { mockDb = seed(); });

const DOC = '/dashboard/apps/assurance/document-control';
const PR = '/dashboard/apps/assurance/peer-review-manager';
const MOC = '/dashboard/apps/assurance/management-of-change';
const QA = '/dashboard/apps/assurance/qa-plan';

const docRoutes = (
  <Routes>
    <Route path={DOC} element={<DocDashboard />} />
    <Route path={`${DOC}/library`} element={<DocLibrary />} />
    <Route path={`${DOC}/new`} element={<DocNew />} />
    <Route path={`${DOC}/approvals`} element={<DocApprovals />} />
    <Route path={`${DOC}/reports`} element={<DocReports />} />
    <Route path={`${DOC}/:id`} element={<DocDetail />} />
  </Routes>
);
const prRoutes = (
  <Routes>
    <Route path={PR} element={<PrDashboard />} />
    <Route path={`${PR}/register`} element={<PrRegister />} />
    <Route path={`${PR}/new`} element={<PrNew />} />
    <Route path={`${PR}/reports`} element={<PrReports />} />
    <Route path={`${PR}/:id`} element={<PrDetail />} />
  </Routes>
);
const mocRoutes = (
  <Routes>
    <Route path={MOC} element={<MocDashboard />} />
    <Route path={`${MOC}/register`} element={<MocRegister />} />
    <Route path={`${MOC}/new`} element={<MocNew />} />
    <Route path={`${MOC}/approvals`} element={<MocApprovals />} />
    <Route path={`${MOC}/reports`} element={<MocReports />} />
    <Route path={`${MOC}/:id`} element={<MocDetail />} />
  </Routes>
);
const qaRoutes = (
  <Routes>
    <Route path={`${QA}/*`} element={<QAPlanPageShell />} />
  </Routes>
);

const APPS = [
  {
    name: 'Document Control', base: DOC, routes: docRoutes, scopeTestId: 'doc-control-theme-scope',
    title: 'Document Control', pages: ['', '/library', '/new', '/approvals', '/reports', '/d1'],
  },
  {
    name: 'Peer Review Manager', base: PR, routes: prRoutes, scopeTestId: 'peer-review-theme-scope',
    title: 'Peer Review Manager', plain: true, pages: ['', '/register', '/new', '/reports', '/p1'],
  },
  {
    name: 'Management of Change', base: MOC, routes: mocRoutes, scopeTestId: 'moc-theme-scope',
    title: 'Management of Change', pages: ['', '/register', '/new', '/approvals', '/reports', '/m1'],
  },
  {
    name: 'Quality Assurance Plan', base: QA, routes: qaRoutes, scopeTestId: 'qa-plan-theme-scope',
    title: 'Quality Assurance Plan', pages: ['', '/register', '/new', '/ncr-register', '/ncr/n1', '/reports', '/q1'],
  },
];

// Seeded text each page shows once its hook has loaded.
const SEEN = {
  [`${DOC}/library`]: 'Permit to work procedure',
  [`${DOC}/d1`]: 'Permit to work procedure',
  [`${PR}/register`]: 'Well plan',
  [`${PR}/p1`]: 'Well plan',
  [`${MOC}/register`]: 'Temporary clamp on line 4',
  [`${MOC}/m1`]: 'Temporary clamp on line 4',
  [`${QA}/register`]: 'Pipeline tie-in QA',
  [`${QA}/q1`]: 'Pipeline tie-in QA',
  [`${QA}/ncr-register`]: 'Weld defect',
  [`${QA}/ncr/n1`]: 'Weld defect',
};

const mountAt = (app, sub) => render(
  <MemoryRouter initialEntries={[`${app.base}${sub}`]}>{app.routes}</MemoryRouter>,
);
// Every page has an h1 in the app's shell; wait until the hook has loaded.
const settle = async (app, sub = '') => {
  await screen.findAllByRole('heading', { level: 1 });
  const seen = SEEN[`${app.base}${sub}`];
  if (seen) await screen.findAllByText(new RegExp(seen));
  await screen.findByTestId('theme-toggle');
  await new Promise((r) => { setTimeout(r, 0); });
  return getScopeRoot(app.scopeTestId);
};

APPS.forEach((app) => {
  describeAppTheme({
    name: app.name,
    route: app.base,
    renderApp: () => mountAt(app, ''),
    ready: () => screen.findByRole('heading', { level: 1, name: app.title }),
    scopeTestId: app.scopeTestId,
  });

  describe(`${app.name} themed pages`, () => {
    beforeEach(() => { if (app.plain) mockDb = seedPlain(); });
    beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

    app.pages.forEach((sub) => {
      it(`${sub || '/'} reads on roles in light and in dark`, async () => {
        mountAt(app, sub);
        const scope = await settle(app, sub);
        expect(scope).toHaveAttribute('data-pl-theme', 'light');
        expectNoLegacyChrome();
        fireEvent.click(screen.getByTestId('theme-toggle'));
        expect(scope).toHaveAttribute('data-pl-theme', 'dark');
        expectNoLegacyChrome();
        scope.querySelectorAll('[data-canvas="chart"]').forEach((c) => {
          expect(c.getAttribute('style')).toMatch(/background-color/);
        });
      });
    });
  });
});
