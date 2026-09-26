// Dev-only harness (/dev/epe/runs/r1, DEV builds only; senior test T1,
// 2026-09-26): the Results Viewer on the Ekene demo run computed by the
// engines cash flow (ekeneRun.json, NPV10 USD 1.98 MM, generated from the
// demo kit with the Run Console's case sheet). Supabase is swapped for an
// in-memory table set while the harness is mounted and restored on
// unmount, so the viewer, its charts and exports can be walked without
// auth, a database or the edge function.

import React, { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import EpeResultsViewer from '../EpeResultsViewer';
import RUN from './ekeneRun.json';

const DB = {
  epe_cases: { id: 'c1', user_id: 'dev', case_name: 'Ekene (demo kit)' },
  epe_runs: { id: 'r1', case_id: 'c1', user_id: 'dev', run_name: 'Ekene 2P with Ekene-11', run_config_id: 'cfg1', status: 'complete', epe_cases: { case_name: 'Ekene (demo kit)' } },
  epe_results: { run_id: 'r1', kpis: RUN.kpis, cash_flow_data: RUN.cashFlowData },
  epe_run_configs: { id: 'cfg1', case_id: 'c1', config_name: 'Episode 26 case', ...RUN.cfg },
  epe_sensitivity_runs: [],
  epe_sensitivity_results: [],
};

function query(table) {
  const q = {};
  const chain = () => q;
  ['select', 'eq', 'order', 'limit', 'in', 'gte', 'lte', 'not', 'is', 'or', 'neq', 'range'].forEach((m) => { q[m] = chain; });
  ['insert', 'update', 'upsert', 'delete'].forEach((m) => { q[m] = chain; });
  const v = DB[table];
  const one = () => ({ data: Array.isArray(v) ? (v[0] ?? null) : (v ?? null), error: v == null ? { message: 'no rows' } : null });
  q.single = () => Promise.resolve(one());
  q.maybeSingle = () => Promise.resolve({ ...one(), error: null });
  q.then = (res, rej) => Promise.resolve({ data: Array.isArray(v) ? v : v ? [v] : [], error: null }).then(res, rej);
  return q;
}

export default function EpeHarness() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const saved = { from: supabase.from, invoke: supabase.functions?.invoke };
    supabase.from = (t) => query(t);
    if (supabase.functions) supabase.functions.invoke = async () => ({ data: null, error: { message: 'edge functions are not available on the harness' } });
    setReady(true);
    return () => { supabase.from = saved.from; if (supabase.functions) supabase.functions.invoke = saved.invoke; };
  }, []);
  if (!ready) return null;
  return (
    <div data-testid="epe-harness">
      <Routes>
        <Route path="runs/:runId" element={<EpeResultsViewer />} />
      </Routes>
    </div>
  );
}
