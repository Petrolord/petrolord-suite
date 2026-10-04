// Dev-only: the saved Waterflood Design Studio projects of the /dev
// harnesses live in sessionStorage, so a project saved on
// /dev/studio/waterflood can be read by id from /dev/forecast-scenario-hub
// and /dev/epe (the wf-forecast-1 chain, WF-U2-001; the dcaProjectsStore
// pattern). Never imported by production routes.
const KEY = 'harness.saved_waterflood_design_projects.v1';
export const WF_TABLE = 'saved_waterflood_design_projects';

const store = () => { try { return window.sessionStorage; } catch { return null; } };

export function loadWfRows() {
  try { return JSON.parse(store()?.getItem(KEY) || '[]') || []; } catch { return []; }
}

/** Write the table of a harness store back; call after anything that may have saved. */
export function persistWfRows(db) {
  try { store()?.setItem(KEY, JSON.stringify(db[WF_TABLE] || [])); } catch { /* storage blocked */ }
}

/** Keep the session copy in step with a harness store while it is mounted. */
export function watchWfRows(db, everyMs = 250) {
  let last = '';
  const tick = () => {
    const now = JSON.stringify(db[WF_TABLE] || []);
    if (now !== last) { last = now; persistWfRows(db); }
  };
  const id = setInterval(tick, everyMs);
  return () => { tick(); clearInterval(id); };
}
