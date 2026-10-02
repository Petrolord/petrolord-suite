// Dev-only: the saved Fluid Systems Studio projects of the /dev harnesses
// live in sessionStorage, so a project saved on /dev/fluid-systems-studio is
// there after a page refresh and can be read by id from another harness
// (the pvt-1 chain: Fluid Systems to Well Test Analysis). Never imported by
// production routes.
const KEY = 'harness.saved_fluid_studio_projects.v1';
export const FLUID_TABLE = 'saved_fluid_studio_projects';

const store = () => { try { return window.sessionStorage; } catch { return null; } };

export function loadFluidRows() {
  try { return JSON.parse(store()?.getItem(KEY) || '[]') || []; } catch { return []; }
}

/** Write the table of a harness store back; call after anything that may have saved. */
export function persistFluidRows(db) {
  try { store()?.setItem(KEY, JSON.stringify(db[FLUID_TABLE] || [])); } catch { /* storage blocked */ }
}

/** Keep the session copy in step with a harness store while it is mounted. */
export function watchFluidRows(db, everyMs = 250) {
  let last = '';
  const tick = () => {
    const now = JSON.stringify(db[FLUID_TABLE] || []);
    if (now !== last) { last = now; persistFluidRows(db); }
  };
  const id = setInterval(tick, everyMs);
  return () => { tick(); clearInterval(id); };
}
