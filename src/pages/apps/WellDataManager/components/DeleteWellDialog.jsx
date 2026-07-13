// Delete confirmation with the dependent-data warning the plan
// requires: counts the well's logs and tops before asking, so the user
// sees exactly what a delete takes with it (curve objects included).

import React, { useEffect, useState } from 'react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';

export default function DeleteWellDialog({ well, backend, onOpenChange, onDone }) {
  const [counts, setCounts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!well) return;
    setCounts(null);
    setError(null);
    Promise.all([backend.listLogs(well.id), backend.listTops(well.id)])
      .then(([logs, tops]) => setCounts({ logs: logs.length, tops: tops.length }))
      .catch(() => setCounts({ logs: '?', tops: '?' }));
  }, [well, backend]);

  const doDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await backend.deleteWell(well);
      onOpenChange(false);
      onDone(well);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={!!well} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-slate-900 border-slate-700 text-slate-200" data-testid="wdm-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {well?.name}?</AlertDialogTitle>
          <AlertDialogDescription className="text-slate-400" data-testid="wdm-delete-warning">
            {counts
              ? `This permanently deletes the well, its ${counts.logs} log${counts.logs === 1 ? '' : 's'} `
                + `(curve data included) and ${counts.tops} top${counts.tops === 1 ? '' : 's'}.`
              : 'Counting dependent data…'}
            {well?.organization_id
              ? ' The well is shared — organization members lose access too.' : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <div className="text-xs text-red-400">{error}</div>}
        <AlertDialogFooter>
          <AlertDialogCancel className="border-slate-700 text-slate-300">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-500 text-white"
            disabled={busy || !counts}
            onClick={(e) => { e.preventDefault(); doDelete(); }}
            data-testid="wdm-delete-confirm"
          >
            Delete well
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
