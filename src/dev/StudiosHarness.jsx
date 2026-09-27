// Dev-only harness (/dev/studio/:app; senior testing, Waves 6 and 7): any
// economics, downstream, reservoir, Data & AI or Assurance studio on the
// in-memory Supabase double, so it runs and saves without auth or a
// database. One store per page load; tables are created on first use.
import React, { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import InMemorySupabase, { createStore, DEV_USER } from './InMemorySupabase';
import DevAuth from './DevAuth';

const APPS = {
  afe: lazy(() => import('@/pages/apps/AfeCostControlManager')),
  'decision-tree': lazy(() => import('@/pages/apps/DecisionTreeBuilder')),
  npv: lazy(() => import('@/pages/apps/NpvScenarioBuilder')),
  breakeven: lazy(() => import('@/pages/apps/ProbabilisticBreakevenAnalyzer')),
  'project-management': lazy(() => import('@/pages/apps/ProjectManagementPro')),
  'report-autopilot': lazy(() => import('@/pages/apps/TechnicalReportAutopilot')),
  'crude-assay': lazy(() => import('@/pages/apps/CrudeAssayBlendingStudio')),
  'energy-efficiency': lazy(() => import('@/pages/apps/EnergyEfficiencyStudio')),
  'fuel-pricing': lazy(() => import('@/pages/apps/FuelPricingStudio')),
  'lpg-cng': lazy(() => import('@/pages/apps/LpgCngRolloutStudio')),
  blending: lazy(() => import('@/pages/apps/ProductBlendingOptimizer')),
  'refinery-planning': lazy(() => import('@/pages/apps/RefineryPlanningStudio')),
  'terminal-depot': lazy(() => import('@/pages/apps/TerminalDepotStudio')),
};

// Worked cases with closed-form answers, per app (checked in the T1 reports).
const U = DEV_USER.id;
const TS = '2026-09-26T00:00:00.000Z';
const SEEDS = {
  // AFE: budget 8.5M; EAC max(budget, actual + commitment) unless entered:
  // RIG 5.0M, CSG 2.3M (entered), SVC 1.5M, so 8.8M and a 0.3M overrun;
  // EV 5.0 x 0.6 + 2.0 x 0.9 + 1.5 x 0.3 = 5.25M against 5.2M actual.
  afe: () => ({
    projects: [{ id: 'proj-h1', user_id: U, name: 'Harness Well H-1', created_at: TS }],
    afes: [{
      id: 'afe-h1', user_id: U, project_id: 'proj-h1', afe_number: 'AFE-2026-014', afe_name: 'H-1 drill and complete', class: 'Budget',
      budget: 8500000, currency: 'USD', status: 'Approved', start_date: '2026-06-01', end_date: '2026-12-31',
      description: 'Harness worked case', created_at: TS, updated_at: TS,
    }],
    afe_cost_items: [
      { id: 'ci-rig', afe_id: 'afe-h1', user_id: U, code: 'RIG', wbs_code: '1.1', category: 'Drilling', description: 'Rig and drilling services', vendor: 'Harness Rigs', budget: 5000000, actual: 3000000, commitment: 1000000, progress: 60, forecast: null, created_at: TS },
      { id: 'ci-csg', afe_id: 'afe-h1', user_id: U, code: 'CSG', wbs_code: '1.2', category: 'Materials', description: 'Casing and tubulars', vendor: 'Harness Pipe', budget: 2000000, actual: 1800000, commitment: 0, progress: 90, forecast: 2300000, created_at: TS },
      { id: 'ci-svc', afe_id: 'afe-h1', user_id: U, code: 'SVC', wbs_code: '1.3', category: 'Services', description: 'Completion services', vendor: 'Harness Services', budget: 1500000, actual: 400000, commitment: 200000, progress: 30, forecast: null, created_at: TS },
    ],
    afe_invoices: [
      { id: 'inv-1', afe_id: 'afe-h1', user_id: U, cost_item_id: 'ci-rig', invoice_number: 'HR-1001', vendor: 'Harness Rigs', amount: 1000000, invoice_date: '2026-07-15', status: 'Approved', created_at: TS },
      { id: 'inv-2', afe_id: 'afe-h1', user_id: U, cost_item_id: 'ci-csg', invoice_number: 'HP-2001', vendor: 'Harness Pipe', amount: 1800000, invoice_date: '2026-08-10', status: 'Paid', created_at: TS },
    ],
    afe_partners: [
      { id: 'pt-a', afe_id: 'afe-h1', name: 'Harness Partner', working_interest: 40, partner_type: 'Non-Operator', created_at: TS, updated_at: TS },
    ],
    afe_changes: [
      { id: 'chg-1', afe_id: 'afe-h1', user_id: U, description: 'Extra casing string', reason: 'Shallow water flow', amount: 300000, status: 'Pending', created_at: TS },
    ],
  }),
};

const stores = {};
const storeFor = (app) => (stores[app] ||= createStore(SEEDS[app] ? SEEDS[app]() : {}));

export default function StudiosHarness() {
  const { app } = useParams();
  const App = APPS[app];
  if (!App) return <div className="p-6 text-slate-300">Unknown app. Try one of: {Object.keys(APPS).join(', ')}</div>;
  return (
    <InMemorySupabase db={storeFor(app)}>
      <DevAuth>
        <div className="min-h-screen bg-slate-950 text-slate-100">
          <Suspense fallback={<div className="p-6 text-slate-400">Loading...</div>}><App /></Suspense>
        </div>
      </DevAuth>
    </InMemorySupabase>
  );
}
