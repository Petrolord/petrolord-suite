// Compute attribute volume (W2.1/W2.2): derive a new volume from the
// open volume's brick store — envelope, instantaneous phase/frequency,
// sweetness, windowed RMS or AGC amplitude. The compute runs in a
// worker reading the parent's bricks directly; output bricks upload
// under the ingest backpressure and the result registers as a derived
// volume (manifest v2) that lists beside its parent in the explorer.

import React, { useEffect, useRef, useState } from 'react';
import { Activity, Ban, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  ALL_ATTRIBUTE_DEFS, computeAttributeVolume, defaultDerivedName, derivedStorageBytes,
} from '../../../services/attributeJobService';

const selCls = 'mt-1 w-full rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 text-sm';

export default function ComputeAttributeDialog({
  open, onOpenChange, volume, manifest, onComputed,
}) {
  const { toast } = useToast();
  const [attr, setAttr] = useState('envelope');
  const [paramValues, setParamValues] = useState({});
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const cancelRef = useRef({ cancelled: false });

  const def = ALL_ATTRIBUTE_DEFS[attr];
  const paramDefs = Object.entries(def?.params || {});

  useEffect(() => {
    if (!open) return;
    setProgress(null);
    setName('');
    cancelRef.current = { cancelled: false };
  }, [open]);

  const params = Object.fromEntries(paramDefs.map(([key, p]) => [
    key, paramValues[key] ?? p.default,
  ]));
  const placeholder = volume ? defaultDerivedName(volume.name, attr, params) : '';

  let sizeText = null;
  try {
    if (manifest) {
      const gib = derivedStorageBytes(manifest) / 1024 ** 3;
      sizeText = gib >= 1 ? `${gib.toFixed(1)} GiB` : `${(gib * 1024).toFixed(0)} MiB`;
    }
  } catch { /* manifest without brick block: leave blank */ }

  const run = async () => {
    setBusy(true);
    cancelRef.current = { cancelled: false };
    try {
      await computeAttributeVolume({
        parent: volume,
        parentManifest: manifest,
        attribute: { name: attr, params },
        name: name.trim() || undefined,
        cancelToken: cancelRef.current,
        onProgress: (p) => setProgress(p),
      });
      toast({ title: 'Attribute volume ready', description: placeholder });
      if (onComputed) onComputed();
      onOpenChange(false);
    } catch (e) {
      const cancelled = /cancelled/i.test(e.message);
      toast({
        title: cancelled ? 'Attribute computation cancelled' : 'Attribute computation failed',
        description: cancelled ? 'Partial results were cleaned up.' : e.message,
        variant: cancelled ? undefined : 'destructive',
      });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const pct = progress?.total
    ? Math.round((progress.done / progress.total) * 100) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center text-white">
            <Activity className="w-5 h-5 mr-2 text-cyan-400" />
            Compute attribute volume
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label className="block col-span-2">
              <span className="text-xs text-slate-400">Attribute</span>
              <select
                value={attr}
                onChange={(e) => { setAttr(e.target.value); setParamValues({}); }}
                className={selCls}
                disabled={busy}
              >
                {Object.values(ALL_ATTRIBUTE_DEFS).map((d) => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
              </select>
            </label>
            {paramDefs.map(([key, p]) => (
              <label key={key} className="block">
                <span className="text-xs text-slate-400">{p.label}</span>
                <input
                  type="number"
                  min={p.min}
                  max={p.max}
                  value={params[key]}
                  onChange={(e) => setParamValues((v) => ({
                    ...v, [key]: Number(e.target.value) || p.default,
                  }))}
                  className={selCls}
                  disabled={busy}
                />
              </label>
            ))}
            <label className="block col-span-2">
              <span className="text-xs text-slate-400">Volume name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={placeholder}
                className={selCls}
                disabled={busy}
              />
            </label>
          </div>

          <p className="text-[11px] text-slate-500">
            Derived from “{volume?.name}” on the identical lattice
            {sizeText ? ` (~${sizeText} of brick storage, counted against your quota)` : ''}.
            Stored amplitudes of the parent are never modified.
          </p>

          {busy && (
            <div className="space-y-1">
              <div className="h-1.5 rounded bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all"
                  style={{ width: `${pct ?? 0}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                {progress?.phase === 'upload'
                  ? `Uploading… ${progress.done} bricks`
                  : progress?.total
                    ? `Computing… ${progress.done} / ${progress.total} bricks (${pct}%)`
                    : 'Starting…'}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            {busy && (
              <Button
                variant="outline"
                onClick={() => { cancelRef.current.cancelled = true; }}
              >
                <Ban className="w-4 h-4 mr-1" />
                Cancel
              </Button>
            )}
            <Button onClick={run} disabled={busy || !volume || !manifest}>
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Activity className="w-4 h-4 mr-1" />}
              Compute
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
