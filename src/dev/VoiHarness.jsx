// Dev-only harness (/dev/voi-analyzer; senior test T1, Wave 2 #27): Value of
// Information Analyzer on the in-memory Supabase double, so studies save
// and reopen without auth or a database.
import React from 'react';
import ValueOfInformationAnalyzer from '@/pages/apps/ValueOfInformationAnalyzer';
import InMemorySupabase, { createStore } from './InMemorySupabase';

const db = createStore({ saved_voi_projects: [] });

export default function VoiHarness() {
  return <InMemorySupabase db={db}><ValueOfInformationAnalyzer /></InMemorySupabase>;
}
