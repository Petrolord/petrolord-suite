import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';

const Dashboard = lazy(() => import('./Dashboard'));
const Programmes = lazy(() => import('./Programmes'));
const Checklists = lazy(() => import('./Checklists'));
const Audits = lazy(() => import('./Audits'));
const AuditDetail = lazy(() => import('./AuditDetail'));
const Findings = lazy(() => import('./Findings'));
const FindingDetail = lazy(() => import('./FindingDetail'));
const Reports = lazy(() => import('./Reports'));

/**
 * AS10 — the app's routes. Every detail page reads the parameter its
 * route declares, which is the defect AS7 found twice in one app.
 */
export default function AuditManagerPageShell() {
  return (
    <div className="audit-manager-shell h-full w-full">
      <Suspense fallback={<div className="flex items-center justify-center h-full">Loading Audit & Findings Manager...</div>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="programmes" element={<Programmes />} />
          <Route path="checklists" element={<Checklists />} />
          <Route path="audits" element={<Audits />} />
          <Route path="audits/:auditId" element={<AuditDetail />} />
          <Route path="findings" element={<Findings />} />
          <Route path="findings/:findingId" element={<FindingDetail />} />
          <Route path="reports" element={<Reports />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </Suspense>
    </div>
  );
}
