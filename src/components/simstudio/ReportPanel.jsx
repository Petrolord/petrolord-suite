// Report tab (SIM-U1; RL1 to RL12): the rows the PDF prints, from the same
// model (reportModel.js), for the chosen completed run; the figure list with
// each figure drawn or its reason; Export PDF and the results CSV.
import React, { useEffect, useMemo, useState } from 'react';
import { FileDown, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSimStudio } from '@/contexts/SimStudioContext';
import { collectSimReportArgs, exportSimPdf } from '@/utils/simstudio/reportExport';
import { buildResultsCsv } from '@/utils/simstudio/resultsCsv';
import { sha256Hex } from '@/lib/simService';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { buildLabel } from '@/lib/platformBuild';

const KvTable = ({ rows, testId }) => (
  <table className="w-full text-xs" data-testid={testId}>
    <tbody>
      {rows.map(([k, v], i) => (
        <tr key={i} className="border-b border-pl-border align-top">
          <td className="py-1 pr-3 text-pl-muted w-1/3">{k}</td>
          <td className="py-1 text-pl-text break-words [overflow-wrap:anywhere]">{v || EMPTY_VALUE}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const Grid = ({ head, rows, testId }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs" data-testid={testId}>
      <thead><tr className="text-pl-muted text-left">{head.map((h) => <th key={h} className="py-1 pr-3 font-normal">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-pl-border">{r.map((c, j) => <td key={j} className="py-1 pr-3 text-pl-text">{c}</td>)}</tr>)}</tbody>
    </table>
  </div>
);

const ReportPanel = () => {
  const {
    activeCase, runs, summary, summaryRunId, loadResults, deckText, form, system, organizationName, addNotification,
  } = useSimStudio();
  const completeRuns = useMemo(() => runs.filter((r) => r.status === 'complete' && r.result_path), [runs]);
  const run = completeRuns.find((r) => r.id === summaryRunId) || null;
  useEffect(() => {
    if (!summaryRunId && completeRuns[0]) loadResults(completeRuns[0]);
  }, [summaryRunId, completeRuns, loadResults]);
  const [deckSha, setDeckSha] = useState(null);
  useEffect(() => {
    let alive = true;
    if (deckText) sha256Hex(deckText).then((h) => { if (alive) setDeckSha(h); });
    else setDeckSha(null);
    return () => { alive = false; };
  }, [deckText]);

  const args = useMemo(() => (run && summary ? collectSimReportArgs({
    caseRow: activeCase, run, summary, deckText, deckTextSha: deckSha, form, system, organizationName, build: buildLabel(),
  }) : null), [activeCase, run, summary, deckText, deckSha, form, system, organizationName]);
  const m = args?.model;

  if (!activeCase) {
    return <Card><CardContent className="py-10 text-center text-sm text-pl-muted">Open a case to see its report.</CardContent></Card>;
  }
  if (!m) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-pl-muted" data-testid="sim-report-empty">
          {completeRuns.length ? 'Loading the run.' : 'The report needs a completed run. Queue one on the Runs tab.'}
        </CardContent>
      </Card>
    );
  }

  const exportPdf = async () => {
    const ok = await exportSimPdf(args, { caseName: activeCase.name });
    addNotification(ok ? 'Report exported' : 'The report could not be built; see the browser console.', ok ? 'success' : 'error');
  };
  const exportCsv = () => {
    const blob = new Blob([buildResultsCsv({ summary, run, caseRow: activeCase, system, deckSystem: m.deckSystem })], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeCase.name || 'simulation'}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4" data-testid="sim-report">
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0 flex-wrap gap-2">
          <CardTitle className="text-base">Report: {activeCase.name}</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={summaryRunId || ''} data-testid="report-run-select"
              onChange={(e) => { const r = completeRuns.find((x) => x.id === e.target.value); if (r) loadResults(r); }}
              className="h-7 rounded-md border border-pl-border-strong bg-pl-surface px-2 text-xs text-pl-text">
              {completeRuns.map((r) => <option key={r.id} value={r.id}>{new Date(r.queued_at).toLocaleString()}</option>)}
            </select>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={exportCsv} data-testid="report-csv"><Download className="w-3 h-3 mr-1" /> CSV</Button>
            <Button size="sm" className="h-7 text-xs" onClick={exportPdf} data-testid="report-export"><FileDown className="w-3 h-3 mr-1" /> Export PDF</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <KvTable rows={m.identification} testId="report-identification" />
          <p className="text-[11px] text-pl-muted">{m.displayUnits}</p>
        </CardContent>
      </Card>

      <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Headline results</CardTitle></CardHeader>
        <CardContent><Grid head={m.headline.head} rows={m.headline.rows} testId="report-headline" /></CardContent></Card>

      <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Material balance (from the simulator&apos;s PRT)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {m.materialBalance.reported && <Grid head={m.materialBalance.head} rows={m.materialBalance.rows} testId="report-mb" />}
          <p className={`text-xs ${m.materialBalance.reported && m.materialBalance.closes ? 'text-pl-success-text' : 'text-pl-warning-text'}`} data-testid="report-mb-text">{m.materialBalance.text}</p>
        </CardContent></Card>

      <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Convergence (from the simulator&apos;s PRT)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {m.convergence.reported && <KvTable rows={m.convergence.rows} testId="report-convergence" />}
          <p className="text-xs text-pl-muted" data-testid="report-convergence-text">{m.convergence.text}</p>
        </CardContent></Card>

      {(m.bhpMatch.applies || m.deckSummary?.schedule?.historyControls) && (
        <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Bottomhole pressure match (history phase)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {m.bhpMatch.applies && <Grid head={m.bhpMatch.head} rows={m.bhpMatch.rows} testId="report-bhp" />}
            <p className="text-xs text-pl-muted" data-testid="report-bhp-text">{m.bhpMatch.text}</p>
          </CardContent></Card>
      )}

      <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Run provenance</CardTitle></CardHeader>
        <CardContent><KvTable rows={m.provenance} testId="report-provenance" /></CardContent></Card>

      <Card><CardHeader className="pb-1"><CardTitle className="text-sm">What the deck holds</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <KvTable rows={m.deck} testId="report-deck" />
          {m.wells.length > 0 && <Grid head={m.wellsHead} rows={m.wells} testId="report-wells" />}
        </CardContent></Card>

      <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Model Builder inputs and their sources</CardTitle></CardHeader>
        <CardContent>
          {m.inputs
            ? <Grid head={['Input', 'Value', 'Unit', 'Source and quality']} rows={m.inputs.rows.map((r) => [r.label, r.value, r.unit, r.source])} testId="report-inputs" />
            : <p className="text-xs text-pl-muted" data-testid="report-inputs-why">Not shown: {m.inputsWhy}</p>}
        </CardContent></Card>

      <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Limits of this analysis</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-xs text-pl-text">
          <ul className="list-disc pl-4 space-y-1">{m.limits.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
          <div className="font-semibold pt-1">Flags on this run</div>
          {m.limits.flags.length
            ? <ul className="list-disc pl-4 space-y-1 text-pl-warning-text" data-testid="report-flags">{m.limits.flags.map((a, i) => <li key={i}>{a}</li>)}</ul>
            : <p className="text-pl-muted" data-testid="report-flags">{m.limits.noFlagsText}</p>}
        </CardContent></Card>

      <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Figures in the PDF</CardTitle></CardHeader>
        <CardContent>
          <ol className="list-decimal pl-4 space-y-1 text-xs" data-testid="report-figures">
            {args.figures.map((f) => (
              <li key={f.id}><span className="text-pl-text">{f.title}</span>{f.statement ? <span className="text-pl-muted">: {f.statement}</span> : <span className="text-pl-muted">: drawn on the calendar axis (the series of the Results tab)</span>}</li>
            ))}
          </ol>
        </CardContent></Card>
    </div>
  );
};

export default ReportPanel;
