// Dev-only harness (/dev/epe/runs/r1, DEV builds only; senior test T1,
// 2026-09-26): the Results Viewer on the Ekene demo run computed by the
// engines cash flow (ekeneRun.json, NPV10 USD 1.98 MM, generated from the
// demo kit with the Run Console's case sheet). Supabase is swapped for an
// in-memory table set while the harness is mounted and restored on
// unmount, so the viewer, its charts and exports can be walked without
// auth, a database or the edge function.
//
// Design system pilot 3 (2026-09-27): the harness also mounts the case list,
// case detail, Run Console, comparison and help pages on the same in-memory
// tables, inside the same ThemedApp scope as the live routes, so every EPE
// page can be walked in light and dark (/dev/epe/cases, /dev/epe/cases/c1,
// /dev/epe/cases/c1/run, /dev/epe/cases/c1/compare, /dev/epe/help).

import React, { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import { ThemedApp } from '@/design/ThemeProvider';
import EpeResultsViewer from '../EpeResultsViewer';
import EpeCaseList from '../EpeCaseList';
import EpeCaseDetail from '../EpeCaseDetail';
import EpeRunConsole from '../EpeRunConsole';
import EpeRunComparison from '../EpeRunComparison';
import EpeHelpGuide from '../EpeHelpGuide';
import RUN from './ekeneRun.json';

const NOW = '2026-09-26T10:00:00Z';
const PROD_ROWS = RUN.cashFlowData.slice(0, 12).map((r) => ({ year: r.year, oil_bbl: r.oil_bbl || 0, gas_mscf: r.gas_mscf || 0 }));
const DEV_AUTH = { user: { id: 'dev', email: 'dev@petrolord.local' }, session: null, loading: false };

const DB = {
  epe_cases: [
    { id: 'c1', user_id: 'dev', case_name: 'Ekene (demo kit)', description: 'Ekene field, 2P development with Ekene-11', created_at: NOW },
    { id: 'c2', user_id: 'dev', case_name: 'Ekene low case', description: 'Archived what-if copy', created_at: NOW, archived_at: NOW },
    { id: 'c3', user_id: 'peer', organization_id: 'o1', case_name: 'Partner review case', description: 'Shared by a teammate', created_at: NOW },
  ],
  epe_runs: [
    { id: 'r1', case_id: 'c1', user_id: 'dev', run_name: 'Ekene 2P with Ekene-11', run_config_id: 'cfg1', status: 'complete', created_at: NOW, locked: true, approved_at: NOW, epe_cases: { case_name: 'Ekene (demo kit)' } },
    { id: 'r2', case_id: 'c1', user_id: 'dev', run_name: 'Ekene 1P check', run_config_id: 'cfg1', status: 'failed', error_message: 'Harness run with no engine', created_at: NOW, epe_cases: { case_name: 'Ekene (demo kit)' } },
  ],
  epe_production_volumes: [{ id: 'p1', case_id: 'c1', user_id: 'dev', file_name: 'ekene_production.csv', data: PROD_ROWS, created_at: NOW }],
  epe_capex: [{ id: 'k1', case_id: 'c1', user_id: 'dev', file_name: 'ekene_capex.csv', data: null, created_at: NOW }],
  epe_opex: [{ id: 'x1', case_id: 'c1', user_id: 'dev', file_name: 'ekene_opex.csv', data: { storagePath: 'dev/ekene_opex.csv' }, created_at: NOW }],
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
    const saved = { from: supabase.from, invoke: supabase.functions?.invoke, getUser: supabase.auth?.getUser };
    supabase.from = (t) => query(t);
    if (supabase.auth) supabase.auth.getUser = async () => ({ data: { user: DEV_AUTH.user }, error: null });
    if (supabase.functions) supabase.functions.invoke = async () => ({ data: null, error: { message: 'edge functions are not available on the harness' } });
    setReady(true);
    return () => {
      supabase.from = saved.from;
      if (supabase.functions) supabase.functions.invoke = saved.invoke;
      if (supabase.auth) supabase.auth.getUser = saved.getUser;
    };
  }, []);
  if (!ready) return null;
  return (
    <AuthContext.Provider value={DEV_AUTH}>
      <ThemedApp className="min-h-screen" data-testid="epe-harness">
        <Routes>
          <Route path="runs/:runId" element={<EpeResultsViewer />} />
          <Route path="cases" element={<EpeCaseList />} />
          <Route path="cases/:caseId" element={<EpeCaseDetail />} />
          <Route path="cases/:caseId/run" element={<EpeRunConsole />} />
          <Route path="cases/:caseId/compare" element={<EpeRunComparison />} />
          <Route path="help" element={<EpeHelpGuide />} />
        </Routes>
      </ThemedApp>
    </AuthContext.Provider>
  );
}
