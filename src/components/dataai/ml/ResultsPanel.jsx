// ML Workbench: validation results (Data & AI D2).
//
// Per-fold and pooled held-out scores, the coefficients of the model fitted
// on every row, and the crossplot, depth track and ROC curve. Every number
// is the engine's from the last run; refusals are shown in the engine's own
// words. Figures are rounded for reading (qcDisplay rules); the CSV export
// keeps full precision.
import React, { useMemo, useState } from 'react';
import { useMlWorkbench } from '@/contexts/MlWorkbenchContext';
import { displayNumber as dn } from '@/utils/dataAi/qcDisplay';
import { modelText, validationText } from '@/utils/dataAi/mlReport';
import {
  EngineError, Note, Section, SelectField,
} from '@/components/dataai/quality/shared';
import {
  CrossPlot, DepthTrack, RocChart, MAX_PLOT_POINTS, strideNote,
} from './charts';

const Th = ({ children }) => <th className="px-2 py-1 text-left font-medium text-slate-400">{children}</th>;
const Td = ({ children, mono = true }) => <td className={`px-2 py-1 ${mono ? 'font-mono' : ''} text-slate-200`}>{children}</td>;

export const StaleNote = ({ keyName }) => {
  const { isStale } = useMlWorkbench();
  return isStale(keyName)
    ? <Note tone="warn" testId={`stale-${keyName}`}>The spec or the data has changed since this ran. Run it again to see results for what is on screen.</Note>
    : null;
};

