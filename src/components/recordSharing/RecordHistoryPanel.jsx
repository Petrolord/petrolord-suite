// Who changed what on a record: the rows of suite_record_changes the user may
// read, newest first. Names come from the user's own organisation; an author
// outside it reads "A colleague". Emails are never shown.

import React, { useEffect, useState } from 'react';
import { describeChange, whenText } from '@/lib/recordSharing/rules';

export default function RecordHistoryPanel({ load, userId = null, fieldLabels = {}, className = '' }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    setRows(null); setError(null);
    Promise.resolve().then(load).then((r) => { if (alive) setRows(r || []); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [load]);
  return (
    <div data-testid="history-panel" className={`max-h-56 overflow-auto rounded border border-pl-border bg-pl-bg p-2 ${className}`}>
      <p className="mb-1 font-medium text-pl-text">History</p>
      {error && <p className="text-pl-danger-text">{error}</p>}
      {!error && rows === null && <p className="text-pl-muted">Loading the history.</p>}
      {!error && rows && rows.length === 0 && <p className="text-pl-muted">No changes recorded yet. The history starts when sharing is switched on for the database.</p>}
      {!error && rows && rows.length > 0 && (
        <ol className="space-y-1">
          {rows.map((c) => (
            <li key={c.id} data-testid="history-row" className="flex flex-wrap gap-x-2 text-pl-text">
              <span className="tabular-nums text-pl-muted">{whenText(c.changed_at)}</span>
              <span className="font-medium">{c.changed_by && c.changed_by === userId ? 'You' : c.changed_by_name}</span>
              <span>{describeChange(c, fieldLabels)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
