// Dev-only harness (/dev/production/:app; senior testing, Wave 4): any
// Production studio on the in-memory Supabase double, over a seeded po_*
// spine (productionSpineSeed.js) so well pickers, histories and saved
// projects work without auth or a database. One store per page load.
//
// Design-system rollout (Wave 0A): the harness adds no colours and no theme
// scope of its own: the dev routes sit in one theme scope in App.jsx
// (batch 7A), so each app paints itself as on its real route.
import React, { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import InMemorySupabase, { createStore } from './InMemorySupabase';
import DevAuth from './DevAuth';
import { productionSeed } from './productionSpineSeed';

const APPS = {
  'artificial-lift': lazy(() => import('@/pages/apps/ArtificialLiftAdvisor')),
  choke: lazy(() => import('@/pages/apps/ChokePerformanceStudio')),
  esp: lazy(() => import('@/pages/apps/EspDesignStudio')),
  'flow-assurance': lazy(() => import('@/pages/apps/FlowAssuranceStudio')),
  'gas-lift': lazy(() => import('@/pages/apps/GasLiftDesignStudio')),
  'gas-well': lazy(() => import('@/pages/apps/GasWellPerformanceStudio')),
  allocation: lazy(() => import('@/pages/apps/ProductionAllocationStudio')),
  network: lazy(() => import('@/pages/apps/ProductionNetworkStudio')),
  surveillance: lazy(() => import('@/pages/apps/ProductionSurveillanceStudio')),
  'rod-pump': lazy(() => import('@/pages/apps/RodPumpDesignStudio')),
  intervention: lazy(() => import('@/pages/apps/WellInterventionPlanner')),
};

const db = createStore(productionSeed());

export default function ProductionHarness() {
  const { app } = useParams();
  const App = APPS[app];
  if (!App) return <div className="p-6 text-slate-300">Unknown app. Try one of: {Object.keys(APPS).join(', ')}</div>;
  return (
    <InMemorySupabase db={db}>
      <DevAuth>
        <div className="min-h-screen">
          <Suspense fallback={<div className="p-6 text-slate-400">Loading...</div>}><App /></Suspense>
        </div>
      </DevAuth>
    </InMemorySupabase>
  );
}
