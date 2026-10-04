// The Report tab of the Recovery Factor Estimator (RF-U1-005; reviewer lens
// RL1 to RL12): identification and the sources of typed inputs, the rows the
// PDF prints from one model (reportModel.js), and the export. The figures are
// listed with what each shows or why it does not apply.
import React, { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { InputSourceControl } from '@/lib/inputProvenance/InputSourceControl';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { IDENTIFICATION_FIELDS } from '@/utils/rfestimator/model';
import { collectRfReportArgs, exportRfPdf } from '@/utils/rfestimator/reportExport';
import { corrFieldsFor, VOL_FIELDS_OIL, VOL_FIELDS_GAS, PLAIN_LABELS } from './rfFields';

function useOrganizationName() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  try { return useAuth()?.organization?.name || ''; } catch { return ''; }
}

const ModelTable = ({ head, rows, testId }) => (
  <div className="overflow-x-auto" data-testid={testId}>
    <table className="w-full text-xs">
      <thead><tr className="text-pl-muted">{head.map((h) => <th key={h} className="text-left font-medium pr-3 pb-1">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-pl-border">{r.map((c, j) => <td key={j} className="pr-3 py-1 align-top">{c}</td>)}</tr>)}</tbody>
    </table>
  </div>
);

const ReportTab = () => {
  const c = useRfEstimator();
  const organizationName = useOrganizationName();
  const [busy, setBusy] = useState(false);
  const state = {
    inputs: c.inputs, derived: c.derived, identification: c.identification, inputMeta: c.inputMeta,
    pvtIntake: c.pvtIntake, inPlaceIntake: c.inPlaceIntake, migration: c.migration, dcaCheck: c.dcaCheck,
  };
  const args = useMemo(
    () => collectRfReportArgs({ state, system: c.unitSystem, projectName: c.projectName, organizationName, build: c.build }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c.inputs, c.derived, c.identification, c.inputMeta, c.pvtIntake, c.inPlaceIntake, c.migration, c.dcaCheck, c.unitSystem, c.projectName, organizationName, c.build],
  );
  const { model, figures } = args;

  // the typed inputs of this case whose source the user states here
  const sourceKeys = useMemo(() => {
    const out = [];
    if (c.inputs.inPlaceMode === 'direct') { if (!c.inPlaceIntake) out.push(['ooipDirect', c.inputs.phase === 'gas' ? 'OGIP' : 'OOIP']); } else {
      for (const [k] of c.inputs.phase === 'gas' ? VOL_FIELDS_GAS : VOL_FIELDS_OIL) out.push([`vol.${k}`, `${PLAIN_LABELS[k]} (volumetrics)`]);
    }
    for (const [k] of corrFieldsFor(c.inputs)) out.push([`corr.${k}`, PLAIN_LABELS[k]]);
    return out;
  }, [c.inputs.inPlaceMode, c.inputs.phase, c.inputs.method, c.inputs.corr?.gwdMode, c.inPlaceIntake]);

  const exportPdf = async () => {
    setBusy(true);
    const ok = await exportRfPdf(args, { projectName: c.projectName });
    setBusy(false);
    c.addNotification(ok ? 'Report exported.' : 'The report could not be built. See the console for the reason.', ok ? 'success' : 'error');
  };

  if (!model) return null;
  return (
    <div className="space-y-4 h-full overflow-y-auto" data-testid="rf-report">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-pl-border bg-pl-surface px-4 py-3">
        <p className="text-xs text-pl-muted max-w-xl">
          The PDF prints what this tab shows: identification, the headline with its basis, the in-place volume and the
          method by their parts, every input with its unit and source, the method and its validation, the limits and
          flags, the intake records and the figures.
        </p>
        <Button onClick={exportPdf} disabled={busy} data-testid="rf-export-pdf" size="sm">
          <FileText className="w-4 h-4 mr-1" /> Export PDF report
        </Button>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Identification</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {IDENTIFICATION_FIELDS.map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs text-pl-muted" htmlFor={`rf-id-${key}`}>{label}</Label>
                <Input id={`rf-id-${key}`} data-testid={`rf-id-${key}`} className="h-8 text-xs" value={c.identification[key] || ''}
                  placeholder={key === 'company' ? (organizationName || 'From your organisation') : key === 'dataDate' ? 'YYYY-MM-DD' : ''}
                  onChange={(e) => c.setIdentificationField(key, e.target.value)} />
              </div>
            ))}
            <div className="col-span-2 space-y-1">
              <Label className="text-xs text-pl-muted" htmlFor="rf-id-notes">Notes for the reader</Label>
              <Textarea id="rf-id-notes" className="text-xs" rows={3} value={c.identification.notes || ''} onChange={(e) => c.setIdentificationField('notes', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Where the typed inputs came from</CardTitle></CardHeader>
          <CardContent className="space-y-3 max-h-[520px] overflow-y-auto">
            <p className="text-xs text-pl-muted">Values taken from Fluid Systems Studio, Material Balance or ReservoirCalc Pro carry their source by themselves; state the others here. An untouched sample value prints as a sample value.</p>
            {sourceKeys.map(([key, label]) => (
              <InputSourceControl key={key} label={label} meta={c.inputMeta[key]} onChange={(field, value) => c.setInputSource(key, field, value)} testId={`rf-src-${key.replace('.', '-')}`} />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Headline results</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <ModelTable head={model.headline.head} rows={model.headline.rows} testId="rf-report-headline" />
          {model.headline.note && <p className="text-xs text-pl-muted">{model.headline.note}</p>}
        </CardContent>
      </Card>
      {model.uncertainty?.rows && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Uncertainty: recovery factor x in-place volume</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <ModelTable head={model.uncertainty.head} rows={model.uncertainty.rows} testId="rf-report-uncertainty" />
            <ModelTable head={['Item', 'As run']} rows={model.uncertainty.runRows} testId="rf-report-uncertainty-run" />
            <p className="text-xs text-pl-muted">{model.uncertainty.note}</p>
          </CardContent>
        </Card>
      )}
      {model.dcaCheck && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Cross-check: decline EUR over the in-place volume</CardTitle></CardHeader>
          <CardContent className="space-y-2"><ModelTable head={model.dcaCheck.head} rows={model.dcaCheck.rows} testId="rf-report-dca" /><p className="text-xs text-pl-muted">{model.dcaCheck.note}</p></CardContent>
        </Card>
      )}
      {model.inPlaceSplit && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{c.inputs.phase === 'gas' ? 'OGIP' : 'OOIP'} by its parts</CardTitle></CardHeader>
          <CardContent className="space-y-2"><ModelTable head={model.inPlaceSplit.head} rows={model.inPlaceSplit.rows} testId="rf-report-inplace" /><p className="text-xs text-pl-muted">{model.inPlaceSplit.note}</p></CardContent>
        </Card>
      )}
      {model.methodSplit && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">The method by its parts</CardTitle></CardHeader>
          <CardContent className="space-y-2"><ModelTable head={model.methodSplit.head} rows={model.methodSplit.rows} testId="rf-report-method" /><p className="text-xs text-pl-muted">{model.methodSplit.note}</p></CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Inputs and their sources</CardTitle></CardHeader>
        <CardContent>
          <ModelTable head={['Input', 'Value', 'Unit', 'Source and quality']} rows={model.inputs.rows.map((r) => [r.label, r.value, r.unit, r.source])} testId="rf-report-inputs" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Method and validation</CardTitle></CardHeader>
        <CardContent><ModelTable head={['Item', 'As used in this report']} rows={model.methodRows} testId="rf-report-methodrows" /></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Limits and flags</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1" data-testid="rf-report-flags">
          {model.limits.flags.length ? model.limits.flags.map((f) => <p key={f}>{f}</p>) : <p>No input is outside the domain of its method, the estimate is inside the analog range, and nothing was edited after an intake.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Figures in the report</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1" data-testid="rf-report-figures">
          {figures.map((f, i) => <p key={f.id}><span className="font-semibold">Figure {i + 1}. {f.title}.</span> {f.statement || f.caption}</p>)}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportTab;
