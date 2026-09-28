// Dev-only harness (/dev/assurance/:app; senior testing, Wave 7): the
// Assurance apps on the in-memory Supabase double. Their pages link to one
// another by absolute /dashboard/apps/assurance/... paths, so they run in a
// nested MemoryRouter that starts at the real path (the browser URL stays on
// the harness). The outer router's location context is reset so React
// Router accepts the nesting. One organization and one member; every table
// starts empty, and the code-number RPCs are stood in.
//
// Design-system rollout (Wave 0A): the harness adds no colours and no theme
// scope of its own. Each app paints itself exactly as on its real route (an
// unmigrated app on the body's legacy dark background, a migrated one inside
// the ThemedApp it wraps itself in), so no rollout batch edits this file.
import React, { lazy, Suspense } from 'react';
import {
  MemoryRouter, Routes, Route, useParams, UNSAFE_LocationContext, UNSAFE_RouteContext,
} from 'react-router-dom';
import InMemorySupabase, { createStore, DEV_USER } from './InMemorySupabase';
import DevAuth from './DevAuth';

const RiskRegister = lazy(() => import('@/pages/apps/RiskRegister.jsx'));
const NewRisk = lazy(() => import('@/pages/apps/risk-register/NewRiskPage.jsx'));
const RiskDetail = lazy(() => import('@/pages/apps/risk-register/RiskDetailPage.jsx'));
const EditRisk = lazy(() => import('@/pages/apps/risk-register/EditRiskPage.jsx'));
const DocDash = lazy(() => import('@/pages/apps/assurance/document-control/Dashboard.jsx'));
const DocLib = lazy(() => import('@/pages/apps/assurance/document-control/Library.jsx'));
const DocNew = lazy(() => import('@/pages/apps/assurance/document-control/NewDocument.jsx'));
const DocAppr = lazy(() => import('@/pages/apps/assurance/document-control/ApprovalQueue.jsx'));
const DocRep = lazy(() => import('@/pages/apps/assurance/document-control/Reports.jsx'));
const DocDetail = lazy(() => import('@/pages/apps/assurance/document-control/DocumentDetail.jsx'));
const PrDash = lazy(() => import('@/pages/apps/assurance/peer-review/Dashboard.jsx'));
const PrReg = lazy(() => import('@/pages/apps/assurance/peer-review/ReviewRegister.jsx'));
const PrNew = lazy(() => import('@/pages/apps/assurance/peer-review/NewReview.jsx'));
const PrRep = lazy(() => import('@/pages/apps/assurance/peer-review/Reports.jsx'));
const PrDetail = lazy(() => import('@/pages/apps/assurance/peer-review/ReviewDetail.jsx'));
const MocDash = lazy(() => import('@/pages/apps/assurance/moc/Dashboard.jsx'));
const MocReg = lazy(() => import('@/pages/apps/assurance/moc/Register.jsx'));
const MocNew = lazy(() => import('@/pages/apps/assurance/moc/NewMOC.jsx'));
const MocAppr = lazy(() => import('@/pages/apps/assurance/moc/Approvals.jsx'));
const MocRep = lazy(() => import('@/pages/apps/assurance/moc/Reports.jsx'));
const MocDetail = lazy(() => import('@/pages/apps/assurance/moc/MOCDetail.jsx'));
const QaShell = lazy(() => import('@/pages/apps/assurance/qa-plan/QAPlanPageShell.jsx'));
const RegShell = lazy(() => import('@/pages/apps/assurance/regulatory-compliance/RegulatoryCompliancePageShell.jsx'));
const IsoShell = lazy(() => import('@/pages/apps/assurance/iso-compliance/ISOCompliancePageShell'));
const LessonShell = lazy(() => import('@/pages/apps/assurance/lessons-learned/LessonsLearnedPageShell.jsx'));
const AuditShell = lazy(() => import('@/pages/apps/assurance/audit-manager/AuditManagerPageShell.jsx'));

