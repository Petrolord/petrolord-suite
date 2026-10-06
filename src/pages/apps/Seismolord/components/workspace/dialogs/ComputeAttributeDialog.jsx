// Compute attribute volume (W2.1/W2.2): derive a new volume from the
// open volume's brick store: the trace attributes (envelope, phase,
// frequency, sweetness, RMS, AGC, spectral decomposition, relative
// acoustic impedance) and the neighbourhood ones (variance, fault
// likelihood, edge, dip, azimuth, chaos, curvature). The compute runs in a
// worker reading the parent's bricks directly; output bricks upload
// under the ingest backpressure and the result registers as a derived
// volume (manifest v2) that lists beside its parent in the explorer.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Ban, Loader2, Server } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { serverAttributeAdvice, startServerAttribute } from '../../../services/serverAttribute';
import { useToast } from '@/components/ui/use-toast';
import {
  ALL_ATTRIBUTE_DEFS, attributePrecheck, computeAttributeVolume, defaultDerivedName, derivedStorageBytes,
} from '../../../services/attributeJobService';
import { groupAttributeDefs } from '../../../lib/attributeDisplay';
import { surveyConvergence } from '../../../lib/northReference';
import { surveyAffine } from '../../../engine/surveyGeometry';
import { geomFromManifest } from '../../../engine/sliceAssembly';
import { convergenceAt } from '@/lib/crs';
import { isTransformableTag } from '@/lib/crs/tags';

/** A typed parameter value: blank or unreadable falls back to the default;
 *  0 is a real value where the parameter allows it (Edge's window). */
export function paramValue(raw, p) {
  const n = raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) ? n : p.default;
}

const selCls = 'mt-1 w-full rounded-md bg-pl-surface border border-pl-border-strong text-pl-text px-2 py-1 text-sm';

