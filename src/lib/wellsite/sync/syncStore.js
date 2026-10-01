// The sync state the screens show (WS6): one small observable per page.
// Precedence for the headline: conflict, failed, pending, synchronising,
// synchronised; offline overrides the wording, not the counts.

const listeners = new Set();
let state = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  phase: 'idle',            // idle | pushing | pulling
  pending: 0, inflight: 0, failed: 0, rejected: 0, conflicts: 0, photosNotBackedUp: 0,
  lastSyncUtc: null, lastError: null, wellId: null,
};

export function getSyncState() { return state; }
export function setSyncState(patch) {
  state = { ...state, ...patch };
  for (const l of listeners) { try { l(state); } catch { /* a listener's error is not ours */ } }
}
export function subscribeSyncState(cb) { listeners.add(cb); return () => listeners.delete(cb); }
export function _resetSyncState() { state = { ...state, phase: 'idle', pending: 0, inflight: 0, failed: 0, rejected: 0, conflicts: 0, photosNotBackedUp: 0, lastSyncUtc: null, lastError: null }; }

/** The headline and its tone. */
export function syncHeadline(s = state) {
  if (!s.online) return { state: 'offline', text: `offline, ${s.pending + s.failed} waiting`, tone: 'amber' };
  if (s.conflicts > 0) return { state: 'conflict', text: `${s.conflicts} conflict(s)`, tone: 'amber' };
  if (s.rejected > 0) return { state: 'failed', text: `${s.rejected} refused`, tone: 'red' };
  if (s.phase !== 'idle') return { state: 'synchronising', text: s.phase === 'pushing' ? 'sharing' : 'receiving', tone: 'cyan' };
  if (s.pending + s.failed > 0) return { state: 'pending', text: `${s.pending + s.failed} to share`, tone: 'cyan' };
  // WS-U1-002: "shared" only after a sharing pass has completed; before the
  // first one (signed out, a fresh page, a pass that failed) nothing has
  // reached the office yet and the pill must not say otherwise
  if (!s.lastSyncUtc) return { state: 'local', text: s.lastError ? 'not shared yet, last try failed' : 'not shared yet', tone: s.lastError ? 'amber' : 'slate' };
  return { state: 'synchronised', text: 'shared', tone: 'slate' };
}
