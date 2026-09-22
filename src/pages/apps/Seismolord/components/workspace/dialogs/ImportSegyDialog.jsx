// SEG-Y import as a modal dialog (launched from the ribbon and the
// explorer toolbar). A v4 import runs as a background job and the dialog
// closes as soon as it starts; the v1 fallback path still blocks closing
// while it streams so its transcode/upload is never torn down mid-import.

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
        <ImportPanel
          frameless
          onIngested={onIngested}
          onBusyChange={setBusy}
          // a v4 import runs as a background job: the dialog closes and
          // progress moves to the status bar
          onBackgroundStarted={() => { setBusy(false); onOpenChange(false); }}
        />
      </DialogContent>
    </Dialog>
  );
}
