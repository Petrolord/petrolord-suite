// The sync drawer (spec sections 37, 44): what is waiting, what the
// server refused and why, conflicts to resolve, the storage held on
// this device and the photos not yet backed up, and the offline
// readiness of the app itself.
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSyncState } from './SyncStatusPill';
import { toRigLocal } from '@/lib/wellsite/time';

export default function SyncDrawer({ backend, wellId, offsetMin, onClose, onOpenConflicts, onKeepOffline, offlineReady }) {
  const s = useSyncState();
  const [entries, setEntries] = useState([]);
  const [storage, setStorage] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const local = (ms) => (ms ? toRigLocal(ms, offsetMin).hhmm : '');

  useEffect(() => {
    let alive = true;
    (async () => {
      const rows = wellId ? await backend.db.outbox.where('[well_id+status]').anyOf([[wellId, 'pending'], [wellId, 'failed'], [wellId, 'rejected']]).toArray() : [];
      const est = await backend.storageInfo();
      let p = null;
      try { p = typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch { p = null; }
      if (alive) { setEntries(rows.sort((a, b) => a.seq - b.seq)); setStorage(est); setPersisted(p); }
    })();
    return () => { alive = false; };
  }, [backend, wellId, s.pending, s.rejected, s.failed, s.lastSyncUtc]);

  const mb = (b) => (Number.isFinite(b) ? `${(b / 1048576).toFixed(1)} MB` : 'unknown');
  return (
    <div className="p-3 space-y-3 text-xs" data-testid="ws-sync-drawer">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">Sharing</div>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-200" data-testid="ws-sync-close">close</button>
      </div>
      <div className="text-slate-300" data-testid="ws-sync-summary">
        {s.online ? 'Connected.' : 'No connection. Everything is saved on this device and shares when one returns.'}
        {s.lastSyncUtc ? ` Last shared ${local(Date.parse(s.lastSyncUtc))} rig time.` : ''}
      </div>
      <div className="grid grid-cols-2 gap-1 text-slate-400">
        <span>Waiting</span><span className="text-slate-100" data-testid="ws-sync-pending">{s.pending + s.failed}</span>
        <span>Refused by the server</span><span className="text-slate-100" data-testid="ws-sync-rejected">{s.rejected}</span>
        <span>Conflicts</span><span className="text-slate-100" data-testid="ws-sync-conflicts">{s.conflicts}</span>
        <span>Photos not yet backed up</span><span className="text-slate-100" data-testid="ws-sync-photos">{s.photosNotBackedUp}</span>
      </div>
      {s.lastError && <div className="text-amber-400" data-testid="ws-sync-error">{s.lastError}</div>}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => backend.flush()} data-testid="ws-sync-flush" disabled={!s.online}>Share now</Button>
        {(s.rejected > 0 || s.failed > 0) && <Button size="sm" variant="outline" onClick={() => backend.retryRejected(wellId)} data-testid="ws-sync-retry">Retry refused</Button>}
        {s.conflicts > 0 && <Button size="sm" onClick={onOpenConflicts} data-testid="ws-sync-open-conflicts">Open conflicts</Button>}
      </div>
      {entries.length > 0 && (
        <table className="w-full text-slate-400"><tbody>
          {entries.slice(0, 30).map((e) => (
            <tr key={e.seq} data-testid={`ws-sync-entry-${e.seq}`} data-status={e.status} className={e.status === 'rejected' ? 'text-red-300' : ''}>
              <td className="pr-2">{e.table.replace('ws_', '')}</td><td className="pr-2">{e.op}</td><td className="pr-2">{e.status}</td><td className="text-slate-500">{e.last_error || ''}</td>
            </tr>
          ))}
        </tbody></table>
      )}
      <div className="text-[10px] uppercase tracking-wide text-slate-500 pt-1">This device</div>
      <div className="text-slate-400" data-testid="ws-sync-storage">
        Storage used {storage ? mb(storage.usage) : 'unknown'} of {storage ? mb(storage.quota) : 'unknown'}.
        {' '}{persisted === true ? 'Storage is protected from eviction.' : persisted === false ? 'Storage may be evicted under disk pressure; install the app to protect it.' : ''}
      </div>
      <div className="text-slate-400" data-testid="ws-sync-offline-ready">
        {offlineReady === true ? 'This app is cached for use without a connection.' : offlineReady === false ? 'Open once with a connection, then keep offline, so the app itself loads without one.' : ''}
        {onKeepOffline && <Button size="sm" variant="ghost" onClick={onKeepOffline} data-testid="ws-sync-keep-offline" disabled={!s.online}>Keep offline</Button>}
      </div>
      <div className="text-[10px] text-slate-600">Rely on device disk encryption (BitLocker or equivalent) for the record held here.</div>
    </div>
  );
}
