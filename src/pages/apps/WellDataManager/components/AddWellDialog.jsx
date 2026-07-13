// Manual well entry: the shared WellImport form (header + delimited
// deviation/tops/checkshots with column mapping) in a dialog. The
// form's draft persists as a registry well + normalized tops.

import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import WellImport from '@/components/wells/WellImport';

export default function AddWellDialog({ open, onOpenChange, backend, onDone }) {
  const save = async (draft) => {
    const well = await backend.saveWell({
      name: draft.name,
      uwi: draft.uwi,
      surfaceX: draft.surfaceX,
      surfaceY: draft.surfaceY,
      kbM: draft.kbM,
      tdMdM: draft.tdMdM,
      deviation: draft.deviation,
      checkshots: draft.checkshots,
    });
    if (draft.tops.length) await backend.replaceTops(well.id, draft.tops);
    onOpenChange(false);
    onDone(well);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl bg-slate-900 border-slate-700 text-slate-200"
        data-testid="wdm-add-dialog"
      >
        <DialogHeader>
          <DialogTitle>Add well</DialogTitle>
          <DialogDescription className="text-slate-400">
            Header plus optional pasted deviation survey, tops and checkshots (SI units).
          </DialogDescription>
        </DialogHeader>
        <WellImport onSave={save} />
      </DialogContent>
    </Dialog>
  );
}
