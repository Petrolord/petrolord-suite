// Dev-only: the saved Voidage Replacement Monitor projects of the /dev
// harness live in sessionStorage, so a project saved on /dev/studio/vrr can
// be read by id from /dev/studio/waterflood (the vrr-1 chain, formerly vrr-ledger-1,
// WF-U2-004; the dcaProjectsStore pattern). Never imported by production
// routes.
const KEY = 'harness.saved_vrr_projects.v1';
export const VRR_TABLE = 'saved_vrr_projects';

const store = () => { try { return window.sessionStorage; } catch { return null; } };

export function loadVrrRows() {
  try { return JSON.parse(store()?.getItem(KEY) || '[]') || []; } catch { return []; }
}

/** Write the table of a harness store back; call after anything that may have saved. */
export function persistVrrRows(db) {
  try { store()?.setItem(KEY, JSON.stringify(db[VRR_TABLE] || [])); } catch { /* storage blocked */ }
}

/** Keep the session copy in step with a harness store while it is mounted. */
export function watchVrrRows(db, everyMs = 250) {
  let last = '';
  const tick = () => {
    const now = JSON.stringify(db[VRR_TABLE] || []);
    if (now !== last) { last = now; persistVrrRows(db); }
  };
  const id = setInterval(tick, everyMs);
  return () => { tick(); clearInterval(id); };
}
