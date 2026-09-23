// Detect faults (discoverability programme, 2026-09-23): automatic fault
// picking on its own, without going through Tops to Horizons. The same
// AutoFaultPicker and framework-worker job; the area of interest starts
// around the line on screen.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Loader2, Sparkles } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import AutoFaultPicker from '../AutoFaultPicker';
import { aoiAround, defaultAoi } from '../../../services/topsToHorizonsPipeline';

/**
 * @param {Object} p
 * @param {{il: number, xl: number}} [p.center] the lattice position on screen
 * @param {(kind, config, onProgress) => {promise, cancel}} p.runJob
 */
export default function DetectFaultsDialog({
  open, onOpenChange, volume, manifest, geom, faults = [], center = null, runJob, onFaultsSaved,
}) {
  const { toast } = useToast();
  const dtMs = manifest?.geometry?.dt_us ? manifest.geometry.dt_us / 1000 : null;
  const [busy, setBusy] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const jobRef = useRef(null);

  // the centre is read when the dialog opens, so scrubbing behind it
  // does not reset the area being edited
  const [openCenter, setOpenCenter] = useState(center);
  useEffect(() => {
    if (!open) return;
    setOpenCenter(center);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => () => jobRef.current?.cancel(), []);

  const presets = useMemo(() => (geom ? [
    { key: 'line', label: 'Around the current line', aoi: aoiAround(openCenter, geom) },
    { key: 'survey', label: 'Whole survey (shrunk to fit)', aoi: defaultAoi([], geom) },
  ] : []), [geom, openCenter]);
  const initialAoi = presets[0]?.aoi ?? null;

  const run = async (kind, config) => {
    setBusy(kind);
    setError(null);
    setProgress(null);
    const job = runJob(kind, config, (stage, done, total) => setProgress({ stage, done, total }));
    jobRef.current = job;
    try {
      return await job.promise;
    } finally {
      if (jobRef.current === job) jobRef.current = null;
      setBusy(null);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="sl-detect-faults">
        <DialogHeader>
          <DialogTitle className="flex items-center text-white">
            <Sparkles className="w-5 h-5 mr-2 text-cyan-400" />
            Detect faults
          </DialogTitle>
        </DialogHeader>
        {!volume || !geom || volume.local ? (
          <p className="text-sm text-slate-400">
            {volume?.local
              ? 'Fault detection reads the uploaded volume. Start the import to convert this survey.'
              : 'Open a converted volume in the viewer first.'}
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              Proposes faults from the seismic itself; no variance volume is needed first. Nothing is saved until
              you tick the faults to keep. Saved faults are ordinary faults: edit them with the stick tools, use them
              as tracking barriers, or delete them.
            </p>
            {busy && (
              <div className="flex items-center text-xs text-slate-300">
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                {progress ? `${progress.stage} ${progress.done} of ${progress.total}` : 'Working'}
                <Button size="sm" variant="ghost" className="ml-2" onClick={() => jobRef.current?.cancel()}>
                  <Ban className="w-4 h-4 mr-1" />
                  Cancel
                </Button>
              </div>
            )}
            {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
            <AutoFaultPicker
              geom={geom}
              dtMs={dtMs}
              volume={volume}
              faults={faults}
              initialAoi={initialAoi}
              presets={presets}
              run={run}
              busy={busy}
              onError={setError}
              onSaved={(rows) => {
                onFaultsSaved?.(rows);
                toast({ title: 'Faults saved', description: `${rows.length} automatic ${rows.length === 1 ? 'fault' : 'faults'} added to the explorer.` });
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
