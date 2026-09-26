// Analysis tab: run panel, KPI band, broomstick + torque + side-force
// charts, immutable run history (wp_td_runs), CSV/PDF export.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Play, Save, Download, FileText, Trash2 } from 'lucide-react';
import { BroomstickChart, TorqueChart, SideForceChart, OP_LABELS } from '../charts/TdCharts';
import { forceOut, torqueOut, depthOut, forceLabel, torqueLabel, depthLabel } from '../services/tdRun';
import { exportRunCsv, exportRunPdf } from '../services/tdExport';

function Kpi({ label, value, unit, testId, warn }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${warn ? 'border-red-700 bg-red-950/40' : 'border-slate-800 bg-slate-900/60'}`}>
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm font-semibold ${warn ? 'text-red-300' : 'text-slate-100'}`} data-testid={testId}>
        {value}<span className="ml-1 text-[10px] font-normal text-slate-500">{unit}</span>
      </div>
    </div>
  );
}

export default function AnalysisTab({
  run, wear, depthUnit, onRun, onSaveRun, running, savingRun,
  runs, onDeleteRun, caseName, wellboreName, error,
}) {
  const results = run?.results || null;
  const tripOut = results?.trip_out;
  const rotating = results?.rotate_on_bottom || results?.rotate_off_bottom;
  // TD-T1-001: each warning names its operation (two unnamed "buckled
  // interval starts at ..." lines could not be told apart), the buckling
  // onset says which operation buckles first, and a negative surface load is
  // called what it is: the string would have to be pushed from surface.
  const entries = results ? Object.entries(results) : [];
  const firstBuck = entries
    .filter(([, r]) => r.summary.bucklingFirstMd != null)
    .sort((a, b) => a[1].summary.bucklingFirstMd - b[1].summary.bucklingFirstMd)[0] || null;
  const anyBuckMd = firstBuck ? firstBuck[1].summary.bucklingFirstMd : null;
  const opName = (op) => OP_LABELS[op] || op;
  const lockups = entries
    .filter(([, r]) => Number.isFinite(r.summary.hookloadN) && r.summary.hookloadN < 0)
    .map(([op, r]) => {
      const head = `${opName(op)}: the surface load is ${forceOut(r.summary.hookloadN, depthUnit).toFixed(1)} ${forceLabel(depthUnit)}. `
        + 'The string would have to be pushed from surface';
      return op === 'trip_in' || op === 'rotate_off_bottom'
        ? `${head}, so the pipe will not run in under its own weight. Reduce friction, add weight in the vertical section, or rotate while running.`
        : `${head}, so this operation cannot reach its planned weight on bit (lockup). Reduce friction or WOB, add weight in the vertical section, or rotate.`;
    });
  const warnings = [
    ...lockups,
    ...entries.flatMap(([op, r]) => (r.summary.warnings || []).map((w) => `${opName(op)}: ${w}`)),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-8 bg-lime-500 text-slate-900 hover:bg-lime-600" onClick={onRun} disabled={running} data-testid="td-run">
          <Play className="mr-1 h-3.5 w-3.5" /> {running ? 'Running…' : 'Run analysis'}
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={onSaveRun} disabled={!results || savingRun} data-testid="td-save-run">
          <Save className="mr-1 h-3.5 w-3.5" /> Save run
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={() => exportRunCsv(results, depthUnit)} disabled={!results}>
          <Download className="mr-1 h-3.5 w-3.5" /> CSV
        </Button>
        <Button size="sm" variant="outline" className="h-8"
          onClick={() => exportRunPdf({ results, wear, caseName, wellboreName, depthUnit })} disabled={!results}>
          <FileText className="mr-1 h-3.5 w-3.5" /> PDF
        </Button>
        {error && <span className="text-xs text-red-400" data-testid="td-error">{error}</span>}
      </div>

      {results && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Kpi label="Pickup hookload" testId="td-hookload" unit={forceLabel(depthUnit)}
            value={tripOut ? forceOut(tripOut.summary.hookloadN, depthUnit).toFixed(1) : '--'} />
          <Kpi label="Surface torque" testId="td-torque" unit={torqueLabel(depthUnit)}
            value={rotating ? torqueOut(rotating.summary.surfaceTorqueNm, depthUnit).toFixed(2) : '--'} />
          <Kpi label={firstBuck ? `Buckling onset (${opName(firstBuck[0])})` : 'Buckling onset'} testId="td-buckmd" unit={anyBuckMd != null ? depthLabel(depthUnit) : ''}
            value={anyBuckMd != null ? depthOut(anyBuckMd, depthUnit).toFixed(0) : 'none'}
            warn={anyBuckMd != null} />
          <Kpi label="Max wall loss" testId="td-wear" unit="%"
            value={wear ? wear.summary.maxWallLossPct.toFixed(1) : '--'} />
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-800 bg-amber-950/40 p-2 text-xs text-amber-300">
          {[...new Set(warnings)].map((w) => <div key={w}>• {w}</div>)}
        </div>
      )}

      {results && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3" style={{ minHeight: 420 }}>
          <BroomstickChart results={results} depthUnit={depthUnit} />
          <TorqueChart results={results} depthUnit={depthUnit} />
          <SideForceChart results={results} depthUnit={depthUnit} />
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Run history</h3>
        {(!runs || runs.length === 0) && <div className="text-xs text-slate-500">No saved runs yet.</div>}
        {(runs || []).map((r) => (
          <div key={r.id} className="flex items-center justify-between border-t border-slate-800 py-1.5 text-xs text-slate-300 first:border-t-0">
            <span>{new Date(r.created_at).toLocaleString()}: {Object.keys(r.summary || {}).length ? Object.entries(r.summary).map(([op, s]) => `${op}: ${forceOut(s.hookloadN, depthUnit).toFixed(0)} ${forceLabel(depthUnit)}`).join('  ') : r.engine_version}</span>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-500 hover:text-red-400" onClick={() => onDeleteRun(r.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
