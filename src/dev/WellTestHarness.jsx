// Dev-only harness (/dev/well-test-analysis-studio; senior test T1, Wave 2
// #22): Well Test Analysis Studio on the in-memory Supabase double, so
// tests save and reload without auth or a database.
import React from 'react';
import WellTestAnalysisStudio from '@/pages/apps/WellTestAnalysisStudio';
import InMemorySupabase, { createStore } from './InMemorySupabase';

const db = createStore({ saved_well_test_projects: [] });

export default function WellTestHarness() {
  return <InMemorySupabase db={db}><WellTestAnalysisStudio /></InMemorySupabase>;
}
