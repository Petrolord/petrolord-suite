import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Loader2, XCircle, Crosshair, Route, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { listVolumes, getManifest } from '../services/volumesService';
import {
  saveHorizon, listHorizons, loadHorizonGrid, deleteHorizon,
} from '../services/horizonsService';
import { saveFault, listFaults, deleteFault } from '../services/faultsService';
import { BrickCache, storageBrickFetcher, ABORTED } from '../engine/brickCache';
import {
  assembleSlice, assembleTrace, bricksForSlice, geomFromManifest, brickKey,
} from '../engine/sliceAssembly';
import { snapPick } from '../engine/horizonTrack';
import { SEISMIC_COLORMAPS } from '../viewer/SliceRenderer';
import SliceView from './SliceView';
import HorizonsList, { horizonColor } from './HorizonsList';
import FaultsList, { faultColor } from './FaultsList';

const ORIENTATIONS = [
  { key: 'inline', label: 'Inline' },
  { key: 'xline', label: 'Crossline' },
  { key: 'time', label: 'Time slice' },
];

// storage base URL without touching the shared client module
const storageBase = () => supabase.storage.from('seismic')
  .getPublicUrl('x').data.publicUrl.split('/storage/v1/')[0];

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  return session.access_token;
}

const newHorizonWorker = () =>
  new Worker(new URL('../workers/horizon.worker.js', import.meta.url), { type: 'module' });

