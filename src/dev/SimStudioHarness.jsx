// Dev-only harness (/dev/reservoir-simulation-studio; senior test T1, Wave
// 2 #23): Reservoir Simulation Studio on the in-memory Supabase double, with
// a stand-in for the OPM Flow worker. sim_enqueue_run applies the RPC's
// checks and queues a run; the stand-in claims it, then completes it with a
// summary that OPM Flow 2026.04 actually produced (run offline with the
// worker image on 2026-09-26, built by the worker's own build_summary):
// SPE1CASE1 for the SPE1 template, the Model Builder's default deck
// (worker fixture BUILT.DATA) for anything else. A deck containing the word
// HARNESS_FAIL fails with a flow-style error so the failure path can be
// walked. Nothing here runs a simulation.
import React from 'react';
import ReservoirSimulationStudio from '@/pages/apps/ReservoirSimulationStudio';
import InMemorySupabase, { createStore, newId, DEV_USER } from './InMemorySupabase';
import spe1Summary from './fixtures/sim-spe1-summary.json';
import builtSummary from './fixtures/sim-built-summary.json';
import builtPrt from './fixtures/sim-built-prt.txt?raw';

const db = createStore({ sim_cases: [], sim_runs: [], rb_cases: [], rb_production_data: [], geo_surfaces: [] });

const patchRun = (id, fields) => {
  db.sim_runs = db.sim_runs.map((r) => (r.id === id ? { ...r, ...fields } : r));
};

async function readDeck(path) {
  const blob = db.__storage?.[`sim/${path}`];
  return blob ? blob.text() : '';
}

function workerStandIn(run, caseRow) {
  setTimeout(() => {
    const r = db.sim_runs.find((x) => x.id === run.id);
    if (!r || r.status !== 'queued') return;
    patchRun(run.id, { status: 'running', claimed_at: new Date().toISOString(), worker_id: 'harness', attempt: 1 });
  }, 1500);
  setTimeout(async () => {
    const r = db.sim_runs.find((x) => x.id === run.id);
    if (!r || r.status !== 'running') return;
    if (r.cancel_requested) { patchRun(run.id, { status: 'cancelled', finished_at: new Date().toISOString() }); return; }
    const deck = await readDeck(caseRow.deck_path);
    const base = `${DEV_USER.id}/${caseRow.id}/runs/${run.id}`;
    if (/HARNESS_FAIL/.test(deck)) {
      db.__storage[`sim/${base}/prt_excerpt.txt`] = new Blob(['Error: Problem with keyword HARNESS_FAIL\nIn SPE1CASE1.DATA line 12\nUnknown keyword\n']);
      patchRun(run.id, {
        status: 'failed', finished_at: new Date().toISOString(), exit_code: 1, failure_stage: 'sim_failed',
        error_message: 'Error: Problem with keyword HARNESS_FAIL. Unknown keyword.', log_path: `${base}/prt_excerpt.txt`,
      });
      return;
    }
    const spe1 = caseRow.deck_source === 'template' && caseRow.template_slug === 'SPE1CASE1';
    const summary = spe1 ? spe1Summary : builtSummary;
    const json = JSON.stringify(summary);
    db.__storage[`sim/${base}/summary.json`] = new Blob([json], { type: 'application/json' });
    const keys = Object.keys(summary.field);
    const csv = [['day', ...keys].join(','), ...summary.days.map((d, i) => [d, ...keys.map((k) => summary.field[k][i])].join(','))].join('\n');
    db.__storage[`sim/${base}/summary.csv`] = new Blob([csv], { type: 'text/csv' });
    db.__storage[`sim/${base}/prt_excerpt.txt`] = new Blob([builtPrt]);
    patchRun(run.id, {
      status: 'complete', finished_at: new Date().toISOString(), exit_code: 0,
      opm_version: summary.opm_version, deck_sha256: 'harness', elapsed_seconds: spe1 ? 1.9 : 3.4,
      active_cells: spe1 ? 300 : 2000, report_steps: summary.days.length,
      result_path: `${base}/summary.json`, log_path: `${base}/prt_excerpt.txt`, result_bytes: json.length,
    });
  }, 4000);
}

const rpc = {
  // mirrors sim_enqueue_run's checks (migration 20260826200000)
  async sim_enqueue_run({ p_case_id: caseId }) {
    const caseRow = db.sim_cases.find((c) => c.id === caseId);
    if (!caseRow) return { data: null, error: { message: 'Case not found' } };
    if (!caseRow.deck_path) return { data: null, error: { message: 'This case has no deck yet. Add one on the Deck tab.' } };
    const inflight = db.sim_runs.filter((r) => r.user_id === DEV_USER.id && (r.status === 'queued' || r.status === 'running'));
    if (inflight.length >= 2) return { data: null, error: { message: 'You already have 2 simulations queued or running. Wait for one to finish.' } };
    const run = {
      id: newId('run'), case_id: caseId, user_id: DEV_USER.id, status: 'queued', cancel_requested: false, attempt: 0,
      queued_at: new Date().toISOString(),
    };
    db.sim_runs.push(run);
    workerStandIn(run, caseRow);
    return { data: run.id, error: null };
  },
  async sim_cancel_run({ p_run_id: runId }) {
    const r = db.sim_runs.find((x) => x.id === runId);
    if (!r) return { data: null, error: { message: 'Run not found' } };
    if (r.status === 'queued') { patchRun(runId, { status: 'cancelled', finished_at: new Date().toISOString() }); return { data: 'cancelled', error: null }; }
    if (r.status === 'running') { patchRun(runId, { cancel_requested: true }); return { data: 'cancel_requested', error: null }; }
    return { data: r.status, error: null };
  },
};

export default function SimStudioHarness() {
  return <InMemorySupabase db={db} rpc={rpc}><ReservoirSimulationStudio /></InMemorySupabase>;
}
