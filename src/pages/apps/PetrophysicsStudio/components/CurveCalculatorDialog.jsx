// Curve calculator (Petrophysics Studio PT9f): a new curve from an
// expression over any curve the well carries (inputs, pipeline outputs,
// registry curves). Saved to the registry as a NEW row with the
// expression in its provenance (the raw curves are never changed), so it
// can be drawn (Track layout, address log:<MNEMONIC>), mapped as an
// input, exported and used by every other Suite app.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { evalCurve, curveStats, normalizeMnemonic, CALC_EXAMPLES, CALC_FUNCTIONS } from '../services/curveCalc';
import { nextFreeName } from '@/lib/curveNames';
import { PIPELINE_VERSION } from '../engine/pipeline';

const inputCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs';
const fmt = (v, d = 4) => (Number.isFinite(v) ? String(Number(v.toFixed(d))) : '—');

export default function CurveCalculatorDialog({
  open, onOpenChange, wellData, outputs, backend, projectId, onSaved, onStatus, canSave = true,
}) {
  const [mnemonic, setMnemonic] = useState('HCPV');
  const [unit, setUnit] = useState('V/V');
  const [expr, setExpr] = useState('PHIE * (1 - SW)');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setBusy(false); }, [open]);

  // every curve an expression may name: mapped inputs, outputs, then any
  // other registry curve by its mnemonic
  const curvesByKey = useMemo(() => {
    if (!wellData) return {};
    const out = { ...wellData.curves, ...(outputs || {}) };
    for (const [m, arr] of Object.entries(wellData.logs || {})) if (!out[m] && arr) out[m] = arr;
    return out;
  }, [wellData, outputs]);
  const available = useMemo(() => Object.keys(curvesByKey).filter((k) => k !== 'DEPT'), [curvesByKey]);
  const existing = useMemo(() => (wellData?.allLogs || []).map((l) => l.mnemonic), [wellData]);
  const n = wellData?.curves?.DEPT?.length || 0;

  const result = useMemo(() => {
    if (!n || !expr.trim()) return { error: null, data: null };
    try {
      const r = evalCurve(expr, curvesByKey, n);
      return { error: null, data: r.data, ids: r.ids, stats: curveStats(r.data) };
    } catch (e) {
      return { error: e.message, data: null };
    }
  }, [expr, curvesByKey, n]);

  const mnem = normalizeMnemonic(mnemonic);
  const finalName = mnem ? nextFreeName(mnem, existing) : '';
  const nameNote = mnem && finalName !== mnem ? `${mnem} exists; saving as ${finalName}` : '';

  const insert = (text) => setExpr((e) => (e.trim() ? `${e} ${text}` : text));

  const save = async () => {
    if (!result.data || !finalName) return;
    setBusy(true);
    try {
      const depth = wellData.curves.DEPT;
      const data = new Float32Array(result.data.length);
      let nullCount = 0;
      for (let i = 0; i < data.length; i++) { data[i] = result.data[i]; if (!Number.isFinite(result.data[i])) nullCount += 1; }
      const depthLog = wellData.inventory.find((e) => e.key === 'DEPT')?.log;
      const log = {
        mnemonic: finalName,
        description: `Calculated: ${expr.trim()}`,
        unit: unit.trim(),
        data,
        startMdM: depth[0],
        stopMdM: depth[depth.length - 1],
        stepM: depthLog?.step_m ?? null,
        nSamples: data.length,
        nullCount,
        provenance: {
          computed: true,
          engine: 'petrophysics-studio',
          operation: 'calculator',
          expression: expr.trim(),
          inputs: result.ids,
          pipeline_version: PIPELINE_VERSION,
          input_log_ids: wellData.inventory.filter((e) => e.log).map((e) => e.log.id),
        },
      };
      await backend.publishCurves(wellData.wellId, [log], projectId);
      onOpenChange(false);
      await onSaved?.();
      onStatus?.(`Saved ${finalName} (${result.stats.valid} of ${n} samples). Draw it from Track layout as log:${finalName}, or map it as an input in the explorer.`);
    } catch (e) {
      onStatus?.(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-slate-900 border-slate-700 text-slate-200" data-testid="petro-calc-dialog">
        <DialogHeader>
          <DialogTitle>Curve calculator</DialogTitle>
          <DialogDescription className="text-slate-400">
            A new curve from an expression over this well&apos;s curves. Saved as a new registry row with
            the expression in its provenance; nothing existing is changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1">Name
              <input className={`${inputCls} w-28`} value={mnemonic} data-testid="petro-calc-name" onChange={(e) => setMnemonic(e.target.value)} />
            </label>
            <label className="flex items-center gap-1">Unit
              <input className={`${inputCls} w-20`} value={unit} data-testid="petro-calc-unit" onChange={(e) => setUnit(e.target.value)} />
            </label>
            <label className="flex items-center gap-1 ml-auto">Example
              <select className={inputCls} value="" data-testid="petro-calc-example" onChange={(e) => {
                const ex = CALC_EXAMPLES[Number(e.target.value)];
                if (ex) { setMnemonic(ex.mnemonic); setUnit(ex.unit); setExpr(ex.expr); }
              }}>
                <option value="">Pick one…</option>
                {CALC_EXAMPLES.map((ex, i) => <option key={ex.label} value={i}>{ex.label}</option>)}
              </select>
            </label>
          </div>
          {nameNote && <p className="text-[10px] text-amber-300" data-testid="petro-calc-name-note">{nameNote}</p>}
          <textarea
            className={`${inputCls} w-full h-16 font-mono`}
            value={expr}
            data-testid="petro-calc-expr"
            spellCheck={false}
            onChange={(e) => setExpr(e.target.value)}
          />
          <div className="flex flex-wrap gap-1 items-center">
            <span className="text-slate-500">Curves</span>
            {available.map((k) => (
              <button key={k} type="button" className="px-1.5 py-0.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800" onClick={() => insert(k)}>{k}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 items-center">
            <span className="text-slate-500">Functions</span>
            {CALC_FUNCTIONS.map((f) => (
              <button key={f} type="button" className="px-1.5 py-0.5 rounded border border-slate-800 text-slate-400 hover:bg-slate-800" onClick={() => insert(`${f}(`)}>{f}</button>
            ))}
            <span className="text-slate-600">· + - * / ^ ( ) &lt; &lt;= &gt; &gt;= == != &amp;&amp; || ! pi e</span>
          </div>
          {result.error ? (
            <p className="text-red-300" data-testid="petro-calc-error">{result.error}</p>
          ) : result.stats ? (
            <p className="text-slate-300" data-testid="petro-calc-preview">
              {result.stats.valid} of {result.stats.total} samples valid · min {fmt(result.stats.min)} · mean {fmt(result.stats.mean)} · max {fmt(result.stats.max)}
              {result.ids?.length ? ` · uses ${result.ids.join(', ')}` : ''}
            </p>
          ) : (
            <p className="text-slate-500">Type an expression, or pick an example.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            size="sm"
            data-testid="petro-calc-save"
            disabled={!canSave || busy || !result.data || !finalName}
            title={canSave ? 'Save the curve to this well' : 'Org-shared wells are read-only'}
            className="bg-cyan-700 hover:bg-cyan-600 text-white"
            onClick={save}
          >
            {busy ? 'Saving…' : `Save ${finalName || 'curve'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
