// Dev-only harness (/dev/studio/:app; senior testing, Waves 6 and 7): any
// economics, downstream, reservoir, Data & AI or Assurance studio on the
// in-memory Supabase double, so it runs and saves without auth or a
// database. One store per page load; tables are created on first use.
//
// Design-system rollout (Wave 0A): the harness adds no colours and no theme
// scope of its own: the dev routes sit in one theme scope in App.jsx
// (batch 7A), so each app paints itself as on its real route.
import React, { lazy, Suspense, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import InMemorySupabase, { createStore, DEV_USER } from './InMemorySupabase';
import DevAuth from './DevAuth';
import { loadScalRows, watchScalRows, persistScalRows, SCAL_TABLE } from './scalProjectsStore';
import { loadFluidRows, FLUID_TABLE } from './fluidProjectsStore';
import { savedScalRows } from '@/components/scalstudio/__fixtures__/savedProjects';

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
  // W7F: Materials & Spares was the one downstream studio missing here.
  'materials-spares': lazy(() => import('@/pages/apps/MaterialsSparesPlanner')),
  // Wave 7 (reservoir and ML)
  eor: lazy(() => import('@/pages/apps/EorScreeningTool')),
  'recovery-factor': lazy(() => import('@/pages/apps/RecoveryFactorEstimator')),
  scal: lazy(() => import('@/pages/apps/ScalStudio')),
  vrr: lazy(() => import('@/pages/apps/VoidageReplacementMonitor')),
  waterflood: lazy(() => import('@/pages/apps/WaterfloodDesignStudio')),
  'well-spacing': lazy(() => import('@/pages/apps/WellSpacingOptimizer')),
  'ml-workbench': lazy(() => import('@/pages/apps/MlWorkbench')),
  'forecasting-ml': lazy(() => import('@/pages/apps/ForecastingMlWorkbench')),
};

