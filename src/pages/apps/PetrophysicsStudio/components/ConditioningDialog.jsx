// Log conditioning dialog (Petrophysics Studio PS8, audit B3):
// despike, smooth, block depth-shift, bad-hole repair and
// normalization apply. THE DEFENSIBILITY RULE: results save as NEW
// registry curves (KEY_CND) with full operation provenance — raw
// curves are never touched, and the pipeline never picks a
// conditioned curve silently; the user selects it in the explorer
// (the dialog says so after saving).

import React, { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Wand2 } from 'lucide-react';
import {
  despikeHampel, smoothMean, smoothMedian, depthShiftBlock, badHoleFlag, applyBadHole,
} from '../engine/conditioning';
import { applyNormalization } from '../engine/normalize';
import { PIPELINE_VERSION } from '../engine/pipeline';

const inputCls = 'w-20 rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs';
const selCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs';
const num = (v) => Number(v);

const OPS = [
  { id: 'despike', label: 'Despike (Hampel)' },
  { id: 'smooth-mean', label: 'Smooth (mean)' },
  { id: 'smooth-median', label: 'Smooth (median)' },
  { id: 'depth-shift', label: 'Depth shift (block)' },
  { id: 'bad-hole', label: 'Bad-hole repair' },
  { id: 'normalize', label: 'Apply normalization' },
];

