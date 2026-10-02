// React side of organisation sharing (see ./rules and ./store): keeps one
// open record's sharing state, the check-out and its renewal.
//
// The check-out renews on a save (the database does that) and every four
// minutes while the user is active in the page; with no activity it lapses
// 30 minutes after the last save or renewal. It is released when the record
// is closed, on "Done editing", and by the owner at any time.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { accessOf, messages, isShared } from './rules';

const HEARTBEAT_MS = 4 * 60 * 1000;
const POLL_MS = 45 * 1000;
const TICK_MS = 20 * 1000;

/**
 * @param {{
 *   store: Object,            a sharing store (supabaseSharingStore() or makeSharingStore(memoryTransport(...)))
 *   table: string,
 *   record: ?Object,          the open record's row or sharingOf(row); null while unsaved
 *   onChange?: (sharing: Object) => void,   the sharing state changed (share switch, check-out)
 * }} opts
 */
export function useRecordSharing({ store, table, record, onChange = null }) {
  const [ctx, setCtx] = useState({ userId: null, organizationId: null, ready: false });
  const [available, setAvailable] = useState(null);       // null = asking
  const [sharing, setSharing] = useState(record || null);
  const [names, setNames] = useState({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);             // { kind, text }
  const [now, setNow] = useState(() => Date.now());
  const lastActivity = useRef(Date.now());
  const lastBeat = useRef(Date.now());
  const live = useRef({ sharing: null, mine: false });
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const id = record?.id || null;

  // the record prop is the app's copy: follow it when it moves
  const sig = record ? [record.id, record.version, record.visibility, record.organization_id, record.org_access, record.editing_by, record.editing_expires, record.updated_at].join('|') : '';
  useEffect(() => { setSharing(record || null); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  // a notice belongs to the record it was raised on
  useEffect(() => { setNotice(null); }, [id]);

  useEffect(() => {
    let alive = true;
    if (!store) { setAvailable(false); return undefined; }   // a backend without sharing: nothing to show, saves as before
    (async () => {
      const [c, cap] = await Promise.all([store.context().catch(() => ({ userId: null, organizationId: null })), store.capability(table).catch(() => ({ available: false }))]);
      if (!alive) return;
      setCtx({ ...c, ready: true });
      setAvailable(!!cap.available);
    })();
    return () => { alive = false; };
  }, [store, table]);

  const access = useMemo(
    () => accessOf(table, sharing, { userId: ctx.userId, now, available: available !== false }),
    [table, sharing, ctx.userId, now, available],
  );
  live.current = { sharing, mine: access.lock.mine };

  const apply = useCallback((next) => {
    if (!next) return;
    setSharing((prev) => {
      const merged = { ...(prev || {}), ...next };
      if (onChangeRef.current) onChangeRef.current(merged);
      return merged;
    });
  }, []);

  // names of the owner, the editor and the last author
  useEffect(() => {
    if (!sharing || !store) return undefined;
    let alive = true;
    store.names([sharing.user_id, sharing.editing_by, sharing.updated_by]).then((n) => { if (alive) setNames((p) => ({ ...p, ...n })); }).catch(() => {});
    return () => { alive = false; };
  }, [store, sharing?.user_id, sharing?.editing_by, sharing?.updated_by]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    if (!id || !store) return null;
    const fresh = await store.refresh(table, id).catch(() => null);
    if (fresh) apply(fresh);
    return fresh;
  }, [store, table, id, apply]);

  // clock (expiry), poll while shared (someone else may take or release), activity
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    const mark = () => { lastActivity.current = Date.now(); };
    window.addEventListener('pointerdown', mark, true);
    window.addEventListener('keydown', mark, true);
    return () => { clearInterval(t); window.removeEventListener('pointerdown', mark, true); window.removeEventListener('keydown', mark, true); };
  }, []);
  const sharedNow = !!sharing && available === true && isShared(table, sharing);
  useEffect(() => {
    if (!id || !sharedNow) return undefined;
    const t = setInterval(() => { if (typeof document === 'undefined' || !document.hidden) refresh(); }, POLL_MS);
    return () => clearInterval(t);
  }, [id, sharedNow, refresh]);

  // heartbeat while holding the check-out and active
  useEffect(() => {
    if (!id || !access.lock.mine) return undefined;
    lastBeat.current = Date.now();
    const t = setInterval(async () => {
      if (lastActivity.current <= lastBeat.current) return;   // idle: let it lapse
      lastBeat.current = Date.now();
      const res = await store.renew(table, id).catch(() => null);
      if (res?.ok) apply({ editing_by: res.editing_by, editing_since: res.editing_since, editing_expires: res.editing_expires });
      else { await refresh(); setNotice({ kind: 'expired', text: messages.expired() }); }
    }, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [id, access.lock.mine, store, table, apply, refresh]);

  // a lapse the user has not seen yet
  const wasMine = useRef(false);
  useEffect(() => {
    if (wasMine.current && !access.lock.mine && access.sharedEdit && sharing?.editing_by === ctx.userId) {
      setNotice({ kind: 'expired', text: messages.expired() });
    }
    wasMine.current = access.lock.mine;
  }, [access.lock.mine, access.sharedEdit, sharing?.editing_by, ctx.userId]);

  // release on close, on switching record and when the page goes away
  useEffect(() => {
    if (!id || !store) return undefined;
    const release = () => { if (live.current.mine) store.release(table, id); };
    window.addEventListener('pagehide', release);
    return () => { window.removeEventListener('pagehide', release); release(); };
  }, [store, table, id]);

  const run = useCallback(async (fn) => {
    setBusy(true);
    try { return await fn(); } catch (e) { setNotice({ kind: 'error', text: e.message }); return null; } finally { setBusy(false); }
  }, []);

  const startEditing = useCallback(({ takeOver = false } = {}) => run(async () => {
    setNotice(null);
    const res = await store.take(table, id, { takeOver });
    if (res.ok) {
      if (res.needed) apply({ editing_by: res.editing_by, editing_since: res.editing_since, editing_expires: res.editing_expires });
      if (res.stale) {
        const fresh = await refresh();
        const who = fresh?.updated_by ? (await store.names([fresh.updated_by]))[fresh.updated_by] : null;
        setNotice({ kind: 'stale', text: messages.stale(who, fresh?.updated_at) });
      }
      lastActivity.current = Date.now();
    } else {
      await refresh();
      setNotice({ kind: res.reason || 'error', text: res.message || 'Could not start editing.' });
    }
    return res;
  }), [run, store, table, id, apply, refresh]);

  const stopEditing = useCallback(() => run(async () => {
    const res = await store.release(table, id);
    await refresh();
    return res;
  }), [run, store, table, id, refresh]);

  const share = useCallback(({ shared, access: level = 'view' }) => run(async () => {
    setNotice(null);
    const next = await store.setSharing(table, id, { shared, access: level });
    apply(next);
    // the owner who opens a record for colleagues to edit is the one editing it now
    if (shared && level === 'edit') {
      const res = await store.take(table, id);
      if (res.ok && res.needed) apply({ editing_by: res.editing_by, editing_since: res.editing_since, editing_expires: res.editing_expires });
    }
    return next;
  }), [run, store, table, id, apply]);

  const loadHistory = useCallback(() => (store ? store.history(table, id) : Promise.resolve([])), [store, table, id]);

  const ownerName = sharing?.user_id ? names[sharing.user_id] : null;
  const editorName = access.lock.by ? names[access.lock.by] : null;
  let readOnlyReason = null;
  if (sharing && ctx.ready && !access.canWrite) {
    if (access.lock.live && !access.lock.mine) readOnlyReason = messages.locked(editorName, access.lock.since);
    else if (access.mode === 'colleague-view') readOnlyReason = messages.viewOnly(ownerName);
    else if (access.sharedEdit) readOnlyReason = messages.noCheckout();
    else if (access.mode === 'none') readOnlyReason = messages.gone();
  }

  return {
    ready: !!store && ctx.ready && available !== null,
    available: available === true,
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    sharing,
    access,
    names,
    ownerName,
    editorName,
    lastEditorName: sharing?.updated_by ? names[sharing.updated_by] : null,
    busy,
    notice,
    clearNotice: () => setNotice(null),
    /** False while the record is open read-only for this user. Unsaved records are writable. */
    canWrite: !store || !sharing || !ctx.ready ? true : access.canWrite,
    readOnlyReason,
    share, startEditing, stopEditing, refresh, loadHistory,
    takeOver: () => startEditing({ takeOver: true }),
  };
}
