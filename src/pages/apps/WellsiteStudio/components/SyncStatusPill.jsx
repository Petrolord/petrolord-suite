// The sync pill in the ribbon (spec section 37): pending, synchronising,
// synchronised, conflict, failed, and offline. Click opens the drawer.
import React, { useEffect, useState } from 'react';
import { getSyncState, subscribeSyncState, syncHeadline } from '@/lib/wellsite/sync/syncStore';

const TONE = { amber: 'border-amber-500/60 text-amber-300', red: 'border-red-500/60 text-red-300', cyan: 'border-cyan-500/60 text-cyan-300', slate: 'border-slate-700 text-slate-400' };

export function useSyncState() {
  const [s, setS] = useState(getSyncState);
  useEffect(() => subscribeSyncState(setS), []);
  return s;
}

export default function SyncStatusPill({ onClick }) {
  const s = useSyncState();
  const h = syncHeadline(s);
  return (
    <button type="button" onClick={onClick} data-testid="ws-sync-state" data-sync={h.state} title="Every entry is saved on this device first, then shared when a connection exists. Click for details."
      className={`px-2 py-0.5 text-[11px] rounded border ${TONE[h.tone]}`}>
      {h.text}
    </button>
  );
}
