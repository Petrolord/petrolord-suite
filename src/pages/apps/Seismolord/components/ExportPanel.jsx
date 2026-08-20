import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban, Download, Grid3X3, Loader2, XCircle, Send, Mountain,
} from 'lucide-react';
import { AMP_MODES, INTERVAL_MODES } from '../engine/horizonAmplitude';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { listHorizons } from '../services/horizonsService';
import { listFaults } from '../services/faultsService';
import { surveyAffine } from '../engine/surveyGeometry';
import { writeCPS3, writeZMAP, writeIrapClassic, grvAcreFt } from '@/lib/gridding/surfaceExport';
import {
  writeCharismaHorizon, writeIlXlXyz, writeXyzPoints,
} from '../engine/pickExport';
import { normalizeVelocity, describeVelocity } from '../engine/velocityModel';
import { publishSurface } from '../services/exportsService';
import { saveHorizonAsSurface, saveAmplitudeAsSurface } from '../services/surfacesService';
import {
  gridHorizonSurface, gridHorizonAmplitude, exportHorizonPicks,
} from '../services/surfaceWorkflow';

const FORMATS = [
  { key: 'xyz', label: 'XYZ points (.xyz)', ext: 'xyz' },
  { key: 'cps3', label: 'CPS-3 grid (.dat)', ext: 'cps3.dat' },
  { key: 'zmap', label: 'ZMAP+ grid (.dat)', ext: 'zmap.dat' },
  { key: 'irap', label: 'Irap classic grid (.dat)', ext: 'irap.dat' },
];

const PICK_FORMATS = [
  { key: 'charisma', label: 'Charisma 3D horizon (.txt)', ext: 'charisma.txt' },
  { key: 'ilxl', label: 'IL/XL/X/Y/Z points (.txt)', ext: 'picks.txt' },
  { key: 'xyz', label: 'XYZ points (.xyz)', ext: 'picks.xyz' },
];

const downloadText = (text, fileName) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Export a horizon as one of its three distinct objects:
 *  - the STRUCTURE surface: gridded (fault-aware TPS) then written as
 *    XYZ / CPS-3 / ZMAP+ / Irap classic, sent to ReservoirCalc Pro, or
 *    SAVED to the shared surface registry (geo_surfaces — first-class
 *    object, visible in the explorer's Surfaces section and in
 *    Mapping & Surface Studio);
 *  - the AMPLITUDE map: a seismic attribute along the horizon
 *    (amplitude at pick / windowed RMS / mean / max |amp|), extracted
 *    from the bricks at bin resolution and bilinearly RESAMPLED onto
 *    the export grid (never TPS-fit — decimation would smooth the
 *    detail away); downloadable in the grid formats or saved to the
 *    registry as an attribute surface (map-only, no sign flip);
 *  - the PICKS: the interpretation itself, written as Charisma 3D
 *    horizon / five-column IL-XL points / bare XYZ points, no gridding.
 * Structure/pick exports follow the playbook convention: Z NEGATIVE
 * downward — depth in feet (velocity model wins over the constant
 * fallback) or negated TWT ms; picks offer a positive-down flip for
 * Petrel-bound files. Amplitude values keep their physical sign.
 * The amplitude option needs brick access and only appears when the
 * caller passes extractAmplitude (ViewerPanel's cache-shielded
 * extractor).
 */
