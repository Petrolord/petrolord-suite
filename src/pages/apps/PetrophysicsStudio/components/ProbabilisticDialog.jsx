// Probabilistic dialog (Petrophysics Studio PT10d, 2026-09-09): per
// parameter a Vary switch, a distribution and its three values, draws and
// seed, a worker run with progress and Cancel, then the zone table, a
// tornado per zone for net pay, and three ways out: Apply to tracks,
// Export CSV, Publish. Labels obey owner decision 1: parameters are
// percentiles ("10th percentile of Sw"), cases are Low / Best / High with
// the direction, outcomes alone carry P90 / P50 / P10.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { saveAs } from 'file-saver';
import { PARAM_FIELDS, visibleField, fieldLabel } from '../services/paramFields';
import { UNCERTAIN_PARAMS } from '../engine/probabilistic';
import {
  DIST_TYPES, DIST_FIELDS, DRAW_CHOICES, defaultUncertainty, entryProblem, specForEngine, probabilisticCsv, BEST_CASE_NOTE,
} from '../services/probabilistic';
import { OUTCOME_LABELS, EXCEEDANCE_DEFINITION, parameterPercentileLabel } from '@/lib/percentileConventions';

const fmt = (v, d = 3) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(d));
const cellCls = 'w-full min-w-[3.5rem] rounded bg-slate-950 border px-1 py-0.5 text-xs text-slate-200';
const selCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1 py-0.5 text-xs';

