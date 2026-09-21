import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';

const Dashboard = lazy(() => import('./Dashboard'));
const Register = lazy(() => import('./Register'));
const NewQAPlan = lazy(() => import('./NewQAPlan'));
const QAPlanDetail = lazy(() => import('./QAPlanDetail'));
const NCRRegister = lazy(() => import('./NCRRegister'));
const NCRDetail = lazy(() => import('./NCRDetail'));
const Reports = lazy(() => import('./Reports'));

/**
 * AS7 — the app's routes.
 *
 * Two of them were wrong. The detail route declared `:qaPlanId` while
 * the page read `useParams().id`, and there was no NCR route at all
 * although the register's rows navigated to `ncr/:id`, so a click on a
 * non-conformance fell through the catch-all onto the dashboard.
 */
export default function QAPlanPageShell() {
  return (
    <div className="qa-plan-shell h-full w-full">
      <Suspense fallback={<div className="flex items-center justify-center h-full">Loading QA Plan Module...</div>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="register" element={<Register />} />
          <Route path="new" element={<NewQAPlan />} />
          <Route path="ncr-register" element={<NCRRegister />} />
          <Route path="ncr/:ncrId" element={<NCRDetail />} />
          <Route path="reports" element={<Reports />} />
          <Route path=":planId" element={<QAPlanDetail />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </Suspense>
    </div>
  );
}