import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Download, Grid3X3, Loader2, XCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { listHorizons } from '../services/horizonsService';
import { listFaults } from '../services/faultsService';
import { surveyAffine } from '../engine/surveyGeometry';
import { writeCPS3, writeZMAP, grvAcreFt } from '../engine/surfaceExport';
import { normalizeVelocity, describeVelocity } from '../engine/velocityModel';
import { publishSurface } from '../services/exportsService';
import { gridHorizonSurface } from '../services/surfaceWorkflow';

const FORMATS = [
  { key: 'xyz', label: 'XYZ points (.xyz)', ext: 'xyz' },
  { key: 'cps3', label: 'CPS-3 grid (.dat)', ext: 'cps3.dat' },
  { key: 'zmap', label: 'ZMAP+ grid (.dat)', ext: 'zmap.dat' },
];

/**
 * Grid a horizon and export it. Exports follow the playbook convention:
 * z is NEGATIVE downward — depth in feet (constant-velocity conversion)
 * or negated TWT milliseconds. When the volume has faults that cut the
 * horizon, gridding is fault-blocked by default (interpolation never
 * crosses a fault).
 */
export default function ExportPanel({ volume, manifest, frameless }) {
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
  const [faults, setFaults] = useState([]);
  const [faultAware, setFaultAware] = useState(true);
  const [excludedFaultIds, setExcludedFaultIds] = useState(new Set());
  const [maxExtra, setMaxExtra] = useState(0);  // m, 0 = 2 x cell (default)
  const abortRef = useRef(null);               // in-flight grid job

  // never leave a gridding worker running behind an unmounted panel
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    setHorizons([]);
    setHorizonId('');
    setFaults([]);
    setExcludedFaultIds(new Set());
    setResult(null);
    setError(null);
    if (volume) {
      listHorizons(volume.id)
        .then(setHorizons)
        .catch((e) => setError(e.message));
      listFaults(volume.id)
        .then(setFaults)
        .catch(() => setFaults([])); // faults are optional for export
    }
  }, [volume]);

  // the volume's persisted velocity model beats the constant fallback
  const model = useMemo(() => normalizeVelocity(manifest?.velocity), [manifest]);

  const affine = useMemo(
    () => (manifest ? surveyAffine(manifest.geometry) : null), [manifest]);

  /** @param {'download'|'rcp'} destination */
  const runExport = async (destination = 'download') => {
    if (!volume || !manifest || !horizonId) return;
    const horizon = horizons.find((h) => h.id === horizonId);
    setRunning(true);
    setResult(null);
    setError(null);
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      if (!affine) throw new Error('Volume has no usable survey coordinates for gridding.');
      // z NEGATIVE downward (playbook export convention); the volume's
      // velocity model wins over the constant-velocity fallback; the
      // INCLUDED faults that cut the horizon block interpolation
      const usedFaults = faultAware
        ? faults.filter((f) => !excludedFaultIds.has(f.id)) : [];
      const {
        g, spec, gridded, xyzText, faultInfo, maxExtrapolationM,
      } = await gridHorizonSurface({
        manifest,
        horizon,
        domain,
        velocityFtS: velocity,
        cellM: cell,
        faults: usedFaults.length ? usedFaults : null,
        maxExtrapolationM: maxExtra,
        signal: ctl.signal,
      });
      const dxy = spec.dx;
      const safeName = horizon.name.replace(/[^\w-]+/g, '_').toLowerCase();
      const effectiveFormat = destination === 'rcp' ? 'xyz' : format;
      const fmt = FORMATS.find((f) => f.key === effectiveFormat);
      let text;
      if (effectiveFormat === 'xyz') text = xyzText;
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
            // well-tie provenance: which wells calibrated the model that
            // drove this depth conversion (null = uncalibrated / TWT)
            velocity_calibration: domain === 'depth' && model
              ? (manifest.velocity_calibration || null) : null,
            wells_used: domain === 'depth' && model
              ? (manifest.velocity_calibration?.wells ?? null) : null,
            // provenance: measured survey orientation vs the legacy
            // axis-aligned corner assumption
            survey_geometry: affine.legacyAxisAligned ? 'corners_axis_aligned' : 'measured_affine',
            // fault blocking: null when gridding ran unblocked (no
            // faults, toggle off, or no fault cuts this horizon)
            fault_aware: Boolean(faultInfo),
            fault_blocks: faultInfo?.blocks ?? null,
            faults_used: faultInfo?.traces ?? null,
            faults_excluded: faultAware && excludedFaultIds.size
              ? faults.filter((f) => excludedFaultIds.has(f.id)).map((f) => f.name)
              : null,
            max_extrapolation_m: maxExtrapolationM,
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
        faultInfo,
        fileName: destination === 'rcp' ? 'sent to ReservoirCalc Pro' : fileName,
      });
      toast({
        title: destination === 'rcp' ? 'Surface sent to ReservoirCalc Pro' : 'Surface exported',
        description: destination === 'rcp'
          ? 'Open ReservoirCalc Pro → Import surface → From Seismolord.'
          : fileName,
      });
    } catch (e) {
      if (e.message !== 'Export cancelled') setError(e.message);
    } finally {
      if (abortRef.current === ctl) abortRef.current = null;
      setRunning(false);
    }
  };

  const inner = (
    <div className="space-y-4">
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
              {running && (
                <Button
                  variant="outline" size="sm"
                  onClick={() => abortRef.current?.abort()}
                  title="Stop the gridding job"
                >
                  <Ban className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              )}
              {faults.length > 0 && (
                <label
                  className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none"
                  title="Interpolation will not cross faults that cut this horizon; nodes on the fault trace stay null"
                >
                  <input
                    type="checkbox"
                    checked={faultAware}
                    onChange={(e) => setFaultAware(e.target.checked)}
                    className="accent-cyan-500"
                  />
                  Fault-aware ({faults.length} fault{faults.length > 1 ? 's' : ''})
                </label>
              )}
              <div className="flex items-center gap-2">
                <Label
                  className="text-slate-300 text-sm"
                  title="Nodes farther than this from any pick stay null — with fault blocking on, this bounds how far a block extrapolates toward the fault"
                >
                  Max extrap. (m, 0=2×cell)
                </Label>
                <Input
                  type="number" value={maxExtra} min="0" step="10"
                  className="w-24 bg-slate-950 border-slate-700 text-slate-200"
                  onChange={(e) => setMaxExtra(Number(e.target.value))}
                />
              </div>
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

            {faultAware && faults.length > 1 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-1 text-sm text-slate-400">
                <span className="text-xs text-slate-500">Faults included:</span>
                {faults.map((f) => (
                  <label key={f.id} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!excludedFaultIds.has(f.id)}
                      onChange={(e) => setExcludedFaultIds((s) => {
                        const next = new Set(s);
                        if (e.target.checked) next.delete(f.id);
                        else next.add(f.id);
                        return next;
                      })}
                      className="accent-cyan-500"
                    />
                    {f.name}
                  </label>
                ))}
              </div>
            )}

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
                {result.faultInfo && (
                  <div>Fault blocks: <span className="text-white">
                    {result.faultInfo.blocks}
                  </span> ({result.faultInfo.traces} fault trace{result.faultInfo.traces > 1 ? 's' : ''})
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
              CPS-3/ZMAP+ bodies are column-major, north to south. World positions
              come from the measured survey geometry (rotated surveys supported).
              With fault-aware gridding on, interpolation never crosses a fault that
              cuts the horizon and nodes on the fault trace stay null.
            </p>
          </>
        )}
    </div>
  );

  if (frameless) return inner;
  return (
    <Card className="bg-slate-900/60 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <Grid3X3 className="w-5 h-5 mr-2 text-cyan-400" />
          Grid &amp; export surface
        </CardTitle>
      </CardHeader>
      <CardContent>{inner}</CardContent>
    </Card>
  );
}
