// Data Quality Studio: scorecard and flag table (Data & AI D1).
//
// The scorecard is the engine's scorecard() on the dimension counts the
// profile run made; the flag table lists every engine flag with its rule and
// reason. On screen a reason's long decimals are shortened for reading by
// displayReason (qcDisplay.js); the exports keep the engine's text. Refused
// checks are listed with the engine's own reason.
import React, { useMemo, useState } from 'react';
import { useDataQualityStudio } from '@/contexts/DataQualityStudioContext';
import { SCORE_BASIS, dimensionLabel } from '@/utils/dataAi/qcProfile';
import { displayNumber, displayReason } from '@/utils/dataAi/qcDisplay';
import { EngineError, Note, Section, SelectField, fmt } from './shared';

const PAGE = 200;

/**
 * The flagged sample's value and the entry it was compared with. On an index
 * flag the value is the index itself, shown as its label (a date reads as a
 * date); elsewhere it is the engine's number, shortened for reading.
 */
export const flagFigures = (f) => {
  const isIndex = f.method === 'index';
  const value = isIndex ? (f.value === null || f.value === undefined ? '' : f.at) : displayNumber(f.value);
  let previous = '';
  if (f.previous !== null && f.previous !== undefined) {
    previous = isIndex ? String(f.previousAt ?? '') : `${displayNumber(f.previous)}${f.previousAt ? ` at ${f.previousAt}` : ''}`;
  }
  return { value: value ?? '', previous };
};

