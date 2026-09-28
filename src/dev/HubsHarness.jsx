// Dev-only harness (/dev/hubs/<page>; design-system pilot 1): the real
// DashboardLayout, sidebar, landing and module hubs on the in-memory
// Supabase double, so the hubs can be walked and screenshotted in light and
// dark without an account. <page> is "landing", a hub slug (geoscience,
// data-ai ...) or "wds", the unmigrated Waterflood Design Studio opened
// from a hub, for the opt-in check. The pages run in a nested MemoryRouter
// that starts at the real /dashboard path. Never in production builds.
import React, { lazy, Suspense } from 'react';
import {
  MemoryRouter, Routes, Route, useParams, UNSAFE_LocationContext, UNSAFE_RouteContext,
} from 'react-router-dom';
import InMemorySupabase, { createStore, DEV_USER } from './InMemorySupabase';
import DevAuth from './DevAuth';
import DashboardLayout from '@/layouts/DashboardLayout';
import HubScope from '@/components/hubs/HubScope';
import AppRoute from '@/components/AppRoute';
import Dashboard from '@/pages/Dashboard';

const GeoscienceAnalytics = lazy(() => import('@/pages/dashboard/GeoscienceAnalytics'));
const ReservoirManagement = lazy(() => import('@/pages/dashboard/ReservoirManagement'));
const DrillingCompletionsHub = lazy(() => import('@/pages/dashboard/DrillingCompletionsHub'));
const ProductionOperationsHub = lazy(() => import('@/pages/dashboard/ProductionOperationsHub'));
const EconomicsProjectManagementHub = lazy(() => import('@/pages/dashboard/EconomicsProjectManagementHub'));
const FacilitiesEngineeringHub = lazy(() => import('@/pages/dashboard/FacilitiesEngineeringHub'));
const MidstreamDownstreamHub = lazy(() => import('@/pages/dashboard/MidstreamDownstreamHub'));
const ProcessSafetyHub = lazy(() => import('@/pages/dashboard/ProcessSafetyHub'));
const DataAiHub = lazy(() => import('@/pages/dashboard/DataAiHub'));
const AssuranceHub = lazy(() => import('@/pages/dashboard/AssuranceHub'));
const WaterfloodDesignStudio = lazy(() => import('@/pages/apps/WaterfloodDesignStudio'));

const ORG = { id: '00000000-0000-4000-8000-000000000001', name: 'Harness Energy' };
const USER = { ...DEV_USER, user_metadata: { full_name: 'Ada Harness', role: 'admin' } };

// A few catalogue rows per module: live with a seat, live without one
// (Locked), Coming Soon and In Development, so every card state shows.
const app = (id, module, name, extra = {}) => ({
  id, slug: id, module, app_name: name, status: 'Active', is_built: true, display_order: 1,
  description: `${name}: a short description of what the application does for the engineer.`, ...extra,
});
const MASTER_APPS = [
  app('seismolord', 'geoscience', 'Seismolord'),
  app('petrophysics-studio', 'geoscience', 'Petrophysics Studio'),
  app('well-correlation', 'geoscience', 'Well Correlation'),
  app('geo-soon', 'geoscience', 'Basin Modelling Studio', { status: 'Coming Soon' }),
  app('geo-dev', 'geoscience', 'Rock Physics Studio', { is_built: false }),
  app('decline-curve-analysis', 'reservoir', 'Decline Curve Analysis'),
  app('voidage-replacement-monitor', 'reservoir', 'Voidage Replacement Monitor'),
  app('waterflood-design-studio', 'reservoir', 'Waterflood Design Studio'),
  app('material-balance-studio', 'reservoir', 'Material Balance Studio'),
  app('eor-screening', 'reservoir', 'EOR Screening', { status: 'Coming Soon' }),
  app('well-design-studio', 'drilling', 'Well Design Studio'),
  app('nodal-analysis-studio', 'production', 'Nodal Analysis Studio'),
  app('epe-suite', 'economics', 'Petroleum Economics Studio'),
  app('separator-sizing', 'facilities', 'Separator Sizing'),
  app('crude-assay', 'Midstream & Downstream', 'Crude Assay & Blending Studio'),
  app('lopa-sil-studio', 'Process Safety', 'LOPA & SIL Studio'),
  app('data-quality-studio', 'Data & AI', 'Data Quality Studio'),
  app('ml-workbench', 'Data & AI', 'ML Workbench', { status: 'Coming Soon' }),
  app('risk-register', 'assurance', 'Risk Register'),
];
const MODULES = ['geoscience', 'reservoir', 'drilling', 'production', 'economics', 'facilities',
  'assurance', 'midstream-downstream', 'process-safety', 'data-ai'];
const SEATS = ['seismolord', 'well-correlation', 'decline-curve-analysis', 'voidage-replacement-monitor', 'waterflood-design-studio',
  'well-design-studio', 'epe-suite', 'data-quality-studio', 'risk-register'];

const seed = () => ({
  master_apps: MASTER_APPS,
  purchased_modules: MODULES.map((m, i) => ({
    id: `pm-${i}`, organization_id: ORG.id, module_id: m, status: 'active', expiry_date: null,
  })),
  app_seat_assignments: SEATS.map((a) => ({ app_id: a, user_id: USER.id, organization_id: ORG.id })),
  organization_members: [{ organization_id: ORG.id, user_id: USER.id }],
  access_requests: [],
  org_closure_requests: [],
});

const START = { landing: '/dashboard', wds: '/dashboard/apps/reservoir/waterflood-design-studio' };
const hubRoute = (slug, Hub) => <Route path={slug} element={<AppRoute appName={slug}><Hub /></AppRoute>} />;

let store = null;

export default function HubsHarness() {
  const { page = 'landing' } = useParams();
  if (!store) store = createStore(seed());
  const start = START[page] || `/dashboard/${page}`;
  return (
    <InMemorySupabase db={store} user={USER}>
      <DevAuth user={USER} organization={ORG}>
        <UNSAFE_LocationContext.Provider value={null}>
          <UNSAFE_RouteContext.Provider value={{ outlet: null, matches: [], isDataRoute: false }}>
            <MemoryRouter initialEntries={[start]}>
              <Suspense fallback={<div className="p-6 text-slate-400">Loading...</div>}>
                <Routes>
                  <Route path="/dashboard" element={<DashboardLayout />}>
                    <Route element={<HubScope />}>
                      <Route index element={<Dashboard />} />
                      {hubRoute('geoscience', GeoscienceAnalytics)}
                      {hubRoute('reservoir', ReservoirManagement)}
                      {hubRoute('drilling', DrillingCompletionsHub)}
                      {hubRoute('production', ProductionOperationsHub)}
                      {hubRoute('economics', EconomicsProjectManagementHub)}
                      {hubRoute('facilities', FacilitiesEngineeringHub)}
                      {hubRoute('midstream-downstream', MidstreamDownstreamHub)}
                      {hubRoute('process-safety', ProcessSafetyHub)}
                      {hubRoute('data-ai', DataAiHub)}
                      {hubRoute('assurance', AssuranceHub)}
                    </Route>
                    <Route path="apps/reservoir/waterflood-design-studio" element={<WaterfloodDesignStudio />} />
                  </Route>
                  <Route path="*" element={<div className="p-6 text-amber-300">Left the hubs (a link outside the harness).</div>} />
                </Routes>
              </Suspense>
            </MemoryRouter>
          </UNSAFE_RouteContext.Provider>
        </UNSAFE_LocationContext.Provider>
      </DevAuth>
    </InMemorySupabase>
  );
}
