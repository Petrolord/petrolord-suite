// Report tab of the Material Balance Studio (MBAL-U1).
//
// The tab shows the report as rows, the same rows the PDF prints (one
// builder, lib/reportModel.js), and holds what only the report needs:
// who and what it identifies, the pressure datum, and where each input came
// from. Those are saved with the case and do not make a run stale.
//
// The PDF and the series CSV are exported only while the run is the run of
// the current inputs (H4).
import React, { useEffect, useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet, Info, Save, Loader2 } from 'lucide-react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useMaterialBalanceStudio } from '@/contexts/MaterialBalanceStudioContext';
import { staleRunMessage } from '@/pages/apps/reservoir-balance/lib/runStaleness';
import { exportMbalPdf, buildPlotDataCsv } from '@/utils/mbalReportExport';
import {
  collectMbalReportArgs, DATUM_NOTE, INPUTS_NOTE, CROSS_CHECK_NOTE,
} from '@/pages/apps/reservoir-balance/lib/reportModel';
import {
  IDENTIFICATION_FIELDS, DEPTH_REFERENCES, PRESSURE_BASES, emptyStudy,
} from '@/pages/apps/reservoir-balance/lib/studyMeta';
import { INPUTS_HEAD, inputsBody } from '@/lib/reportKit';
import { setProvenanceField, countStated } from '@/lib/inputProvenance';
import { InputSourceControl } from '@/lib/inputProvenance/InputSourceControl';
import UnitField from './UnitField';

const NONE = '__none__';

/** The inputs a person can state a source for, with the label the control shows. */
export const SOURCED_INPUTS = Object.freeze([
  ['initial_pressure_psia', 'Initial reservoir pressure'],
  ['reservoir_temperature_f', 'Reservoir temperature'],
  ['initial_water_saturation', 'Initial water saturation'],
  ['bubble_point_psia', 'Bubble point pressure'],
  ['pvt_table', 'PVT table'],
  ['oil_gravity_api', 'Oil gravity'],
  ['gas_specific_gravity', 'Gas specific gravity'],
  ['water_salinity_ppm', 'Formation water salinity'],
  ['formation_compressibility_psi', 'Formation compressibility'],
  ['water_compressibility_psi', 'Water compressibility'],
  ['gas_cap_ratio_m', 'Gas cap ratio m'],
  ['aquifer', 'Aquifer model and parameters'],
  ['production_data', 'Pressure and production table'],
]);