// Worked cases with closed-form answers, per app (checked in the T1 reports).
const U = DEV_USER.id;
const TS = '2026-09-26T00:00:00.000Z';
const SEEDS = {
  // SCAL-U1: projects saved on the SCAL harness in this tab (kr-1 chain to
  // Waterflood); ?saved=1 adds two projects as earlier releases saved them.
  scal: () => {
    const rows = loadScalRows();
    const wantFixtures = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('saved') === '1';
    if (wantFixtures) for (const r of savedScalRows(U)) if (!rows.some((x) => x.id === r.id)) rows.push(r);
    // SCAL-U2-005: the Fluid Systems projects saved on the Fluid harness in this tab, read by id
    return { [SCAL_TABLE]: rows, [FLUID_TABLE]: loadFluidRows() };
  },
  waterflood: () => ({ [SCAL_TABLE]: loadScalRows() }),
  // AFE: budget 8.5M; EAC max(budget, actual + commitment) unless entered:
  // RIG 5.0M, CSG 2.3M (entered), SVC 1.5M, so 8.8M and a 0.3M overrun;
  // EV 5.0 x 0.6 + 2.0 x 0.9 + 1.5 x 0.3 = 5.25M against 5.2M actual.
  // Project Management: one Field Development project, as of 2026-09-01.
  // BAC 10.0M; EV 1.0 + 4.0 x 0.5 + 5.0 x 0.1 = 3.5M; AC 1.1 + 2.2 + 0.4
  // = 3.7M; PV 1.0 + 4.0 x 184/305 + 5.0 x 62/364 = 4.26M, so CPI 0.946,
  // SPI 0.821, CV -0.2M, SV -0.76M.
  'project-management': () => ({
    projects: [{
      id: 'pm-h1', user_id: U, name: 'Harness Field Development', company_name: 'Harness Energy', stage: 'Execute',
      baseline_budget: 10000000, project_type: 'Field Development', status: 'Active', country: 'Nigeria', asset: 'Harness Field',
      percent_complete: 35, start_date: '2026-01-01', end_date: '2027-06-30', created_at: TS, updated_at: TS,
    }],
    tasks: [
      { id: 'pm-t1', project_id: 'pm-h1', user_id: U, name: 'FEED', workstream: 'Engineering', task_category: 'FEED', type: 'task', owner: 'Harness Lead', planned_start_date: '2026-01-01', planned_end_date: '2026-03-31', actual_end_date: '2026-04-10', planned_cost: 1000000, actual_cost: 1100000, percent_complete: 100, status: 'Done', priority: 'High', display_order: 1, is_archived: false, created_at: TS },
      { id: 'pm-t2', project_id: 'pm-h1', user_id: U, name: 'Procurement', workstream: 'Supply Chain', task_category: 'Detailed Design', type: 'task', owner: 'Harness Buyer', planned_start_date: '2026-03-01', planned_end_date: '2026-12-31', planned_cost: 4000000, actual_cost: 2200000, percent_complete: 50, status: 'In Progress', priority: 'High', display_order: 2, is_archived: false, created_at: TS },
      { id: 'pm-t3', project_id: 'pm-h1', user_id: U, name: 'Construction', workstream: 'Construction', task_category: 'Execution', type: 'task', owner: 'Harness Contractor', planned_start_date: '2026-07-01', planned_end_date: '2027-06-30', planned_cost: 5000000, actual_cost: 400000, percent_complete: 10, status: 'In Progress', priority: 'Medium', display_order: 3, is_archived: false, created_at: TS },
    ],
    pm_resources: [
      { id: 'pm-r1', project_id: 'pm-h1', user_id: U, name: 'Harness Lead', type: 'Person', discipline: 'Facilities', skills: ['FEED', 'Topsides'], availability_percent: 80, cost_per_day: 1200, contact_info: 'lead@harness.example', created_at: TS },
    ],
    risks: [
      { id: 'pm-k1', project_id: 'pm-h1', user_id: U, title: 'Long-lead compressor slips', description: 'Vendor quotes 40 weeks', category: 'Schedule', probability: 4, impact: 4, risk_score: 16, status: 'Open', owner: 'Harness Buyer', mitigation_plan: 'Second vendor on standby', due_date: '2026-10-15', created_at: TS },
      { id: 'pm-k2', project_id: 'pm-h1', user_id: U, title: 'Pipe price rise', description: 'Steel index up', category: 'Cost', probability: 2, impact: 3, risk_score: 6, status: 'Open', owner: 'Harness Lead', mitigation_plan: 'Fixed-price order', due_date: '2026-11-01', created_at: TS },
    ],
    project_issues: [
      { id: 'pm-i1', project_id: 'pm-h1', user_id: U, title: 'Late vendor drawings', description: 'Two weeks late', status: 'Open', severity: 'Medium', priority: 'Medium', occurred_date: '2026-08-20', reported_date: '2026-08-21', owner: 'Harness Lead', created_at: TS },
    ],
    pm_deliverables: [],
  }),
  'report-autopilot': () => ({ saved_report_autopilot_projects: [] }),
  'crude-assay': () => ({ saved_crude_assay_projects: [] }),
  'energy-efficiency': () => ({ saved_energy_efficiency_projects: [] }),
  'fuel-pricing': () => ({ saved_fuel_pricing_projects: [] }),
  'lpg-cng': () => ({ saved_lpg_cng_projects: [] }),
  blending: () => ({ saved_blend_optimizer_projects: [] }),
  'refinery-planning': () => ({ saved_refinery_plan_projects: [] }),
  'terminal-depot': () => ({ saved_terminal_projects: [] }),
  'materials-spares': () => ({ scm_materials_projects: [] }),
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

// Stand-ins for edge functions that call a model (not gradable by hand):
// report-autopilot answers each section with a fixed sentence built only
// from the brief and the inputs, so the flow around it can be tested.
const FUNCTIONS = {
  'report-autopilot': {
    'report-autopilot': async (body) => ({
      data: {
        sections: (body?.sections || []).map((sec) => ({
          id: sec.id,
          title: sec.name,
          content: `Harness draft for ${sec.name} on ${body?.input?.well_name || body?.input?.project_name || 'the project'}. ${sec.brief || ''}`.trim(),
        })),
        model: 'harness-stand-in',
        generated_at: TS,
      },
      error: null,
    }),
  },
};

const stores = {};
const storeFor = (app) => (stores[app] ||= createStore(SEEDS[app] ? SEEDS[app]() : {}));

// the SCAL rows of the tab: kept in sessionStorage while SCAL is open, read
// again by Waterflood on every mount (a project may have been saved since)
function useScalRows(app) {
  // read during render, before the app's own mount effects ask for a project
  // by id. /dev/studio/scal and /dev/studio/waterflood are one component, so
  // the SCAL watcher's last tick runs after this render: write the SCAL store
  // first, or a save made just before the handoff is missed (CI, PR #869).
  if (app === 'waterflood') {
    if (stores.scal) persistScalRows(stores.scal);
    storeFor('waterflood')[SCAL_TABLE] = loadScalRows();
  }
  // a Fluid project may have been saved on the Fluid harness since SCAL was first opened
  if (app === 'scal') storeFor('scal')[FLUID_TABLE] = loadFluidRows();
  useEffect(() => (app === 'scal' ? watchScalRows(storeFor('scal')) : undefined), [app]);
}

export default function StudiosHarness() {
  const { app } = useParams();
  useScalRows(app);
  const App = APPS[app];
  if (!App) return <div className="p-6 text-pl-text">Unknown app. Try one of: {Object.keys(APPS).join(', ')}</div>;
  return (
    <InMemorySupabase db={storeFor(app)} functions={FUNCTIONS[app]}>
      <DevAuth>
        <div className="min-h-screen">
          <Suspense fallback={<div className="p-6 text-pl-muted">Loading...</div>}>
            <App />
          </Suspense>
        </div>
      </DevAuth>
    </InMemorySupabase>
  );
}
