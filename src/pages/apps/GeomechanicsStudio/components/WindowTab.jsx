// Mud Window tab: stability window along the definitive trajectory,
// exports, immutable run history.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Play, Save, Download, FileText, Trash2 } from 'lucide-react';
import { MudWindowChart } from '../charts/GmCharts';
import { emwOut, emwLabel, depthOut, depthLabel } from '../services/gmRun';

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

export default function WindowTab({
  win, depthUnit, onRun, running, error, onSaveRun, savingRun,
  runs, onDeleteRun, onExportCsv, onExportPdf,
}) {
  const last = win?.rows?.[win.rows.length - 1] || null;
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-8 bg-lime-500 text-slate-900 hover:bg-lime-600" onClick={onRun} disabled={running} data-testid="gm-run-window">
          <Play className="mr-1 h-3.5 w-3.5" /> {running ? 'Computing…' : 'Compute mud window'}
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={onSaveRun} disabled={!win || savingRun} data-testid="gm-save-run">
          <Save className="mr-1 h-3.5 w-3.5" /> Save run
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={onExportCsv} disabled={!win}>
          <Download className="mr-1 h-3.5 w-3.5" /> CSV
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={onExportPdf} disabled={!win}>
          <FileText className="mr-1 h-3.5 w-3.5" /> PDF
        </Button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {win && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Kpi label="Collapse at TD" testId="gm-collapse-td" unit={emwLabel(depthUnit)}
            value={last ? emwOut(last.collapseEmwKgM3, depthUnit).toFixed(3) : '--'} />
          <Kpi label="Frac initiation at TD" testId="gm-fracinit-td" unit={emwLabel(depthUnit)}
            value={last ? emwOut(last.fracInitEmwKgM3, depthUnit).toFixed(3) : '--'} />
          <Kpi label="Tightest window" testId="gm-window-min" unit={emwLabel(depthUnit)}
            value={win.tightest ? emwOut(win.tightest.widthKgM3, depthUnit).toFixed(3) : '--'}
            warn={win.tightest && win.tightest.widthKgM3 < 60} />
          <Kpi label="Tightest at" unit={depthLabel(depthUnit)}
            value={win.tightest ? depthOut(win.tightest.md, depthUnit).toFixed(0) : '--'}
            warn={win.inversionMd != null} />
        </div>
      )}

      {win && win.warnings.length > 0 && (
        <div className="rounded-md border border-red-800 bg-red-950/40 p-2 text-xs text-red-300">
          {win.warnings.map((w) => <div key={w}>• {w}</div>)}
        </div>
      )}

      {win && (
        <div className="min-h-0 flex-1" style={{ minHeight: 440 }}>
          <MudWindowChart window={win} depthUnit={depthUnit} />
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Run history</h3>
        {(!runs || runs.length === 0) && <div className="text-xs text-slate-500">No saved runs yet.</div>}
        {(runs || []).map((r) => (
          <div key={r.id} className="flex items-center justify-between border-t border-slate-800 py-1.5 text-xs text-slate-300 first:border-t-0">
            <span>
              {new Date(r.created_at).toLocaleString()} — tightest {r.summary?.tightestWidthKgM3 != null ? emwOut(r.summary.tightestWidthKgM3, depthUnit).toFixed(2) : '--'} {emwLabel(depthUnit)},
              quality {r.summary?.qualityScore ?? '--'}
            </span>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-500 hover:text-red-400" onClick={() => onDeleteRun(r.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