const DataTable = ({ head, body, testId, compact = false }) => (
  <div className="overflow-x-auto" data-testid={testId}>
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr>{head.map((h) => <th key={h} className="text-left font-semibold text-pl-muted border-b border-pl-border py-1.5 pr-3 whitespace-nowrap">{h}</th>)}</tr>
      </thead>
      <tbody>
        {body.map((row, i) => (
          <tr key={i} className="border-b border-pl-border/60 align-top">
            {row.map((cell, j) => (
              <td key={j} className={`py-1.5 pr-3 text-pl-text ${j > 0 && compact ? 'font-pl-mono tabular-nums whitespace-nowrap' : ''}`}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Note = ({ children }) => <p className="text-[11px] text-pl-muted leading-relaxed mt-2">{children}</p>;

const ReportTab = () => {
  const {
    caseData, lastResult, lastRunConfig, runStaleness, refreshRunInputs, reportArgs, study, saveStudy, units, organizationName,
  } = useMaterialBalanceStudio();
  const { toast } = useToast();
  // H4: the config printed beside the result is the one the run was made on
  // (its own snapshot), never today's default config. The default config is
  // re-read when the tab opens so an edit on another tab is seen here.
  useEffect(() => { refreshRunInputs?.(); }, [refreshRunInputs]);
  const stale = Boolean(runStaleness?.stale);
  const hasResult = Boolean(lastResult?.plot_data?.timestep_index?.length);

  // The study record is edited here and saved on demand.
  const [draft, setDraft] = useState(study ?? emptyStudy());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const studyKey = JSON.stringify(study);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!dirty) setDraft(study ?? emptyStudy()); }, [studyKey]);
  const edit = (fn) => { setDraft((d) => fn(d)); setDirty(true); };
  const setId = (key, value) => edit((d) => ({ ...d, identification: { ...d.identification, [key]: value } }));
  const setDatum = (key, value) => edit((d) => ({ ...d, datum: { ...d.datum, [key]: value } }));
  const setMeta = (key, field, value) => edit((d) => ({ ...d, inputMeta: setProvenanceField(d.inputMeta, key, field, value) }));

  const onSave = async () => {
    setSaving(true);
    const { error } = await saveStudy(draft);
    setSaving(false);
    if (error) {
      toast({ title: 'The report details were not saved', description: error.message, variant: 'destructive' });
      return;
    }
    setDirty(false);
    toast({ title: 'Report details saved', description: 'Identification, datum and input sources are stored with the case. The run stays current.' });
  };

  // the report as rows: the draft is shown at once, so what is typed is what prints
  const model = useMemo(
    () => (hasResult ? collectMbalReportArgs({ ...reportArgs, study: draft }) : null),
    [hasResult, reportArgs, draft],
  );

  const onPdf = async () => {
    setExporting(true);
    try {
      const { pages } = await exportMbalPdf({ ...reportArgs, study: draft });
      toast({ title: 'Report exported', description: `The PDF has been downloaded (${pages} pages).` });
    } catch (err) {
      toast({ title: 'Export failed', description: err.message, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const onCsv = () => {
    if (stale) {
      toast({ title: 'Export refused', description: staleRunMessage(runStaleness), variant: 'destructive' });
      return;
    }
    const csv = buildPlotDataCsv(lastResult, { caseData, runConfig: lastRunConfig });
    if (!csv) {
      toast({ title: 'No data', description: 'Run the engine first.', variant: 'destructive' });
      return;
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mbal-series-${(caseData?.name ?? 'case').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stated = countStated(draft.inputMeta, SOURCED_INPUTS.map(([k]) => k));

  return (
    <div className="space-y-4" data-testid="mbal-report-tab">
      <Card>
        <CardHeader>
          <CardTitle>Report</CardTitle>
          <CardDescription>
            A PDF of the last run for a reviewer: identification, every input with its unit and source, the data used and left out, the results with the regression statement, the in-place volume by each method, the drive indices with their convention, the limits of the method and the plots. The CSV carries every per-timestep series of the run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasResult ? (
            <p className="text-sm text-pl-muted flex items-center gap-2" data-testid="mbal-report-empty">
              <Info className="h-4 w-4" />
              Run the engine on the Run tab first. The report describes the last completed run, and only while the inputs are the ones that run was made on.
            </p>
          ) : stale ? (
            <div className="space-y-3">
              <p className="text-sm text-pl-warning-text flex items-start gap-2" data-testid="mbal-report-stale">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{staleRunMessage(runStaleness)} The report and the series file are not exported until then.</span>
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled data-testid="mbal-export-pdf"><FileDown className="mr-2 h-4 w-4" /> Export PDF report</Button>
                <Button variant="outline" disabled data-testid="mbal-export-csv"><FileSpreadsheet className="mr-2 h-4 w-4" /> Export series CSV</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={onPdf} disabled={exporting} data-testid="mbal-export-pdf">
                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />} Export PDF report
              </Button>
              <Button variant="outline" onClick={onCsv} data-testid="mbal-export-csv">
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Export series CSV
              </Button>
              <p className="text-[11px] text-pl-muted" data-testid="mbal-report-units">Prints in {units.displayUnits()}.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base">Report details</CardTitle>
            <CardDescription>
              What only the report needs. Saving these does not change a result, so the run stays current.
            </CardDescription>
          </div>
          <Button onClick={onSave} disabled={!dirty || saving || !caseData} data-testid="mbal-study-save">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save report details
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-pl-muted">Identification</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {IDENTIFICATION_FIELDS.map(([key, label, hint]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`mbal-id-${key}`} className="text-xs text-pl-text">{label}</Label>
                  <Input id={`mbal-id-${key}`} className="h-9" value={draft.identification[key] ?? ''} data-testid={`mbal-id-${key}`}
                    placeholder={key === 'company' ? (organizationName || hint) : hint} onChange={(e) => setId(key, e.target.value)} />
                </div>
              ))}
            </div>
            <Note>Case name, field and reservoir come from the case (Edit case on the case card). A blank prints as n/a.</Note>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-pl-muted">Pressure datum</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <UnitField id="mbal-datum-depth" testId="mbal-datum-depth" label="Datum depth" quantity="depth" units={units}
                value={draft.datum.datum_depth_ft} onCommit={(v) => setDatum('datum_depth_ft', v)} placeholder="optional" />
              <UnitField id="mbal-gauge-depth" testId="mbal-gauge-depth" label="Gauge or survey depth" quantity="depth" units={units}
                value={draft.datum.gauge_depth_ft} onCommit={(v) => setDatum('gauge_depth_ft', v)} placeholder="optional" />
              <div className="space-y-1.5">
                <Label className="text-xs text-pl-text">Depths are</Label>
                <Select value={draft.datum.reference} onValueChange={(v) => setDatum('reference', v)}>
                  <SelectTrigger className="h-9" aria-label="Depth reference" data-testid="mbal-datum-reference"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DEPTH_REFERENCES).map(([k, text]) => <SelectItem key={k} value={k}>{text}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-pl-text">The pressures on the Data tab are</Label>
                <Select value={draft.datum.basis || NONE} onValueChange={(v) => setDatum('basis', v === NONE ? '' : v)}>
                  <SelectTrigger className="h-9" aria-label="Pressure basis" data-testid="mbal-datum-basis"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRESSURE_BASES).map(([k, text]) => <SelectItem key={k || NONE} value={k || NONE}>{text}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Input className="h-9" value={draft.datum.note ?? ''} placeholder="Note on the surveys: tool, build-up time, how they were referred to the datum"
              aria-label="Note on the pressure surveys" data-testid="mbal-datum-note" onChange={(e) => setDatum('note', e.target.value)} />
            <Note>{DATUM_NOTE}</Note>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-pl-muted">Input sources and quality ({stated} of {SOURCED_INPUTS.length} stated)</h3>
            <Note>For each input say whether it was measured, taken from a correlation (and which), borrowed from an offset well or assumed, and note its quality. The report prints this beside the value. What the app itself knows (a default it applied, a fitted value, a handoff from another app) is printed without asking.</Note>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3">
              {SOURCED_INPUTS.map(([key, label]) => (
                <InputSourceControl key={key} testId={`mbal-source-${key}`} label={label} meta={draft.inputMeta?.[key]}
                  notePlaceholder="Note: report, sample, survey, quality" onChange={(field, value) => setMeta(key, field, value)} />
              ))}
            </div>
          </section>
        </CardContent>
      </Card>

      {model && (
        <Card data-testid="mbal-report-preview">
          <CardHeader>
            <CardTitle className="text-base">What the report prints</CardTitle>
            <CardDescription>
              The rows of the PDF, from the same builder. {stale ? 'These are the rows of an earlier run and are not exported.' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-pl-muted mb-1">Identification</h3>
              <DataTable testId="mbal-preview-identification" head={['Field', 'Value']} body={model.identification.map(([k, v]) => [k, v || 'n/a'])} />
            </section>
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-pl-muted mb-1">Headline results</h3>
              <DataTable testId="mbal-preview-headline" head={['Quantity', 'Value']} body={model.headline.rows} />
              <Note>{model.regressionText}</Note>
            </section>
            {model.historyMatch && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-pl-muted mb-1">{model.historyMatch.title}</h3>
                <DataTable testId="mbal-preview-history-match" compact head={model.historyMatch.head} body={model.historyMatch.rows} />
                <Note>{model.historyMatch.note}</Note>
              </section>
            )}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-pl-muted mb-1">In-place volume by each method</h3>
              <DataTable testId="mbal-preview-cross-check" head={['Method', 'In place', 'Against the headline', 'Basis']}
                body={model.crossCheck.map((r) => [r.method, r.text, r.difference, r.basis])} />
              <Note>{CROSS_CHECK_NOTE}</Note>
            </section>
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-pl-muted mb-1">Drive indices at the last timestep</h3>
              <DataTable testId="mbal-preview-drive" compact head={model.drive.head} body={model.drive.rows} />
              <Note>{model.drive.note}</Note>
            </section>
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-pl-muted mb-1">Inputs of the analysis</h3>
              <DataTable testId="mbal-preview-inputs" head={INPUTS_HEAD} body={inputsBody(model.inputs)} />
              <Note>{INPUTS_NOTE}</Note>
            </section>
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-pl-muted mb-1">Data summary</h3>
              <DataTable testId="mbal-preview-data" head={['Quantity', 'Value']} body={model.data.totals} />
              <Note>{model.data.note}</Note>
            </section>
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-pl-muted mb-1">Limits of this analysis</h3>
              <ul className="list-disc pl-5 space-y-1 text-xs text-pl-text" data-testid="mbal-preview-limits">
                {model.limits.assumptions.map((line) => <li key={line}>{line}</li>)}
              </ul>
              <Note>{model.limits.flags.length ? model.limits.flags.join(' ') : model.limits.noFlagsText}</Note>
            </section>
            <Note>The PDF adds the data table, the withdrawal and expansion terms, the PVT the engine used, the drive indices of every timestep, the engine warnings and the plots of the Plots tab.</Note>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ReportTab;
