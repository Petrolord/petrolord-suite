// Electrofacies Studio: pieces shared by the panels (Data & AI D3).
//
// On screen every figure goes through qcDisplay.displayNumber (at most 6
// decimals, integers as they are); the CSV keeps the engine's full values.
// Engine refusals are shown verbatim through EngineError.
import React from 'react';
import { Button } from '@/components/ui/button';
import { useElectrofacies } from '@/contexts/ElectrofaciesContext';
import { displayNumber as dn } from '@/utils/dataAi/qcDisplay';
import { EngineError, Note } from '@/components/dataai/quality/shared';

export { dn };

const JOB_NAMES = {
  pca: 'PCA', kmeans: 'k-means', elbow: 'Elbow', agglomerative: 'Agglomerative clustering', knn: 'kNN', cart: 'CART',
};

/** The running job with its progress count and a cancel button. */
export const BusyBar = () => {
  const { busy, cancelJob } = useElectrofacies();
  if (!busy) return null;
  const pct = busy.total ? Math.round((100 * busy.done) / busy.total) : null;
  return (
    <div className="flex items-center gap-3 rounded border border-sky-800 bg-sky-950/40 p-2 text-xs text-sky-100" role="status" data-testid="busy-bar">
      <span>
        Running {JOB_NAMES[busy.job] || busy.job}
        {busy.total ? `: ${busy.phase ? `${busy.phase}, ` : ''}${busy.done.toLocaleString('en-US')} of ${busy.total.toLocaleString('en-US')}` : ' in the background'}
      </span>
      {pct !== null ? (
        <div className="h-1.5 w-40 overflow-hidden rounded bg-slate-800">
          <div className="h-full bg-sky-500" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <Button size="sm" variant="ghost" className="h-6 text-sky-200" onClick={cancelJob}>Cancel</Button>
    </div>
  );
};

/** A run button that is off while another job runs or the design is refused. */
export const RunButton = ({ job, children, testId }) => {
  const { runJob, busy, design } = useElectrofacies();
  const ready = design && !design.error;
  return (
    <Button size="sm" disabled={!ready || !!busy} onClick={() => runJob(job)} data-testid={testId || `run-${job}`}>
      {children}
    </Button>
  );
};

export const StaleNote = ({ job }) => {
  const { isStale } = useElectrofacies();
  return isStale(job)
    ? <Note tone="warn" testId={`stale-${job}`}>The logs, the core facies or the settings have changed since this ran. Run it again to see results for the current inputs.</Note>
    : null;
};

export const NeedDesign = () => {
  const { design } = useElectrofacies();
  if (!design) return <Note testId="spec-no-data">Load data and choose logs first.</Note>;
  if (design.error) return <EngineError result={design} />;
  return null;
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
          {headers.map((h) => <th key={h} className="px-2 py-1 font-medium">{h}</th>)}
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

/** Confusion matrix: core facies down, predicted across (engine layout). */
export const ConfusionTable = ({ report, testId = 'confusion', predictedName = 'Predicted' }) => (
  <Grid
    testId={testId}
    caption={`Rows: core facies. Columns: ${predictedName.toLowerCase()}. Each cell counts rows (engine confusionMatrix layout).`}
    headers={['Core facies', ...report.labels.map((l) => `${predictedName} ${l}`)]}
    rows={report.labels.map((l, i) => [String(l), ...report.matrix[i]])}
  />
);

/** Per-class precision, recall, F1 and support with the macro and weighted means. */
export const ReportTable = ({ report, testId = 'report' }) => (
  <Grid
    testId={testId}
    headers={['Facies', 'Precision', 'Recall', 'F1', 'Support']}
    rows={[
      ...report.perClass.map((c) => [String(c.label), c.precision, c.recall, c.f1, c.support]),
      ['Macro mean', report.macro.precision, report.macro.recall, report.macro.f1, ''],
      ['Weighted mean', report.weighted.precision, report.weighted.recall, report.weighted.f1, ''],
    ]}
  />
);

/** Clusters against the core facies: the matching that ran, the mapping, the scores. */
export const CoreComparison = ({ compare, testId = 'core-compare' }) => {
  if (!compare) return null;
  if (compare.none) return <Note testId={`${testId}-none`}>{compare.none}</Note>;
  const m = compare.match;
  if (m.error) return <EngineError result={m} prefix="Matching" />;
  return (
    <div className="space-y-2" data-testid={testId}>
      <p className="text-xs text-slate-200" data-testid={`${testId}-mode`}>
        Matching ran {compare.modeText}. {compare.rows.toLocaleString('en-US')} cored rows compared.
      </p>
      <p className="text-xs text-slate-200">
        Adjusted Rand index <span className="font-mono" data-testid={`${testId}-ari`}>{dn(m.ari)}</span>
        {' '}(independent of the matching; 1 is the same partition, about 0 is chance).
        Accuracy after matching <span className="font-mono" data-testid={`${testId}-accuracy`}>{dn(m.report.accuracy)}</span>
        {' '}({m.matchedRows.toLocaleString('en-US')} rows on their matched facies).
      </p>
      <Grid
        testId={`${testId}-mapping`}
        headers={['Cluster', 'Matched facies', 'Rows of that facies', 'Cluster rows (cored)']}
        rows={m.mapping.map((x) => [String(x.cluster), String(x.facies), x.rows, x.clusterSize])}
      />
      <ConfusionTable report={m.report} testId={`${testId}-confusion`} predictedName="Matched" />
      <ReportTable report={m.report} testId={`${testId}-report`} />
      {m.report.undefinedRatios.length ? (
        <Note>
          {m.report.undefinedRatios.length} ratio{m.report.undefinedRatios.length === 1 ? ' has' : 's have'} a zero denominator and score 0 (engine zeroDivision 0).
        </Note>
      ) : null}
    </div>
  );
};
