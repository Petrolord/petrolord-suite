import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';

const Dashboard = lazy(() => import('./Dashboard'));
const Register = lazy(() => import('./Register'));
const NewQAPlan = lazy(() => import('./NewQAPlan'));
const QAPlanDetail = lazy(() => import('./QAPlanDetail'));
const NCRRegister = lazy(() => import('./NCRRegister'));
const Reports = lazy(() => import('./Reports'));

export default function QAPlanPageShell() {
  return (
    <div className="qa-plan-shell h-full w-full">
      <Suspense fallback={<div className="flex items-center justify-center h-full">Loading QA Plan Module...</div>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="register" element={<Register />} />
          <Route path="new" element={<NewQAPlan />} />
          <Route path=":qaPlanId" element={<QAPlanDetail />} />
          <Route path="ncr-register" element={<NCRRegister />} />
          <Route path="reports" element={<Reports />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </Suspense>
    </div>
  );
}