// AI Evaluation Studio: pieces shared by the panels (Data & AI D5).
//
// On screen every figure goes through qcDisplay.displayNumber (at most 6
// decimals, integers as they are); the CSV keeps the engine's full values.
// Engine refusals are shown verbatim through EngineError.
import React from 'react';
import { Button } from '@/components/ui/button';
import { useEvaluation } from '@/contexts/EvaluationContext';
import { displayNumber as dn, displayReason } from '@/utils/dataAi/qcDisplay';
import { Note, SelectField } from '@/components/dataai/quality/shared';

export { dn, displayReason };

const JOB_NAMES = {
  retrieval: 'the retrieval run',
  metrics: 'the retrieval metrics',
  compare: 'the system comparison',
  answers: 'the groundedness check',
  extraction: 'the extraction scoring',
  agreement: 'the agreement',
  calibration: 'the calibration',
};

/** The running job with a cancel button. */
export const BusyBar = () => {
  const { busy, cancelJob } = useEvaluation();
  if (!busy) return null;
  return (
    <div className="flex items-center gap-3 rounded border border-sky-800 bg-sky-950/40 p-2 text-xs text-sky-100" role="status" data-testid="busy-bar">
      <span>Running {JOB_NAMES[busy.job] || busy.job} in the background</span>
      <Button size="sm" variant="ghost" className="h-6 text-sky-200" onClick={cancelJob}>Cancel</Button>
    </div>
  );
};

/** A run button that is off while another job runs or the dataset lacks what the job needs. */
export const RunButton = ({ job, children, testId }) => {
  const { runJob, busy, jobReady } = useEvaluation();
  return (
    <Button size="sm" disabled={!jobReady(job) || !!busy} onClick={() => runJob(job)} data-testid={testId || `run-${job}`}>
      {children}
    </Button>
  );
};

export const StaleNote = ({ job }) => {
  const { isStale } = useEvaluation();
  return isStale(job)
    ? <Note tone="warn" testId={`stale-${job}`}>The data or the settings have changed since this ran. Run it again to see results for the current inputs.</Note>
    : null;
};

export const NeedData = () => {
  const { dataset, reloadError } = useEvaluation();
  if (dataset) return null;
  return <Note tone="warn" testId="no-dataset">{reloadError || 'No dataset is loaded. Load the Ekene synthetic documents or upload a corpus on the Corpus and queries tab.'}</Note>;
};

/** A small table; numbers go through displayNumber. */
export const Grid = ({
  headers, rows, testId, caption, maxHeight,
}) => (
  <div className={`overflow-x-auto ${maxHeight ? `${maxHeight} overflow-y-auto` : ''}`}>
    <table className="w-full text-left text-xs text-slate-200" data-testid={testId}>
      {caption ? <caption className="mb-1 text-left text-[11px] text-slate-400">{caption}</caption> : null}
      <thead>
        <tr className="border-b border-slate-700 text-slate-400">
          {headers.map((h, i) => <th key={`${i}-${h}`} className="px-2 py-1 font-medium">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-slate-800 align-top">
            {r.map((c, j) => (
              <td key={j} className="px-2 py-1 font-mono">{typeof c === 'number' ? dn(c) : c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** A metric, or the word "undefined" when the engine returned null. */
export const metricCell = (v) => (v === null || v === undefined ? 'undefined' : v);

/** The engine's basis lines, as the engine wrote them. */
export const Basis = ({ basis, testId }) => {
  if (!basis) return null;
  return (
    <details className="rounded border border-slate-800 p-2 text-[11px] text-slate-400" data-testid={testId}>
      <summary className="cursor-pointer text-slate-300">How the engine computed this</summary>
      <dl className="mt-1 space-y-1">
        {Object.entries(basis).map(([k, v]) => (
          <div key={k}>
            <dt className="inline font-semibold text-slate-300">{k}: </dt>
            <dd className="inline">{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
};

/** A picker over the run sources: the current retrieval settings or a system's retrieved lists. */
export const SourcePicker = ({
  label, value, onChange, testId,
}) => {
  const { dataset } = useEvaluation();
  const options = [{ value: 'retrieval', label: 'Current retrieval settings' }]
    .concat((dataset?.systems || []).map((s) => ({ value: s.id, label: `${s.name} (its retrieved lists)` })));
  return <SelectField label={label} value={value} onChange={onChange} testId={testId} options={options} />;
};

export const SystemPicker = ({
  label, value, onChange, testId, ids,
}) => {
  const { dataset } = useEvaluation();
  const list = ids || (dataset?.systems || []).map((s) => s.id);
  const nameOf = (id) => dataset?.systems.find((s) => s.id === id)?.name || `System ${id}`;
  return <SelectField label={label} value={value} onChange={onChange} testId={testId} options={list.map((id) => ({ value: id, label: nameOf(id) }))} />;
};
