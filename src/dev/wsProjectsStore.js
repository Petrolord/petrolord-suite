// Dev-only: the saved Well Spacing Optimizer projects of the /dev
// harnesses live in sessionStorage, so a project saved on
// /dev/studio/well-spacing can be read by id from /dev/forecast-scenario-hub
// and /dev/epe (the ws-case-1 chain, WS-U2-004; the dcaProjectsStore
// pattern). Never imported by production routes.
const KEY = 'harness.saved_well_spacing_projects.v1';
export const WS_TABLE = 'saved_well_spacing_projects';

const store = () => { try { return window.sessionStorage; } catch { return null; } };

export function loadWsRows() {
  try { return JSON.parse(store()?.getItem(KEY) || '[]') || []; } catch { return []; }
}

/** Write the table of a harness store back; call after anything that may have saved. */
export function persistWsRows(db) {
  try { store()?.setItem(KEY, JSON.stringify(db[WS_TABLE] || [])); } catch { /* storage blocked */ }
}

/** Keep the session copy in step with a harness store while it is mounted. */
export function watchWsRows(db, everyMs = 250) {
  let last = '';
  const tick = () => {
    const now = JSON.stringify(db[WS_TABLE] || []);
    if (now !== last) { last = now; persistWsRows(db); }
  };
  const id = setInterval(tick, everyMs);
  return () => { tick(); clearInterval(id); };
}
