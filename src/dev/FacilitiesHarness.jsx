// Dev-only harness (/dev/facilities/:app; senior testing, Wave 5): any
// Facilities or Process Safety studio on the in-memory Supabase double, so
// projects save and reopen without auth or a database. One store per page
// load; tables are created on first use.
//
// Design-system rollout (Wave 0A): the harness adds no colours and no theme
// scope of its own: the dev routes sit in one theme scope in App.jsx
// (batch 7A), so each app paints itself as on its real route.
import React, { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import InMemorySupabase, { createStore } from './InMemorySupabase';
import DevAuth from './DevAuth';

const APPS = {
  compressor: lazy(() => import('@/pages/apps/CompressorStationDesigner')),
  'control-valve': lazy(() => import('@/pages/apps/ControlValveSizing')),
  corrosion: lazy(() => import('@/pages/apps/CorrosionRatePredictor')),
  layout: lazy(() => import('@/pages/apps/FacilityLayoutMapper')),
  metering: lazy(() => import('@/pages/apps/FlowMeteringDesigner')),
  'gas-processing': lazy(() => import('@/pages/apps/GasTreatingDehydration')),
  'heat-exchanger': lazy(() => import('@/pages/apps/HeatExchangerSizer')),
  pipeline: lazy(() => import('@/pages/apps/PipelineLineSizingStudio')),
  'produced-water': lazy(() => import('@/pages/apps/ProducedWaterTreatment.jsx')),
  'pump-station': lazy(() => import('@/pages/apps/PumpStationDesigner')),
  relief: lazy(() => import('@/pages/apps/ReliefBlowdownSizer')),
  separator: lazy(() => import('@/pages/apps/SeparatorSlugCatcherDesigner')),
  tank: lazy(() => import('@/pages/apps/StorageTankDesigner')),
  consequence: lazy(() => import('@/pages/apps/ConsequenceModellingStudio')),
  lopa: lazy(() => import('@/pages/apps/LopaSilStudio')),
  qra: lazy(() => import('@/pages/apps/QraStudio')),
};

const db = createStore({});

export default function FacilitiesHarness() {
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
