// The sync engine (WS6, spec sections 36 to 38): automatic, never in the
// way. Push the outbox, pull what others wrote, recompute conflicts,
// and publish the state; triggered by coming online, the tab becoming
// visible, an auth refresh, a timer, and (debounced) every local commit.
// Failures stay queued and retry; nothing needs a person to click sync,
// though flush() exists for the drawer.

import { drainOutbox } from './push';
import { pullWell } from './pull';
import { detectConflicts } from './conflicts';
import { setSyncState, getSyncState } from './syncStore';

export function makeSyncEngine({ db, transport, wellIdOf, intervalMs = 60000, debounceMs = 500 }) {
  let timer = null;
  let debounce = null;
  let running = false;
  let queued = false;
  let stopped = true;
  let offAuth = null;

  async function refreshCounts(wellId) {
    const pending = wellId ? await db.outbox.where('[well_id+status]').equals([wellId, 'pending']).count() : await db.outbox.where('status').equals('pending').count();
    const failed = wellId ? await db.outbox.where('[well_id+status]').equals([wellId, 'failed']).count() : await db.outbox.where('status').equals('failed').count();
    const rejected = wellId ? await db.outbox.where('[well_id+status]').equals([wellId, 'rejected']).count() : await db.outbox.where('status').equals('rejected').count();
    const conflicts = wellId ? await db.conflicts.where('well_id').equals(wellId).count() : await db.conflicts.count();
    const photosNotBackedUp = wellId ? (await db.photos.where('[well_id+captured_at]').between([wellId, ''], [wellId, '￿']).toArray()).filter((p) => p.upload_state !== 'complete' && p.upload_state !== 'remote').length : 0;
    setSyncState({ online: transport.online(), pending, failed, rejected, conflicts, photosNotBackedUp, wellId });
  }

  async function cycle(reason) {
    if (running) { queued = true; return getSyncState(); }
    running = true;
    const wellId = wellIdOf ? wellIdOf() : null;
    try {
      await refreshCounts(wellId);
      if (!transport.online()) return getSyncState();
      setSyncState({ phase: 'pushing', lastError: null });
      const push = await drainOutbox({ db, transport, wellId });
      if (push.error) setSyncState({ lastError: push.error });
      if (wellId) {
        setSyncState({ phase: 'pulling' });
        await pullWell({ db, transport, wellId });
        await detectConflicts(db, wellId);
      }
      setSyncState({ phase: 'idle', lastSyncUtc: new Date().toISOString(), lastReason: reason });
    } catch (err) {
      setSyncState({ phase: 'idle', lastError: String(err && err.message ? err.message : err) });
    } finally {
      running = false;
      await refreshCounts(wellId).catch(() => {});
      if (queued) { queued = false; setTimeout(() => cycle('queued'), 0); }
    }
    return getSyncState();
  }

  const onOnline = () => { setSyncState({ online: true }); cycle('online'); };
  const onOffline = () => setSyncState({ online: false });
  const onVisible = () => { if (typeof document === 'undefined' || document.visibilityState === 'visible') cycle('visible'); };

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      if (typeof window !== 'undefined') {
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        document.addEventListener('visibilitychange', onVisible);
      }
      if (transport.onAuthEvent) offAuth = transport.onAuthEvent((event) => { if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') cycle('auth'); });
      timer = setInterval(() => cycle('timer'), intervalMs);
      cycle('start');
    },
    stop() {
      stopped = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
        document.removeEventListener('visibilitychange', onVisible);
      }
      if (offAuth) { offAuth(); offAuth = null; }
      if (timer) { clearInterval(timer); timer = null; }
      if (debounce) { clearTimeout(debounce); debounce = null; }
    },
    /** A local commit happened: sync soon. */
    touch() {
      if (stopped) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { debounce = null; cycle('commit'); }, debounceMs);
    },
    flush: (reason = 'manual') => cycle(reason),
    refreshCounts,
    /** Retry rejected and failed entries (an approver fixed the cause). */
    async retryRejected(wellId) {
      const list = await db.outbox.where('[well_id+status]').anyOf([[wellId, 'rejected'], [wellId, 'failed']]).toArray();
      for (const e of list) await db.outbox.update(e.seq, { status: 'pending', attempts: 0, next_attempt_at: 0 });
      return cycle('retry');
    },
  };
}