const ORG = { id: 'dev-org', name: 'Harness Energy' };
const TS = '2026-09-27T00:00:00.000Z';
const TABLES = [
  'audit_actions', 'audit_activity_log', 'audit_findings', 'audit_programmes', 'audit_records', 'audit_responses',
  'audit_template_items', 'audit_templates', 'doc_activity_log', 'doc_categories', 'doc_revisions', 'doc_workflows',
  'documents', 'iso_actions', 'iso_activity_log', 'iso_audit_clauses', 'iso_audits', 'iso_clauses', 'iso_findings',
  'iso_standards', 'lesson_activity_log', 'lesson_applications', 'lesson_records', 'moc_actions', 'moc_activity_log',
  'moc_approvals', 'moc_impacts', 'moc_records', 'peer_review_audit', 'peer_review_comments',
  'peer_review_participants', 'peer_reviews', 'qa_activity_log', 'qa_capas', 'qa_checkpoints', 'qa_ncrs', 'qa_plans',
  'regulatory_authorities', 'regulatory_evidence', 'regulatory_obligations', 'risk_links', 'risk_register',
  'risk_register_snapshots', 'risk_tags', 'saved_reports',
];
// Column DEFAULTs from the create-table migrations (supabase/migrations),
// so an insert that relies on one reads back as the database returns it.
const DEFAULTS = {
  'risk_register': {
    'status': 'Open'
  },
  'doc_revisions': {
    'status': 'Draft'
  },
  'doc_workflows': {
    'status': 'Pending'
  },
  'documents': {
    'status': 'Draft',
    'confidentiality': 'Internal',
    'current_revision': 1
  },
  'moc_actions': {
    'status': 'Open'
  },
  'moc_approvals': {
    'level': 1,
    'status': 'Pending'
  },
  'moc_records': {
    'stage': 'Draft',
    'priority': 'Medium'
  },
  'peer_review_comments': {
    'severity': 'Minor',
    'status': 'Open'
  },
  'peer_reviews': {
    'stage': 'Draft',
    'priority': 'Medium'
  },
  'qa_plans': {
    'status': 'Draft'
  },
  'qa_checkpoints': {
    'point_type': 'Review point',
    'status': 'Pending'
  },
  'qa_ncrs': {
    'severity': 'Minor',
    'status': 'Open'
  },
  'qa_capas': {
    'action_type': 'Corrective',
    'status': 'Open'
  },
  'iso_standards': {
    'certification_status': 'Not certified',
    'cycle_years': 3
  },
  'iso_clauses': {
    'applicability': 'Applicable',
    'status': 'Not assessed'
  },
  'iso_audits': {
    'audit_type': 'Internal',
    'status': 'Planned'
  },
  'iso_audit_clauses': {
    'result': 'Not examined'
  },
  'iso_findings': {
    'finding_type': 'Observation',
    'status': 'Open'
  },
  'iso_actions': {
    'action_type': 'Corrective',
    'status': 'Open'
  },
  'lesson_records': {
    'source_type': 'Other',
    'applicability_scope': 'This asset',
    'status': 'Draft'
  },
  'lesson_applications': {
    'outcome': 'Adopted'
  },
  'audit_programmes': {
    'status': 'Draft'
  },
  'audit_templates': {
    'audit_type': 'Safety',
    'status': 'Draft'
  },
  'audit_template_items': {
    'criticality': 'Minor'
  },
  'audit_records': {
    'audit_type': 'Safety',
    'status': 'Planned'
  },
  'audit_responses': {
    'result': 'Not examined'
  },
  'audit_findings': {
    'finding_type': 'Observation',
    'stop_work': false,
    'status': 'Open'
  },
  'audit_actions': {
    'action_type': 'Corrective',
    'status': 'Open'
  }
};

const seed = () => ({
  ...Object.fromEntries(TABLES.map((t) => [t, []])),
  __defaults: DEFAULTS,
  // generated columns (as1 risk_score, as2 residual_score)
  __computed: {
    risk_register: (r) => {
      const n = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
      const l = n(r.likelihood); const i = n(r.impact);
      return {
        risk_score: l != null && i != null ? l * i : null,
        residual_score: l != null && i != null ? (n(r.residual_likelihood) ?? l) * (n(r.residual_impact) ?? i) : null,
      };
    },
  },
  organization_members: [
    { id: 'om-1', organization_id: ORG.id, user_id: DEV_USER.id, full_name: 'Harness Engineer', email: DEV_USER.email, role: 'admin', status: 'active', created_at: TS },
    { id: 'om-2', organization_id: ORG.id, user_id: 'dev-user-2', full_name: 'Harness Reviewer', email: 'reviewer@petrolord.dev', role: 'member', status: 'active', created_at: TS },
  ],
});