function Tornado({ zone, depthUnit }) {
  const F = depthUnit === 'ft' ? 1 / 0.3048 : 1;
  const rows = (zone.sensitivity?.tornado || []).slice(0, 8);
  if (!rows.length) return <p className="text-[10px] text-slate-500 px-1">Sensitivity needs at least 30 realisations.</p>;
  const base = rows[0].base;
  const maxSwing = Math.max(1e-9, ...rows.map((r) => Math.max(Math.abs(r.low - base), Math.abs(r.high - base))));
  return (
    <div className="px-1 space-y-0.5" data-testid={`petro-prob-tornado-${zone.name}`}>
      <div className="text-[10px] text-slate-500">Net pay swing about the median ({fmt(base * F, 1)} {depthUnit}) when a parameter sits in its bottom or top tenth of draws</div>
      {rows.map((r) => {
        const lo = Math.min(r.low, r.high) - base;
        const hi = Math.max(r.low, r.high) - base;
        const left = 50 + (lo / maxSwing) * 50;
        const width = ((hi - lo) / maxSwing) * 50;
        return (
          <div key={r.parameter} className="flex items-center gap-1 text-[10px]">
            <span className="w-20 text-slate-400 truncate">{r.parameter}</span>
            <div className="relative flex-1 h-3 bg-slate-800/60 rounded">
              <div className="absolute top-0 bottom-0 w-px bg-slate-500" style={{ left: '50%' }} />
              <div className="absolute top-0.5 bottom-0.5 rounded bg-cyan-600/70" style={{ left: `${left}%`, width: `${Math.max(1, width)}%` }} />
            </div>
            <span className="w-24 text-slate-400 text-right">{fmt((base + lo) * F, 1)} to {fmt((base + hi) * F, 1)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function ProbabilisticDialog({
  open, onOpenChange, params, uncertainty, result, running, progress, runMs, zones = [], depthUnit = 'm', wellName = 'Well',
  canPublish = false, onRun, onCancel, onApply, onPublish, onStatus,
}) {
  const [draft, setDraft] = useState({});
  const [n, setN] = useState(uncertainty?.n || 200);
  const [seed, setSeed] = useState(uncertainty?.seed ?? 1);
  useEffect(() => {
    if (!open) return;
    setDraft(uncertainty?.spec || defaultUncertainty(params));
    setN(uncertainty?.n || 200);
    setSeed(uncertainty?.seed ?? 1);
  }, [open, params, uncertainty]);

  const problems = useMemo(() => {
    const out = {};
    for (const [k, e] of Object.entries(draft)) { const pr = entryProblem(e); if (pr) out[k] = pr; }
    return out;
  }, [draft]);
  const varying = useMemo(() => Object.entries(draft).filter(([, e]) => e?.vary).map(([k]) => k), [draft]);
  const nProblems = Object.keys(problems).length;
  const setEntry = (key, patch) => setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
  const fieldOf = (key) => PARAM_FIELDS.find((f) => f.key === key);
  const F = depthUnit === 'ft' ? 1 / 0.3048 : 1;

  const run = () => {
    if (nProblems || !varying.length) return;
    onRun({ spec: draft, engineSpec: specForEngine(draft), n: Number(n), seed: Number(seed) });
  };
  const exportCsv = () => {
    if (!result) return;
    saveAs(new Blob([probabilisticCsv(result, depthUnit)], { type: 'text/csv;charset=utf-8;' }), `${String(wellName).replace(/[^\w.-]+/g, '_')}_probabilistic.csv`);
    onStatus?.('Exported the probabilistic zone summary CSV.');
  };
  const pct = progress ? Math.round(progress.phase === 'zones' ? 70 + (30 * progress.done) / Math.max(1, progress.total) : (70 * progress.done) / Math.max(1, progress.total)) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] bg-slate-900 border-slate-700 text-slate-200" data-testid="petro-prob-dialog">
        <DialogHeader>
          <DialogTitle>Probabilistic petrophysics</DialogTitle>
          <DialogDescription className="text-slate-400">
            Tick the parameters to vary, give each a distribution, and run a few hundred realisations of the
            zoned pipeline with a fixed seed. Curves come back as 10th, 50th and 90th percentiles; zone net pay
            comes back as P90, P50 and P10 cases. {BEST_CASE_NOTE}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3 text-xs">
          <div className="max-h-[55vh] overflow-auto rounded border border-slate-800">
            <table className="text-xs border-collapse min-w-full">
              <thead className="sticky top-0 bg-slate-900 z-10">
                <tr>
                  {['Parameter', 'Current', 'Vary', 'Distribution', 'Value 1', 'Value 2', 'Value 3'].map((h) => (
                    <th key={h} className="text-left px-2 py-1 text-slate-400 font-normal whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {UNCERTAIN_PARAMS.filter((k) => draft[k]).map((key) => {
                  const e = draft[key];
                  const f = fieldOf(key);
                  const applies = f ? visibleField(f, params) : true;
                  const fields = DIST_FIELDS[e.type] || [];
                  const bad = problems[key];
                  return (
                    <tr key={key} className={`border-t border-slate-800/60 ${applies ? '' : 'opacity-50'}`} data-testid={`petro-prob-row-${key}`} title={applies ? undefined : 'Not used by the current models'}>
                      <td className="px-2 py-0.5 text-slate-300 whitespace-nowrap">{f ? fieldLabel(f, params) : key}<span className="text-slate-600"> {key}</span></td>
                      <td className="px-2 py-0.5 text-slate-400">{fmt(params[key], 4)}</td>
                      <td className="px-2 py-0.5"><input type="checkbox" data-testid={`petro-prob-vary-${key}`} checked={!!e.vary} onChange={(ev) => setEntry(key, { vary: ev.target.checked })} /></td>
                      <td className="px-2 py-0.5">
                        <select className={selCls} data-testid={`petro-prob-dist-${key}`} value={e.type} disabled={!e.vary} onChange={(ev) => setEntry(key, { type: ev.target.value })}>
                          {DIST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      {[0, 1, 2].map((i) => {
                        const fd = fields[i];
                        if (!fd) return <td key={i} className="px-2 py-0.5" />;
                        return (
                          <td key={fd[0]} className="px-2 py-0.5">
                            <input className={`${cellCls} ${bad ? 'border-red-700' : 'border-slate-800'}`} disabled={!e.vary} title={fd[1]} placeholder={fd[1]}
                              data-testid={`petro-prob-${key}-${fd[0]}`} value={e[fd[0]] ?? ''} onChange={(ev) => setEntry(key, { [fd[0]]: ev.target.value })} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-2 py-1 text-[10px] text-slate-500">
              Triangular takes the parameter&apos;s 10th, 50th and 90th percentiles (fitted, not min/mode/max). Uniform takes min and max. Normal and lognormal take mean and standard deviation.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1 text-slate-400">Draws
                <select className={selCls} data-testid="petro-prob-n" value={n} onChange={(e) => setN(Number(e.target.value))}>
                  {DRAW_CHOICES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1 text-slate-400">Seed
                <input className={`${cellCls} border-slate-800`} style={{ width: 64 }} data-testid="petro-prob-seed" value={seed} onChange={(e) => setSeed(e.target.value)} />
              </label>
              {running ? (
                <Button variant="outline" size="sm" data-testid="petro-prob-cancel" className="border-red-900/60 text-red-300" onClick={onCancel}>Cancel</Button>
              ) : (
                <Button size="sm" data-testid="petro-prob-run" disabled={nProblems > 0 || !varying.length} className="bg-cyan-700 hover:bg-cyan-600 text-white" onClick={run}>
                  Run {n} realisations
                </Button>
              )}
              <span className="text-[11px] text-slate-500" data-testid="petro-prob-state">
                {nProblems ? `${nProblems} entr${nProblems === 1 ? 'y needs' : 'ies need'} fixing: ${Object.values(problems)[0]}` : running ? `${progress?.phase === 'zones' ? 'summarising zones' : 'computing curves'}…` : result ? `${result.draws.n} realisations, seed ${result.draws.seed}, ${varying.length} parameters varied${runMs ? `, ${(runMs / 1000).toFixed(1)} s` : ''}` : `${varying.length} parameter${varying.length === 1 ? '' : 's'} to vary`}
              </span>
            </div>
            {running && <Progress value={pct} className="h-2 bg-slate-800" data-testid="petro-prob-progress" />}

            <div className="rounded border border-slate-800 max-h-[40vh] overflow-auto">
              <table className="text-xs border-collapse min-w-full">
                <thead className="sticky top-0 bg-slate-900">
                  <tr>
                    <th className="text-left px-2 py-1 text-slate-400 font-normal" rowSpan={2}>Zone</th>
                    <th className="text-left px-2 py-1 text-slate-400 font-normal whitespace-nowrap" colSpan={4}>Net pay ({depthUnit}), exceedance cases</th>
                    <th className="text-left px-2 py-1 text-slate-400 font-normal" colSpan={3}>φe avg, percentiles</th>
                    <th className="text-left px-2 py-1 text-slate-400 font-normal" colSpan={3}>Sw avg, percentiles</th>
                    <th className="text-left px-2 py-1 text-slate-400 font-normal" colSpan={3}>k gm (mD), percentiles</th>
                  </tr>
                  <tr>
                    {[OUTCOME_LABELS.p90, OUTCOME_LABELS.p50, OUTCOME_LABELS.p10, 'mean'].map((h) => <th key={`net-${h}`} className="text-left px-2 py-0.5 text-slate-500 font-normal">{h}</th>)}
                    {['phi', 'Sw', 'k'].flatMap((q) => ['q10', 'q50', 'q90'].map((k) => (
                      <th key={`${q}-${k}`} className="text-left px-2 py-0.5 text-slate-500 font-normal whitespace-nowrap" title={parameterPercentileLabel(q, k)}>{k.slice(1)}th</th>
                    )))}
                  </tr>
                </thead>
                <tbody>
                  {!result && <tr><td colSpan={14} className="px-2 py-2 text-slate-500">{zones.length ? 'Run to fill the table.' : 'No zones on this well yet; the run still draws on the tracks.'}</td></tr>}
                  {result?.zones.map((z) => (
                    <tr key={z.name} className="border-t border-slate-800/60" data-testid={`petro-prob-row-zone-${z.name}`}>
                      <td className="px-2 py-0.5 text-slate-300">{z.name}</td>
                      {['p90', 'p50', 'p10', 'mean'].map((k) => <td key={k} className="px-2 py-0.5" data-testid={`petro-prob-net-${z.name}-${k}`}>{fmt(z.outcomes.net_m[k] * F, 1)}</td>)}
                      {['phi_avg', 'sw_avg', 'k_gm_md'].flatMap((f) => ['q10', 'q50', 'q90'].map((k) => (
                        <td key={`${f}-${k}`} className="px-2 py-0.5">{fmt(z.parameters[f][k], f === 'k_gm_md' ? 1 : 3)}</td>
                      )))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result?.zones.map((z) => <Tornado key={z.name} zone={z} depthUnit={depthUnit} />)}
              {result && <p className="px-2 py-1 text-[10px] text-slate-500">{EXCEEDANCE_DEFINITION}</p>}
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center gap-2">
          <span className="mr-auto text-[11px] text-slate-500">Low case Sw is the high Sw value; low case porosity the low value. The band tracks say which in their headers.</span>
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" size="sm" data-testid="petro-prob-csv" disabled={!result || !result.zones.length} className="border-slate-700 text-slate-300" onClick={exportCsv}>Export CSV</Button>
          <Button variant="outline" size="sm" data-testid="petro-prob-publish" disabled={!canPublish || !result}
            title={canPublish ? 'Write the percentile curves and PAY_PROB to the registry' : 'Org-shared wells are read-only'}
            className="border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10" onClick={async () => { await onPublish(); onOpenChange(false); }}>
            Publish
          </Button>
          <Button size="sm" data-testid="petro-prob-apply" disabled={!result} className="bg-cyan-700 hover:bg-cyan-600 text-white" onClick={() => { onApply(); onOpenChange(false); }}>
            Apply to tracks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
