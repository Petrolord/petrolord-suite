// Placement tab: run the plug-flow simulation, pressure/ECD charts, final
// state, quality checklist, report exports, run history.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Play, Save, Download, FileText, Trash2, Check, X, AlertTriangle } from 'lucide-react';
import { PlacementChart, EcdChart } from '../charts/CmtCharts';
import {
  pressureOut, pressureLabel, emwOut, emwLabel, depthOut, depthLabel,
} from '../services/cmtRun';

function Kpi({ label, value, unit, testId, warn }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${warn ? 'border-pl-warning/40 bg-pl-warning-bg' : 'border-pl-border bg-pl-surface'}`}>
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-pl-muted">{warn && <AlertTriangle className="h-3 w-3 shrink-0 text-pl-warning-text" aria-label="Warning" />}{label}</div>
      <div className={`font-pl-mono text-sm font-semibold tabular-nums ${warn ? 'text-pl-warning-text' : 'text-pl-text'}`} data-testid={testId}>
        {value}<span className="ml-1 text-[10px] font-normal text-pl-muted">{unit}</span>
      </div>
    </div>
  );
}

export default function PlacementTab({
  placementResult, checklist, depthUnit, fracEmwKgM3, onRun, running, error,
  onSaveRun, savingRun, runs, onDeleteRun, onExportCsv, onExportPdf,
}) {
  const placement = placementResult?.placement || null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-8" onClick={onRun} disabled={running} data-testid="cmt-run">
          <Play className="mr-1 h-3.5 w-3.5" /> {running ? 'Simulating…' : 'Simulate placement'}
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={onSaveRun} disabled={!placement || savingRun} data-testid="cmt-save-run">
          <Save className="mr-1 h-3.5 w-3.5" /> Save run
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={onExportCsv} disabled={!placement}>
          <Download className="mr-1 h-3.5 w-3.5" /> CSV
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={onExportPdf} disabled={!placement} data-testid="cmt-pdf">
          <FileText className="mr-1 h-3.5 w-3.5" /> Job report PDF
        </Button>
        {error && <span className="text-xs text-pl-danger-text" data-testid="cmt-error">{error}</span>}
      </div>

      {placement && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Kpi label="End pump pressure" testId="cmt-pump-end" unit={pressureLabel(depthUnit)}
            value={pressureOut(placement.endPumpPressurePa, depthUnit).toFixed(0)} />
          <Kpi label="Max ECD at prev shoe" testId="cmt-ecd-max" unit={emwLabel(depthUnit)}
            value={placement.maxEcdPrevShoeKgM3 != null ? emwOut(placement.maxEcdPrevShoeKgM3, depthUnit).toFixed(3) : '--'}
            warn={fracEmwKgM3 != null && placement.maxEcdPrevShoeKgM3 > fracEmwKgM3} />
          <Kpi label="Achieved TOC" testId="cmt-toc-final" unit={depthLabel(depthUnit)}
            value={placement.achievedTocMd != null ? depthOut(placement.achievedTocMd, depthUnit).toFixed(0) : '--'} />
          <Kpi label="Float differential" unit={pressureLabel(depthUnit)}
            value={pressureOut(placement.floatDiffPa, depthUnit).toFixed(0)}
            warn={placement.floatDiffPa < 0} />
          <Kpi label="Free fall" testId="cmt-freefall" unit=""
            value={placement.freeFall ? 'yes' : 'no'} warn={placement.freeFall} />
        </div>
      )}

      {placement && placement.warnings.length > 0 && (
        <div className="rounded-md border border-pl-warning/40 bg-pl-warning-bg p-2 text-xs text-pl-warning-text">
          {placement.warnings.map((w) => <div key={w}>• {w}</div>)}
        </div>
      )}

      {placement && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2" style={{ minHeight: 400 }}>
          <PlacementChart placement={placement} depthUnit={depthUnit} />
          <EcdChart placement={placement} fracEmwKgM3={fracEmwKgM3} depthUnit={depthUnit} />
        </div>
      )}

      {checklist && (
        <div className="rounded-lg border border-pl-border bg-pl-surface p-3" data-testid="cmt-checklist">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-pl-text">
            Placement quality checklist ({checklist.passed}/{checklist.total})
          </h3>
          {checklist.items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 border-t border-pl-border py-1 text-xs first:border-t-0">
              {item.ok
                ? <Check className="h-3.5 w-3.5 shrink-0 text-pl-success-text" />
                : <X className="h-3.5 w-3.5 shrink-0 text-pl-warning-text" />}
              <span className={item.ok ? 'text-pl-text' : 'text-pl-warning-text'}>{item.detail}</span>
            </div>
          ))}
        </div>
      )}

      {placement && (
        <div className="rounded-lg border border-pl-border bg-pl-surface p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-pl-text">Final annulus</h3>
          <table className="w-full text-xs text-pl-text">
            <thead>
              <tr className="text-[10px] uppercase text-pl-muted">
                <th className="p-1 text-right">From ({depthLabel(depthUnit)})</th>
                <th className="p-1 text-right">To ({depthLabel(depthUnit)})</th>
                <th className="p-1 text-left">Fluid</th>
                <th className="p-1 text-right">Density ({emwLabel(depthUnit)})</th>
              </tr>
            </thead>
            <tbody>
              {placement.annulusEnd.map((s, i) => (
                <tr key={i} className="border-t border-pl-border">
                  <td className="p-1 text-right">{depthOut(s.fromMd, depthUnit).toFixed(0)}</td>
                  <td className="p-1 text-right">{depthOut(s.toMd, depthUnit).toFixed(0)}</td>
                  <td className="p-1">{s.kind}</td>
                  <td className="p-1 text-right">{emwOut(s.densityKgM3, depthUnit).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border border-pl-border bg-pl-surface p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-pl-text">Run history</h3>
        {(!runs || runs.length === 0) && <div className="text-xs text-pl-muted">No saved runs yet.</div>}
        {(runs || []).map((r) => (
          <div key={r.id} className="flex items-center justify-between border-t border-pl-border py-1.5 text-xs text-pl-text first:border-t-0">
            <span>
              {new Date(r.created_at).toLocaleString()}: TOC {r.summary?.achievedTocMd != null ? depthOut(r.summary.achievedTocMd, depthUnit).toFixed(0) : '--'} {depthLabel(depthUnit)},
              max ECD {r.summary?.maxEcdPrevShoeKgM3 != null ? emwOut(r.summary.maxEcdPrevShoeKgM3, depthUnit).toFixed(2) : '--'} {emwLabel(depthUnit)}
            </span>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-pl-muted hover:text-pl-danger-text" onClick={() => onDeleteRun(r.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