const SavedNote = () => {
  const { savedSummary, dataChanged } = useMlWorkbench();
  if (!savedSummary) return null;
  return (
    <div className="space-y-1 rounded border border-slate-800 p-2 text-xs text-slate-300" data-testid="saved-summary">
      <p>
        Saved run: {savedSummary.task}, target {savedSummary.target}, {savedSummary.rows} rows,
        saved {savedSummary.ranAt ? savedSummary.ranAt.slice(0, 16).replace('T', ' ') : ''} UTC with {savedSummary.engine}.
        {savedSummary.pooled ? ` Pooled then: ${Object.entries(savedSummary.pooled).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k} ${dn(v)}`).join(', ')}.` : ''}
      </p>
      {dataChanged ? <Note tone="warn" testId="data-changed">The data read now differs from the numbers this run fitted (the fingerprints differ), so a rerun will not reproduce the saved scores exactly.</Note> : null}
      <Note>Press Fit and validate to recompute everything with the engine.</Note>
    </div>
  );
};

const FoldTable = ({ ev }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs" data-testid="fold-table">
      <thead>
        <tr>
          <Th>Fold</Th><Th>Held-out wells</Th><Th>Train rows</Th><Th>Test rows</Th>
          {ev.task === 'classification'
            ? (<><Th>Accuracy</Th><Th>F1 class 1</Th><Th>AUC</Th><Th>Log loss</Th><Th>Converged</Th></>)
            : (<><Th>RMSE</Th><Th>MAE</Th><Th>R²</Th><Th>Train R²</Th></>)}
        </tr>
      </thead>
      <tbody>
        {ev.folds.map((f) => (
          <tr key={f.fold} className="border-t border-slate-800 align-top">
            <Td>{f.fold}</Td>
            <Td mono={false}>{f.testGroups.join(', ')}</Td>
            <Td>{f.nTrain}</Td>
            <Td>{f.nTest}</Td>
            {f.error ? (
              <td colSpan={ev.task === 'classification' ? 5 : 4} className="px-2 py-1"><EngineError result={f} prefix={`Refused (${f.stage})`} /></td>
            ) : ev.task === 'classification' ? (
              <>
                <Td>{dn(f.test.report.accuracy)}</Td>
                <Td>{dn(f.test.report.perClass?.[1]?.f1)}</Td>
                <Td>{f.test.roc.error ? <span className="text-amber-200">{f.test.roc.error}</span> : dn(f.test.roc.auc)}</Td>
                <Td>{dn(f.test.logLoss.logLoss)}</Td>
                <Td mono={false}>{f.fit.converged ? `yes, ${f.fit.iterations} updates` : <span className="text-amber-200">no: {f.fit.warning}</span>}</Td>
              </>
            ) : (
              <>
                <Td>{dn(f.test.rmse)}</Td>
                <Td>{dn(f.test.mae)}</Td>
                <Td>{dn(f.test.r2)}</Td>
                <Td>{dn(f.train.r2)}</Td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const CoefficientTable = ({ final, standardise }) => {
  if (!final) return null;
  if (final.error) return <EngineError result={final} prefix="The model on every row was refused" />;
  const f = final.fit;
  return (
    <div className="space-y-1">
      <table className="w-full text-xs" data-testid="coef-table">
        <thead>
          <tr>
            <Th>Term</Th><Th>Coefficient</Th>
            {f.standardErrors ? <Th>Standard error</Th> : null}
            {f.tValues ? <Th>t</Th> : null}
            {f.standardizedCoefficients ? <Th>Coefficient on the engine&apos;s standardised features</Th> : null}
          </tr>
        </thead>
        <tbody>
          {f.names.map((nm, j) => (
            <tr key={nm} className="border-t border-slate-800">
              <Td mono={false}>{nm}</Td>
              <Td>{dn(f.coefficients[j])}</Td>
              {f.standardErrors ? <Td>{dn(f.standardErrors[j])}</Td> : null}
              {f.tValues ? <Td>{dn(f.tValues[j])}</Td> : null}
              {f.standardizedCoefficients ? <Td>{dn(f.standardizedCoefficients[j])}</Td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      <Note>
        {standardise
          ? 'Features were standardised with the training rows\' mean and population SD, so each coefficient is the change in the target (or the log odds) per one SD of its feature, and the intercept is the value at the feature means.'
          : 'Features were used as given, so each coefficient is per unit of its feature.'}
        {f.kind === 'ols' ? ` Standard errors are s x sqrt(diag((X'X)^-1)) with s² = RSS / (n - p). Scaled condition number ${dn(f.scaledConditionNumber)} (refused above 1e8).` : ''}
        {f.kind === 'ridge' ? ` Ridge gives no standard errors. Effective degrees of freedom ${dn(f.effectiveDegreesOfFreedom)}.` : ''}
        {f.kind === 'logistic' ? ` Standard errors from the inverse information at the solution. ${f.converged ? `Converged in ${f.iterations} Newton updates.` : f.warning}` : ''}
        {' '}This is the model fitted on every row; it is the one written to a well.
      </Note>
    </div>
  );
};

const RegressionCharts = ({ ev, design, table }) => {
  const wells = useMemo(() => [...new Set(ev.tested.map((i) => design.groups[i]))], [ev, design]);
  const [well, setWell] = useState(wells[0] || '');
  const target = design.targetText;
  const unit = table.units?.[target] ? ` (${table.units[target]})` : '';
  const points = useMemo(() => ev.tested.map((i) => ({ x: design.y[i], y: ev.oof[i] })), [ev, design]);
  const track = useMemo(() => ev.tested.filter((i) => design.groups[i] === (well || wells[0]) && design.depth[i] !== null)
    .map((i) => ({ depth: design.depth[i], actual: design.y[i], predicted: ev.oof[i] })), [ev, design, well, wells]);
  const stride = Math.max(1, Math.ceil(track.length / MAX_PLOT_POINTS));
  return (
    <>
      <Section title="Predicted against measured (held-out rows)">
        <CrossPlot points={points} xLabel={`Measured ${target}${unit}`} yLabel={`Predicted ${target}${unit}`} />
      </Section>
      <Section title="Depth track (a held-out well)">
        <SelectField label="Well" value={well || wells[0]} onChange={setWell} options={wells.map((w) => ({ value: w, label: w }))} className="w-48" testId="track-well" />
        {track.length ? (
          <>
            <DepthTrack rows={stride > 1 ? track.filter((_, i) => i % stride === 0) : track} valueLabel={`${target}${unit}`} depthLabel={`Depth (${table.depthUnit || 'm'})`} />
            {stride > 1 ? <Note>{strideNote(track.length, stride)}</Note> : null}
            <Note>The predicted curve for this well comes from the fold that held it out, so the model never saw it.</Note>
          </>
        ) : <Note>This data has no depth, so there is no depth track.</Note>}
      </Section>
    </>
  );
};

const ClassificationSummary = ({ ev }) => {
  const p = ev.pooled;
  if (!p) return null;
  const r = p.report;
  return (
    <div className="space-y-3" data-testid="classification-pooled">
      {r.error ? <EngineError result={r} prefix="Report" /> : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs text-slate-400">Confusion matrix (rows are the true class, columns the predicted class)</p>
              <table className="text-xs" data-testid="confusion-matrix">
                <thead><tr><Th />{r.labels.map((l) => <Th key={l}>Predicted {l}</Th>)}</tr></thead>
                <tbody>
                  {r.labels.map((l, i) => (
                    <tr key={l} className="border-t border-slate-800"><Td mono={false}>True {l}</Td>{r.matrix[i].map((c, j) => <Td key={r.labels[j]}>{c}</Td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <table className="w-full text-xs" data-testid="class-report">
                <thead><tr><Th>Class</Th><Th>Precision</Th><Th>Recall</Th><Th>F1</Th><Th>Support</Th></tr></thead>
                <tbody>
                  {r.perClass.map((c) => (
                    <tr key={c.label} className="border-t border-slate-800"><Td>{c.label}</Td><Td>{dn(c.precision)}</Td><Td>{dn(c.recall)}</Td><Td>{dn(c.f1)}</Td><Td>{c.support}</Td></tr>
                  ))}
                  <tr className="border-t border-slate-800"><Td mono={false}>Macro</Td><Td>{dn(r.macro.precision)}</Td><Td>{dn(r.macro.recall)}</Td><Td>{dn(r.macro.f1)}</Td><Td /></tr>
                  <tr className="border-t border-slate-800"><Td mono={false}>Weighted</Td><Td>{dn(r.weighted.precision)}</Td><Td>{dn(r.weighted.recall)}</Td><Td>{dn(r.weighted.f1)}</Td><Td /></tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-slate-300">
            Accuracy {dn(r.accuracy)}; ROC AUC {p.roc.error ? 'refused' : dn(p.roc.auc)}; log loss {p.logLoss.error ? 'refused' : dn(p.logLoss.logLoss)}
            {p.logLoss.clipped ? ` (${p.logLoss.clipped} probabilities clipped to [1e-15, 1 - 1e-15])` : ''}.
            {r.undefinedRatios.length ? ` Undefined ratios scored 0: ${r.undefinedRatios.map((u) => `${u.metric} of class ${u.label}`).join(', ')}.` : ''}
          </p>
          <Note>A probability above 0.5 is class 1; exactly 0.5 is class 0. Pooled figures score every held-out row with the probability from the fold that held its well out.</Note>
        </>
      )}
      {p.roc.error ? <EngineError result={p.roc} prefix="ROC" /> : <RocChart roc={p.roc} />}
    </div>
  );
};

const ClassificationTrack = ({ ev, design, table }) => {
  const wells = useMemo(() => [...new Set(ev.tested.map((i) => design.groups[i]))], [ev, design]);
  const [well, setWell] = useState(wells[0] || '');
  const track = ev.tested.filter((i) => design.groups[i] === (well || wells[0]) && design.depth[i] !== null)
    .map((i) => ({ depth: design.depth[i], actual: design.y[i], predicted: ev.oof[i] }));
  if (!track.length) return null;
  const stride = Math.max(1, Math.ceil(track.length / MAX_PLOT_POINTS));
  return (
    <Section title="Depth track (a held-out well)">
      <SelectField label="Well" value={well || wells[0]} onChange={setWell} options={wells.map((w) => ({ value: w, label: w }))} className="w-48" />
      <DepthTrack rows={stride > 1 ? track.filter((_, i) => i % stride === 0) : track} valueLabel="Class and probability of class 1" depthLabel={`Depth (${table.depthUnit || 'm'})`} actualName="True class" predictedName="Probability of class 1" testId="class-track" />
    </Section>
  );
};

const ResultsPanel = () => {
  const {
    results, design, table, parsed, spec, isStale,
  } = useMlWorkbench();
  const r = results.evaluate;
  if (!r) {
    return (
      <div className="space-y-3">
        <SavedNote />
        <Note testId="results-not-run">Fit and validate on the Model tab to see results.</Note>
      </div>
    );
  }
  const { evaluation: ev, final } = r.result;
  // row-level charts index the design the run fitted, so they wait for a rerun after a change
  const fresh = !isStale('evaluate');
  return (
    <div className="space-y-3" data-testid="results-panel">
      <SavedNote />
      <StaleNote keyName="evaluate" />
      {ev.error ? <EngineError result={ev} prefix="Validation refused" /> : (
        <>
          <Section title="Held-out scores">
            <p className="text-xs text-slate-300" data-testid="results-basis">
              {modelText(parsed)}, {validationText(ev)}; {ev.tested.length.toLocaleString('en-US')} held-out rows.
              {r.task === 'regression' && ev.pooled ? (
                <span data-testid="pooled-regression"> Pooled RMSE {dn(ev.pooled.rmse)}, MAE {dn(ev.pooled.mae)}, R² {dn(ev.pooled.r2)}.</span>
              ) : null}
            </p>
            {ev.pooledRefusal ? <Note tone="warn" testId="pooled-refused">{ev.pooledRefusal}</Note> : null}
            <FoldTable ev={ev} />
            <Note>
              Each fold holds out whole wells: the model is fitted on the other wells and scored on these. R² on a fold is
              about the mean of that fold&apos;s own held-out values, and it is negative when the model does worse than that mean.
              {ev.scheme === 'kfold' ? ' Group k-fold deals the wells round robin after one seeded shuffle, so folds differ by at most one well, whatever their row counts.' : ''}
            </Note>
          </Section>
          {r.task === 'classification' && ev.pooled ? <Section title="Classification (pooled held-out rows)"><ClassificationSummary ev={ev} /></Section> : null}
          <Section title="Coefficients"><CoefficientTable final={final} standardise={parsed.standardise} /></Section>
          {fresh && r.task === 'regression' && design && !design.error && ev.tested.length ? <RegressionCharts ev={ev} design={design} table={table} /> : null}
          {fresh && r.task === 'classification' && design && !design.error && ev.tested.length ? <ClassificationTrack ev={ev} design={design} table={table} /> : null}
          {spec.task !== r.task ? <Note tone="warn">These results are for the {r.task} task.</Note> : null}
        </>
      )}
    </div>
  );
};

export default ResultsPanel;
