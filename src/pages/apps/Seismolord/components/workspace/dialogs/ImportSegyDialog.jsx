// SEG-Y import as a modal dialog (launched from the ribbon and the
// explorer toolbar). Closing is blocked while an ingest is streaming so
// the transcode/upload pipeline is never torn down mid-import.

import React, { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import ImportPanel from '../../ImportPanel';

export default function ImportSegyDialog({ open, onOpenChange, onIngested }) {
  const [busy, setBusy] = useState(false);
  const guard = useCallback((e) => { if (busy) e.preventDefault(); }, [busy]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o && busy) return; onOpenChange(o); }}
    >
      <DialogContent
        className="max-w-3xl max-h-[85vh] overflow-y-auto"
        onInteractOutside={guard}
        onEscapeKeyDown={guard}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center text-white">
            <Upload className="w-5 h-5 mr-2 text-cyan-400" />
            Import SEG-Y volume
          </DialogTitle>
        </DialogHeader>
        <ImportPanel frameless onIngested={onIngested} onBusyChange={setBusy} />
      </DialogContent>
    </Dialog>
  );
}
