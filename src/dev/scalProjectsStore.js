// Dev-only: the saved SCAL Studio projects of the /dev/studio harnesses live
// in sessionStorage, so a project saved on /dev/studio/scal is there after a
// page refresh and the Waterflood harness can read it by id (the kr-1 chain,
// SCAL-U1). The pattern of fluidProjectsStore.js. Never imported by
// production routes.
const KEY = 'harness.saved_scal_projects.v1';
export const SCAL_TABLE = 'saved_scal_projects';

const store = () => { try { return window.sessionStorage; } catch { return null; } };

export function loadScalRows() {
  try { return JSON.parse(store()?.getItem(KEY) || '[]') || []; } catch { return []; }
}

export function persistScalRows(db) {
  try { store()?.setItem(KEY, JSON.stringify(db[SCAL_TABLE] || [])); } catch { /* storage blocked */ }
}

/** Keep the session copy in step with a harness store while it is mounted. */
export function watchScalRows(db, everyMs = 250) {
  let last = '';
  const tick = () => {
    const now = JSON.stringify(db[SCAL_TABLE] || []);
    if (now !== last) { last = now; persistScalRows(db); }
  };
  const id = setInterval(tick, everyMs);
  return () => { tick(); clearInterval(id); };
}
