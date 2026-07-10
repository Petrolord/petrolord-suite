import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Loader2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { listVolumes, getManifest } from '../services/volumesService';
import { BrickCache, storageBrickFetcher, ABORTED } from '../engine/brickCache';
import {
  assembleSlice, bricksForSlice, geomFromManifest, brickKey,
} from '../engine/sliceAssembly';
import { SliceRenderer, SEISMIC_COLORMAPS } from '../viewer/SliceRenderer';

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

export default function ViewerPanel({ refreshKey }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const cacheRef = useRef(null);
  const requestRef = useRef(0);

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

  const selectVolume = async (id) => {
    const v = volumes.find((x) => x.id === id) || null;
    setVolume(v);
    setManifest(null);
    setError(null);
    if (!v) return;
    setLoading(true);
    try {
      const m = await getManifest(v);
      cacheRef.current = new BrickCache(
        storageBrickFetcher({ supabaseUrl: storageBase(), getToken: accessToken }),
        { maxBytes: 256 * 1024 * 1024 },
      );
      setManifest(m);
      setOrientation('inline');
      setSliceIndex(Math.floor(m.geometry.il.count / 2));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const drawSlice = useCallback(async () => {
    if (!manifest || !geom || !volume || !canvasRef.current) return;
    const req = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      if (!rendererRef.current) rendererRef.current = new SliceRenderer(canvasRef.current);
      const renderer = rendererRef.current;
      const cache = cacheRef.current;

      // scrub cancellation: keep only the bricks this slice needs
      const needed = new Set(bricksForSlice(geom, orientation, sliceIndex)
        .map(({ i, j, k }) => brickKey(volume.storage_path, i, j, k)));
      cache.cancelPendingExcept(needed);

      const t0 = performance.now();
      const slice = await assembleSlice(
        (i, j, k) => cache.get(brickKey(volume.storage_path, i, j, k)),
        geom, orientation, sliceIndex);
      if (req !== requestRef.current) return;          // stale scrub

      const canvas = canvasRef.current;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);

      renderer.setColormap(colormap);
      renderer.setParams({
        gain,
        polarity,
        clip: Math.max((manifest.stats?.rms || 1) * clipRms, 1e-12),
        traceBalance,
      });
      renderer.setSlice(slice, orientation !== 'time');
      renderer.render();
      setSliceMs(performance.now() - t0);
    } catch (e) {
      if (e.message !== ABORTED && req === requestRef.current) setError(e.message);
    } finally {
      if (req === requestRef.current) setLoading(false);
    }
  }, [manifest, geom, volume, orientation, sliceIndex, colormap, gain, clipRms, polarity, traceBalance]);

  useEffect(() => { drawSlice(); }, [drawSlice]);

  useEffect(() => () => {
    if (rendererRef.current) rendererRef.current.destroy();
    if (cacheRef.current) cacheRef.current.clear();
  }, []);

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
          Section viewer
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
                type="range"
                min="0"
                max={maxIndex}
                value={sliceIndex}
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
          </>
        )}

        <div className="relative rounded-lg border border-slate-800 bg-slate-950 overflow-hidden"
          style={{ height: 480 }}
        >
          <canvas ref={canvasRef} className="w-full h-full block" />
          {!manifest && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
              Select an ingested volume to view sections.
            </div>
          )}
          {loading && (
            <div className="absolute top-2 right-2 text-cyan-300">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Amplitudes rendered from stored float32 — colormap, gain, polarity and
            balance are shader-only. Nulls (1.0E+30) draw as gray.
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
