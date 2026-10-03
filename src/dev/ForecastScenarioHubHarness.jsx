// Dev-only harness (/dev/forecast-scenario-hub; senior test T1, Wave 2 #21;
// HUB-U1): Forecast Scenario Hub on the in-memory Supabase double, so
// scenario sets save and reload without auth or a database. Saved sets are
// kept in the tab's sessionStorage, so they survive a page reload; the
// Decline Curve Analysis projects saved on /dev/dca in this tab are read
// from sessionStorage too, so a forecast sent from there arrives here by id.
import React, { useEffect } from 'react';
import ForecastScenarioHub from '@/pages/apps/ForecastScenarioHub';
import InMemorySupabase, { createStore } from './InMemorySupabase';
import { loadDcaRows, DCA_TABLE } from './dcaProjectsStore';

const HUB_TABLE = 'saved_scenario_hub_projects';
const KEY = 'harness.saved_scenario_hub_projects.v1';
const session = () => { try { return window.sessionStorage; } catch { return null; } };
const loadHubRows = () => { try { return JSON.parse(session()?.getItem(KEY) || '[]') || []; } catch { return []; } };

const db = createStore({ [HUB_TABLE]: loadHubRows(), [DCA_TABLE]: [] });

export default function ForecastScenarioHubHarness() {
  // the DCA rows as they are now in this tab (read on every mount)
  db[DCA_TABLE] = loadDcaRows();
  useEffect(() => {
    let last = '';
    const tick = () => {
      const now = JSON.stringify(db[HUB_TABLE] || []);
      if (now !== last) { last = now; try { session()?.setItem(KEY, now); } catch { /* storage blocked */ } }
    };
    const id = setInterval(tick, 250);
    return () => { tick(); clearInterval(id); };
  }, []);
  return <InMemorySupabase db={db}><ForecastScenarioHub /></InMemorySupabase>;
}