export default function ConditioningDialog({
  open, onOpenChange, wellData, projectId, backend, onSaved, onStatus, lastNormFit,
}) {
  const [op, setOp] = useState('despike');
  const [srcKey, setSrcKey] = useState('GR');
  const [p, setP] = useState({
    halfWindow: '5', nSigma: '3', shiftM: '0.5',
    bitSize: '8.5', washoutOver: '2', drhoMax: '0.15', mode: 'null', maxGapSamples: '6',
    shift: lastNormFit ? String(Number(lastNormFit.result.shift.toFixed(4))) : '0',
    scale: lastNormFit ? String(Number(lastNormFit.result.scale.toFixed(6))) : '1',
  });
  const [busy, setBusy] = useState(false);

  const sources = useMemo(() => Object.keys(wellData?.curves || {})
    .filter((k) => k !== 'DEPT'), [wellData]);
  const srcData = wellData?.curves[srcKey];
  const depth = wellData?.curves.DEPT;

  const compute = () => {
    switch (op) {
      case 'smooth-mean': return { data: smoothMean(srcData, num(p.halfWindow)) };
      case 'smooth-median': return { data: smoothMedian(srcData, num(p.halfWindow)) };
      case 'depth-shift': return { data: depthShiftBlock(depth, srcData, num(p.shiftM)) };
      case 'bad-hole': {
        const cali = wellData.curves.CAL || null;
        const drho = wellData.curves.DRHO || null;
        if (!cali && !drho) throw new Error('Bad-hole repair needs a CAL or DRHO curve on this well.');
        const flags = badHoleFlag(
          { cali, bitSize: num(p.bitSize), drho },
          { washoutOver: num(p.washoutOver), drhoMax: num(p.drhoMax) },
        );
        return {
          data: applyBadHole(srcData, flags, { mode: p.mode, maxGapSamples: num(p.maxGapSamples) }),
          flags,
        };
      }
      case 'normalize': return { data: applyNormalization(srcData, { shift: num(p.shift), scale: num(p.scale) }) };
      default: return { data: despikeHampel(srcData, num(p.halfWindow), num(p.nSigma)) };
    }
  };

  const preview = useMemo(() => {
    if (!srcData || !open) return null;
    try {
      const { data } = compute();
      let changed = 0;
      let nulled = 0;
      for (let i = 0; i < data.length; i++) {
        const a = srcData[i];
        const b = data[i];
        if (Number.isFinite(a) && Number.isNaN(b)) nulled += 1;
        else if (Number.isFinite(a) && Number.isFinite(b) && a !== b) changed += 1;
      }
      return { changed, nulled };
    } catch (e) {
      return { error: e.message };
    }
  }, [srcData, op, p, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildLog = (mnemonic, unit, description, data64, method, opParams) => {
    const data = new Float32Array(data64.length);
    let nullCount = 0;
    for (let i = 0; i < data64.length; i++) {
      data[i] = data64[i];
      if (!Number.isFinite(data64[i])) nullCount += 1;
    }
    const srcLog = wellData.inventory.find((e) => e.key === srcKey)?.log;
    return {
      mnemonic,
      description,
      unit,
      data,
      startMdM: depth[0],
      stopMdM: depth[depth.length - 1],
      stepM: srcLog?.step_m ?? null,
      nSamples: data.length,
      nullCount,
      provenance: {
        computed: true,
        engine: 'petrophysics-studio',
        operation: 'conditioning',
        method,
        params: opParams,
        pipeline_version: PIPELINE_VERSION,
        input_log_ids: wellData.inventory.filter((e) => e.log).map((e) => e.log.id),
      },
    };
  };

  const save = async () => {
    setBusy(true);
    try {
      const { data, flags } = compute();
      const srcLog = wellData.inventory.find((e) => e.key === srcKey)?.log;
      const opParams = { op, srcKey, ...p };
      const logs = [buildLog(
        `${srcKey}_CND`,
        srcLog?.unit || '',
        `${srcKey} conditioned (${op})`,
        data,
        op,
        opParams,
      )];
      if (flags) {
        logs.push(buildLog('BADHOLE', 'FLAG', 'Bad-hole flag (1 = flagged)', Float64Array.from(flags), 'bad-hole-flag', opParams));
      }
      await backend.publishCurves(wellData.wellId, logs, projectId);
      onOpenChange(false);
      await onSaved(); // refresh the inventory before the message lands
      onStatus(`Saved ${srcKey}_CND. Pick it as the ${srcKey} input in the explorer to use it.`);
    } catch (e) {
      onStatus(e.message);
    } finally {
      setBusy(false);
    }
  };

  const field = (key, label) => (
    <label className="flex items-center gap-1 text-slate-400">{label}
      <input className={inputCls} data-testid={`petro-cond-${key}`} value={p[key]}
        onChange={(e) => setP((s) => ({ ...s, [key]: e.target.value }))} />
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-slate-900 border-slate-700 text-slate-200" data-testid="petro-cond-dialog">
        <DialogHeader>
          <DialogTitle>Condition a curve</DialogTitle>
          <DialogDescription className="text-slate-400">
            Saves a NEW {srcKey}_CND curve with operation provenance. Raw curves are never changed,
            and nothing is substituted silently: pick the conditioned curve in the explorer to use it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1 text-slate-400">Curve
              <select className={selCls} data-testid="petro-cond-source" value={srcKey}
                onChange={(e) => setSrcKey(e.target.value)}
              >
                {sources.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1 text-slate-400">Operation
              <select className={selCls} data-testid="petro-cond-op" value={op}
                onChange={(e) => setOp(e.target.value)}
              >
                {OPS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {(op === 'despike' || op === 'smooth-mean' || op === 'smooth-median') && field('halfWindow', 'Half window')}
            {op === 'despike' && field('nSigma', 'n sigma')}
            {op === 'depth-shift' && field('shiftM', 'Shift (m)')}
            {op === 'bad-hole' && (
              <>
                {field('bitSize', 'Bit size')}
                {field('washoutOver', 'Washout over')}
                {field('drhoMax', '|DRHO| max')}
                <label className="flex items-center gap-1 text-slate-400">Repair
                  <select className={selCls} value={p.mode} onChange={(e) => setP((s) => ({ ...s, mode: e.target.value }))}>
                    <option value="null">null out</option>
                    <option value="interp">bridge short gaps</option>
                  </select>
                </label>
                {p.mode === 'interp' && field('maxGapSamples', 'Max gap (samples)')}
              </>
            )}
            {op === 'normalize' && (
              <>
                {field('shift', 'Shift')}
                {field('scale', 'Scale')}
                {lastNormFit && (
                  <span className="text-slate-500">prefilled from the histogram fit</span>
                )}
              </>
            )}
          </div>
          {op === 'depth-shift' && (
            <p className="text-[10px] text-slate-500">
              Constant block shift only. Interval stretch and squeeze correlation is out of scope by decision.
            </p>
          )}

          {preview && (preview.error ? (
            <p className="text-amber-400/90" data-testid="petro-cond-preview">{preview.error}</p>
          ) : (
            <p className="text-slate-400" data-testid="petro-cond-preview">
              Preview: <b className="text-slate-200">{preview.changed}</b> samples changed,{' '}
              <b className="text-slate-200">{preview.nulled}</b> nulled.
            </p>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-cyan-600 hover:bg-cyan-500 text-white"
            disabled={busy || !srcData || !!preview?.error}
            data-testid="petro-cond-save"
            onClick={save}
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
            Save {srcKey}_CND
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
