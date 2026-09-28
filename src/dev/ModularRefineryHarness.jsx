// Dev-only harness (/dev/modular-refinery-feasibility; senior test T1, Wave 2
// #30): Modular Refinery Feasibility Studio on the in-memory Supabase double.
import React from 'react';
import ModularRefineryFeasibility from '@/pages/apps/ModularRefineryFeasibility';
import InMemorySupabase, { createStore } from './InMemorySupabase';

const db = createStore({ saved_modular_refinery_projects: [] });

export default function ModularRefineryHarness() {
  return <InMemorySupabase db={db}><div className="min-h-screen"><ModularRefineryFeasibility /></div></InMemorySupabase>;
}
