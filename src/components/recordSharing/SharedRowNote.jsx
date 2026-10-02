// A line for open dialogs and lists: who shared a record, what colleagues may
// do, who is editing it and who saved it last.

import React, { useEffect, useState } from 'react';
import { Users, Lock } from 'lucide-react';
import { accessOf, whenText, COLLEAGUE } from '@/lib/recordSharing/rules';

/** Resolve display names for the people a list of rows mentions. */
export function useSharingNames(store, rows) {
  const [names, setNames] = useState({});
  const ids = [...new Set((rows || []).flatMap((r) => [r?.user_id, r?.editing_by, r?.updated_by]).filter(Boolean))].sort().join(',');
  useEffect(() => {
    if (!store || !ids) return undefined;
    let alive = true;
    store.names(ids.split(',')).then((n) => { if (alive) setNames(n); }).catch(() => {});
    return () => { alive = false; };
  }, [store, ids]);
  return names;
}

export default function SharedRowNote({ table, row, userId, names = {}, className = '' }) {
  if (!row) return null;
  const a = accessOf(table, row, { userId });
  if (!a.shared && a.isOwner && !row.updated_by) return null;
  const who = (id) => (id === userId ? 'you' : names[id] || COLLEAGUE);
  const parts = [];
  if (!a.isOwner && a.shared) parts.push(`Shared by ${who(row.user_id)}, ${a.sharedEdit ? 'colleagues can edit' : 'view only'}`);
  else if (a.isOwner && a.shared) parts.push(a.sharedEdit ? 'Shared: colleagues can edit' : 'Shared: colleagues can view');
  if (a.lock.live) parts.push(`being edited by ${who(a.lock.by)}`);
  if (row.updated_by && (a.shared || row.updated_by !== userId)) parts.push(`last saved by ${who(row.updated_by)} at ${whenText(row.updated_at)}`);
  if (!parts.length) return null;
  return (
    <span data-testid="shared-row-note" className={`inline-flex items-center gap-1 text-xs text-pl-muted ${className}`}>
      {a.lock.live ? <Lock className="h-3 w-3" aria-hidden /> : <Users className="h-3 w-3" aria-hidden />}
      {parts.join('; ')}
    </span>
  );
}