export default function ComputeAttributeDialog({
  open, onOpenChange, volume, manifest, onComputed, initialAttribute = null, onServerJobStarted,
}) {
  const { toast } = useToast();
  const [attr, setAttr] = useState('envelope');
  const [paramValues, setParamValues] = useState({});
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const cancelRef = useRef({ cancelled: false });
  // QI Q0b: the Petrolord server computes attribute volumes of your own
  // volumes; chosen by default from 1 GiB of output
  const [userId, setUserId] = useState(null);
  useEffect(() => {
    let live = true;
    supabase.auth.getUser().then(({ data }) => { if (live) setUserId(data?.user?.id || null); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const serverAdvice = serverAttributeAdvice({ parentManifest: manifest, isOwnVolume: Boolean(userId && volume?.user_id === userId) });
  const [onServer, setOnServer] = useState(false);
  useEffect(() => { if (open) setOnServer(serverAdvice.preferred); }, [open, serverAdvice.preferred]);

  const def = ALL_ATTRIBUTE_DEFS[attr];
  const paramDefs = Object.entries(def?.params || {});

  useEffect(() => {
    if (!open) return;
    setProgress(null);
    setName('');
    if (initialAttribute && ALL_ATTRIBUTE_DEFS[initialAttribute]) setAttr(initialAttribute);
    cancelRef.current = { cancelled: false };
  }, [open]);

  const params = Object.fromEntries(paramDefs.map(([key, p]) => [
    key, paramValues[key] ?? p.default,
  ]));
  const placeholder = volume ? defaultDerivedName(volume.name, attr, params) : '';
  const blocked = manifest ? attributePrecheck(attr, manifest) : null;

  let sizeText = null;
  try {
    if (manifest) {
      const gib = derivedStorageBytes(manifest) / 1024 ** 3;
      sizeText = gib >= 1 ? `${gib.toFixed(1)} GiB` : `${(gib * 1024).toFixed(0)} MiB`;
    }
  } catch { /* manifest without brick block: leave blank */ }

  // U2-017: Dip azimuth from true north (the meridian convergence at the
  // survey centre), when the survey CRS is a real projection
  const [northRef, setNorthRef] = useState('grid');
  const trueNorth = useMemo(() => {
    if (attr !== 'azimuth_north' || !manifest || !volume) return null;
    if (!volume.crs || !isTransformableTag(volume.crs)) {
      return { error: 'True north needs the survey CRS declared as a projection; this volume has none, so only grid north is offered.' };
    }
    try {
      const aff = surveyAffine(manifest.geometry);
      const g = geomFromManifest(manifest);
      const c = surveyConvergence(aff, g, (x, y) => convergenceAt(volume.crs, x, y));
      return { convergenceDeg: c.centreDeg, spreadDeg: c.spreadDeg };
    } catch (e) {
      return { error: e.message };
    }
  }, [attr, manifest, volume]);
  const north = attr === 'azimuth_north' && northRef === 'true' && trueNorth && !trueNorth.error
    ? { reference: 'true', convergenceDeg: Math.round(trueNorth.convergenceDeg * 1e4) / 1e4, crs: volume.crs }
    : null;

  const runOnServer = async () => {
    setBusy(true);
    try {
      await startServerAttribute({
        parent: volume,
        parentManifest: manifest,
        attribute: { name: attr, params, ...(north ? { north } : {}) },
        name: name.trim() || (north ? `${placeholder} (true north)` : undefined),
      });
      toast({ title: 'Computing on the Petrolord server', description: `${placeholder}: follow it under Server jobs. You can keep working or close this tab.` });
      if (onServerJobStarted) onServerJobStarted();
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Could not start the server computation', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (onServer) { await runOnServer(); return; }
    setBusy(true);
    cancelRef.current = { cancelled: false };
    try {
      await computeAttributeVolume({
        parent: volume,
        parentManifest: manifest,
        attribute: { name: attr, params, ...(north ? { north } : {}) },
        name: name.trim() || (north ? `${placeholder} (true north)` : undefined),
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
          <DialogTitle className="flex items-center text-pl-text">
            <Activity className="w-5 h-5 mr-2 text-pl-primary-text" />
            Compute attribute volume
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label className="block col-span-2">
              <span className="text-xs text-pl-muted">Attribute</span>
              <select
                value={attr}
                onChange={(e) => { setAttr(e.target.value); setParamValues({}); }}
                className={selCls}
                disabled={busy}
              >
                {groupAttributeDefs(ALL_ATTRIBUTE_DEFS).map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.defs.map((d) => (
                      <option key={d.key} value={d.key}>{d.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {paramDefs.map(([key, p]) => (
              <label key={key} className="block">
                <span className="text-xs text-pl-muted">{p.label}</span>
                <input
                  type="number"
                  min={p.min}
                  max={p.max}
                  value={params[key]}
                  onChange={(e) => setParamValues((v) => ({
                    ...v, [key]: paramValue(e.target.value, p),
                  }))}
                  className={selCls}
                  disabled={busy}
                />
              </label>
            ))}
            {attr === 'azimuth_north' && (
              <label className="block col-span-2" data-testid="sl-attr-north">
                <span className="text-xs text-pl-muted">North reference</span>
                <select value={northRef} onChange={(e) => setNorthRef(e.target.value)} className={selCls} disabled={busy}>
                  <option value="grid">Grid north</option>
                  <option value="true" disabled={!trueNorth || Boolean(trueNorth.error)}>True north</option>
                </select>
                <span className="block text-[11px] text-pl-muted mt-0.5">
                  {trueNorth?.error
                    ? trueNorth.error
                    : trueNorth
                      ? `True north is ${Math.abs(trueNorth.convergenceDeg).toFixed(3)} deg ${trueNorth.convergenceDeg >= 0 ? 'east' : 'west'} of grid north at the survey centre (meridian convergence); it varies by ${trueNorth.spreadDeg.toFixed(3)} deg across the survey, and the centre value is used throughout.`
                      : ''}
                </span>
              </label>
            )}
            <label className="block col-span-2">
              <span className="text-xs text-pl-muted">Volume name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={placeholder}
                className={selCls}
                disabled={busy}
              />
            </label>
          </div>

          {blocked && (
            <p className="text-xs text-pl-warning-text" data-testid="sl-attr-blocked">{blocked}</p>
          )}

          <p className="text-[11px] text-pl-muted">
            Derived from “{volume?.name}” on the identical lattice
            {sizeText ? ` (~${sizeText} of brick storage, counted against your quota)` : ''}.
            Stored amplitudes of the parent are never modified.
          </p>

          {serverAdvice.offer && (
            <fieldset className="rounded border border-pl-border p-2 space-y-1 text-xs" data-testid="sl-attr-where">
              <legend className="px-1 text-pl-muted">Where to compute</legend>
              <label className="flex items-start gap-2">
                <input type="radio" name="sl-attr-where" checked={onServer} onChange={() => setOnServer(true)} disabled={busy} />
                <span>
                  <Server className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                  On the Petrolord server
                  {serverAdvice.preferred && <span className="text-pl-muted"> (recommended for a volume this size)</span>}
                  <span className="block text-[11px] text-pl-muted">It carries on if you close the tab and shows under Server jobs.</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="sl-attr-where" checked={!onServer} onChange={() => setOnServer(false)} disabled={busy} />
                <span>
                  In this browser
                  <span className="block text-[11px] text-pl-muted">Keep this dialog open until it finishes.</span>
                </span>
              </label>
            </fieldset>
          )}

          {busy && (
            <div className="space-y-1">
              <div className="h-1.5 rounded bg-pl-sunken overflow-hidden">
                <div
                  className="h-full bg-pl-primary transition-all"
                  style={{ width: `${pct ?? 0}%` }}
                />
              </div>
              <p className="text-[11px] text-pl-muted">
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
            <Button onClick={run} disabled={busy || !volume || !manifest || Boolean(blocked)}>
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Activity className="w-4 h-4 mr-1" />}
              Compute
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
