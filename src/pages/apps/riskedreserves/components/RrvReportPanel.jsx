// The Report tab of Risked Reserves Valuation (upgrade U1, 2026-10-02). It
// shows the rows the PDF prints, from the same builder
// (services/rrvReportModel), so the screen and the page are one model
// (reviewer lens RL12). Above them: who and what the report identifies, and
// where each of this app's own inputs came from. The handed-over inputs
// state their source themselves.

import React from 'react';
import { FileText } from 'lucide-react';
import { InputSourceControl } from '@/lib/inputProvenance/InputSourceControl';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { RRV_SOURCES } from '../services/rrvReportModel';

const field = 'w-full rounded bg-pl-surface border border-pl-border-strong text-pl-text px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus disabled:opacity-60';
const card = 'rounded border border-pl-border bg-pl-surface p-3';
const h = 'text-xs font-semibold text-pl-text mb-2';

// a cell that is a number (or several, or a percentage) reads in the mono face
const NUMERIC = /^[-\d.,%/ ]+$/;

const IDENT = [
  ['company', 'Company', 'the operator or licence holder'],
  ['licence', 'Licence or block', 'e.g. OML 143'],
  ['play', 'Play', 'e.g. Agbada stacked sands'],
  ['analyst', 'Analyst', 'your name'],
];

