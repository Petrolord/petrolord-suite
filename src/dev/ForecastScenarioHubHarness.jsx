// Dev-only harness (/dev/forecast-scenario-hub; senior test T1, Wave 2 #21):
// Forecast Scenario Hub on the in-memory Supabase double, so scenario sets
// save and reload without auth or a database.
import React from 'react';
import ForecastScenarioHub from '@/pages/apps/ForecastScenarioHub';
import InMemorySupabase, { createStore } from './InMemorySupabase';

const db = createStore({ saved_scenario_hub_projects: [] });

export default function ForecastScenarioHubHarness() {
  return <InMemorySupabase db={db}><ForecastScenarioHub /></InMemorySupabase>;
}