export default function ExportPanel({
  volume, manifest, frameless, onSurfaceSaved, extractAmplitude,
}) {
  const { toast } = useToast();
  const [horizons, setHorizons] = useState([]);
  const [horizonId, setHorizonId] = useState('');
  const [objectKind, setObjectKind] = useState('surface'); // 'surface' | 'amplitude' | 'picks'
  const [ampMode, setAmpMode] = useState('value');    // AMP_MODES key, 'interval_<mode>' or 'isofreq'
  const [ampWindow, setAmpWindow] = useState(4);      // half-width, samples
  const [horizonBId, setHorizonBId] = useState('');   // W2.5 interval: second horizon
  const [freqHz, setFreqHz] = useState(30);           // W2.5 isofrequency
  const [domain, setDomain] = useState('depth');      // 'depth' | 'twt'
  const [velocity, setVelocity] = useState(10000);    // ft/s
  const [cell, setCell] = useState(0);                // m, 0 -> default bin
  const [format, setFormat] = useState('xyz');
  const [pickFormat, setPickFormat] = useState('charisma');
  const [zSign, setZSign] = useState('negative');     // picks only
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

  const isPicks = objectKind === 'picks';
  const isAmp = objectKind === 'amplitude';
  const isInterval = ampMode.startsWith('interval_');
  const isIso = ampMode === 'isofreq';
  const ampMeta = AMP_MODES.find((m) => m.key === ampMode) || null;

  const runAmplitudeExport = async (horizon, destination, signal) => {
    const horizonB = isInterval ? horizons.find((h) => h.id === horizonBId) : null;
    if (isInterval && !horizonB) {
      throw new Error('Pick the second horizon for an interval attribute.');
    }
    if (isInterval && horizonB.id === horizon.id) {
      throw new Error('Interval attributes need two different horizons.');
    }
    const win = isIso ? Math.max(2, Math.round(ampWindow))
      : ampMeta?.windowed ? Math.max(0, Math.round(ampWindow)) : 0;
    const { g, spec, live, vMin, vMax, xyzText } = await gridHorizonAmplitude({
      manifest,
      horizon,
      horizonB,
      extract: extractAmplitude,
      mode: isInterval ? ampMode.slice('interval_'.length) : ampMode,
      window: win,
      freqHz: isIso ? freqHz : null,
      cellM: cell,
      signal,
    });
    const safeName = horizon.name.replace(/[^\w-]+/g, '_').toLowerCase();
    const fmt = FORMATS.find((f) => f.key === format);
    let text;
    if (format === 'xyz') text = xyzText;
    else if (format === 'cps3') text = writeCPS3(g);
    else if (format === 'irap') text = writeIrapClassic(g);
    else text = writeZMAP({ ...g, name: safeName });
    const fileName = `${safeName}_${ampMode}.${fmt.ext}`;

    const modeLabel = isIso ? `Isofrequency ${freqHz} Hz`
      : isInterval
        ? INTERVAL_MODES.find((m) => `interval_${m.key}` === ampMode).label
        : ampMeta.label;
    const params = {
      attribute: ampMode,
      window_samples: ampMeta?.windowed || isIso ? win : null,
      ...(isIso ? { freq_hz: freqHz } : {}),
      ...(horizonB ? { horizon_b: horizonB.name, horizon_b_id: horizonB.id } : {}),
      cell_m: spec.dx,
      survey_geometry: affine.legacyAxisAligned ? 'corners_axis_aligned' : 'measured_affine',
      live_nodes: live,
      amp_min: vMin,
      amp_max: vMax,
    };

    if (destination === 'registry') {
      await saveAmplitudeAsSurface({
        volume, horizon, mode: ampMode, modeLabel, g, spec, params,
      });
      onSurfaceSaved?.();
    } else {
      downloadText(text, fileName);
    }
    setResult({
      live,
      zMin: vMin,
      zMax: vMax,
      isAmp: true,
      fileName: destination === 'registry' ? 'saved as attribute surface' : fileName,
    });
    toast({
      title: destination === 'registry' ? 'Amplitude map saved' : 'Amplitude map exported',
      description: destination === 'registry'
        ? 'Now in the explorer’s Surfaces section and Mapping & Surface Studio (map display only).'
        : fileName,
    });
  };

  const runPicksExport = async (horizon) => {
    const { rows, count, zMin, zMax } = await exportHorizonPicks({
      manifest, horizon, domain, velocityFtS: velocity, zSign,
    });
    const fmt = PICK_FORMATS.find((f) => f.key === pickFormat);
    let text;
    if (pickFormat === 'charisma') text = writeCharismaHorizon(rows);
    else if (pickFormat === 'ilxl') text = writeIlXlXyz(rows);
    else text = writeXyzPoints(rows);
    const safeName = horizon.name.replace(/[^\w-]+/g, '_').toLowerCase();
    const fileName = `${safeName}_${domain}_${fmt.ext}`;
    downloadText(text, fileName);
    setResult({ live: count, zMin, zMax, fileName });
    toast({
      title: 'Horizon picks exported',
      description: `${fileName} (${count.toLocaleString()} picks)`,
    });
  };

  /** @param {'download'|'rcp'|'registry'} destination */
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

      if (isPicks) {
        await runPicksExport(horizon);
        return;
      }

      if (isAmp) {
        await runAmplitudeExport(horizon, destination, ctl.signal);
        return;
      }

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
      else if (effectiveFormat === 'irap') text = writeIrapClassic(g);
      else text = writeZMAP({ ...g, name: safeName });
      const fileName = `${safeName}_${domain}.${fmt.ext}`;

      // shared provenance for the RCP handoff and the surface registry
      const exportParams = {
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
      };

      if (destination === 'rcp') {
        await publishSurface({
          name: `${horizon.name} (${domain === 'depth' ? 'depth ft' : 'TWT ms'})`,
          xyzText: text,
          domain: domain === 'depth' ? 'depth_ft' : 'twt_ms',
          volume,
          horizon,
          params: exportParams,
        });
      } else if (destination === 'registry') {
        await saveHorizonAsSurface({
          volume, horizon, domain, g, spec, params: exportParams,
        });
        onSurfaceSaved?.();
      } else {
        downloadText(text, fileName);
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
        fileName: destination === 'rcp' ? 'sent to ReservoirCalc Pro'
          : destination === 'registry' ? 'saved as surface' : fileName,
      });
      toast({
        title: destination === 'rcp' ? 'Surface sent to ReservoirCalc Pro'
          : destination === 'registry' ? 'Surface saved' : 'Surface exported',
        description: destination === 'rcp'
          ? 'Open ReservoirCalc Pro → Import surface → From Seismolord.'
          : destination === 'registry'
            ? 'Now in the explorer’s Surfaces section and Mapping & Surface Studio.'
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
                <Label
                  className="text-slate-300"
                  title="Surface = structure gridded from the picks; Amplitude = seismic attribute along the horizon; Picks = the interpretation itself (one row per live pick)"
                >
                  Export
                </Label>
                <select
                  className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
                  value={objectKind}
                  onChange={(e) => setObjectKind(e.target.value)}
                >
                  <option value="surface">Surface (gridded)</option>
                  {extractAmplitude && (
                    <option value="amplitude">Amplitude map (gridded)</option>
                  )}
                  <option value="picks">Horizon picks</option>
                </select>
              </div>
              {isAmp && (
                <div>
                  <Label
                    className="text-slate-300"
                    title="At-horizon attributes run around the pick; interval attributes run over every sample between this horizon and a second one; isofrequency reads the spectral amplitude at one frequency in a window about the pick"
                  >
                    Attribute
                  </Label>
                  <select
                    className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
                    value={ampMode}
                    onChange={(e) => setAmpMode(e.target.value)}
                  >
                    <optgroup label="At horizon">
                      {AMP_MODES.map((m) => (
                        <option key={m.key} value={m.key}>{m.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Between two horizons">
                      {INTERVAL_MODES.map((m) => (
                        <option key={m.key} value={`interval_${m.key}`}>{m.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Spectral">
                      <option value="isofreq">Isofrequency</option>
                    </optgroup>
                  </select>
                </div>
              )}
              {isAmp && isInterval && (
                <div>
                  <Label className="text-slate-300" title="The statistic runs from this horizon to the one picked above, whichever is shallower">
                    Second horizon
                  </Label>
                  <select
                    className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
                    value={horizonBId}
                    onChange={(e) => setHorizonBId(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {horizons.filter((h) => h.id !== horizonId).map((h) => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {isAmp && isIso && (
                <div>
                  <Label className="text-slate-300" title="Spectral amplitude is read at this frequency (Hann-tapered window about the pick)">
                    Frequency (Hz)
                  </Label>
                  <Input
                    type="number" value={freqHz} min="1" step="1"
                    className="mt-1 bg-slate-950 border-slate-700 text-slate-200"
                    onChange={(e) => setFreqHz(Number(e.target.value) || 30)}
                  />
                </div>
              )}
              {isAmp && (ampMeta?.windowed || isIso) && (
                <div>
                  <Label className="text-slate-300" title="Half-width of the window, in samples either side of the pick">
                    Window (± samples)
                  </Label>
                  <Input
                    type="number" value={ampWindow} min={isIso ? '2' : '0'} step="1"
                    className="mt-1 bg-slate-950 border-slate-700 text-slate-200"
                    onChange={(e) => setAmpWindow(Number(e.target.value))}
                  />
                </div>
              )}
              {!isAmp && (
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
              )}
              {!isAmp && (
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
              )}
              {!isPicks && (
                <div>
                  <Label className="text-slate-300">Cell (m, 0=bin)</Label>
                  <Input
                    type="number" value={cell} min="0" step="5"
                    className="mt-1 bg-slate-950 border-slate-700 text-slate-200"
                    onChange={(e) => setCell(Number(e.target.value))}
                  />
                </div>
              )}
              <div>
                <Label className="text-slate-300">Format</Label>
                {isPicks ? (
                  <select
                    className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
                    value={pickFormat}
                    onChange={(e) => setPickFormat(e.target.value)}
                  >
                    {PICK_FORMATS.map((f) => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                  >
                    {FORMATS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                )}
              </div>
              {isPicks && (
                <div>
                  <Label
                    className="text-slate-300"
                    title="The suite convention is Z negative downward; Petrel's Charisma import conventionally expects positive-down values"
                  >
                    Z sign
                  </Label>
                  <select
                    className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm"
                    value={zSign}
                    onChange={(e) => setZSign(e.target.value)}
                  >
                    <option value="negative">Negative down (suite)</option>
                    <option value="positive">Positive down (Petrel)</option>
                  </select>
                </div>
              )}
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
                {isPicks ? 'Export picks' : isAmp ? 'Extract & download' : 'Grid & download'}
              </Button>
              {!isPicks && (
                <Button
                  onClick={() => runExport('registry')}
                  disabled={!horizonId || running}
                  variant="outline"
                  className="border-cyan-600/60 text-cyan-300 hover:bg-cyan-950/40"
                  title={isAmp
                    ? 'Extract the attribute and keep the map as a first-class attribute surface (explorer Surfaces section + Mapping & Surface Studio; map display only)'
                    : 'Grid the picks and keep the result as a first-class surface (explorer Surfaces section + Mapping & Surface Studio)'}
                >
                  <Mountain className="w-4 h-4 mr-2" />
                  Save as surface
                </Button>
              )}
              {!isPicks && !isAmp && (
                <Button
                  onClick={() => runExport('rcp')}
                  disabled={!horizonId || running}
                  variant="outline"
                  className="border-emerald-600/60 text-emerald-300 hover:bg-emerald-950/40"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send to ReservoirCalc Pro
                </Button>
              )}
              {running && !isPicks && (
                <Button
                  variant="outline" size="sm"
                  onClick={() => abortRef.current?.abort()}
                  title="Stop the gridding job"
                >
                  <Ban className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              )}
              {!isPicks && !isAmp && faults.length > 0 && (
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
              {!isPicks && !isAmp && (
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
              )}
              {!isPicks && !isAmp && (
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
              )}
            </div>

            {!isPicks && !isAmp && faultAware && faults.length > 1 && (
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
                <div>
                  {result.controlCount != null || result.isAmp ? 'Live nodes' : 'Picks'}:{' '}
                  <span className="text-white">{result.live.toLocaleString()}</span>
                </div>
                <div>
                  {result.isAmp ? 'Amp range' : 'Z range'}: <span className="text-white">
                    {result.zMin?.toFixed(result.isAmp ? 4 : 1)} … {result.zMax?.toFixed(result.isAmp ? 4 : 1)}
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
              {isAmp
                ? 'Amplitude export extracts the seismic attribute along the horizon '
                  + '(parabolic value at the sub-sample pick, or a windowed statistic '
                  + 'with nulls excluded) at bin resolution, then bilinearly resamples '
                  + 'it onto the export grid — no TPS fit, so amplitude detail is '
                  + 'preserved. Values keep their physical sign and unit (raw '
                  + 'amplitude); nulls are 1.0E+30 (Irap writes its own 9999900 '
                  + 'sentinel); grid bodies follow the same column-major, '
                  + 'north-to-south conventions as structure exports. Saved attribute '
                  + 'surfaces display in the Map window only.'
                : isPicks
                ? 'Pick export writes the interpretation itself: one row per live '
                  + 'pick with real inline/crossline numbers and world X/Y from the '
                  + 'measured survey geometry. Charisma rows use the 9-token dialect '
                  + 'Petrel imports; nulls are skipped (no sentinel rows). Depth uses '
                  + 'the volume velocity model when set, else constant velocity.'
                : 'Exports use the suite convention: Z negative downward (depth in feet via '
                  + 'the volume velocity model when set, else constant velocity; or negated '
                  + 'TWT ms); nulls are 1.0E+30 (Irap writes its own 9999900 sentinel); '
                  + 'CPS-3/ZMAP+ bodies are column-major, north to south. World positions '
                  + 'come from the measured survey geometry (rotated surveys supported). '
                  + 'With fault-aware gridding on, interpolation never crosses a fault that '
                  + 'cuts the horizon and nodes on the fault trace stay null. "Save as '
                  + 'surface" keeps the grid as a first-class object in the shared surface '
                  + 'registry.'}
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
