// The Report tab (EOR-U1; reviewer lens RL1 to RL12): the identification a
// reviewer signs against, then the same model the PDF prints (ranking,
// inputs with sources, limits and flags, the figure list), and the PDF.
import React, { useMemo, useState } from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { buildLabel } from '@/lib/platformBuild';
import { IDENTIFICATION } from '@/utils/eor/reportModel';
import { collectEorReportArgs, exportEorPdf } from '@/utils/eor/eorReportExport';
import { useEorScreening } from '@/contexts/EorScreeningContext';

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

const EorReportTab = () => {
  const { inputs, results, setIdentificationField, projectName, organizationName, u, addNotification, canWrite } = useEorScreening();
  const [busy, setBusy] = useState(false);
  const args = useMemo(
    () => collectEorReportArgs(inputs, { projectName, organizationName, build: buildLabel(), system: u.system, results }),
    [inputs, projectName, organizationName, u.system, results],
  );
  const { model } = args;
  const id = inputs.identification || {};
  const exportPdf = async () => {
    setBusy(true);
    const ok = await exportEorPdf(args, { projectName });
    setBusy(false);
    addNotification(ok ? 'Report saved as PDF.' : 'The report could not be built.', ok ? 'success' : 'error');
  };
  return (
    <div className="space-y-4" data-testid="eor-report-tab">
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">EOR Screening Report</CardTitle>
          <Button size="sm" disabled={busy} data-testid="eor-report-export" onClick={exportPdf}>
            <FileDown className="w-4 h-4 mr-1" /> Export PDF
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {IDENTIFICATION.map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`eor-id-${key}`} className="text-xs text-pl-muted">{label}</Label>
                <Input
                  id={`eor-id-${key}`} className="h-8" value={id[key] || ''} disabled={!canWrite}
                  placeholder={key === 'company' ? (organizationName || 'Your organisation') : key === 'dataDate' ? 'e.g. 2026-09-30' : ''}
                  onChange={(e) => setIdentificationField(key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="eor-id-notes" className="text-xs text-pl-muted">Notes printed in the report</Label>
            <Textarea id="eor-id-notes" rows={2} value={id.notes || ''} disabled={!canWrite} onChange={(e) => setIdentificationField('notes', e.target.value)} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Ranking of the methods</CardTitle></CardHeader>
        <CardContent>
          <SmallTable head={model.ranking.head} rows={model.ranking.rows} testId="eor-report-ranking" />
          <p className="text-xs text-pl-muted mt-2">{model.ranking.note}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Inputs and their sources</CardTitle></CardHeader>
        <CardContent>
          <SmallTable head={['Input', 'Value', 'Unit', 'Source and quality']} rows={model.inputs.rows.map((r) => [r.label, r.value, r.unit, r.source])} testId="eor-report-inputs" />
          <p className="text-xs text-pl-muted mt-2">{model.inputs.note}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Criteria used</CardTitle></CardHeader>
        <CardContent>
          <SmallTable head={model.edition.head} rows={model.edition.rows} testId="eor-report-edition" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Limits of this analysis</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1" data-testid="eor-report-limits">
          {model.limits.assumptions.map((a) => <p key={a}>{a}</p>)}
          <p className="font-semibold pt-1">Flags on the inputs</p>
          {model.limits.flags.length ? model.limits.flags.map((f) => <p key={f} className="text-pl-warning-text">{f}</p>) : <p>{model.limits.noFlagsText}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Figures</CardTitle></CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside text-xs space-y-0.5" data-testid="eor-report-figures">
            {model.figures.map((f) => <li key={f.id}>{f.title}{f.statement ? `: ${f.statement}` : ''}</li>)}
          </ol>
          <p className="text-xs text-pl-muted mt-2">The PDF also prints each method criterion by criterion, as on the Screening tab.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default EorReportTab;
