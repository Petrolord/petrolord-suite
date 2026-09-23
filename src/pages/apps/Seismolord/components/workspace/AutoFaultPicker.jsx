// Automatic fault picking over an area of interest: the shared panel of
// the Tops to Horizons dialog (step 3) and the standalone Detect faults
// dialog. It runs the framework worker's 'faults' job through `run`,
// lists the proposals, and saves the ticked ones as ordinary faults
// (params.source 'auto').
import React, { useEffect, useState } from 'react';
import { Save, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { saveFault } from '../../services/faultsService';
import { saveAutoFaults } from '../../services/topsToHorizons';
import { clampAoi, AOI_MAX_SAMPLES } from '../../services/topsToHorizonsPipeline';

const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? '·' : v.toFixed(d));
const AOI_FIELDS = [
  ['il0', 'Inline from'], ['il1', 'to'], ['xl0', 'Crossline from'], ['xl1', 'to'], ['s0', 'Sample from'], ['s1', 'to'],
];

/** One line on the data quality and the thresholds the picking used. */
export function describeQuality(q) {
  const scale = q.thresholdScale ?? 1;
  const thr = scale < 1 ? `thresholds at ${Math.round(scale * 100)} percent of the standard` : 'standard thresholds';
  if (q.coherence == null) return `Data quality not measured (volume input); ${thr}.`;
  const kind = q.coherence >= 0.95 ? 'clean' : q.coherence >= 0.85 ? 'some noise' : 'noisy';
  return `Reflector coherence ${q.coherence.toFixed(2)} (${kind}); ${thr}.`;
}

export const aoiSampleCount = (a) => (a
  ? (a.il1 - a.il0 + 1) * (a.xl1 - a.xl0 + 1) * (a.s1 - a.s0 + 1) : 0);

/**
 * @param {Object} p
 * @param {Object} p.geom lattice geometry
 * @param {number} p.dtMs sample interval
 * @param {Object} p.volume the open volume row
 * @param {Array<Object>} p.faults existing faults (their names are taken)
 * @param {Object|null} p.initialAoi starting area of interest
 * @param {Array<{key: string, label: string, aoi: Object}>} [p.presets] quick areas
 * @param {Array<{id: string, name: string, kind: 'variance'|'likelihood', storagePath: string}>} [p.inputs]
 *   same-lattice volumes the picking can start from instead of the seismic
 * @param {(kind: string, config: Object) => Promise<Object>} p.run worker job
 * @param {string|null} p.busy the caller's busy state (disables the buttons)
 * @param {(rows: Object[]) => void} [p.onSaved]
 * @param {(msg: string) => void} [p.onError]
 */
