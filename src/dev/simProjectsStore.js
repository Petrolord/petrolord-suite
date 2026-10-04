// Dev-only: the Reservoir Simulation Studio cases, runs and run files of the
// /dev harness live in sessionStorage, so a run completed on
// /dev/reservoir-simulation-studio can be read by id from
// /dev/forecast-scenario-hub and /dev/epe (the sim-forecast-1 chain,
// SIM-U2-002; the wfProjectsStore pattern). Never imported by production
// routes.
const KEY = 'harness.sim_cases_runs.v1';
export const SIM_TABLES = Object.freeze(['sim_cases', 'sim_runs']);

const store = () => { try { return window.sessionStorage; } catch { return null; } };

/** { sim_cases, sim_runs, files: { 'sim/<path>': text } } as saved in this tab. */
export function loadSimSnapshot() {
  try {
    const v = JSON.parse(store()?.getItem(KEY) || 'null');
    return v && typeof v === 'object' ? { sim_cases: v.sim_cases || [], sim_runs: v.sim_runs || [], files: v.files || {} } : { sim_cases: [], sim_runs: [], files: {} };
  } catch {
    return { sim_cases: [], sim_runs: [], files: {} };
  }
}

/** The snapshot as harness tables and storage blobs ({ 'sim/<path>': Blob }). */
export function simStoreFromSnapshot(snap = loadSimSnapshot()) {
  const storage = {};
  for (const [k, text] of Object.entries(snap.files)) storage[k] = new Blob([text], { type: 'text/plain' });
  return { sim_cases: snap.sim_cases, sim_runs: snap.sim_runs, storage };
}

/** Keep the session copy in step with a harness store while it is mounted (summaries and decks only). */
export function watchSimRows(db, everyMs = 500) {
  let last = '';
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const files = {};
      for (const [k, blob] of Object.entries(db.__storage || {})) {
        if (!k.startsWith('sim/') || !/(summary\.json|\.DATA)$/i.test(k)) continue;
        files[k] = typeof blob === 'string' ? blob : await blob.text();
      }
      const now = JSON.stringify({ sim_cases: db.sim_cases || [], sim_runs: db.sim_runs || [], files });
      if (now !== last) { last = now; store()?.setItem(KEY, now); }
    } catch { /* storage blocked or full */ } finally { busy = false; }
  };
  const id = setInterval(tick, everyMs);
  return () => { tick(); clearInterval(id); };
}