function Table({ title, head, body, note: text, testId }) {
  if (!body?.length) return null;
  return (
    <div className={card} data-testid={testId}>
      <div className={h}>{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-pl-muted"><tr>{head.map((c) => <th key={c} className="text-left font-medium px-1.5 py-1 border-b border-pl-border">{c}</th>)}</tr></thead>
          <tbody>
            {body.map((row, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <tr key={i} className="border-b border-pl-border last:border-0 align-top">
                {row.map((c, j) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <td key={j} className={`px-1.5 py-1 text-pl-text ${NUMERIC.test(String(c ?? '')) ? 'font-pl-mono tabular-nums' : ''}`}>{c ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {text && <p className="mt-2 text-[11px] text-pl-muted">{text}</p>}
    </div>
  );
}

/**
 * @param {{model: object, prospect: object, readOnly?: boolean, ownSourceKeys: string[],
 *   onIdent: function(string, string): void, onMeta: function(string, string, string): void,
 *   onExport: function(): void, exporting?: boolean, companyDefault?: ?string, labels: object}} props
 */
export default function RrvReportPanel({ model, prospect, readOnly = false, ownSourceKeys, onIdent, onMeta, onExport, exporting = false, companyDefault = null, labels }) {
  const ident = prospect.ident || {};
  return (
    <div className="space-y-3" data-testid="rrv-report">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-pl-primary text-pl-primary-text hover:bg-pl-sunken disabled:opacity-40"
          onClick={onExport} disabled={!model.valued || exporting} data-testid="rrv-report-pdf"
          title={model.valued ? 'Download the report as a PDF' : `The report needs a valued prospect: ${model.problem || ''}`}>
          <FileText className="w-3.5 h-3.5" /> {exporting ? 'Building the PDF' : 'Download PDF report'}
        </button>
        <span className="text-[11px] text-pl-muted">
          {model.valued ? 'The PDF prints the rows below, with the plots, from the same builder.' : `Not ready: ${model.problem}`}
        </span>
      </div>

      <div className={card} data-testid="rrv-report-ident">
        <div className={h}>Identification (printed in the report header, saved with the valuation)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {IDENT.map(([k, label, hint]) => (
            <label key={k} className="text-[11px] text-pl-muted">{label}
              <input className={field} value={ident[k] || ''} disabled={readOnly} data-testid={`rrv-ident-${k}`}
                placeholder={k === 'company' && companyDefault ? `${companyDefault} (your organisation)` : hint}
                onChange={(e) => onIdent(k, e.target.value)} />
            </label>
          ))}
        </div>
        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs" data-testid="rrv-report-header">
          {[...model.identification, ['Display units', model.displayUnits]].map(([k, v]) => (
            <div key={k} className="flex gap-2"><dt className="w-36 shrink-0 text-pl-muted">{k}</dt><dd className="text-pl-text" data-testid={`rrv-header-${k}`}>{v === '' || v == null ? EMPTY_VALUE : v}</dd></div>
          ))}
        </dl>
      </div>

      {!readOnly && ownSourceKeys.length > 0 && (
        <div className={card} data-testid="rrv-report-sources">
          <div className={h}>Where these inputs came from (printed in the Source column)</div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {ownSourceKeys.map((k) => (
              <InputSourceControl key={k} label={labels[k]} meta={prospect.inputMeta?.[k]} sources={RRV_SOURCES} testId={`rrv-source-${k}`}
                notePlaceholder="Note: study, date, analog, who agreed it" onChange={(f, value) => onMeta(k, f, value)} />
            ))}
          </div>
        </div>
      )}

      <Table testId="rrv-report-inputs" title="Inputs, with unit and source" head={['Input', 'Value', 'Unit', 'Source and quality']}
        body={model.inputs.rows.map((r) => [r.label, r.value, r.unit, r.source])} note={model.inputs.note} />
      {model.handoff
        ? <Table testId="rrv-report-handoff" title="Handoff from ReservoirCalc Pro" head={['Item', 'As recorded']} body={model.handoff} />
        : <div className={card} data-testid="rrv-report-handoff"><div className={h}>Handoff from ReservoirCalc Pro</div><p className="text-xs text-pl-muted">None: this prospect was typed in Risked Reserves Valuation.</p></div>}
      {model.chance.rows
        ? <Table testId="rrv-report-chance" title="Chance of success" head={['Factor', 'Chance (fraction)', 'Chance (%)']} body={model.chance.rows} note={model.chance.note} />
        : <div className={card} data-testid="rrv-report-chance"><div className={h}>Chance of success</div><p className="text-xs text-pl-muted">{model.chance.statement}</p></div>}
      {model.valued && (
        <>
          <Table testId="rrv-report-headline" title="Headline results" head={model.headline.head} body={model.headline.body} note={model.headline.note} />
          <Table testId="rrv-report-volumes" title="Volumes: unrisked and risked" head={model.volumes.head} body={model.volumes.body} note={model.volumes.note} />
          <Table testId="rrv-report-economics" title="Economics: the MEFS and the value of a discovery" head={['Item', 'As used']} body={model.economics.basis} />
          <Table testId="rrv-report-value-size" title="Value by field size" head={model.economics.table.head} body={model.economics.table.body} note={model.economics.table.note} />
          <Table testId="rrv-report-value" title="Expected monetary value, in its parts" head={model.value.head} body={model.value.body} note={model.value.note} />
          <Table testId="rrv-report-outcomes" title="Outcomes of the exploration well" head={model.outcomes.head} body={model.outcomes.body} note={model.outcomes.note} />
          {model.portfolio && <Table testId="rrv-report-portfolio" title="Portfolio context" head={model.portfolio.head} body={model.portfolio.body} note={model.portfolio.note} />}
          <div className={card} data-testid="rrv-report-limits">
            <div className={h}>Limits of this analysis</div>
            <ul className="list-disc pl-4 space-y-1 text-xs text-pl-muted">{model.limits.assumptions.map((l) => <li key={l}>{l}</li>)}</ul>
            <div className={`${h} mt-3`}>Flags on this prospect</div>
            {model.limits.flags.length
              ? <ul className="list-disc pl-4 space-y-1 text-xs text-pl-warning-text" data-testid="rrv-report-flags">{model.limits.flags.map((l) => <li key={l}>{l}</li>)}</ul>
              : <p className="text-xs text-pl-muted" data-testid="rrv-report-flags">{model.limits.noFlagsText}</p>}
          </div>
          <div className={card} data-testid="rrv-report-figures">
            <div className={h}>Plots in the PDF</div>
            <ol className="list-decimal pl-4 space-y-1 text-xs text-pl-muted">
              {model.figures.map((f) => <li key={f.id}><span className="text-pl-text">{f.title}.</span> {f.panels ? f.caption : f.statement}</li>)}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
