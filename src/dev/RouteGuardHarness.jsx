// Dev-only harness (/dev/route-guard/<page>?licensed=slug,slug; route protection
// 2026-09-30, docs/scope/AppRouteProtection-STATUS.md). Mounts a sample of the
// app routes that used to render with no licence check, each behind the real
// ProtectedAppRoute with the same appId App.jsx uses, on the in-memory Supabase
// double. The get-user-entitlements stand-in returns exactly the slugs in
// ?licensed=, so a walk can show the access-restricted screen for an unlicensed
// user and the app for a licensed one. src/__tests__/appRouteProtection.test.js
// checks every SAMPLE appId below against App.jsx so the two cannot drift.
// Never in production builds.
import React, { lazy, Suspense, useMemo } from 'react';
import {
  MemoryRouter, Routes, Route, useParams, useLocation, UNSAFE_LocationContext, UNSAFE_RouteContext,
} from 'react-router-dom';
import InMemorySupabase, { createStore, DEV_USER } from './InMemorySupabase';
import DevAuth from './DevAuth';
import ProtectedAppRoute from '@/components/ProtectedAppRoute';

const ScalStudio = lazy(() => import('@/pages/apps/ScalStudio'));
const WaterfloodDesignStudio = lazy(() => import('@/pages/apps/WaterfloodDesignStudio'));
const ReservoirBalance = lazy(() => import('@/pages/apps/reservoir-balance/ReservoirBalance'));
const DeclineCurveAnalysis = lazy(() => import('@/pages/apps/DeclineCurveAnalysis'));
const BasinFlowGenesis = lazy(() => import('@/pages/apps/BasinFlowGenesis/BasinFlowGenesis'));
const EorScreeningTool = lazy(() => import('@/pages/apps/EorScreeningTool'));

// page -> the App.jsx route (relative to /dashboard), its appId and its app
export const SAMPLE = {
  scal: { path: 'apps/reservoir/scal-studio', appId: 'scal-studio', name: 'SCAL Studio', App: ScalStudio },
  wds: { path: 'apps/reservoir/waterflood-design-studio', appId: 'fractional-flow-calculator', name: 'Waterflood Design Studio', App: WaterfloodDesignStudio },
  mbal: { path: 'apps/reservoir/material-balance-studio', appId: 'reservoir-balance', name: 'Material Balance Studio', App: ReservoirBalance },
  dca: { path: 'apps/reservoir/decline-curve-analysis', appId: 'decline-curve-analysis', name: 'Decline Curve Analysis', App: DeclineCurveAnalysis },
  basin: { path: 'apps/geoscience/basinflow-genesis', appId: 'basinflow-genesis', name: 'Basin & Charge Modeling', App: BasinFlowGenesis },
  eor: { path: 'apps/reservoir/eor-screening', appId: 'eor-screening', name: 'EOR Screening', App: EorScreeningTool },
};

const ORG = { id: '00000000-0000-4000-8000-000000000001', name: 'Harness Energy' };

export default function RouteGuardHarness() {
  const { page = 'scal' } = useParams();
  const { search } = useLocation();
  const licensed = useMemo(() => (new URLSearchParams(search).get('licensed') || '').split(',').filter(Boolean), [search]);
  // a user per licence set, so the per-user entitlement cache never carries one walk into the next
  const user = useMemo(() => ({ ...DEV_USER, id: `route-guard-${licensed.join('+') || 'none'}` }), [licensed]);
  const store = useMemo(() => createStore({
    organization_members: [{ organization_id: ORG.id, user_id: user.id }],
  }), [user]);
  const functions = useMemo(() => ({
    'get-user-entitlements': async () => ({ data: { accessible_app_ids: licensed, entitlements: [] }, error: null }),
  }), [licensed]);
  const s = SAMPLE[page];
  if (!s) return <div className="p-6">Unknown page: {page}. Pages: {Object.keys(SAMPLE).join(', ')}</div>;
  return (
    <InMemorySupabase db={store} user={user} functions={functions}>
      <DevAuth user={user} organization={ORG}>
          <UNSAFE_LocationContext.Provider value={null}>
            <UNSAFE_RouteContext.Provider value={{ outlet: null, matches: [], isDataRoute: false }}>
              <MemoryRouter initialEntries={[`/dashboard/${s.path}`]}>
                <Suspense fallback={<div className="p-6">Loading...</div>}>
                  <Routes>
                    <Route path={`/dashboard/${s.path}`} element={<ProtectedAppRoute appId={s.appId} appName={s.name}><div data-testid="route-guard-app"><s.App /></div></ProtectedAppRoute>} />
                    <Route path="*" element={<div data-testid="route-guard-left">Left the sample route.</div>} />
                  </Routes>
                </Suspense>
              </MemoryRouter>
            </UNSAFE_RouteContext.Provider>
          </UNSAFE_LocationContext.Provider>
      </DevAuth>
    </InMemorySupabase>
  );
}
