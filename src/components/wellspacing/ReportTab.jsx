// The Report tab (WS-U1; reviewer lens RL1 to RL12): the identification a
// reviewer signs against, then the same model the PDF prints (inputs with
// sources, methods, limits and flags, the figure list), and the PDF.
import React, { useMemo, useState } from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { buildLabel } from '@/lib/platformBuild';
import { IDENTIFICATION } from '@/utils/wellspacing/reportModel';
import { collectWellSpacingReportArgs, exportWellSpacingPdf } from '@/utils/wellspacing/reportExport';
import { useWellSpacing } from '@/contexts/WellSpacingContext';

const SmallTable = ({ head, rows, testId }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs" data-testid={testId}>
      <thead><tr className="text-left text-pl-muted">{head.map((h) => <th key={h} className="pr-3 py-1 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-pl-border align-top">
            {r.map((c, j) => <td key={j} className="pr-3 py-1">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const ReportTab = () => {
  const { inputs, results, setIdentificationField, projectName, organizationName, u, addNotification, canWrite, mc, runMonteCarlo } = useWellSpacing();
  const [busy, setBusy] = useState(false);
  const args = useMemo(
    () => collectWellSpacingReportArgs(inputs, { results, projectName, organizationName, build: buildLabel(), system: u.system, mc }),
    [inputs, results, projectName, organizationName, u.system, mc],
  );
  const { model } = args;
  const id = inputs.identification || {};
  const exportPdf = async () => {
    setBusy(true);
    // WS-U2-008: the PDF carries the uncertainty of the inputs on screen: run it now if it is asked for and not current
    let use = args;
    if (results && args.model.uncertainty.given && !mc) {
      const fresh = runMonteCarlo();
      use = collectWellSpacingReportArgs(inputs, { results, projectName, organizationName, build: buildLabel(), system: u.system, mc: fresh });
    }
    const ok = await exportWellSpacingPdf(use, { projectName });
    setBusy(false);
    addNotification(ok ? 'Report saved as PDF.' : 'The report could not be built.', ok ? 'success' : 'error');
  };
  return (
    <div className="space-y-4" data-testid="ws-report-tab">
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Well Spacing Report</CardTitle>
          <Button size="sm" disabled={busy} data-testid="ws-report-export" onClick={exportPdf}>
            <FileDown className="w-4 h-4 mr-1" /> Export PDF
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {!model.hasResults && <p className="text-xs text-pl-warning-text" data-testid="ws-report-no-cases">No case is computed yet: the PDF will print the inputs and say why the cases and figures are missing.</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {IDENTIFICATION.map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`ws-id-${key}`} className="text-xs text-pl-muted">{label}</Label>
                <Input
                  id={`ws-id-${key}`} className="h-8" value={id[key] || ''} disabled={!canWrite}
                  placeholder={key === 'company' ? (organizationName || 'Your organisation') : key === 'field' ? (inputs.form.fieldName || '') : key === 'dataDate' ? 'e.g. 2026-09-30' : ''}
                  onChange={(e) => setIdentificationField(key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="ws-id-notes" className="text-xs text-pl-muted">Notes printed in the report</Label>
            <Textarea id="ws-id-notes" rows={2} value={id.notes || ''} disabled={!canWrite} onChange={(e) => setIdentificationField('notes', e.target.value)} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Inputs and their sources</CardTitle></CardHeader>
        <CardContent>
          <SmallTable head={['Input', 'Value', 'Unit', 'Source and quality']} rows={model.inputs.rows.map((r) => [r.label, r.value, r.unit, r.source])} testId="ws-report-inputs" />
          <p className="text-xs text-pl-muted mt-2">{model.inputs.note}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Methods and references</CardTitle></CardHeader>
        <CardContent><SmallTable head={model.methods.head} rows={model.methods.rows} testId="ws-report-methods" /></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Limits of this analysis</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1" data-testid="ws-report-limits">
          {model.limits.assumptions.map((a) => <p key={a}>{a}</p>)}
          <p className="font-semibold pt-1">Flags on the inputs and the cases</p>
          {model.limits.flags.length ? model.limits.flags.map((f) => <p key={f} className="text-pl-warning-text">{f}</p>) : <p>{model.limits.noFlagsText}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Figures</CardTitle></CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside text-xs space-y-0.5" data-testid="ws-report-figures">
            {model.figures.map((f) => <li key={f.id}>{f.title}{f.statement ? `: ${f.statement}` : ''}</li>)}
          </ol>
          <p className="text-xs text-pl-muted mt-2">The PDF also prints the case table, the economics by part, the incremental economics, the drainage table and the cross-checks, as on the Study tab.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportTab;
