// Dev-only harness (/dev/nodal-analysis-studio; senior test T1, Wave 2 #25):
// Nodal Analysis Studio on the in-memory Supabase double, so wells save and
// reopen without auth or a database.
import React from 'react';
import NodalAnalysisStudio from '@/pages/apps/NodalAnalysisStudio';
import InMemorySupabase, { createStore } from './InMemorySupabase';

const db = createStore({ saved_nodal_analysis_projects: [] });

export default function NodalHarness() {
  return <InMemorySupabase db={db}><NodalAnalysisStudio /></InMemorySupabase>;
}
