// Make a surface straight from an interpreted horizon, with no file in
// between. Both actions grid the picks here with Seismolord's
// fault-aware gridder and save one surface in the shared registry
// (services/makeSurface.makeSurfaceFromHorizon):
//  - "Grid in Seismolord" also shows the new surface in the Map window;
//  - "Publish to the registry" keeps the view as it is and links to
//    Mapping & Surface Studio, where the surface is already listed.
// Opened from a horizon's right-click menu (horizon preselected) and the
// Interpretation tab.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ban, ExternalLink, Loader2, Map as MapIcon, Mountain, Send, XCircle,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { listFaults } from '../../../services/faultsService';
import { makeSurfaceFromHorizon, MAPPING_STUDIO_PATH } from '../../../services/makeSurface';
import { normalizeVelocity, describeVelocity } from '../../../engine/velocityModel';

export default function MakeSurfaceDialog({
  open, onOpenChange, volume, manifest, horizons = [], initialHorizonId = null,
  onSurfaceSaved, showSurface,
}) {
  const { toast } = useToast();
  const [horizonId, setHorizonId] = useState('');
  const model = useMemo(() => normalizeVelocity(manifest?.velocity), [manifest]);
  const [domain, setDomain] = useState('twt');
  const [velocity, setVelocity] = useState(10000);
  const [cell, setCell] = useState(0);
  const [faults, setFaults] = useState([]);
  const [faultAware, setFaultAware] = useState(true);
  const [running, setRunning] = useState(null);     // null | 'grid' | 'publish'
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setHorizonId(initialHorizonId || horizons[0]?.id || '');
    setDomain(model ? 'depth' : 'twt');
    setResult(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialHorizonId]);

  useEffect(() => {
    if (!open || !volume) return;
    listFaults(volume.id).then(setFaults).catch(() => setFaults([]));
  }, [open, volume]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const horizon = horizons.find((h) => h.id === horizonId) || null;

  /** @param {'grid'|'publish'} action */
  const run = async (action) => {
    if (!horizon) return;
    setRunning(action);
    setResult(null);
    setError(null);
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const out = await makeSurfaceFromHorizon({
        volume,
        manifest,
        horizon,
        domain,
        velocityFtS: velocity,
        cellM: cell,
        faults: faultAware ? faults : null,
        signal: ctl.signal,
      });
      setResult({ ...out, action });
      onSurfaceSaved?.(out.surface);
      if (action === 'grid') showSurface?.(out.surface);
      toast({
        title: action === 'grid' ? 'Surface made' : 'Surface published',
        description: action === 'grid'
          ? `${out.surface?.name || horizon.name} is in the Surfaces section and shown in the Map window.`
          : `${out.surface?.name || horizon.name} is in the registry for Mapping & Surface Studio.`,
      });
    } catch (e) {
      if (e.message !== 'Export cancelled') setError(e.message);
    } finally {
      if (abortRef.current === ctl) abortRef.current = null;
      setRunning(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="sl-make-surface">
        <DialogHeader>
          <DialogTitle className="flex items-center text-white">
            <Mountain className="w-5 h-5 mr-2 text-cyan-400" />
            Make surface from horizon
          </DialogTitle>
        </DialogHeader>
        {!volume && <p className="text-sm text-slate-400">Select a volume in the viewer first.</p>}
        {volume && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Grids the horizon&apos;s picks here and saves the surface in the shared registry. No file
              export or re-import is needed.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-slate-300">Horizon</Label>
                <select
                  data-testid="sl-make-surface-horizon"
                  className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
                  value={horizonId}
                  onChange={(e) => setHorizonId(e.target.value)}
                >
                  <option value="">Select a horizon…</option>
                  {horizons.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-slate-300">Domain</Label>
                <select
                  data-testid="sl-make-surface-domain"
                  className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                >
                  <option value="twt">TWT (ms)</option>
                  <option value="depth">Depth (ft)</option>
                </select>
              </div>
              <div>
                <Label className="text-slate-300">{model ? 'Velocity (volume model)' : 'Velocity ft/s'}</Label>
                {model ? (
                  <div
                    className="mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-400 p-2 text-sm truncate"
                    title="Set in the viewer's velocity model controls"
                  >
                    {describeVelocity(model)}
                  </div>
                ) : (
                  <Input
                    type="number" value={velocity} min="1000" step="100"
                    className="mt-1 bg-slate-950 border-slate-700 text-slate-200"
                    onChange={(e) => setVelocity(Number(e.target.value))}
                    disabled={domain !== 'depth'}
                  />
                )}
              </div>
              <div>
                <Label className="text-slate-300">Cell (m, 0 = bin)</Label>
                <Input
                  type="number" value={cell} min="0" step="5"
                  className="mt-1 bg-slate-950 border-slate-700 text-slate-200"
                  onChange={(e) => setCell(Number(e.target.value))}
                />
              </div>
              {faults.length > 0 && (
                <label
                  className="flex items-end gap-2 text-sm text-slate-300 cursor-pointer select-none pb-2"
                  title="Interpolation will not cross faults that cut this horizon"
                >
                  <input
                    type="checkbox"
                    checked={faultAware}
                    onChange={(e) => setFaultAware(e.target.checked)}
                    className="accent-cyan-500"
                  />
                  {`Fault-aware (${faults.length} fault${faults.length > 1 ? 's' : ''})`}
                </label>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                data-testid="sl-make-surface-grid"
                onClick={() => run('grid')}
                disabled={!horizon || !manifest || Boolean(running)}
                className="bg-cyan-600 hover:bg-cyan-500 text-white"
                title="Grid the picks and show the surface in the Map window"
              >
                {running === 'grid'
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <MapIcon className="w-4 h-4 mr-2" />}
                Grid in Seismolord
              </Button>
              <Button
                data-testid="sl-make-surface-publish"
                onClick={() => run('publish')}
                disabled={!horizon || !manifest || Boolean(running)}
                variant="outline"
                className="border-cyan-600/60 text-cyan-300 hover:bg-cyan-950/40"
                title="Grid the picks and save the surface for Mapping & Surface Studio"
              >
                {running === 'publish'
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Send className="w-4 h-4 mr-2" />}
                Publish to the registry
              </Button>
              {running && (
                <Button variant="outline" size="sm" onClick={() => abortRef.current?.abort()}>
                  <Ban className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              )}
            </div>

            {result && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300" data-testid="sl-make-surface-result">
                {`${result.surface?.name || 'Surface'}: ${result.live.toLocaleString()} live nodes, cell ${result.cellM} m, `
                  + `z ${result.zMin?.toFixed(1)} to ${result.zMax?.toFixed(1)}.`}
                {result.action === 'publish' && (
                  <Link
                    to={MAPPING_STUDIO_PATH}
                    className="ml-2 inline-flex items-center text-cyan-300 hover:text-cyan-200 underline"
                  >
                    Open Mapping &amp; Surface Studio
                    <ExternalLink className="w-3.5 h-3.5 ml-1" />
                  </Link>
                )}
              </div>
            )}
            {error && (
              <div className="flex items-start text-red-400 text-sm" data-testid="sl-make-surface-error">
                <XCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />{error}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
