// Dev-only harness (/dev/flare-gas-to-value; senior test T1, Wave 2 #29):
// Flare Gas to Value Studio on the in-memory Supabase double.
import React from 'react';
import FlareToValueStudio from '@/pages/apps/FlareToValueStudio';
import InMemorySupabase, { createStore } from './InMemorySupabase';

const db = createStore({ saved_flare_projects: [] });

export default function FlareHarness() {
  return <InMemorySupabase db={db}><div className="min-h-screen bg-slate-950 text-slate-100"><FlareToValueStudio /></div></InMemorySupabase>;
}
