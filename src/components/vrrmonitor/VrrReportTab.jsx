// The Report tab (VRR-U1; reviewer lens RL1 to RL12): the identification a
// reviewer signs against, then the same model the PDF prints (headline,
// inputs with sources, the voidage ledger by term, limits, the figure
// list), the PDF and the ledger CSV with its provenance header.
import React, { useMemo, useState } from 'react';
import { FileDown, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';
import { buildLabel } from '@/lib/platformBuild';
import { IDENTIFICATION } from '@/utils/vrr/reportModel';
import { collectVrrReportArgs, exportVrrPdf } from '@/utils/vrr/vrrReportExport';
import { buildLedgerCsv, ledgerCsvName } from '@/utils/vrr/ledgerCsv';
import { downloadText } from './download';

const SmallTable = ({ head, rows, testId }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs" data-testid={testId}>
      <thead><tr className="text-left text-pl-muted">{head.map((h) => <th key={h} className="pr-3 py-1 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-pl-border align-top">
            {r.map((c, j) => <td key={j} className={`pr-3 py-1 ${j > 0 && /^[-\d.,]+$/.test(String(c)) ? 'text-right font-pl-mono tabular-nums' : ''}`}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const VrrReportTab = () => {
  const ctx = useVrrMonitor();
  const { inputs, setIdentificationField, projectName, organizationName, u, addNotification, canWrite } = ctx;
  const [busy, setBusy] = useState(false);
  const args = useMemo(
    () => collectVrrReportArgs({ inputs, derived: ctx, system: u.system, projectName, organizationName, build: buildLabel() }),
    // the derived state is a pure function of the inputs
    [inputs, u.system, projectName, organizationName], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const { model, figures } = args;
  const id = inputs.identification || {};

  const exportPdf = async () => {
    setBusy(true);
    const ok = await exportVrrPdf(args, { projectName });
    setBusy(false);
    addNotification(ok ? 'Report saved as PDF.' : 'The report could not be built.', ok ? 'success' : 'error');
  };

  return (
    <div className="space-y-4" data-testid="vrr-report-tab">
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Voidage Replacement Report</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" disabled={!model} data-testid="vrr-ledger-csv" onClick={() => downloadText(buildLedgerCsv(args, { projectName }), ledgerCsvName({ projectName }))}>
              <Table2 className="w-4 h-4 mr-1" /> Ledger CSV
            </Button>
            <Button size="sm" disabled={!model || busy} data-testid="vrr-report-export" onClick={exportPdf}>
              <FileDown className="w-4 h-4 mr-1" /> Export PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {IDENTIFICATION.map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`vrr-id-${key}`} className="text-xs text-pl-muted">{label}</Label>
                <Input
                  id={`vrr-id-${key}`} className="h-8" value={id[key] || ''} disabled={!canWrite}
                  placeholder={key === 'company' ? (organizationName || 'Your organisation') : key === 'dataSource' ? 'e.g. monthly allocation, production accounting' : ''}
                  onChange={(e) => setIdentificationField(key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="vrr-id-notes" className="text-xs text-pl-muted">Notes printed in the report</Label>
            <Textarea id="vrr-id-notes" rows={2} value={id.notes || ''} disabled={!canWrite} onChange={(e) => setIdentificationField('notes', e.target.value)} />
          </div>
          {!model && <p className="text-sm text-pl-muted">Nothing to report yet: import a ledger or fill the period grid.</p>}
        </CardContent>
      </Card>

      {model && (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Headline results</CardTitle></CardHeader>
            <CardContent><SmallTable head={model.headline.head} rows={model.headline.rows} testId="vrr-report-headline" /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Inputs and their sources</CardTitle></CardHeader>
            <CardContent>
              <SmallTable head={['Input', 'Value', 'Unit', 'Source and quality']} rows={model.inputs.rows.map((r) => [r.label, r.value, r.unit, r.source])} testId="vrr-report-inputs" />
              <p className="text-xs text-pl-muted mt-2">{model.inputs.note} Sources of the constant FVF set are stated in the left rail of the Data &amp; PVT tab.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Voidage ledger by period</CardTitle></CardHeader>
            <CardContent>
              <SmallTable head={model.ledger.head} rows={model.ledger.rows} testId="vrr-report-ledger" />
              <p className="text-xs text-pl-muted mt-2">{model.ledger.note}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Limits of this analysis</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-1" data-testid="vrr-report-limits">
              {model.limits.assumptions.map((a) => <p key={a}>{a}</p>)}
              <p className="font-semibold pt-1">Flags</p>
              {model.limits.flags.length ? model.limits.flags.map((f) => <p key={f} className="text-pl-warning-text">{f}</p>) : <p>{model.limits.noFlagsText}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Figures</CardTitle></CardHeader>
            <CardContent>
              <ol className="list-decimal list-inside text-xs space-y-0.5" data-testid="vrr-report-figures">
                {figures.map((f) => <li key={f.id}>{f.title}{f.statement ? `: ${f.statement}` : ''}</li>)}
              </ol>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default VrrReportTab;
