// Petrophysics porosity and TOC as inputs (BF-U2-007). For a model tied to
// a registry well: the well's porosity and TOC curves averaged over each
// layer, the porosity against the model's Athy porosity, and two edits to
// apply (surface porosity from the log; TOC of the source layers). Both go
// through the layer replacement that Undo reverses.

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { verticalDepthOf } from '@/lib/basinHandoff';
import { useBasinFlow } from '../../contexts/BasinFlowContext';
import { useMultiWell } from '../../contexts/MultiWellContext';
import { pickPetroCurves, readCurve, toModelDepth, porosityByLayer, tocByLayer, applyPorosityFit, applyToc } from '../../services/petroInputs';

const f = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : EMPTY_VALUE);

export default function PetroLogsImport() {
  const { state, dispatch } = useBasinFlow();
  const { backend } = useMultiWell();
  const { toast } = useToast();
  const wellId = state.settings?.registryWellId || null;
  const [load, setLoad] = useState({ status: 'idle' });

  useEffect(() => {
    let live = true;
    if (!wellId) { setLoad({ status: 'untied' }); return undefined; }
    if (!backend?.listRegistryLogs || !backend?.downloadRegistryCurve) { setLoad({ status: 'error', message: 'This backend cannot read registry curves.' }); return undefined; }
    setLoad({ status: 'loading' });
    (async () => {
      const [wells, logs] = await Promise.all([backend.listRegistryWells(), backend.listRegistryLogs(wellId)]);
      const well = (wells || []).find((w) => w.id === wellId) || null;
      const picked = pickPetroCurves(logs);
      const read = {};
      for (const kind of ['porosity', 'toc']) {
        const log = picked[kind];
        if (!log) continue;
        const raw = await backend.downloadRegistryCurve(log);
        read[kind] = { log, ...readCurve(log, raw, kind) };
      }
      if (live) setLoad({ status: 'ready', well, picked, read });
    })().catch((e) => { if (live) setLoad({ status: 'error', message: e.message }); });
    return () => { live = false; };
  }, [wellId, backend]);

  const tops = (state.stratigraphy || []).map((l) => l.provenance?.top_tvd_m).filter(Number.isFinite);
  const topTvdM = tops.length ? Math.min(...tops) : 0;
  const frame = useMemo(() => (load.status === 'ready' && load.well ? verticalDepthOf(load.well) : { tvd: (md) => md, basis: 'md' }), [load]);
  const samples = (kind) => (load.status === 'ready' && load.read[kind]?.ok ? toModelDepth(load.read[kind].log, load.read[kind].values, { tvdOf: frame.tvd, topTvdM }) : []);
  const phiRows = useMemo(() => porosityByLayer(samples('porosity'), state.stratigraphy), [load, state.stratigraphy, topTvdM]); // eslint-disable-line react-hooks/exhaustive-deps
  const tocRows = useMemo(() => tocByLayer(samples('toc'), state.stratigraphy), [load, state.stratigraphy, topTvdM]); // eslint-disable-line react-hooks/exhaustive-deps

  if (load.status === 'untied') return <p className="text-xs text-pl-muted" data-testid="bf-petro-untied">Tie the model to a registry well first (Registry well tab, or Send to Basin from Stratigraphy Studio): the porosity and TOC curves are read from that well.</p>;
  if (load.status === 'loading' || load.status === 'idle') return <p className="text-xs text-pl-muted">Reading the well's curves…</p>;
  if (load.status === 'error') return <p className="text-xs text-pl-danger-text" data-testid="bf-petro-error">{load.message}</p>;

  const { picked, read } = load;
  const applyPhi = () => {
    const n = phiRows.filter((r) => r.usable).length;
    dispatch({ type: 'REPLACE_LAYERS', payload: { stratigraphy: applyPorosityFit(state.stratigraphy, phiRows), label: `Porosity from ${read.porosity.log.mnemonic}` } });
    toast({ title: 'Surface porosity set from the log', description: `${n} layer${n === 1 ? '' : 's'} changed. Undo in Properties puts the previous values back.` });
  };
  const applyTocRows = () => {
    const n = tocRows.filter((r) => r.usable && r.isSource).length;
    dispatch({ type: 'REPLACE_LAYERS', payload: { stratigraphy: applyToc(state.stratigraphy, tocRows), label: 'TOC from the log' } });
    toast({ title: 'TOC set from the log', description: `${n} source layer${n === 1 ? '' : 's'} changed. Undo in Properties puts the previous values back.` });
  };

  return (
    <div className="space-y-4" data-testid="bf-petro">
      <p className="text-xs text-pl-muted" data-testid="bf-petro-basis">
        {state.settings?.registryWellName}: depths {frame.basis === 'tvd' ? 'through the survey to TVD' : 'as MD (no survey)'}, model surface at {topTvdM.toFixed(0)} m TVD.
        {' '}{[...picked.notes, read.porosity?.note, read.toc?.note].filter(Boolean).join(' ')}
      </p>
      <Card><CardContent className="p-4 space-y-2">
        <div className="text-sm text-pl-text">Porosity {read.porosity ? `(${read.porosity.log.mnemonic}, ${read.porosity.ok ? read.porosity.unit : 'not read'})` : ''}</div>
        {!read.porosity && <p className="text-xs text-pl-muted" data-testid="bf-petro-no-phi">No PHIT or PHIE curve on this well. Publish one in Petrophysics Studio.</p>}
        {read.porosity && !read.porosity.ok && <p className="text-xs text-pl-warning-text" data-testid="bf-petro-phi-refused">{read.porosity.reason}</p>}
        {read.porosity?.ok && (
          <>
            <table className="w-full text-xs text-pl-text" data-testid="bf-petro-phi-table">
              <thead><tr className="text-pl-muted text-left"><th className="font-normal">Layer</th><th className="font-normal text-right">Samples</th><th className="font-normal text-right">Log</th><th className="font-normal text-right">Model</th><th className="font-normal text-right">Surface porosity now</th><th className="font-normal text-right">From the log</th></tr></thead>
              <tbody>
                {phiRows.map((r) => (
                  <tr key={r.id} className="border-t border-pl-border" data-testid="bf-petro-phi-row">
                    <td className="py-0.5">{r.name}</td><td className="text-right font-mono">{r.n}</td>
                    <td className="text-right font-mono">{f(r.logPhi, 3)}</td><td className="text-right font-mono">{r.n ? f(r.modelPhi, 3) : EMPTY_VALUE}</td>
                    <td className="text-right font-mono">{f(r.phi0, 2)}</td>
                    <td className="text-right font-mono" title={r.why}>{r.usable ? f(r.phi0Fit, 2) : r.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end"><Button size="sm" data-testid="bf-petro-apply-phi" disabled={!phiRows.some((r) => r.usable)} onClick={applyPhi}>Set the surface porosity from the log</Button></div>
            <p className="text-[11px] text-pl-muted">The compaction coefficient is kept; the surface porosity is scaled so the model matches the log's mean over the logged depths.</p>
          </>
        )}
      </CardContent></Card>
      <Card><CardContent className="p-4 space-y-2">
        <div className="text-sm text-pl-text">TOC {read.toc?.ok ? '(wt %)' : ''}</div>
        {!read.toc && <p className="text-xs text-pl-muted" data-testid="bf-petro-no-toc">No TOC curve on this well.</p>}
        {read.toc && !read.toc.ok && <p className="text-xs text-pl-warning-text">{read.toc.reason}</p>}
        {read.toc?.ok && (
          <>
            <table className="w-full text-xs text-pl-text" data-testid="bf-petro-toc-table">
              <thead><tr className="text-pl-muted text-left"><th className="font-normal">Layer</th><th className="font-normal text-right">Samples</th><th className="font-normal text-right">Log TOC</th><th className="font-normal text-right">Source TOC now</th></tr></thead>
              <tbody>
                {tocRows.map((r) => (
                  <tr key={r.id} className="border-t border-pl-border" data-testid="bf-petro-toc-row">
                    <td className="py-0.5">{r.name}</td><td className="text-right font-mono">{r.n}</td>
                    <td className="text-right font-mono">{f(r.toc, 2)}</td><td className="text-right font-mono">{r.isSource ? f(r.current, 2) : 'not a source'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end"><Button size="sm" data-testid="bf-petro-apply-toc" disabled={!tocRows.some((r) => r.usable && r.isSource)} onClick={applyTocRows}>Set the source TOC from the log</Button></div>
            <p className="text-[11px] text-pl-muted">A log TOC is the present-day value. The model takes the original TOC, so raise it for a source rock that has already generated. Only layers marked as source rock are changed.</p>
          </>
        )}
      </CardContent></Card>
    </div>
  );
}