export default function AutoFaultPicker({
  geom, dtMs, volume, faults = [], initialAoi, presets = [], inputs = [], run, busy = null, onSaved, onError,
}) {
  const { toast } = useToast();
  const [aoi, setAoi] = useState(initialAoi || null);
  const [detected, setDetected] = useState(null);
  const [keep, setKeep] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [inputId, setInputId] = useState('');
  const [sensitivity, setSensitivity] = useState('auto');
  const input = inputs.find((v) => v.id === inputId) || null;

  useEffect(() => {
    setAoi(initialAoi || null);
    setDetected(null);
  }, [initialAoi]);

  const samples = aoiSampleCount(aoi);
  const tooBig = samples > AOI_MAX_SAMPLES;
  const disabled = Boolean(busy) || saving;

  const detect = async () => {
    try {
      const r = await run('faults', {
        geom,
        dtMs,
        aoi: clampAoi(aoi, geom),
        params: { sensitivity },
        input: input ? {
          kind: input.kind, storagePath: input.storagePath, dtype: input.dtype ?? 'float32le', v4: input.v4 ?? null,
        } : null,
      });
      setDetected(r);
      setKeep(new Set(r.faults.map((f) => f.name)));
      if (!r.faults.length) toast({ title: 'No faults found', description: 'No fault stood above the confidence floor in this area.' });
    } catch (e) {
      if (!/cancel/i.test(e.message)) onError?.(e.message);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const chosen = detected.faults.filter((f) => keep.has(f.name));
      const rows = await saveAutoFaults({
        volumeId: volume.id, faults: chosen, takenNames: new Set(faults.map((f) => f.name)), saveFault, aoi: detected.aoi,
      });
      setDetected(null);
      onSaved?.(rows);
    } catch (e) {
      onError?.(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2" data-testid="sl-auto-faults">
      <Label className="text-slate-300 flex items-center">
        <Sparkles className="w-4 h-4 mr-1 text-cyan-400" />
        Pick faults automatically
      </Label>
      <p className="text-xs text-slate-400">
        A fault likelihood from dip-steered semblance, thinned to one cell and grouped into
        faults. It runs over an area of interest (lattice indices), up to
        {` ${(AOI_MAX_SAMPLES / 1e6).toFixed(0)} million samples at a time.`}
      </p>
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant="outline"
              onClick={() => { setAoi(p.aoi); setDetected(null); }}
              disabled={disabled}
              data-testid={`sl-aoi-${p.key}`}
            >
              {p.label}
            </Button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="text-slate-400">
          Start from
          <select
            className="mt-1 w-full rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-1"
            value={inputId}
            onChange={(e) => { setInputId(e.target.value); setDetected(null); }}
            disabled={disabled}
            aria-label="Start from"
          >
            <option value="">The seismic (measures data quality)</option>
            {inputs.map((v) => (
              <option key={v.id} value={v.id}>
                {`${v.name} (${v.kind === 'likelihood' ? 'fault likelihood, fastest' : 'variance'})`}
              </option>
            ))}
          </select>
        </label>
        <label className="text-slate-400">
          Sensitivity
          <select
            className="mt-1 w-full rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-1"
            value={sensitivity}
            onChange={(e) => { setSensitivity(e.target.value); setDetected(null); }}
            disabled={disabled}
            aria-label="Sensitivity"
          >
            <option value="auto">Auto (from the data quality)</option>
            <option value="standard">Standard (clean data)</option>
            <option value="high">High (noisy data)</option>
          </select>
        </label>
      </div>
      {input && sensitivity === 'auto' && (
        <p className="text-xs text-amber-300/90">
          A volume input does not show the data quality, so Auto means Standard. Choose High for noisy data.
        </p>
      )}
      {aoi && (
        <div className="grid grid-cols-6 gap-2 text-xs">
          {AOI_FIELDS.map(([k, lab]) => (
            <div key={k}>
              <Label className="text-slate-400 text-xs">{lab}</Label>
              <Input
                type="number"
                value={aoi[k]}
                onChange={(e) => setAoi((a) => ({ ...a, [k]: Number(e.target.value) }))}
                className="h-7 text-xs"
                aria-label={`${lab} (${k})`}
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3">
        <span className={`text-xs ${tooBig ? 'text-rose-300' : 'text-slate-400'}`}>
          {`${(samples / 1e6).toFixed(1)} million samples`}
        </span>
        <Button size="sm" onClick={detect} disabled={disabled || !aoi || tooBig} data-testid="t2h-detect">
          <Sparkles className="w-4 h-4 mr-1" />
          Pick faults
        </Button>
      </div>
      {detected?.quality && (
        <p className="text-xs text-slate-400" data-testid="sl-auto-faults-quality">
          {describeQuality(detected.quality)}
        </p>
      )}
      {detected && (
        <div className="space-y-1">
          {detected.faults.map((f) => (
            <label key={f.name} className="text-xs text-slate-300 flex items-center gap-2">
              <input
                type="checkbox"
                checked={keep.has(f.name)}
                onChange={(e) => setKeep((s) => {
                  const n = new Set(s);
                  if (e.target.checked) n.add(f.name); else n.delete(f.name);
                  return n;
                })}
              />
              {`${f.name}: confidence ${fmt(f.confidence, 2)}, ${f.sticks.length} sticks, strike ${fmt(f.stats?.strikeDeg, 0)}°`}
            </label>
          ))}
          {detected.faults.length > 0 && (
            <Button size="sm" onClick={save} disabled={disabled || !keep.size} data-testid="sl-auto-faults-save">
              <Save className="w-4 h-4 mr-1" />
              Save the ticked faults
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
