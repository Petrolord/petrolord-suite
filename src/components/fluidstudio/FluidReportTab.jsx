// Report tab of Fluid Systems Studio (FLUID-U1; reviewer lens RL1 to RL12).
// The door to the PDF: the identification a reviewer needs, where each
// input came from, and the report itself as the PDF will print it. Every
// table here is a table of the report model (utils/fluidstudio/reportModel),
// the same object the PDF is built from, so screen and file cannot differ.
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, AlertTriangle } from 'lucide-react';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { InputSourceControl } from '@/lib/inputProvenance/InputSourceControl';
import { INPUTS_HEAD, inputsBody } from '@/lib/reportKit/report';
import { describePvtContract } from '@/lib/inputProvenance/pvtContract';
import { IDENTIFICATION_FIELDS, SOURCE_KEYS, identificationOf, SAMPLE_NOTE } from '@/utils/fluidstudio/reportModel';
import { figureListRows } from '@/utils/fluidstudio/reportFigures';

const blank = (v) => (v == null || String(v).trim() === '' ? EMPTY_VALUE : v);

const ModelTable = ({ head, rows, testId, dense = false, numeric = false }) => (
  <div className="overflow-x-auto" data-testid={testId}>
    <table className={`w-full ${dense ? 'text-xs' : 'text-sm'}`}>
      <thead>
        <tr className="text-pl-muted border-b border-pl-border">
          {head.map((h, i) => <th key={h + i} className={`py-1.5 px-2 font-medium ${numeric && i < head.length - 1 ? 'text-right' : 'text-left'}`}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-pl-border text-pl-text align-top">
            {r.map((c, j) => <td key={j} className={`py-1 px-2 ${numeric && j < r.length - 1 ? 'text-right font-pl-mono tabular-nums' : ''}`}>{c}</td>)}
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

/**
 * @param {{report: {model: object, figures: object[], contract: ?object}, inputs: object,
 *   organizationName?: string, onIdentification: function(string, string): void,
 *   onSource: function(string, string, string): void, onExport: function(): void, exporting?: boolean}} props
 */
const FluidReportTab = ({ report, inputs, organizationName = '', onIdentification, onSource, onExport, exporting = false }) => {
  const { model, figures, contract } = report || {};
  if (!model) return null;
  const id = identificationOf(inputs);
  const meta = inputs?.inputMeta || {};
  const sourceKeys = [
    ...(model.mode === 'eos' ? SOURCE_KEYS.eos : SOURCE_KEYS.blackOil),
    ...(model.blending ? SOURCE_KEYS.blending : []),
  ];
  const sampleMarks = sourceKeys.filter(([k]) => meta[k]?.note === SAMPLE_NOTE).length;
  const figureRows = figureListRows(figures);

  return (
    <div className="space-y-4" data-testid="fluid-report-tab">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="flex items-center text-base text-pl-text"><FileText className="w-4 h-4 mr-2 text-pl-muted" />{model.title}</CardTitle>
            <Button size="sm" onClick={onExport} disabled={exporting} data-testid="fluid-export-pdf">
              <FileText className="w-4 h-4 mr-2" /> Export PDF report
            </Button>
          </div>
          <p className="text-xs text-pl-muted mt-1">
            The PDF prints what this tab shows: identification, every input with its unit and source, the method behind each property, the limits of the methods, the PVT table and the plots. Display units: {model.displayUnits}.
          </p>
        </CardHeader>
      </Card>

      <Section title="Identification" testId="fluid-identification" note="Saved with the project. A field left blank prints as n/a.">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {IDENTIFICATION_FIELDS.map(([key, label, hint]) => (
            <div key={key}>
              <Label htmlFor={`id-${key}`} className="text-xs text-pl-muted">{label}</Label>
              <Input
                id={`id-${key}`}
                className="h-8 mt-1"
                value={id[key] ?? ''}
                placeholder={key === 'company' ? (organizationName || hint) : hint}
                onChange={(e) => onIdentification(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Where the inputs came from"
        testId="fluid-sources"
        note="State the source of each input: a lab measurement, a correlation, an offset well or an assumption, with a note such as the report number. An input with nothing stated prints as entered with no source."
      >
        {sampleMarks > 0 && (
          <p className="text-xs text-pl-warning-text flex items-start gap-1" data-testid="fluid-sample-note">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {sampleMarks} input group{sampleMarks === 1 ? ' still holds' : 's still hold'} the sample fluid values. They print as assumptions until you edit them or state their source.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sourceKeys.map(([key, label]) => (
            <InputSourceControl
              key={key}
              label={label}
              meta={meta[key]}
              testId={`source-${key}`}
              notePlaceholder="Note: lab report, sample, quality"
              onChange={(field, value) => onSource(key, field, value)}
            />
          ))}
        </div>
      </Section>

      <Section title="Report header" testId="fluid-report-header">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {[...model.identification, ['Display units', model.displayUnits]].map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="w-36 shrink-0 text-pl-muted">{k}</span>
              <span className="text-pl-text">{blank(v)}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Headline results" testId="fluid-report-headline" note={model.headline.note}>
        <ModelTable head={model.headline.head} rows={model.headline.rows} />
      </Section>

      <Section title="Inputs and their sources" testId="fluid-report-inputs" note={model.inputs.note}>
        <ModelTable head={[...INPUTS_HEAD]} rows={inputsBody(model.inputs.rows)} />
      </Section>

      <Section title="Method used for each property" testId="fluid-report-methods" note="The method names are written by the engine beside the calculation that used them.">
        <ModelTable head={model.methods.head} rows={model.methods.rows} />
      </Section>

      <Section title="Basis and conventions" testId="fluid-report-basis">
        <ModelTable head={['Item', 'As used in this report']} rows={model.basis} />
      </Section>

      {model.separator && (
        <Section title={model.separator.title} testId="fluid-report-separator" note={model.separator.note}>
          <ModelTable head={model.separator.head} rows={model.separator.rows} numeric />
        </Section>
      )}

      <Section title="Lab tuning" testId="fluid-report-tuning">
        <p className="text-sm text-pl-text" data-status={model.tuning.status}>{model.tuning.text}</p>
        {model.tuning.table && <ModelTable head={model.tuning.table.head} rows={model.tuning.table.rows} />}
        {model.tuning.parameters && <ModelTable head={model.tuning.parameters.head} rows={model.tuning.parameters.rows} />}
      </Section>

      {model.lab && (
        <Section title="Laboratory data against the model" testId="fluid-report-lab" note={model.lab.misfit.note}>
          <ModelTable head={model.lab.tables.head} rows={model.lab.tables.rows} dense />
          <ModelTable head={model.lab.misfit.head} rows={model.lab.misfit.rows} />
          {model.lab.notes.length > 0 && (
            <ul className="text-xs text-pl-muted list-disc list-inside space-y-1">
              {model.lab.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}
        </Section>
      )}

      <Section title="Limits of this analysis" testId="fluid-report-limits" note={model.limits.rangesNote}>
        <ul className="text-sm text-pl-text list-disc list-inside space-y-1">
          {model.limits.assumptions.map((a) => <li key={a}>{a}</li>)}
        </ul>
        <ModelTable head={model.limits.ranges.head} rows={model.limits.ranges.rows} dense />
        <p className="text-sm font-semibold text-pl-text pt-1">Inputs outside a published range</p>
        {model.limits.flags.length
          ? (
            <ul className="text-sm text-pl-warning-text list-disc list-inside space-y-1" data-testid="fluid-range-flags">
              {model.limits.flags.map((f) => <li key={f}>{f}</li>)}
            </ul>
          )
          : <p className="text-sm text-pl-text" data-testid="fluid-range-flags">No input is outside a published range.</p>}
      </Section>

      <Section title="Plots in the report" testId="fluid-report-figures" note="A plot that does not apply is still listed in the PDF, with this reason.">
        <ModelTable
          head={['Figure', 'Title', 'In the PDF']}
          rows={figureRows.map((f) => [String(f.number), f.title, f.plotted ? 'Plotted' : f.text])}
        />
      </Section>

      <Section title="PVT table" testId="fluid-report-pvt" note="The rows the app exports and hands to other apps, in the display units. Oil compressibility is reported above the saturation pressure only.">
        <div className="max-h-96 overflow-y-auto">
          <ModelTable head={model.pvtTable.head} rows={model.pvtTable.rows} dense numeric />
        </div>
      </Section>

      {contract && (
        <Section title="PVT contract handed to other apps" testId="fluid-report-contract" note="Other Petrolord apps receive this block with the table and print it as the source of the fluid properties they take. It is stored with the saved project.">
          <ModelTable head={['Item', 'Value']} rows={describePvtContract(contract).map(([k, v]) => [k, blank(v)])} />
        </Section>
      )}
    </div>
  );
};

export default FluidReportTab;