export const Scorecard = ({ run }) => {
  const sc = run.scorecard;
  if (!sc) {
    return <Note testId="scorecard-empty">No dimension had anything to check, so there is no scorecard. Turn on a check or choose channels.</Note>;
  }
  if (sc.error) return <EngineError result={sc} prefix="Scorecard" />;
  return (
    <div className="space-y-2" data-testid="scorecard">
      <div className="flex flex-wrap items-baseline gap-4">
        <div>
          <div className="text-[11px] text-slate-400">Weighted score</div>
          <div className="font-mono text-2xl text-white" data-testid="score-total">{sc.total.toFixed(4)}</div>
        </div>
        <div className="text-xs text-slate-300">Weakest dimension: <span className="font-medium" data-testid="score-weakest">{dimensionLabel(sc.weakest)}</span></div>
      </div>
      <table className="w-full text-xs">
        <thead className="text-left text-slate-400">
          <tr><th className="py-1">Dimension</th><th>Checked</th><th>Failed</th><th>Weight</th><th>Score</th><th>Contribution</th></tr>
        </thead>
        <tbody className="font-mono text-slate-200">
          {sc.dimensions.map((d) => (
            <tr key={d.name} className="border-t border-slate-800" data-testid={`score-${d.name}`}>
              <td className="py-1 font-sans">{dimensionLabel(d.name)}</td>
              <td>{d.checked}</td>
              <td>{d.failed}</td>
              <td>{d.weight.toFixed(4)}</td>
              <td>{d.score.toFixed(4)}</td>
              <td>{d.contribution.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="text-[11px] text-slate-400">
        <summary className="cursor-pointer hover:text-slate-200">How the dimensions are counted</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {SCORE_BASIS.map((t) => <li key={t}>{t}</li>)}
          <li>{sc.basis.weights}; {sc.basis.tieBreak}.</li>
          <li>No grade bands are given: a threshold for good enough is your organization&apos;s to set.</li>
        </ul>
      </details>
    </div>
  );
};

export const FlagTable = ({ run }) => {
  const [dim, setDim] = useState('');
  const [method, setMethod] = useState('');
  const [channel, setChannel] = useState('');
  const [page, setPage] = useState(0);
  const facets = useMemo(() => ({
    dims: [...new Set(run.flags.map((f) => f.dimension))],
    methods: [...new Set(run.flags.map((f) => f.method))],
    channels: [...new Set(run.flags.map((f) => f.channel).filter(Boolean))],
  }), [run]);
  const rows = run.flags.filter((f) => (!dim || f.dimension === dim) && (!method || f.method === method) && (!channel || f.channel === channel));
  const shown = rows.slice(page * PAGE, (page + 1) * PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  if (!run.flags.length) {
    return <Note testId="flags-empty">No check raised a flag with these parameters. That is the answer to the checks that ran, listed under the scorecard; it says nothing about checks that were off.</Note>;
  }
  return (
    <div className="space-y-2" data-testid="flag-table">
      <div className="flex flex-wrap items-end gap-2">
        <SelectField label="Dimension" value={dim} onChange={(v) => { setDim(v); setPage(0); }} emptyLabel="All" options={facets.dims.map((d) => ({ value: d, label: d }))} className="w-40" />
        <SelectField label="Method" value={method} onChange={(v) => { setMethod(v); setPage(0); }} emptyLabel="All" options={facets.methods.map((d) => ({ value: d, label: d }))} className="w-40" />
        <SelectField label="Channel" value={channel} onChange={(v) => { setChannel(v); setPage(0); }} emptyLabel="All" options={facets.channels.map((d) => ({ value: d, label: d }))} className="w-40" />
        <span className="text-xs text-slate-400" data-testid="flag-count">{rows.length} of {run.flags.length} flags</span>
      </div>
      <div className="max-h-[28rem] overflow-auto rounded border border-slate-800">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-900 text-left text-slate-400">
            <tr><th className="px-2 py-1">Dimension</th><th>Method</th><th>Channel</th><th title="Counted from 0, the numbering the reasons use (entry 57 is the 58th value)">Entry</th><th>At</th><th>Rule</th><th>Value</th><th>Previous</th><th>Reason</th></tr>
          </thead>
          <tbody className="text-slate-200">
            {shown.map((f, i) => {
              const fig = flagFigures(f);
              return (
                <tr key={`${f.method}-${f.channel}-${f.index}-${i}`} className="border-t border-slate-800 align-top" data-testid="flag-row">
                  <td className="px-2 py-1">{f.dimension}</td>
                  <td>{f.method}</td>
                  <td>{f.channel}</td>
                  <td className="font-mono" data-testid="flag-entry">{Number.isInteger(f.index) ? f.index : ''}</td>
                  <td className="font-mono">{f.at}</td>
                  <td className="font-mono text-sky-300">{f.rule}</td>
                  <td className="font-mono" data-testid="flag-value">{fig.value}</td>
                  <td className="font-mono" data-testid="flag-previous">{fig.previous}</td>
                  <td data-testid="flag-reason" title={f.reason}>{displayReason(f.reason)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded bg-slate-800 px-2 py-0.5 disabled:opacity-40">Previous</button>
          <span>Page {page + 1} of {pages}</span>
          <button type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="rounded bg-slate-800 px-2 py-0.5 disabled:opacity-40">Next</button>
        </div>
      ) : null}
    </div>
  );
};

/** The parameters a check ran with, where the engine echoes them. */
export const checkParameters = (r) => {
  const res = r.result || {};
  if (r.method === 'hampel' && res.basis && res.basis.nSigma !== undefined) {
    return `; n sigma ${displayNumber(res.basis.nSigma)}, half window ${displayNumber(res.basis.halfWindow)} samples, 1.4826 x MAD`;
  }
  if (r.method === 'z-score' && Number.isFinite(res.maxPossibleAbsZ)) {
    // One sentence through displayReason, so the ceiling and the threshold
    // never round to the same figure when they differ.
    return displayReason(`; with ${res.n} values the largest possible |z| is ${res.maxPossibleAbsZ} (${res.basis.ceiling}), so the threshold ${res.threshold} ${res.thresholdReachable ? 'can' : 'cannot'} be reached`);
  }
  return '';
};

const CheckList = ({ run }) => {
  const refused = run.results.filter((r) => r.result && r.result.error);
  const ran = run.results.filter((r) => r.result && !r.result.error);
  return (
    <div className="space-y-2">
      {refused.length ? (
        <div className="space-y-1" data-testid="refused-checks">
          <p className="text-xs text-amber-200">{refused.length} check{refused.length === 1 ? ' was' : 's were'} refused by the engine and did not count:</p>
          {refused.map((r, i) => (
            <EngineError key={i} result={r.result} prefix={`${r.method}${r.channel ? ` on ${r.channel}` : ''}`} />
          ))}
        </div>
      ) : null}
      <details className="text-[11px] text-slate-400">
        <summary className="cursor-pointer hover:text-slate-200">{ran.length} checks ran</summary>
        <ul className="mt-1 space-y-0.5">
          {ran.map((r, i) => (
            <li key={i}>
              {r.dimension}: {r.method}{r.channel ? ` on ${r.channel}` : ''}, {(r.result.flags || []).length} flag{(r.result.flags || []).length === 1 ? '' : 's'}
              {r.result.basis?.rule ? `; rule ${r.result.basis.rule}` : ''}
              {checkParameters(r)}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
};

const ResultsPanel = () => {
  const { run, stale, dataset, savedSummary, dataChanged } = useDataQualityStudio();
  if (!dataset) return <Note testId="results-empty">Load data and run a QC profile to see the scorecard and the flags.</Note>;
  if (!run) return <Note testId="results-not-run">Run the QC profile to see the scorecard and the flags.</Note>;
  return (
    <div className="space-y-3" data-testid="results-panel">
      {stale ? <Note tone="warn">These results are from the last run; parameters have changed since.</Note> : null}
      {dataChanged ? (
        <Note tone="warn" testId="data-changed">
          The data has changed since this run was saved (its fingerprint differs). The results below are for the data as it is now;
          the saved run scored {savedSummary.total === null ? 'nothing' : fmt(savedSummary.total)} with {savedSummary.flagCount} flags on {savedSummary.ranAt?.slice(0, 10)}.
        </Note>
      ) : null}
      <Section title="Scorecard"><Scorecard run={run} /></Section>
      <Section title="Flags"><FlagTable run={run} /></Section>
      <Section title="Checks"><CheckList run={run} /></Section>
    </div>
  );
};

export default ResultsPanel;
