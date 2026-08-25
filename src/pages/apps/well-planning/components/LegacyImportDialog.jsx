// Legacy import dialog (WD1): scans the legacy per-user Well Planning
// tables and imports them once into a new 'Imported wells' site.

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { scanLegacyData, importLegacyData } from '../services/legacyImport';

const LegacyImportDialog = ({ open, onOpenChange, userId, onImported }) => {
  const { toast } = useToast();
  const [scan, setScan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (!open || !userId) return;
    setScan(null);
    scanLegacyData(userId).then(setScan).catch(() => setScan({ wells: [], targets: [] }));
  }, [open, userId]);

  const handleImport = async () => {
    setBusy(true);
    try {
      const { site, count } = await importLegacyData(userId, scan, (d, t) => setProgress([d, t]));
      toast({ title: 'Import complete', description: `${count} records imported into the "${site.name}" site.`, className: 'bg-green-600 text-white' });
      onImported?.(site);
      onOpenChange(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Import failed', description: e.message });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle>Import legacy Well Planning data</DialogTitle>
          <DialogDescription className="text-slate-400">
            Brings your wells and targets from the previous version of this app into a new site. Your legacy data is read, never changed.
          </DialogDescription>
        </DialogHeader>

        {!scan ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Scanning legacy data...
          </div>
        ) : (
          <div className="space-y-2 py-2 text-sm">
            <p><span className="font-mono text-lime-400">{scan.wells.length}</span> legacy wells found</p>
            <p><span className="font-mono text-lime-400">{scan.targets.length}</span> legacy targets found</p>
            {scan.wells.length === 0 && (
              <p className="text-slate-500">Nothing to import.</p>
            )}
            {progress && (
              <p className="text-xs text-slate-400">Importing {progress[0]} of {progress[1]}...</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-600 text-slate-300">Close</Button>
          <Button onClick={handleImport} disabled={busy || !scan || scan.wells.length === 0} className="bg-[#4CAF50] hover:bg-[#43a047] text-white">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LegacyImportDialog;