export default function ViewerPanel({ refreshKey, onVolumeChange }) {
  const { toast } = useToast();
  const cacheRef = useRef(null);
  const requestRef = useRef(0);
  const workerRef = useRef(null);
  const jobIdRef = useRef(0);
  const selectSeqRef = useRef(0);               // stale volume-switch guard
  const gridCacheRef = useRef(new Map());       // horizon id -> Float32Array

  const [volumes, setVolumes] = useState([]);
  const [volume, setVolume] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [orientation, setOrientation] = useState('inline');
  const [sliceIndex, setSliceIndex] = useState(0);
  const [colormap, setColormap] = useState(SEISMIC_COLORMAPS[0].key);
  const [gain, setGain] = useState(1);
  const [clipRms, setClipRms] = useState(3);
  const [polarity, setPolarity] = useState(1);
  const [traceBalance, setTraceBalance] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sliceMs, setSliceMs] = useState(null);
  const [slice, setSlice] = useState(null);              // assembled slice for SliceView
  const [resolvedHorizons, setResolvedHorizons] = useState([]);

  // Phase 3: picking + horizons; Phase 4: fault sticks
  const [pickMode, setPickMode] = useState(null);   // null | 'seed' | 'fault'
  const [seedPick, setSeedPick] = useState(null);   // {ilIdx, xlIdx, sample}
  const [tracking, setTracking] = useState(null);   // {tracked, total}
  const [horizons, setHorizons] = useState([]);
  const [visibleIds, setVisibleIds] = useState(new Set());
  const [horizonBusyId, setHorizonBusyId] = useState(null);
  const [faults, setFaults] = useState([]);
  const [visibleFaultIds, setVisibleFaultIds] = useState(new Set());
  const [faultBusyId, setFaultBusyId] = useState(null);
  // draft fault: array of sticks; each stick = array of {il, xl, s}
  const [draftSticks, setDraftSticks] = useState([]);

  useEffect(() => {
    listVolumes()
      .then((vs) => setVolumes(vs.filter((v) => v.status === 'ready')))
      .catch((e) => setError(e.message));
  }, [refreshKey]);

  const geom = useMemo(() => (manifest ? geomFromManifest(manifest) : null), [manifest]);
  const maxIndex = useMemo(() => {
    if (!geom) return 0;
    return orientation === 'inline' ? geom.nIl - 1
      : orientation === 'xline' ? geom.nXl - 1 : geom.ns - 1;
  }, [geom, orientation]);

  const reloadHorizons = useCallback(async (vol) => {
    if (!vol) { setHorizons([]); return; }
    try {
      setHorizons(await listHorizons(vol.id));
    } catch (e) {
      toast({ title: 'Horizons failed to load', description: e.message, variant: 'destructive' });
    }
  }, [toast]);

  const selectVolume = async (id) => {
    const seq = ++selectSeqRef.current;           // supersedes any in-flight select
    const v = volumes.find((x) => x.id === id) || null;
    setVolume(v);
    setManifest(null);
    setSlice(null);
    setSeedPick(null);
    setVisibleIds(new Set());
    setVisibleFaultIds(new Set());
    setDraftSticks([]);
    gridCacheRef.current.clear();
    setError(null);
    if (onVolumeChange) onVolumeChange(null, null);
    if (!v) { setHorizons([]); setFaults([]); return; }
    setLoading(true);
    try {
      const m = await getManifest(v);
      const [hz, flt] = await Promise.all([
        listHorizons(v.id).catch(() => []),
        listFaults(v.id).catch(() => []),
      ]);
      if (seq !== selectSeqRef.current) return;   // a newer selection won; drop this one
      cacheRef.current = new BrickCache(
        storageBrickFetcher({ supabaseUrl: storageBase(), getToken: accessToken }),
        { maxBytes: 256 * 1024 * 1024 },
      );
      setManifest(m);
      setHorizons(hz);
      setFaults(flt);
      setOrientation('inline');
      setSliceIndex(Math.floor(m.geometry.il.count / 2));
      if (onVolumeChange) onVolumeChange(v, m);
    } catch (e) {
      if (seq === selectSeqRef.current) setError(e.message);
    } finally {
      if (seq === selectSeqRef.current) setLoading(false);
    }
  };

  const getBrick = useCallback((i, j, k) => cacheRef.current
    .get(brickKey(volume.storage_path, i, j, k)), [volume]);

  // Assemble the slice for the current position. Display params (gain,
  // colormap, clip…) are NOT dependencies — they are shader-side in
  // SliceView and never trigger a re-assembly or brick fetch.
  const loadSlice = useCallback(async () => {
    if (!manifest || !geom || !volume) return;
    const req = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      // scrub cancellation: keep only the bricks this slice needs
      const needed = new Set(bricksForSlice(geom, orientation, sliceIndex)
        .map(({ i, j, k }) => brickKey(volume.storage_path, i, j, k)));
      cacheRef.current.cancelPendingExcept(needed);

      const t0 = performance.now();
      const assembled = await assembleSlice(getBrick, geom, orientation, sliceIndex);
      if (req !== requestRef.current) return;          // stale scrub
      setSlice({ ...assembled, orientation });         // tag: see SliceView prop
      setSliceMs(performance.now() - t0);
    } catch (e) {
      if (e.message !== ABORTED && req === requestRef.current) setError(e.message);
    } finally {
      if (req === requestRef.current) setLoading(false);
    }
  }, [manifest, geom, volume, orientation, sliceIndex, getBrick]);

  useEffect(() => { loadSlice(); }, [loadSlice]);

  // resolve the visible horizons to grids + colors for the overlay
  useEffect(() => {
    let stale = false;
    (async () => {
      const out = [];
      for (let idx = 0; idx < horizons.length; idx++) {
        const h = horizons[idx];
        if (!visibleIds.has(h.id)) continue;
        let grid = gridCacheRef.current.get(h.id);
        if (!grid) {
          try {
            grid = await loadHorizonGrid(h);
          } catch (e) {
            toast({ title: `Horizon "${h.name}" failed to load`, description: e.message, variant: 'destructive' });
            continue;
          }
          gridCacheRef.current.set(h.id, grid);
        }
        out.push({ grid, color: horizonColor(idx) });
      }
      if (!stale) setResolvedHorizons(out);
    })();
    return () => { stale = true; };
  }, [horizons, visibleIds, toast]);

  // ---- picking (horizon seed / fault sticks) ----------------------------
  // SliceView already mapped the click through its view transform.
  // useCallback keeps the memoized SliceView from re-rendering on every
  // ViewerPanel state change (gain/clip slider ticks, list refreshes).
  const handlePick = useCallback(async ({ ilIdx, xlIdx, sample }) => {
    if (!pickMode || !geom || !volume || orientation === 'time') return;

    if (pickMode === 'fault') {
      // fault points are raw picks on visible discontinuities — no snap
      setDraftSticks((sticks) => {
        const next = sticks.map((s) => [...s]);
        if (next.length === 0) next.push([]);
        next[next.length - 1].push({ il: ilIdx, xl: xlIdx, s: sample });
        return next;
      });
      return;
    }

    try {
      const traceData = await assembleTrace(getBrick, geom, ilIdx, xlIdx);
      const hit = snapPick(traceData, sample, { mode: 'peak', window: 5 });
      if (!hit) {
        toast({ title: 'No event found', description: 'No peak near that click — try closer to a reflector.' });
        return;
      }
      setSeedPick({ ilIdx, xlIdx, sample: hit.sample });
    } catch (err) {
      setError(err.message);
    }
  }, [pickMode, geom, volume, orientation, getBrick, toast]);

  // ---- fault stick editing ----------------------------------------------
  const endStick = () => setDraftSticks((s) => (s.length && s[s.length - 1].length ? [...s, []] : s));

  const discardDraft = () => setDraftSticks([]);

  const saveDraftFault = async () => {
    const sticks = draftSticks.filter((s) => s.length >= 2)
      .map((points) => ({ points }));
    if (!sticks.length) {
      toast({ title: 'Nothing to save', description: 'A fault stick needs at least 2 points.' });
      return;
    }
    // eslint-disable-next-line no-alert
    const name = window.prompt('Fault name:', `Fault ${faults.length + 1}`);
    if (!name) return;
    try {
      const row = await saveFault({ volumeId: volume.id, name, sticks });
      setDraftSticks([]);
      setFaults(await listFaults(volume.id));
      setVisibleFaultIds((s) => new Set([...s, row.id]));
      toast({ title: 'Fault saved', description: `${name}: ${sticks.length} stick(s).` });
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };

  const toggleFault = (f) => {
    setVisibleFaultIds((s) => {
      const next = new Set(s);
      if (next.has(f.id)) next.delete(f.id);
      else next.add(f.id);
      return next;
    });
  };

  const onDeleteFault = async (f) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete fault "${f.name}"?`)) return;
    setFaultBusyId(f.id);
    try {
      await deleteFault(f);
      setVisibleFaultIds((s) => { const n = new Set(s); n.delete(f.id); return n; });
      setFaults(await listFaults(volume.id));
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setFaultBusyId(null);
    }
  };

  // ---- 3D tracking -----------------------------------------------------
  const trackHorizon = async () => {
    if (!seedPick || !geom || !volume || !manifest) return;
    const id = ++jobIdRef.current;
    setTracking({ tracked: 0, total: geom.nIl * geom.nXl });
    try {
      const token = await accessToken();
      const worker = newHorizonWorker();
      workerRef.current = worker;
      const picks = await new Promise((resolve, reject) => {
        worker.onmessage = async (e) => {
          const msg = e.data;
          if (msg.id !== id) return;
          if (msg.type === 'progress') setTracking({ tracked: msg.tracked, total: msg.total });
          else if (msg.type === 'need-token') {
            worker.postMessage({ type: 'token', nonce: msg.nonce, token: await accessToken() });
          } else if (msg.type === 'done') resolve(new Float32Array(msg.picks));
          else if (msg.type === 'error') reject(new Error(msg.message));
        };
        worker.onerror = (ev) => reject(new Error(ev.message));
        worker.postMessage({
          type: 'track3d',
          id,
          config: {
            supabaseUrl: storageBase(),
            token,
            bucket: 'seismic',
            storagePath: volume.storage_path,
            geom,
            seed: seedPick,
            opts: {
              mode: 'peak',
              window: 3,
              maxJump: 4,
              minAbsAmp: (manifest.stats?.rms || 0) * 0.3,
            },
          },
        });
      }).finally(() => worker.terminate());
      workerRef.current = null;

      // eslint-disable-next-line no-alert
      const name = window.prompt('Horizon name:', `Horizon ${horizons.length + 1}`);
      if (!name) { setTracking(null); return; }
      const row = await saveHorizon({
        volume,
        name,
        picks,
        seed: seedPick,
        params: { mode: 'peak', window: 3, maxJump: 4 },
        dtUs: manifest.geometry.dt_us,
      });
      gridCacheRef.current.set(row.id, picks);
      setVisibleIds((s) => new Set([...s, row.id]));
      await reloadHorizons(volume);
      toast({ title: 'Horizon tracked', description: `${name}: ${row.stats.tracked} traces.` });
    } catch (e) {
      if (!/cancelled/i.test(e.message)) {
        toast({ title: 'Tracking failed', description: e.message, variant: 'destructive' });
      }
    } finally {
      setTracking(null);
    }
  };

  const cancelTracking = () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'cancel', id: jobIdRef.current });
    }
  };

  const toggleHorizon = (h) => {
    setVisibleIds((s) => {
      const next = new Set(s);
      if (next.has(h.id)) next.delete(h.id);
      else next.add(h.id);
      return next;
    });
  };

  const onDeleteHorizon = async (h) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete horizon "${h.name}"?`)) return;
    setHorizonBusyId(h.id);
    try {
      await deleteHorizon(h);
      gridCacheRef.current.delete(h.id);
      setVisibleIds((s) => { const n = new Set(s); n.delete(h.id); return n; });
      await reloadHorizons(volume);
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setHorizonBusyId(null);
    }
  };

  useEffect(() => () => {
    if (cacheRef.current) cacheRef.current.clear();
    if (workerRef.current) workerRef.current.terminate();
  }, []);

  // ---- SliceView inputs --------------------------------------------------
  const display = useMemo(() => ({
    colormap,
    gain,
    polarity,
    clip: Math.max((manifest?.stats?.rms || 1) * clipRms, 1e-12),
    traceBalance,
  }), [colormap, gain, polarity, clipRms, traceBalance, manifest]);

  const overlays = useMemo(() => ({
    horizons: resolvedHorizons,
    faults: faults
      .map((f, idx) => ({ sticks: f.sticks, color: faultColor(idx), id: f.id }))
      .filter((f) => visibleFaultIds.has(f.id)),
    draftSticks,
    seedPick,
  }), [resolvedHorizons, faults, visibleFaultIds, draftSticks, seedPick]);

  const stepSlice = useCallback((delta) => {
    setSliceIndex((i) => Math.min(maxIndex, Math.max(0, i + delta)));
  }, [maxIndex]);

  const lineLabel = useMemo(() => {
    if (!manifest) return '';
    const g = manifest.geometry;
    if (orientation === 'inline') return `IL ${g.il.min + sliceIndex * g.il.step}`;
    if (orientation === 'xline') return `XL ${g.xl.min + sliceIndex * g.xl.step}`;
    return `${(sliceIndex * g.dt_us) / 1000} ms`;
  }, [manifest, orientation, sliceIndex]);

  return (
    <Card className="bg-slate-900/60 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <Eye className="w-5 h-5 mr-2 text-cyan-400" />
          Section viewer &amp; horizon picking
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-slate-300">Volume</Label>
            <select
              className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
              value={volume?.id || ''}
              onChange={(e) => selectVolume(e.target.value)}
            >
              <option value="">Select a volume…</option>
              {volumes.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-slate-300">Orientation</Label>
            <select
              className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
              value={orientation}
              onChange={(e) => { setOrientation(e.target.value); setSliceIndex(0); }}
              disabled={!manifest}
            >
              {ORIENTATIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-slate-300">Colormap</Label>
            <select
              className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
              value={colormap}
              onChange={(e) => setColormap(e.target.value)}
              disabled={!manifest}
            >
              {SEISMIC_COLORMAPS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-slate-300">Polarity / balance</Label>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                className={`px-2 py-1.5 text-xs rounded border ${polarity === 1
                  ? 'border-cyan-500 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
                onClick={() => setPolarity((p) => -p)}
                disabled={!manifest}
              >
                {polarity === 1 ? 'SEG normal' : 'Reversed'}
              </button>
              <button
                type="button"
                className={`px-2 py-1.5 text-xs rounded border ${traceBalance
                  ? 'border-cyan-500 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
                onClick={() => setTraceBalance((t) => !t)}
                disabled={!manifest}
              >
                Trace balance
              </button>
            </div>
          </div>
        </div>

        {manifest && (
          <>
            <div className="flex items-center gap-4">
              <Label className="text-slate-300 whitespace-nowrap w-24">{lineLabel}</Label>
              <input
                type="range" min="0" max={maxIndex} value={sliceIndex}
                onChange={(e) => setSliceIndex(Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>
            <div className="flex items-center gap-4">
              <Label className="text-slate-300 whitespace-nowrap w-24">Gain ×{gain.toFixed(1)}</Label>
              <input
                type="range" min="0.1" max="10" step="0.1" value={gain}
                onChange={(e) => setGain(Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
              <Label className="text-slate-300 whitespace-nowrap">Clip ×{clipRms.toFixed(1)} RMS</Label>
              <input
                type="range" min="0.5" max="10" step="0.5" value={clipRms}
                onChange={(e) => setClipRms(Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline" size="sm"
                className={pickMode === 'seed' ? 'border-yellow-500/60 text-yellow-300' : ''}
                onClick={() => setPickMode((p) => (p === 'seed' ? null : 'seed'))}
                disabled={orientation === 'time'}
              >
                <Crosshair className="w-4 h-4 mr-2" />
                {pickMode === 'seed' ? 'Picking: click an event' : 'Pick seed'}
              </Button>
              <Button
                variant="outline" size="sm"
                className={pickMode === 'fault' ? 'border-orange-500/60 text-orange-300' : ''}
                onClick={() => setPickMode((p) => (p === 'fault' ? null : 'fault'))}
                disabled={orientation === 'time'}
              >
                <Crosshair className="w-4 h-4 mr-2" />
                {pickMode === 'fault' ? 'Picking fault points…' : 'Pick fault'}
              </Button>
              {pickMode === 'fault' && (
                <>
                  <Button variant="outline" size="sm" onClick={endStick}>
                    End stick
                  </Button>
                  <Button
                    size="sm"
                    className="bg-orange-600 hover:bg-orange-500 text-white"
                    onClick={saveDraftFault}
                    disabled={!draftSticks.some((s) => s.length >= 2)}
                  >
                    Save fault
                  </Button>
                  <Button variant="outline" size="sm" onClick={discardDraft}
                    disabled={!draftSticks.length}
                  >
                    Discard
                  </Button>
                </>
              )}
              <Button
                size="sm"
                className="bg-cyan-600 hover:bg-cyan-500 text-white"
                onClick={trackHorizon}
                disabled={!seedPick || tracking !== null}
              >
                <Route className="w-4 h-4 mr-2" />
                Track 3D
              </Button>
              {tracking && (
                <>
                  <span className="text-sm text-slate-300 flex items-center">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Tracking… {tracking.tracked.toLocaleString()} / {tracking.total.toLocaleString()}
                  </span>
                  <Button variant="outline" size="sm" onClick={cancelTracking}>
                    <Ban className="w-4 h-4 mr-1" />Cancel
                  </Button>
                </>
              )}
              {seedPick && !tracking && (
                <span className="text-xs text-slate-400">
                  Seed: IL idx {seedPick.ilIdx}, XL idx {seedPick.xlIdx},
                  sample {seedPick.sample.toFixed(2)}
                </span>
              )}
            </div>
          </>
        )}

        <SliceView
          // only hand over a slice that matches the current orientation —
          // an orientation switch must not render the old slice under the
          // new axes while the new one assembles
          slice={manifest && slice && slice.orientation === orientation ? slice : null}
          geom={geom}
          manifest={manifest}
          orientation={orientation}
          sliceIndex={sliceIndex}
          display={display}
          overlays={overlays}
          pickMode={pickMode}
          loading={loading}
          onPick={handlePick}
          onStepSlice={stepSlice}
          height={560}
        />

        {manifest && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-slate-300 text-sm font-medium mb-2">Horizons</div>
              <HorizonsList
                horizons={horizons}
                visibleIds={visibleIds}
                busyId={horizonBusyId}
                onToggle={toggleHorizon}
                onDelete={onDeleteHorizon}
              />
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-slate-300 text-sm font-medium mb-2">Faults</div>
              <FaultsList
                faults={faults}
                visibleIds={visibleFaultIds}
                busyId={faultBusyId}
                onToggle={toggleFault}
                onDelete={onDeleteFault}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Amplitudes rendered from stored float32 — colormap, gain, polarity and
            balance are shader-only. Time increases downward; nulls (1.0E+30) draw as gray.
          </span>
          {sliceMs != null && <span>slice {sliceMs.toFixed(0)} ms</span>}
        </div>

        {error && (
          <div className="flex items-start text-red-400 text-sm">
            <XCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />{error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
