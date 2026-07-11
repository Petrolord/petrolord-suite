import React, { useEffect, useMemo, useState } from 'react';
import { Download, Grid3X3, Loader2, XCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { listHorizons, loadHorizonGrid } from '../services/horizonsService';
import { picksToPoints } from '../engine/gridding';
import { geomFromManifest } from '../engine/sliceAssembly';
import { writeXYZ, writeCPS3, writeZMAP, grvAcreFt } from '../engine/surfaceExport';
import {
  normalizeVelocity, describeVelocity, sampleToExportZ,
} from '../engine/velocityModel';
import { publishSurface } from '../services/exportsService';

const FORMATS = [
  { key: 'xyz', label: 'XYZ points (.xyz)', ext: 'xyz' },
  { key: 'cps3', label: 'CPS-3 grid (.dat)', ext: 'cps3.dat' },
  { key: 'zmap', label: 'ZMAP+ grid (.dat)', ext: 'zmap.dat' },
];

const newGriddingWorker = () =>
  new Worker(new URL('../workers/gridding.worker.js', import.meta.url), { type: 'module' });

let jobSeq = 0;

/**
 * Grid a horizon and export it. Exports follow the playbook convention:
 * z is NEGATIVE downward — depth in feet (constant-velocity conversion)
 * or negated TWT milliseconds.
 */
export default function ExportPanel({ volume, manifest }) {
  const { toast } = useToast();
  const [horizons, setHorizons] = useState([]);
  const [horizonId, setHorizonId] = useState('');
  const [domain, setDomain] = useState('depth');      // 'depth' | 'twt'
  const [velocity, setVelocity] = useState(10000);    // ft/s
  const [cell, setCell] = useState(0);                // m, 0 -> default bin
  const [format, setFormat] = useState('xyz');
  const [contact, setContact] = useState('');         // ft, optional
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);         // {live, zMin, zMax, grv, fileName}
  const [error, setError] = useState(null);

  useEffect(() => {
    setHorizons([]);
    setHorizonId('');
    setResult(null);
    setError(null);
    if (volume) {
      listHorizons(volume.id)
        .then(setHorizons)
        .catch((e) => setError(e.message));
    }
  }, [volume]);

  // the volume's persisted velocity model beats the constant fallback
  const model = useMemo(() => normalizeVelocity(manifest?.velocity), [manifest]);

  const binM = useMemo(() => {
    if (!manifest) return 25;
    const g = manifest.geometry;
    const nXl = g.xl.count;
    return nXl > 1
      ? Math.abs((g.corners.last.x - g.corners.first.x) / (nXl - 1)) || 25
      : 25;
  }, [manifest]);

  /** @param {'download'|'rcp'} destination */
  const runExport = async (destination = 'download') => {
    if (!volume || !manifest || !horizonId) return;
    const horizon = horizons.find((h) => h.id === horizonId);
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const geom = geomFromManifest(manifest);
      const picks = await loadHorizonGrid(horizon);
      const dtMs = manifest.geometry.dt_us / 1000;

      // z NEGATIVE downward (playbook export convention); the volume's
      // velocity model wins over the constant-velocity fallback
      const sampleToZ = domain === 'depth'
        ? (model
          ? sampleToExportZ(model, manifest.geometry.dt_us)
          : (s) => -((s * dtMs) / 1000) * (velocity / 2))
        : (s) => -(s * dtMs);
      const points = picksToPoints(picks, geom, manifest.geometry.corners, sampleToZ);
      if (points.length < 3) throw new Error('Horizon has too few live picks to grid.');

      const c = manifest.geometry.corners;
      const dxy = cell > 0 ? cell : binM;
      const x0 = Math.min(c.first.x, c.last.x);
      const x1 = Math.max(c.first.x, c.last.x);
      const y0 = Math.min(c.first.y, c.last.y);
      const y1 = Math.max(c.first.y, c.last.y);
      const spec = {
        x0, y0, dx: dxy, dy: dxy,
        nx: Math.floor((x1 - x0) / dxy) + 1,
        ny: Math.floor((y1 - y0) / dxy) + 1,
      };

      const id = ++jobSeq;
      const worker = newGriddingWorker();
      const gridded = await new Promise((resolve, reject) => {
        worker.onmessage = (e) => {
          const msg = e.data;
          if (msg.id !== id) return;
          if (msg.type === 'done') resolve(msg);
          else if (msg.type === 'error') reject(new Error(msg.message));
        };
        worker.onerror = (ev) => reject(new Error(ev.message));
        worker.postMessage({
          type: 'grid', id, points, spec, opts: { maxExtrapolation: 2 * dxy },
        });
      }).finally(() => worker.terminate());

      const g = {
        z: new Float32Array(gridded.z),
        nx: spec.nx,
        ny: spec.ny,
        dx: spec.dx,
        dy: spec.dy,
        x: Array.from({ length: spec.nx }, (_, i) => spec.x0 + i * spec.dx),
        y: Array.from({ length: spec.ny }, (_, i) => spec.y0 + i * spec.dy),
      };
      const safeName = horizon.name.replace(/[^\w-]+/g, '_').toLowerCase();
      const effectiveFormat = destination === 'rcp' ? 'xyz' : format;
      const fmt = FORMATS.find((f) => f.key === effectiveFormat);
      let text;
      if (effectiveFormat === 'xyz') text = writeXYZ(g);
      else if (effectiveFormat === 'cps3') text = writeCPS3(g);
      else text = writeZMAP({ ...g, name: safeName });
      const fileName = `${safeName}_${domain}.${fmt.ext}`;

      if (destination === 'rcp') {
        await publishSurface({
          name: `${horizon.name} (${domain === 'depth' ? 'depth ft' : 'TWT ms'})`,
          xyzText: text,
          domain: domain === 'depth' ? 'depth_ft' : 'twt_ms',
          volume,
          horizon,
          params: {
            cell_m: dxy,
            velocity_model: domain === 'depth' && model ? model : null,
            velocity_ft_s: domain === 'depth' && !model ? velocity : null,
            max_extrapolation_m: 2 * dxy,
            control_points: gridded.controlCount,
            live_nodes: gridded.live,
            z_min: gridded.zMin,
            z_max: gridded.zMax,
          },
        });
      } else {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }

      const grv = domain === 'depth' && contact !== ''
        ? grvAcreFt(g, spec.dx, spec.dy, Number(contact))
        : null;
      setResult({
        live: gridded.live,
        controlCount: gridded.controlCount,
        zMin: gridded.zMin,
        zMax: gridded.zMax,
        grv,
        fileName: destination === 'rcp' ? 'sent to ReservoirCalc Pro' : fileName,
      });
      toast({
        title: destination === 'rcp' ? 'Surface sent to ReservoirCalc Pro' : 'Surface exported',
        description: destination === 'rcp'
          ? 'Open ReservoirCalc Pro → Import surface → From Seismolord.'
          : fileName,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="bg-slate-900/60 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <Grid3X3 className="w-5 h-5 mr-2 text-cyan-400" />
          Grid &amp; export surface
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!volume && (
          <p className="text-sm text-slate-400">Select a volume in the viewer first.</p>
        )}
        {volume && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <div className="col-span-2">
                <Label className="text-slate-300">Horizon</Label>
                <select
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
                  className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                >
                  <option value="depth">Depth (ft, −down)</option>
                  <option value="twt">TWT (ms, −down)</option>
                </select>
              </div>
              <div>
                <Label className="text-slate-300">
                  {model ? 'Velocity (volume model)' : 'Velocity ft/s'}
                </Label>
                {model ? (
                  <div
                    className="mt-1 rounded-md bg-slate-950 border border-slate-700
                      text-slate-400 p-2 text-sm truncate"
                    title="Set in the viewer's velocity model controls; clear it there to use a constant"
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
                <Label className="text-slate-300">Cell (m, 0=bin)</Label>
                <Input
                  type="number" value={cell} min="0" step="5"
                  className="mt-1 bg-slate-950 border-slate-700 text-slate-200"
                  onChange={(e) => setCell(Number(e.target.value))}
                />
              </div>
              <div>
                <Label className="text-slate-300">Format</Label>
                <select
                  className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  {FORMATS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => runExport('download')}
                disabled={!horizonId || running}
                className="bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                {running
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Download className="w-4 h-4 mr-2" />}
                Grid &amp; download
              </Button>
              <Button
                onClick={() => runExport('rcp')}
                disabled={!horizonId || running}
                variant="outline"
                className="border-emerald-600/60 text-emerald-300 hover:bg-emerald-950/40"
              >
                <Send className="w-4 h-4 mr-2" />
                Send to ReservoirCalc Pro
              </Button>
              <div className="flex items-center gap-2">
                <Label className="text-slate-300 text-sm">Contact (ft, optional)</Label>
                <Input
                  type="number" value={contact} placeholder="-6200" step="10"
                  className="w-28 bg-slate-950 border-slate-700 text-slate-200"
                  onChange={(e) => setContact(e.target.value)}
                  disabled={domain !== 'depth'}
                />
                <span className="text-xs text-slate-500">for GRV readout</span>
              </div>
            </div>

            {result && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300 grid grid-cols-2 md:grid-cols-4 gap-y-1">
                <div>File: <span className="text-white">{result.fileName}</span></div>
                <div>Live nodes: <span className="text-white">{result.live.toLocaleString()}</span></div>
                <div>
                  Z range: <span className="text-white">
                    {result.zMin?.toFixed(1)} … {result.zMax?.toFixed(1)}
                  </span>
                </div>
                {result.grv != null && (
                  <div>GRV: <span className="text-emerald-300">
                    {result.grv.toLocaleString('en-US', { maximumFractionDigits: 0 })} acre-ft
                  </span>
                  </div>
                )}
              </div>
            )}
            {error && (
              <div className="flex items-start text-red-400 text-sm">
                <XCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />{error}
              </div>
            )}
            <p className="text-xs text-slate-500">
              Exports use the suite convention: Z negative downward (depth in feet via
              the volume velocity model when set, else constant velocity; or negated
              TWT ms); nulls are 1.0E+30;
              CPS-3/ZMAP+ bodies are column-major, north to south. Assumes an
              unrotated survey (X along crosslines) — rotated geometry is a recorded
              follow-up.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
