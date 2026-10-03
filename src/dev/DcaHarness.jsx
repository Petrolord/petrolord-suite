// Dev-only harness (/dev/dca; senior test T1, Wave 2 #20; DCA-U1):
// Decline Curve Analysis on the in-memory Supabase double, so projects save
// and reload without auth or a database. Saved projects are kept in
// sessionStorage (dev/dcaProjectsStore), so they survive a page refresh and
// Forecast Scenario Hub and Petroleum Economics Studio harnesses can read a
// forecast by id (the dca-forecast-1 chain).
import React, { useEffect } from 'react';
import DeclineCurveAnalysis from '@/pages/apps/DeclineCurveAnalysis';
import InMemorySupabase, { createStore } from './InMemorySupabase';
import { loadDcaRows, watchDcaRows, DCA_TABLE } from './dcaProjectsStore';

const db = createStore({ [DCA_TABLE]: loadDcaRows() });

export default function DcaHarness() {
  useEffect(() => watchDcaRows(db), []);
  return <InMemorySupabase db={db}><DeclineCurveAnalysis /></InMemorySupabase>;
}
