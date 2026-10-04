// The Report tab of Waterflood Design Studio (WF-U1; reviewer lens RL1 to
// RL12): identification and the sources of typed inputs on the left, the
// rows the PDF prints on the right, from one model (reportModel.js), and the
// export. The figures are listed with what each shows or why it does not apply.
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FileText } from 'lucide-react';
import { InputSourceControl } from '@/lib/inputProvenance/InputSourceControl';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useWaterfloodDesign } from '@/contexts/WaterfloodDesignContext';
import { IDENTIFICATION_FIELDS } from '@/utils/waterflooddesign/model';
import { collectWaterfloodReportArgs, exportWaterfloodPdf } from '@/utils/waterflooddesign/reportExport';
import { SectionLabel } from './primitives';

// inputs a user types that no intake fills: their source is stated here
export const SOURCE_KEYS = Object.freeze([
  ['area_acres', 'Pattern area'], ['h_ft', 'Net thickness'], ['phi', 'Porosity'], ['iw_bpd', 'Injection rate'],
  ['EV', 'Vertical sweep EV'], ['Sgi', 'Initial gas saturation'], ['muW', 'Water viscosity'], ['muO', 'Oil viscosity'],
  ['Bo', 'Bo (pattern)'], ['Bw', 'Bw (pattern)'], ['Swc', 'Swc'], ['Sor', 'Sor'], ['layers', 'Layers'],
  ['s_bo', 'Bo (voidage)'], ['s_bw', 'Bw (voidage)'], ['s_bg', 'Bg (voidage)'], ['s_rs', 'Rs (voidage)'],
]);

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
  const c = useWaterfloodDesign();
  const organizationName = useOrganizationName();
  const [busy, setBusy] = useState(false);
  const state = {
    displacementInputs: c.displacementInputs, displacementSpec: c.displacementSpec, displacement: c.displacement,
    layers: c.layers, layeredConfig: c.layeredConfig, layeredResult: c.layeredResult,
    patternInputs: c.patternInputs, patternResult: c.patternResult,
    surveillanceRows: c.surveillanceRows, surveillanceConfig: c.surveillanceConfig, surveillanceResult: c.surveillanceResult,
    surveillanceImport: c.surveillanceImport, uncertaintyConfig: c.uncertaintyConfig, mcSummary: c.mcSummary,
    identification: c.identification, inputMeta: c.inputMeta, pvtIntake: c.pvtIntake, migratedFrom: c.migratedFrom,
  };
  const args = useMemo(
    () => collectWaterfloodReportArgs({ state, system: c.unitSystem, projectName: c.projectName, organizationName, build: c.build }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c.displacement, c.layeredResult, c.patternResult, c.surveillanceResult, c.surveillanceImport, c.mcSummary, c.identification, c.inputMeta, c.pvtIntake, c.unitSystem, c.projectName, organizationName, c.build, c.displacementInputs, c.patternInputs, c.surveillanceConfig, c.layeredConfig, c.layers, c.uncertaintyConfig],
  );
  const { model, figures } = args;

  const exportPdf = async () => {
    setBusy(true);
    const ok = await exportWaterfloodPdf(args, { projectName: c.projectName });
    setBusy(false);
    c.addNotification(ok ? 'Report exported.' : 'The report could not be built. See the console for the reason.', ok ? 'success' : 'error');
  };

  if (!model) return null;
  return (
    <div className="space-y-4 overflow-y-auto" data-testid="wds-report">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-pl-border bg-pl-surface px-4 py-3">
        <p className="text-xs text-pl-muted max-w-xl">
          The PDF prints what this tab shows: identification, headline results, the recovery split, every input with its
          unit and source, the forecast by year, the surveillance file as read, the Hall windows, the limits and the figures.
        </p>
        <Button onClick={exportPdf} disabled={busy} data-testid="wds-export-pdf" size="sm">
          <FileText className="w-4 h-4 mr-1" /> Export PDF report
        </Button>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Identification</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {IDENTIFICATION_FIELDS.map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs text-pl-muted" htmlFor={`wds-id-${key}`}>{label}</Label>
                <Input id={`wds-id-${key}`} data-testid={`wds-id-${key}`} className="h-8 text-xs" value={c.identification[key] || ''}
                  placeholder={key === 'company' ? (organizationName || 'From your organisation') : ''}
                  onChange={(e) => c.setIdentificationField(key, e.target.value)} />
              </div>
            ))}
            <div className="col-span-2 space-y-1">
              <Label className="text-xs text-pl-muted" htmlFor="wds-id-notes">Notes for the reader</Label>
              <Textarea id="wds-id-notes" className="text-xs" rows={3} value={c.identification.notes || ''} onChange={(e) => c.setIdentificationField('notes', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Where the typed inputs came from</CardTitle></CardHeader>
          <CardContent className="space-y-3 max-h-[520px] overflow-y-auto">
            <p className="text-xs text-pl-muted">Values taken from SCAL Studio or Fluid Systems Studio carry their source by themselves; state the others here.</p>
            {SOURCE_KEYS.map(([key, label]) => (
              <InputSourceControl key={key} label={label} meta={c.inputMeta[key]} onChange={(field, value) => c.setInputSource(key, field, value)} testId={`wds-src-${key}`} />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Headline results</CardTitle></CardHeader>
        <CardContent><ModelTable head={model.headline.head} rows={model.headline.rows} testId="wds-report-headline" /></CardContent>
      </Card>
      {model.split && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Recovery of the pattern, by its parts</CardTitle></CardHeader>
          <CardContent className="space-y-2"><ModelTable head={model.split.head} rows={model.split.rows} testId="wds-report-split" /><p className="text-xs text-pl-muted">{model.split.note}</p></CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Inputs and their sources</CardTitle></CardHeader>
        <CardContent>
          <ModelTable head={['Input', 'Value', 'Unit', 'Source and quality']} rows={model.inputs.rows.map((r) => [r.label, r.value, r.unit, r.source])} testId="wds-report-inputs" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Limits and flags</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1" data-testid="wds-report-flags">
          {model.limits.flags.length ? model.limits.flags.map((f) => <p key={f}>{f}</p>) : <p>No input is outside a published range and nothing was edited after an intake.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Figures in the report</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1" data-testid="wds-report-figures">
          <SectionLabel>{figures.length} figures</SectionLabel>
          {figures.map((f, i) => <p key={f.id}><span className="font-semibold">Figure {i + 1}. {f.title}.</span> {f.statement || 'Drawn from the series of the screen chart.'}</p>)}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportTab;
