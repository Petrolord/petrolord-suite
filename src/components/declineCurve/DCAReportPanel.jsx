// The Report tab (DCA-U1-002, RL4 and RL12): who the report names, then the
// same rows the PDF prints, from the same model (collectDcaReportArgs), and
// the Export button. A fit or a forecast that is out of date is refused
// here with the reason, as the PDF is.
import React, { useMemo, useState } from 'react';
import { FileDown, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { useDcaUnits } from '@/components/declineCurve/DcaUnits';
import { collectDcaReportArgs, exportDcaPdf, identificationOf, dcaFigures } from '@/utils/declineCurve/dcaReport';
import { buildLabel } from '@/lib/platformBuild';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const useOrganizationName = () => {
  try {
    return useAuth()?.organization?.name || '';
  } catch {
    return '';
  }
};

const ID_FIELDS = [
  ['company', 'Company', 'from your organisation'],
  ['field', 'Field', ''],
  ['licence', 'Licence or block', ''],
  ['reservoir', 'Reservoir or zone', ''],
  ['analyst', 'Analyst', ''],
];

const Table = ({ title, head, rows, testId, note }) => (
  <section className="space-y-1" data-testid={testId}>
    <h4 className="text-xs font-semibold text-pl-text">{title}</h4>
    <div className="overflow-x-auto rounded border border-pl-border">
      <table className="w-full text-[11px]">
        <thead className="bg-pl-sunken text-pl-muted"><tr>{head.map((h) => <th key={h} className="text-left px-2 py-1 font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-pl-border">{r.map((c, j) => <td key={j} className="px-2 py-1 text-pl-text align-top">{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
    {note ? <p className="text-[10px] text-pl-muted">{note}</p> : null}
  </section>
);

const DCAReportPanel = () => {
  const { currentWell, currentProject, selectedStream, updateIdentification, status, addNotification, canWrite } = useDeclineCurve();
  const u = useDcaUnits();
  const organizationName = useOrganizationName();
  const [busy, setBusy] = useState(false);
  const model = useMemo(() => collectDcaReportArgs({
    project: currentProject, well: currentWell, stream: selectedStream, u, organizationName, build: buildLabel(),
  }), [currentProject, currentWell, selectedStream, u, organizationName, status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentWell) {
    return <div className="text-sm text-pl-muted p-4">Select a well to build its report.</div>;
  }
  const id = identificationOf(currentWell, { organizationName });

  const exportPdf = async () => {
    if (!model.ok || busy) return;
    setBusy(true);
    try {
      const name = await exportDcaPdf(model);
      addNotification(`Report exported: ${name}`, 'success');
    } catch (e) {
      addNotification(e.message || 'The report could not be built', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto space-y-4 pr-1" data-testid="dca-report-panel">
      <section className="rounded-lg border border-pl-border bg-pl-surface p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-pl-text">Identification</h3>
          <span className="text-[10px] text-pl-muted">Printed in the report header; it does not change the analysis</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ID_FIELDS.map(([key, label, hint]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`dca-id-${key}`} className="text-[11px] text-pl-text">{label}</Label>
              <Input
                id={`dca-id-${key}`}
                value={currentWell.identification?.[key] ?? ''}
                placeholder={key === 'company' && organizationName ? organizationName : hint}
                onChange={(e) => updateIdentification(currentWell.id, key, e.target.value)}
                disabled={canWrite === false}
                className="h-8 text-xs"
                data-testid={`dca-id-${key}`}
              />
            </div>
          ))}
        </div>
        {currentWell.sample && <p className="text-[11px] text-pl-warning-text">Sample well: Ekene-1 primary decline from the Petrolord engines test data. Not field data.</p>}
      </section>

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-pl-text">Report of {currentWell.name}, {selectedStream}</h3>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={exportPdf} disabled={!model.ok || busy} data-testid="dca-report-export">
          <FileDown size={13} /> {busy ? 'Building...' : 'Export PDF'}
        </Button>
      </div>

      {!model.ok ? (
        <p className="rounded-md border border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text text-xs px-3 py-2 flex gap-2" data-testid="dca-report-refusal">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />{model.refusal}
        </p>
      ) : (
        <>
          <Table title="Headline results" head={['Quantity', 'Value', 'Unit', 'How']} rows={model.eurRows} testId="dca-report-eur"
            note={model.closes ? 'EUR is the sum of the two rows above it.' : 'The parts do not close on EUR.'} />
          <Table title="Life" head={['Quantity', 'Value']} rows={model.lifeRows} testId="dca-report-life" />
          <Table title="Inputs" head={['Input', 'Value', 'Unit', 'Source and quality']} rows={model.inputs.map((r) => [r.label, r.value, r.unit, r.source])} testId="dca-report-inputs" />
          <Table title="Decline rate and its basis" head={['Basis', 'Value', 'Unit']} rows={model.declineRows} testId="dca-report-decline" />
          <Table title="Regression" head={['Item', 'Value']} rows={model.regression} testId="dca-report-regression" />
          {model.mc && <Table title="Monte Carlo EUR" head={['Percentile', 'Value', 'Unit']} rows={model.mc.rows} testId="dca-report-mc" note={model.mc.note} />}
          <Table title="Data used and left out" head={['Count', 'Rows']} rows={model.dataCounts} testId="dca-report-data" note={model.importNotes || undefined} />
          {model.leftOut.length > 0 && <Table title="Points left out of the fit and why" head={['Date', `Rate (${model.units.rate})`, 'Reason']} rows={model.leftOut} testId="dca-report-left-out" />}
          <section className="space-y-1" data-testid="dca-report-limits">
            <h4 className="text-xs font-semibold text-pl-text">Limits of this analysis</h4>
            <ul className="list-disc pl-4 text-[11px] text-pl-muted space-y-0.5">
              {model.assumptions.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
            <h4 className="text-xs font-semibold text-pl-text pt-1">Flags on this analysis</h4>
            {model.flags.length ? (
              <ul className="list-disc pl-4 text-[11px] text-pl-warning-text space-y-0.5">{model.flags.map((s, i) => <li key={i}>{s}</li>)}</ul>
            ) : <p className="text-[11px] text-pl-muted">Nothing in this analysis is flagged.</p>}
          </section>
          <section className="space-y-1" data-testid="dca-report-figures">
            <h4 className="text-xs font-semibold text-pl-text">Figures in the PDF</h4>
            <ol className="list-decimal pl-4 text-[11px] text-pl-muted">
              {dcaFigures(model).map((f) => <li key={f.id}>{f.title}{f.statement ? `: ${f.statement}` : ''}</li>)}
            </ol>
          </section>
        </>
      )}
    </div>
  );
};

export default DCAReportPanel;
