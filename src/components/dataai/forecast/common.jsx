// Production Forecasting ML Workbench: pieces shared by the panels (Data & AI D4).
//
// On screen every figure goes through qcDisplay.displayNumber (at most 6
// decimals, integers as they are); the CSV keeps the engine's full values.
// Engine refusals are shown verbatim through EngineError.
import React from 'react';
import { Button } from '@/components/ui/button';
import { useForecasting } from '@/contexts/ForecastingContext';
import { displayNumber as dn } from '@/utils/dataAi/qcDisplay';
import { Note, SelectField } from '@/components/dataai/quality/shared';

export { dn };

const JOB_NAMES = {
  fit: 'the fits', intervals: 'the bootstrap intervals', compare: 'the backtest', field: 'the field comparison',
};

/** The running job with its progress count and a cancel button. */
export const BusyBar = () => {
  const { busy, cancelJob } = useForecasting();
  if (!busy) return null;
  const pct = busy.total ? Math.round((100 * busy.done) / busy.total) : null;
  return (
    <div className="flex items-center gap-3 rounded border border-sky-800 bg-sky-950/40 p-2 text-xs text-sky-100" role="status" data-testid="busy-bar">
      <span>
        Running {JOB_NAMES[busy.job] || busy.job}
        {busy.total ? `: ${busy.done.toLocaleString('en-US')} of ${busy.total.toLocaleString('en-US')} wells` : ' in the background'}
      </span>
      {pct !== null ? (
        <div className="h-1.5 w-40 overflow-hidden rounded bg-slate-800">
          <div className="h-full bg-sky-500" style={{ width: `${pct}%` }} data-testid="busy-progress" />
        </div>
      ) : null}
      <Button size="sm" variant="ghost" className="h-6 text-sky-200" onClick={cancelJob}>Cancel</Button>
    </div>
  );
};

/** A run button that is off while another job runs or there is no series. */
export const RunButton = ({ job, children, testId }) => {
  const {
    runJob, busy, table, series,
  } = useForecasting();
  const ready = job === 'field' ? !!table : !!series;
  return (
    <Button size="sm" disabled={!ready || !!busy} onClick={() => runJob(job)} data-testid={testId || `run-${job}`}>
      {children}
    </Button>
  );
};

export const StaleNote = ({ job }) => {
  const { isStale } = useForecasting();
  return isStale(job)
    ? <Note tone="warn" testId={`stale-${job}`}>The series or the settings have changed since this ran. Run it again to see results for the current inputs.</Note>
    : null;
};

export const NeedSeries = () => {
  const { table } = useForecasting();
  if (!table) return <Note testId="spec-no-data">Load a production series first.</Note>;
  return null;
};

/** The well whose series the fits, intervals and backtest use. */
export const WellPicker = () => {
  const { table, spec, updateSpec } = useForecasting();
  if (!table) return null;
  return (
    <div className="w-72">
      <SelectField
        label="Well"
        value={spec.well}
        onChange={(v) => updateSpec(['well'], v)}
        testId="well-picker"
        options={table.wells.map((w) => ({ value: w.name, label: `${w.name} (${w.values.length} steps)` }))}
      />
    </div>
  );
};

/** A small table; numbers go through displayNumber. */
export const Grid = ({
  headers, rows, testId, caption,
}) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs text-slate-200" data-testid={testId}>
      {caption ? <caption className="mb-1 text-left text-[11px] text-slate-400">{caption}</caption> : null}
      <thead>
        <tr className="border-b border-slate-700 text-slate-400">
          {headers.map((h, i) => <th key={`${i}-${h}`} className="px-2 py-1 font-medium">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-slate-800">
            {r.map((c, j) => (
              <td key={j} className="px-2 py-1 font-mono">{typeof c === 'number' ? dn(c) : c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** A metric, or the words "undefined" when the engine returned null. */
export const metricCell = (v) => (v === null || v === undefined ? 'undefined' : v);
