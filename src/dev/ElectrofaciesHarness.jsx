// Dev-only harness (/dev/electrofacies-studio; senior test T1, Wave 2 #32):
// Electrofacies Studio on the in-memory Supabase double with a stand-in
// user; data come in by upload (empty well registries).
import React from 'react';
import ElectrofaciesStudio from '@/pages/apps/ElectrofaciesStudio';
import InMemorySupabase, { createStore } from './InMemorySupabase';
import DevAuth from './DevAuth';

const db = createStore({
  dai_facies_runs: [], geo_wells: [], geo_wells_logs: [], geo_wells_intervals: [],
  geo_wells_tops: [], geo_wells_zones: [], geo_strat_units: [], strat_projects: [],
});

export default function ElectrofaciesHarness() {
  return (
    <InMemorySupabase db={db}>
      <DevAuth><div className="min-h-screen"><ElectrofaciesStudio /></div></DevAuth>
    </InMemorySupabase>
  );
}
