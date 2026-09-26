// Dev-only harness (/dev/dca; senior test T1, Wave 2 #20): Decline Curve
// Analysis on the in-memory Supabase double, so projects save and reload
// without auth or a database.
import React from 'react';
import DeclineCurveAnalysis from '@/pages/apps/DeclineCurveAnalysis';
import InMemorySupabase, { createStore } from './InMemorySupabase';

const db = createStore({ saved_dca_projects: [] });

export default function DcaHarness() {
  return <InMemorySupabase db={db}><DeclineCurveAnalysis /></InMemorySupabase>;
}
