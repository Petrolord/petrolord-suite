// Dev-only harness (/dev/carbon-footprint-abatement; senior test T1, Wave 2
// #31): Carbon Footprint & Abatement Studio on the in-memory Supabase double.
import React from 'react';
import CarbonAbatementStudio from '@/pages/apps/CarbonAbatementStudio';
import InMemorySupabase, { createStore } from './InMemorySupabase';

const db = createStore({ saved_carbon_projects: [] });

export default function CarbonHarness() {
  return <InMemorySupabase db={db}><div className="min-h-screen"><CarbonAbatementStudio /></div></InMemorySupabase>;
}
