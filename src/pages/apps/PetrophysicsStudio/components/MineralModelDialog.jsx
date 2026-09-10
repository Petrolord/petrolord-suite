// Mineral model dialog (Petrophysics Studio PT11d, 2026-09-10): the
// endpoint table (editable, Reset to published), three mineral picks,
// the fixed fluid, the tool requirement line, Run, a summary of accepted,
// singular and out-of-range counts with the worst excursion, what the
// solver is not suited to, and three ways out: Apply to tracks, Publish,
// and the note that porosity feeds the pipeline only through an explicit
// phiSource 'mineral'. No worker: a 4 by 4 solve per sample is
// microseconds, so it runs inline like computeWell.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { uOf, MINERAL_FLAGS } from '../engine/mineral';
import {
  defaultMineralModel, publishedEndpoint, modelProblem, ENDPOINT_FIELDS, MINERAL_UNSUITED, mineralSummaryLine, MINERAL_COLORS,
} from '../services/mineralModel';

const cellCls = 'w-20 rounded bg-slate-950 border border-slate-700 text-slate-200 px-1 py-0.5 text-xs font-mono';
const selCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs';
const fmt = (v, d = 3) => (Number.isFinite(v) ? Number(v).toFixed(d) : '—');

export default function MineralModelDialog({
  open, onOpenChange, model, result, wellData, params, canPublish = false, publishing = false,
  onRun, onApply, onPublish, onStatus,
}) {
  const [draft, setDraft] = useState(() => model || defaultMineralModel());
  useEffect(() => { if (open) setDraft(model || defaultMineralModel()); }, [open, model]);

  const problem = useMemo(() => modelProblem(draft, wellData), [draft, wellData]);
  const keys = Object.keys(draft.endpoints || {});
  const setPick = (i, key) => setDraft((d) => ({ ...d, minerals: d.minerals.map((m, j) => (j === i ? key : m)) }));
  const setEndpoint = (key, field, value) => setDraft((d) => ({ ...d, endpoints: { ...d.endpoints, [key]: { ...d.endpoints[key], [field]: value } } }));
  const setFluid = (field, value) => setDraft((d) => ({ ...d, fluid: { ...d.fluid, [field]: value } }));
  const resetRow = (key) => setDraft((d) => ({ ...d, endpoints: { ...d.endpoints, [key]: publishedEndpoint(key) || d.endpoints[key] } }));
  const resetAll = () => setDraft(defaultMineralModel());
  const changedFromPublished = (key) => {
    const pub = publishedEndpoint(key);
    const e = draft.endpoints[key];
    return pub && ENDPOINT_FIELDS.some((f) => Number(e[f.key]) !== Number(pub[f.key]));
  };
  const toolLine = wellData
    ? ['RHOB', 'NPHI', 'PEF'].map((k) => `${k} ${wellData.curves?.[k] ? 'mapped' : 'NOT mapped'}`).join(', ')
    : 'no well open';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-slate-900 border-slate-700 text-slate-200" data-testid="petro-mineral-dialog">
        <DialogHeader>
          <DialogTitle>Mineral model</DialogTitle>
          <DialogDescription className="text-slate-400">
            Density, neutron and PEF solved together for three mineral fractions and porosity with a fixed fluid,
            one linear system per sample (U = Pe × ρe so the photoelectric term mixes by volume). A sample whose
            fractions leave zero to one, or a mineral set the tools cannot separate, is refused and flagged, never
            clamped. Porosity reaches the pipeline only if you pick φt source <span className="font-mono">mineral</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {[0, 1, 2].map((i) => (
              <label key={i} className="flex items-center gap-1">Mineral {i + 1}
                <select className={selCls} data-testid={`petro-mineral-pick-${i}`} value={draft.minerals[i]} onChange={(e) => setPick(i, e.target.value)}>
                  {keys.map((k) => <option key={k} value={k}>{draft.endpoints[k].label || k}</option>)}
                </select>
              </label>
            ))}
            <span className="text-slate-500" data-testid="petro-mineral-tools">Tools: {toolLine}</span>
          </div>

          <div className="rounded border border-slate-800 overflow-auto max-h-56">
            <table className="min-w-full text-xs" data-testid="petro-mineral-table">
              <thead className="sticky top-0 bg-slate-900">
                <tr>
                  <th className="text-left px-2 py-1 text-slate-400 font-normal">Endpoint</th>
                  {ENDPOINT_FIELDS.map((f) => <th key={f.key} className="text-left px-2 py-1 text-slate-400 font-normal">{f.label}</th>)}
                  <th className="text-left px-2 py-1 text-slate-400 font-normal">U (b/cc)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const e = draft.endpoints[k];
                  const inPlay = draft.minerals.includes(k);
                  return (
                    <tr key={k} className={inPlay ? 'bg-slate-800/40' : ''} data-testid={`petro-mineral-row-${k}`}>
                      <td className="px-2 py-0.5 whitespace-nowrap">
                        <span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: MINERAL_COLORS[k] || '#94a3b8' }} />
                        {e.label || k}
                      </td>
                      {ENDPOINT_FIELDS.map((f) => (
                        <td key={f.key} className="px-2 py-0.5">
                          <input className={cellCls} data-testid={`petro-mineral-${k}-${f.key}`} value={e[f.key]} onChange={(ev) => setEndpoint(k, f.key, ev.target.value)} />
                        </td>
                      ))}
                      <td className="px-2 py-0.5 text-slate-400 font-mono">{fmt(uOf(Number(e.pe), Number(e.rho)), 3)}</td>
                      <td className="px-2 py-0.5">
                        {changedFromPublished(k) && (
                          <button type="button" className="text-cyan-300 hover:underline" onClick={() => resetRow(k)}>reset</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-slate-400">Fluid</span>
            <label className="flex items-center gap-1">ρ <input className={cellCls} data-testid="petro-mineral-fluid-rho" value={draft.fluid.rho} onChange={(e) => setFluid('rho', e.target.value)} /></label>
            <label className="flex items-center gap-1">φN <input className={cellCls} data-testid="petro-mineral-fluid-nphi" value={draft.fluid.nphi} onChange={(e) => setFluid('nphi', e.target.value)} /></label>
            <label className="flex items-center gap-1">U <input className={cellCls} data-testid="petro-mineral-fluid-u" value={draft.fluid.u} onChange={(e) => setFluid('u', e.target.value)} /></label>
            <button type="button" className="text-cyan-300 hover:underline" data-testid="petro-mineral-reset" onClick={resetAll}>Reset to published</button>
            <span className="text-[10px] text-slate-500">Schlumberger Log Interpretation Charts mineral table; Doveton 1994. Neutron endpoints in limestone units. Clay is yours to edit per well.</span>
          </div>

          {problem && <p className="text-amber-300/90" data-testid="petro-mineral-problem">{problem}</p>}

          <div className="flex items-center gap-2">
            <Button size="sm" data-testid="petro-mineral-run" disabled={!!problem} onClick={() => onRun(draft)}>Run</Button>
            {result && (
              <span className="text-slate-300" data-testid="petro-mineral-summary">{mineralSummaryLine(result)}</span>
            )}
          </div>
          {result && (
            <p className="text-[10px] text-slate-500">
              Flags: {Object.entries(MINERAL_FLAGS).map(([k, v]) => `${k} ${v}`).join(', ')}. The residual track is the excursion outside zero to one; a
              determined system has no fit residual, and the tool-space misfit arrives with the weighted stage two.
              {params?.phiSource === 'mineral' ? ' PHIT is taken from this model (φt source mineral).' : ' PHIT still comes from your φt source; pick mineral in Parameters to use this porosity.'}
            </p>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Not suited to</div>
            <ul className="list-disc pl-4 text-[10px] text-slate-400 space-y-0.5" data-testid="petro-mineral-unsuited">
              {MINERAL_UNSUITED.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" data-testid="petro-mineral-apply" disabled={!result} onClick={() => { onApply(); onStatus?.('The Mineral model layout is active.'); }}>Apply to tracks</Button>
          <Button size="sm" data-testid="petro-mineral-publish" disabled={!result || !canPublish || publishing} onClick={onPublish}>Publish</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
