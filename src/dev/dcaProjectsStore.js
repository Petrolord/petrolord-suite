// Dev-only: the saved Decline Curve Analysis projects of the /dev harnesses
// live in sessionStorage, so a project saved on /dev/dca is there after a
// page refresh and can be read by id from /dev/forecast-scenario-hub and
// /dev/epe (the dca-forecast-1 chain, DCA-U1-008). Never imported by
// production routes.
const KEY = 'harness.saved_dca_projects.v1';
export const DCA_TABLE = 'saved_dca_projects';

const store = () => { try { return window.sessionStorage; } catch { return null; } };

export function loadDcaRows() {
  try { return JSON.parse(store()?.getItem(KEY) || '[]') || []; } catch { return []; }
}

/** Write the table of a harness store back; call after anything that may have saved. */
export function persistDcaRows(db) {
  try { store()?.setItem(KEY, JSON.stringify(db[DCA_TABLE] || [])); } catch { /* storage blocked */ }
}

/** Keep the session copy in step with a harness store while it is mounted. */
export function watchDcaRows(db, everyMs = 250) {
  let last = '';
  const tick = () => {
    const now = JSON.stringify(db[DCA_TABLE] || []);
    if (now !== last) { last = now; persistDcaRows(db); }
  };
  const id = setInterval(tick, everyMs);
  return () => { tick(); clearInterval(id); };
}
