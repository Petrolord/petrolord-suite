// Dev-only harness (/dev/well-test-analysis-studio; senior test T1, Wave 2
// #22): Well Test Analysis Studio on the in-memory Supabase double, so
// tests save and reload without auth or a database.
//
// Tester round 2 (2026-10-02): the store also seeds one well in the shared
// wells registry (a build to 35 degrees with a published zone summary), so
// the "Propose from the wells registry" door can be walked end to end.
import React, { useState } from 'react';
import WellTestAnalysisStudio from '@/pages/apps/WellTestAnalysisStudio';
import InMemorySupabase, { createStore, DEV_USER } from './InMemorySupabase';
import { loadFluidRows, FLUID_TABLE } from './fluidProjectsStore';

const FT = 0.3048;
const db = createStore({
  saved_well_test_projects: [],
  // projects saved on the Fluid Systems Studio harness in this tab (the pvt-1 chain)
  [FLUID_TABLE]: loadFluidRows(),
  geo_wells: [{
    id: 'harness-well-1', user_id: DEV_USER.id, name: 'Harness-7', uwi: 'HX-0007',
    surface_x: 500000, surface_y: 6000000, kb_m: 25, td_md_m: 3400,
    deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 1500, inc: 0, azi: 90 }, { md: 2400, inc: 35, azi: 90 }, { md: 3400, inc: 35, azi: 90 }],
    checkshots: [], created_at: '2026-10-01T00:00:00Z',
  }],
  geo_wells_zones: [{
    id: 'harness-zone-1', well_id: 'harness-well-1', name: 'D-3 sand',
    top_md_m: 9850 * FT, base_md_m: 9910 * FT,
    properties: { net_m: 45 * FT, phi_avg: 0.18, sw_avg: 0.22 },
  }],
});

export default function WellTestHarness() {
  // read the Fluid Systems projects of this tab again on every mount: the
  // module is loaded once, and a project may have been saved since
  useState(() => { db[FLUID_TABLE] = loadFluidRows(); return null; });
  return <InMemorySupabase db={db}><WellTestAnalysisStudio /></InMemorySupabase>;
}
