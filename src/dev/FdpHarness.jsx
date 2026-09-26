// Dev-only harness (/dev/fdp-accelerator; senior test T1, Wave 2 #24): FDP
// Accelerator on the in-memory Supabase double, so named plans save and
// reopen without auth or a database.
import React from 'react';
import FDPAccelerator from '@/pages/apps/FDPAccelerator';
import InMemorySupabase, { createStore } from './InMemorySupabase';

const db = createStore({ saved_fdp_projects: [] });

export default function FdpHarness() {
  return <InMemorySupabase db={db}><FDPAccelerator /></InMemorySupabase>;
}
