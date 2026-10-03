// Dev-only harness (/dev/forecast-scenario-hub; senior test T1, Wave 2 #21;
// HUB-U1): Forecast Scenario Hub on the in-memory Supabase double, so
// scenario sets save and reload without auth or a database. The Decline
// Curve Analysis projects saved on /dev/dca in this browser tab are read
// from sessionStorage, so a forecast sent from there arrives here by id.
import React from 'react';
import ForecastScenarioHub from '@/pages/apps/ForecastScenarioHub';
import InMemorySupabase, { createStore } from './InMemorySupabase';
import { loadDcaRows, DCA_TABLE } from './dcaProjectsStore';

const db = createStore({ saved_scenario_hub_projects: [], [DCA_TABLE]: [] });

export default function ForecastScenarioHubHarness() {
  // the DCA rows as they are now in this tab (read on every mount)
  db[DCA_TABLE] = loadDcaRows();
  return <InMemorySupabase db={db}><ForecastScenarioHub /></InMemorySupabase>;
}
