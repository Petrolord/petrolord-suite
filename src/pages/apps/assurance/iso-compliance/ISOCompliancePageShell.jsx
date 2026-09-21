import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';

const Dashboard = lazy(() => import('./Dashboard'));
const Standards = lazy(() => import('./Standards'));
const ClauseRegister = lazy(() => import('./ClauseRegister'));
const InternalAudits = lazy(() => import('./InternalAudits'));
const AuditDetail = lazy(() => import('./AuditDetail'));
const FindingsRegister = lazy(() => import('./FindingsRegister'));
const FindingDetail = lazy(() => import('./FindingDetail'));
const Reports = lazy(() => import('./Reports'));

/**
 * AS8 — the app's routes.
 *
 * The shell this replaces was not a router: it held the four generated
 * arrays in `useState` and passed them to every page as props, so the
 * pages could not have queried anything even if they had wanted to. Its
 * one detail route, `:id`, rendered a page that showed the URL's id as
 * a heading over a status panel hardcoded to Compliant / Current /
 * Oct 12, 2023, whichever clause was asked for.
 */
export default function ISOCompliancePageShell() {
  return (
    <div className="iso-compliance-shell h-full w-full">
      <Suspense fallback={<div className="flex items-center justify-center h-full">Loading ISO Compliance...</div>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="standards" element={<Standards />} />
          <Route path="clauses" element={<ClauseRegister />} />
          <Route path="audits" element={<InternalAudits />} />
          <Route path="audits/:auditId" element={<AuditDetail />} />
          <Route path="findings" element={<FindingsRegister />} />
          <Route path="findings/:findingId" element={<FindingDetail />} />
          <Route path="reports" element={<Reports />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </Suspense>
    </div>
  );
}
