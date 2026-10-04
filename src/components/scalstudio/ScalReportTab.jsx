// Report tab of SCAL Studio (SCAL-U1; reviewer lens RL1 to RL12). The door
// to the PDF: the identification a reviewer needs, where each input came
// from, and the report itself as the PDF will print it. Every table here is
// a table of the report model (utils/scalstudio/reportModel), the object
// the PDF is built from, so screen and file cannot differ.
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, AlertTriangle } from 'lucide-react';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { InputSourceControl } from '@/lib/inputProvenance/InputSourceControl';
import { INPUTS_HEAD, inputsBody } from '@/lib/reportKit/report';
import { describeKrContract } from '@/lib/inputProvenance/krContract';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useScalStudio } from '@/contexts/ScalStudioContext';
import { IDENTIFICATION_FIELDS, SOURCE_KEYS } from '@/utils/scalstudio/model';
import { startingValueGroups } from '@/utils/scalstudio/reportModel';
import { figureListRows } from '@/utils/scalstudio/reportFigures';
import { collectScalReportArgs, exportScalPdf } from '@/utils/scalstudio/scalReportExport';

const blank = (v) => (v == null || String(v).trim() === '' ? EMPTY_VALUE : v);

const ModelTable = ({ head, rows, testId, dense = false }) => (
  <div className="overflow-x-auto" data-testid={testId}>
    <table className={`w-full ${dense ? 'text-xs' : 'text-sm'}`}>
      <thead>
        <tr className="text-pl-muted border-b border-pl-border">
          {head.map((h, i) => <th key={h + i} className="py-1.5 px-2 font-medium text-left">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-pl-border text-pl-text align-top">
            {r.map((c, j) => <td key={j} className="py-1 px-2">{blank(c)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Section = ({ title, children, note, testId }) => (
  <Card data-testid={testId}>
    <CardHeader className="pb-2"><CardTitle className="text-base text-pl-text">{title}</CardTitle></CardHeader>
    <CardContent className="space-y-2">
      {children}
      {note && <p className="text-xs text-pl-muted">{note}</p>}
    </CardContent>
  </Card>
);

const useOrganizationName = () => {
  try { return useAuth()?.organization?.name || ''; } catch { return ''; }
};

/** The studio state the report reads, from the context value. */
export const reportStateOf = (c) => ({
  curves: c.curves, ow: c.ow, go: c.go, owStatus: c.owStatus, owCurves: c.owCurves, goCurves: c.goCurves,
  samples: c.samples, samplesDerived: c.samplesDerived, capillary: c.capillary, jResolved: c.jResolved,
  reservoir: c.reservoir, reservoirPc: c.reservoirPc, height: c.height, heightProfile: c.heightProfile,
  inputMeta: c.inputMeta, identification: c.identification, notes: c.notes, contract: c.contract,
});

const ScalReportTab = () => {
  const c = useScalStudio();
  const organizationName = useOrganizationName();
  const [exporting, setExporting] = useState(false);
  const state = reportStateOf(c);
  const args = useMemo(
    () => collectScalReportArgs({ state, system: c.unitSystem, projectName: c.projectName, organizationName, build: c.build }),
    // the state object is rebuilt each render from memoised parts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c.curves, c.ow, c.go, c.owStatus, c.samplesDerived, c.capillary, c.jResolved, c.reservoir, c.reservoirPc, c.height, c.heightProfile, c.inputMeta, c.identification, c.notes, c.contract, c.unitSystem, c.projectName, organizationName, c.build],
  );
  const { model, figures, contract } = args;
  if (!model) return null;
  const starting = startingValueGroups(state);
  const onExport = async () => {
    setExporting(true);
    const ok = await exportScalPdf(args, { projectName: c.projectName });
    setExporting(false);
    if (!ok) c.addNotification('The PDF report could not be built. See the browser console.', 'error');
  };

  return (
    <div className="space-y-4" data-testid="scal-report-tab">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="flex items-center text-base text-pl-text"><FileText className="w-4 h-4 mr-2 text-pl-muted" />{model.title}</CardTitle>
            <Button size="sm" onClick={onExport} disabled={exporting} data-testid="scal-export-pdf">
              <FileText className="w-4 h-4 mr-2" /> Export PDF report
            </Button>
          </div>
          <p className="text-xs text-pl-muted mt-1">
            The PDF prints what this tab shows: identification, every input with its unit and source, the samples and their pedigree, the fits, the model, the limits of the analysis, the tables and the plots of the other tabs. Display units: {model.displayUnits}.
          </p>
        </CardHeader>
      </Card>

      <Section title="Identification" testId="scal-identification" note="Saved with the project. A field left blank prints as n/a. Sample names, depths and pedigree are set per sample on the Lab Data tab.">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {IDENTIFICATION_FIELDS.map(([key, label, hint]) => (
            <div key={key}>
              <Label htmlFor={`scal-id-${key}`} className="text-xs text-pl-muted">{label}</Label>
              <Input
                id={`scal-id-${key}`}
                className="h-8 mt-1"
                value={c.identification?.[key] ?? ''}
                placeholder={key === 'company' ? (organizationName || hint) : hint}
                onChange={(e) => c.setIdentificationField(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Where the inputs came from"
        testId="scal-sources"
        note="State the source of each input: a lab measurement, a correlation, an offset well or an assumption, with a note such as the report number. A Corey set applied from a sample's fit says so by itself."
      >
        {starting.length > 0 && (
          <p className="text-xs text-pl-warning-text flex items-start gap-1" data-testid="scal-sample-note">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {starting.length} input group{starting.length === 1 ? ' still holds' : 's still hold'} the starting values of the app. They print as assumptions until you edit them or state their source.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SOURCE_KEYS.map(([key, label]) => (
            <InputSourceControl
              key={key}
              label={label}
              meta={c.inputMeta?.[key]}
              testId={`scal-source-${key}`}
              notePlaceholder="Note: lab report, sample, quality"
              onChange={(field, value) => c.setSourceField(key, field, value)}
            />
          ))}
        </div>
      </Section>

      <Section title="Report header" testId="scal-report-header">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {[...model.identification, ['Display units', model.displayUnits]].map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="w-36 shrink-0 text-pl-muted">{k}</span>
              <span className="text-pl-text break-words min-w-0">{blank(v)}</span>
            </div>
          ))}
        </div>
      </Section>

      {model.summary && (
        <Section title="Summary (page 1 of the PDF)" testId="scal-report-summary" note={model.summary.note}>
          <ModelTable head={['Item', 'Value']} rows={model.summary.rows} />
        </Section>
      )}

      <Section title="Headline results" testId="scal-report-headline" note={model.headline.note}>
        <ModelTable head={model.headline.head} rows={model.headline.rows} />
      </Section>

      <Section title="Inputs and their sources" testId="scal-report-inputs" note={model.inputs.note}>
        <ModelTable head={[...INPUTS_HEAD]} rows={inputsBody(model.inputs.rows)} dense />
      </Section>

      {model.scaling && (
        <Section title="Leverett scaling and height conversion, by component" testId="scal-report-scaling" note={model.scaling.note}>
          <ModelTable head={model.scaling.head} rows={model.scaling.rows} dense />
        </Section>
      )}

      {model.samples && (
        <Section title="Core samples and their pedigree" testId="scal-report-samples">
          <ModelTable head={model.samples.props.head} rows={model.samples.props.rows} dense />
          <ModelTable head={model.samples.pedigree.head} rows={model.samples.pedigree.rows} dense testId="scal-report-pedigree" />
          <ModelTable head={model.samples.imports.head} rows={model.samples.imports.rows} dense testId="scal-report-imports" />
          {model.samples.fits && <ModelTable head={model.samples.fits.head} rows={model.samples.fits.rows} dense testId="scal-report-fits" />}
          {model.samples.fits && <p className="text-xs text-pl-muted">{model.samples.fits.note}</p>}
          {model.samples.goFits && <ModelTable head={model.samples.goFits.head} rows={model.samples.goFits.rows} dense testId="scal-report-go-fits" />}
          {model.samples.goFits && <p className="text-xs text-pl-muted">{model.samples.goFits.note}</p>}
        </Section>
      )}

      <Section title="Leverett J from the samples" testId="scal-report-j">
        <p className="text-sm text-pl-text">{model.jSection.text}</p>
        {model.jSection.table && <ModelTable head={model.jSection.table.head} rows={model.jSection.table.rows} dense />}
      </Section>

      <Section title="Model, basis and conventions" testId="scal-report-model">
        <ModelTable head={['Item', 'As used in this report']} rows={[...model.model, ...model.basis]} dense />
      </Section>

      <Section title="Limits of this analysis" testId="scal-report-limits">
        <ul className="text-sm text-pl-text list-disc list-inside space-y-1">
          {model.limits.assumptions.map((a) => <li key={a}>{a}</li>)}
        </ul>
        <ModelTable head={model.limits.ranges.head} rows={model.limits.ranges.rows} dense />
        <p className="text-sm font-semibold text-pl-text pt-1">Flags</p>
        {model.limits.flags.length
          ? <ul className="text-sm text-pl-warning-text list-disc list-inside space-y-1" data-testid="scal-flags">{model.limits.flags.map((f) => <li key={f}>{f}</li>)}</ul>
          : <p className="text-sm text-pl-text" data-testid="scal-flags">{model.limits.noFlagsText}</p>}
      </Section>

      <Section title="Plots in the report" testId="scal-report-figures" note="A plot that does not apply is still listed in the PDF, with this reason.">
        <ModelTable head={['Figure', 'Title', 'In the PDF']} rows={figureListRows(figures)} />
      </Section>

      {contract && (
        <Section title="kr-1 block handed to other apps" testId="scal-report-contract" note="Stored with the saved project; Waterflood Design Studio reads it with the curves, and the saturation-height readers read the same project by id.">
          <ModelTable head={['Item', 'Value']} rows={describeKrContract(contract)} />
        </Section>
      )}
    </div>
  );
};

export default ScalReportTab;
