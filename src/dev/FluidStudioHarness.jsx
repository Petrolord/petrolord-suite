// Dev-only harness (/dev/fluid-systems-studio; Reservoir upgrade round,
// FLUID-U1): Fluid Systems Studio on the in-memory Supabase double, so the
// e2e can save, reload and hand a project over without auth or a database.
//
//   ?saved=1   seeds two projects as earlier releases saved them (PL5): a
//              pre-shell row and a schema 1 compositional project.
//
// Saved projects are kept in sessionStorage (dev/fluidProjectsStore), so
// they survive a page refresh and the Well Test harness can read one by id.
import React, { useEffect } from 'react';
import FluidSystemsStudio from '@/pages/apps/FluidSystemsStudio';
import InMemorySupabase, { createStore, DEV_USER } from './InMemorySupabase';
import { loadFluidRows, watchFluidRows, FLUID_TABLE } from './fluidProjectsStore';
import { savedProjectRows } from '@/components/fluidstudio/__fixtures__/savedProjects';

const seeded = () => {
  const rows = loadFluidRows();
  const wantFixtures = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('saved') === '1';
  if (wantFixtures) {
    for (const r of savedProjectRows(DEV_USER.id)) if (!rows.some((x) => x.id === r.id)) rows.push(r);
  }
  return rows;
};

const db = createStore({ [FLUID_TABLE]: seeded() });

export default function FluidStudioHarness() {
  useEffect(() => watchFluidRows(db), []);
  return <InMemorySupabase db={db}><FluidSystemsStudio /></InMemorySupabase>;
}
