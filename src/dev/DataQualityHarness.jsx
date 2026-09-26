// Dev-only harness (/dev/data-quality-studio; senior test T1, Wave 2 #33):
// Data Quality Studio on the in-memory Supabase double with a stand-in
// user; data come in by upload (empty registries).
import React from 'react';
import DataQualityStudio from '@/pages/apps/DataQualityStudio';
import InMemorySupabase, { createStore } from './InMemorySupabase';
import DevAuth from './DevAuth';

const db = createStore({ dai_qc_runs: [], geo_wells: [], geo_wells_logs: [], prod_wells: [], prod_daily: [] });

export default function DataQualityHarness() {
  return (
    <InMemorySupabase db={db}>
      <DevAuth><div className="min-h-screen bg-slate-950 text-slate-100"><DataQualityStudio /></div></DevAuth>
    </InMemorySupabase>
  );
}