// next_*_code stand-ins: PREFIX-YYYY-NNN over the rows already stored.
const counter = (prefix, table) => async (_args, db) => {
  const n = (db[table] || []).length + 1;
  return { data: `${prefix}-2026-${String(n).padStart(3, '0')}`, error: null };
};
const RPC = {
  next_risk_code: counter('RSK', 'risk_register'),
  next_document_number: counter('DOC', 'documents'),
  next_moc_code: counter('MOC', 'moc_records'),
  next_peer_review_code: counter('PR', 'peer_reviews'),
  next_lesson_code: counter('LL', 'lesson_records'),
  next_obligation_code: counter('OBL', 'regulatory_obligations'),
  next_qa_plan_code: counter('QAP', 'qa_plans'),
  next_ncr_code: counter('NCR', 'qa_ncrs'),
  next_audit_code: counter('AUD', 'audit_records'),
  next_audit_finding_code: counter('AF', 'audit_findings'),
  next_iso_audit_code: counter('ISA', 'iso_audits'),
  next_iso_finding_code: counter('ISF', 'iso_findings'),
};

const START = {
  'risk-register': 'risk-register', 'document-control': 'document-control', 'peer-review': 'peer-review-manager',
  moc: 'management-of-change', 'qa-plan': 'qa-plan', regulatory: 'regulatory-compliance', iso: 'iso-compliance',
  lessons: 'lessons-learned', audit: 'audit-manager',
};

let store = null;
const B = '/dashboard/apps/assurance';

export default function AssuranceHarness() {
  const { app } = useParams();
  if (!START[app]) return <div className="p-6 text-slate-300">Unknown app. Try one of: {Object.keys(START).join(', ')}</div>;
  if (!store) store = createStore(seed());
  return (
    <InMemorySupabase db={store} rpc={RPC}>
      <DevAuth organization={ORG}>
        <UNSAFE_LocationContext.Provider value={null}>
          <UNSAFE_RouteContext.Provider value={{ outlet: null, matches: [], isDataRoute: false }}>
            <MemoryRouter initialEntries={[`${B}/${START[app]}`]}>
              <div className="min-h-screen">
                <Suspense fallback={<div className="p-6 text-slate-400">Loading...</div>}>
                  <Routes>
                    <Route path={`${B}/risk-register`} element={<RiskRegister />} />
                    <Route path={`${B}/risk-register/new`} element={<NewRisk />} />
                    <Route path={`${B}/risk-register/:id/edit`} element={<EditRisk />} />
                    <Route path={`${B}/risk-register/:id`} element={<RiskDetail />} />
                    <Route path={`${B}/document-control`} element={<DocDash />} />
                    <Route path={`${B}/document-control/library`} element={<DocLib />} />
                    <Route path={`${B}/document-control/new`} element={<DocNew />} />
                    <Route path={`${B}/document-control/approvals`} element={<DocAppr />} />
                    <Route path={`${B}/document-control/reports`} element={<DocRep />} />
                    <Route path={`${B}/document-control/:id`} element={<DocDetail />} />
                    <Route path={`${B}/peer-review-manager`} element={<PrDash />} />
                    <Route path={`${B}/peer-review-manager/register`} element={<PrReg />} />
                    <Route path={`${B}/peer-review-manager/new`} element={<PrNew />} />
                    <Route path={`${B}/peer-review-manager/reports`} element={<PrRep />} />
                    <Route path={`${B}/peer-review-manager/:id`} element={<PrDetail />} />
                    <Route path={`${B}/management-of-change`} element={<MocDash />} />
                    <Route path={`${B}/management-of-change/register`} element={<MocReg />} />
                    <Route path={`${B}/management-of-change/new`} element={<MocNew />} />
                    <Route path={`${B}/management-of-change/approvals`} element={<MocAppr />} />
                    <Route path={`${B}/management-of-change/reports`} element={<MocRep />} />
                    <Route path={`${B}/management-of-change/:id`} element={<MocDetail />} />
                    <Route path={`${B}/qa-plan/*`} element={<QaShell />} />
                    <Route path={`${B}/regulatory-compliance/*`} element={<RegShell />} />
                    <Route path={`${B}/iso-compliance/*`} element={<IsoShell />} />
                    <Route path={`${B}/lessons-learned/*`} element={<LessonShell />} />
                    <Route path={`${B}/audit-manager/*`} element={<AuditShell />} />
                    <Route path="*" element={<div className="p-6 text-amber-300">Left the Assurance apps (a link outside the harness).</div>} />
                  </Routes>
                </Suspense>
              </div>
            </MemoryRouter>
          </UNSAFE_RouteContext.Provider>
        </UNSAFE_LocationContext.Provider>
      </DevAuth>
    </InMemorySupabase>
  );
}
