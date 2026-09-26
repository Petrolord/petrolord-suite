// AI Evaluation Studio: agreement between graders and calibration of
// probabilities (Data & AI D5).
//
// Agreement: Cohen's kappa between the first and the second grade of every
// judged pair, unweighted and with linear and quadratic weights on the grade
// positions. Calibration: equal-width bins (p in bin i when i/M <= p <
// (i+1)/M, the last bin closed at 1), ECE and MCE over the non-empty bins,
// the Brier score and its Murphy decomposition with the within-bin terms, so
// the identity closes, and log loss from the ML engine.
import React from 'react';
import { useEvaluation } from '@/contexts/EvaluationContext';
import {
  EngineError, Note, Section, TextInput,
} from '@/components/dataai/quality/shared';
import {
  Basis, Grid, NeedData, RunButton, StaleNote, dn, metricCell,
} from '@/components/dataai/evaluate/common';
import { ReliabilityChart, BinCountChart } from '@/components/dataai/evaluate/charts';
import { ENGINE_DEFAULTS } from '@/utils/dataAi/evalWorkflows';

const WEIGHT_NAMES = { none: 'Unweighted', linear: 'Linear weights |i - j|', quadratic: 'Quadratic weights (i - j)^2' };

export const AgreementPanel = () => {
  const { dataset, results } = useEvaluation();
  const out = results.agreement?.result;
  if (!dataset) return <NeedData />;
  if (!dataset.second) {
    return <Note tone="warn" testId="no-second">This dataset has no second grades. Add a grade2 column to the judgments CSV, or a secondAnnotator per query in the JSON file.</Note>;
  }
  const u = out?.results?.none;
  return (
    <div className="space-y-4">
      <Section title="Agreement between the two graders" testId="agreement-spec">
        <Note>
          Every judged (query, passage) pair with both grades is one item. Weighted kappa counts how far apart the two grades are, on the
          grade positions from the lowest to the highest grade seen; a grade nobody used still takes its position.
        </Note>
        <RunButton job="agreement">Compute kappa</RunButton>
      </Section>
      {out ? (
        <Section title="Results" testId="agreement-results">
          <StaleNote job="agreement" />
          <p className="text-xs text-slate-300" data-testid="agreement-line">
            {out.pairs} pairs{out.labels ? `, grades ${out.labels.join(', ')}` : ''}
            {out.missingSecond ? `; ${out.missingSecond} judged pairs have no second grade and are left out` : ''}.
          </p>
          {Object.values(out.results).some((r) => r.error) ? Object.entries(out.results).map(([w, r]) => (r.error ? <EngineError key={w} result={r} prefix={WEIGHT_NAMES[w]} /> : null)) : null}
          <Grid
            testId="kappa-table"
            headers={['Weights', 'Kappa', 'Observed agreement', 'Expected agreement', 'Observed disagreement', 'Expected disagreement']}
            rows={Object.entries(out.results).filter(([, r]) => !r.error).map(([w, r]) => [
              WEIGHT_NAMES[w], metricCell(r.kappa), r.observedAgreement, r.expectedAgreement, r.observedDisagreement, r.expectedDisagreement,
            ])}
          />
          {Object.values(out.results).map((r) => r.note).filter(Boolean).slice(0, 1).map((n) => <Note key={n} tone="warn">{n}</Note>)}
          {u && !u.error ? (
            <Grid
              testId="kappa-confusion"
              caption="Counts: rows the first grade, columns the second grade"
              headers={['', ...u.labels.map((l) => `second ${l}`), 'Total']}
              rows={u.confusion.map((row, i) => [`first ${u.labels[i]}`, ...row, u.rowTotals[i]]).concat([['Total', ...u.columnTotals, u.n]])}
            />
          ) : null}
          {u && !u.error ? <Basis basis={u.basis} testId="agreement-basis" /> : null}
        </Section>
      ) : null}
    </div>
  );
};

export const CalibrationPanel = () => {
  const {
    dataset, spec, updateSpec, results,
  } = useEvaluation();
  const out = results.calibration?.result;
  if (!dataset) return <NeedData />;
  if (!dataset.calibration) {
    return <Note tone="warn" testId="no-calibration">This dataset has no calibration rows. Upload a calibration CSV (probability, outcome) or include them in the JSON file.</Note>;
  }
  const c = out?.result;
  return (
    <div className="space-y-4">
      <Section title="Calibration settings" testId="calibration-spec">
        <div className="flex flex-wrap items-end gap-3">
          <TextInput label="Bins" value={spec.calibration.bins} onChange={(v) => updateSpec(['calibration', 'bins'], v)} placeholder={String(ENGINE_DEFAULTS.BINS)} testId="cal-bins" />
          <RunButton job="calibration">Compute calibration</RunButton>
        </div>
        <Note>
          {dataset.calibration.rows.length.toLocaleString('en-US')} rows. {dataset.calibration.description || ''} A probability on a bin edge
          i/M opens bin i (scikit-learn&apos;s calibration_curve puts it in the bin below, so tables can differ from scikit-learn at the edges).
        </Note>
      </Section>
      {c ? (
        <Section title="Results" testId="calibration-results">
          <StaleNote job="calibration" />
          {c.error ? <EngineError result={c} /> : (
            <>
              <Grid
                testId="calibration-summary"
                headers={['Score', 'Value']}
                rows={[
                  ['Rows', c.n],
                  ['Base rate (share of outcomes 1)', c.baseRate],
                  ['Brier score', c.brier],
                  ['ECE (expected calibration error)', c.ece],
                  ['MCE (largest bin gap)', c.mce],
                  [`Log loss (probabilities clipped to [${c.logLossEps}, 1 - ${c.logLossEps}]; ${c.logLossClipped} clipped)`, c.logLoss],
                ]}
              />
              <Grid
                testId="murphy-table"
                caption="Brier = REL - RES + UNC + WBV - WBC (Stephenson, Coelho and Jolliffe 2008, eq. 7)"
                headers={['Term', 'Value']}
                rows={[
                  ['REL, reliability', c.murphy.reliability],
                  ['RES, resolution', c.murphy.resolution],
                  ['UNC, uncertainty', c.murphy.uncertainty],
                  ['WBV, within-bin variance', c.murphy.withinBinVariance],
                  ['WBC, twice the pooled within-bin covariance', c.murphy.withinBinCovariance],
                  ['Sum', c.murphy.sum],
                  ['Brier', c.brier],
                  ['Closure (Brier minus the sum)', c.murphy.closure],
                ]}
              />
              <p className="text-xs text-slate-300" data-testid="closure-line">The decomposition closes to {dn(c.murphy.closure)} (0 up to rounding).</p>
              <div className="grid gap-3 xl:grid-cols-2">
                <ReliabilityChart calibration={c} />
                <BinCountChart calibration={c} />
              </div>
              <Grid
                testId="reliability-table"
                headers={['Bin', 'Range', 'Rows', 'Mean predicted', 'Observed frequency', 'Gap']}
                rows={c.table.map((b) => [
                  b.bin, `[${dn(b.lower)}, ${dn(b.upper)}${b.closedRight ? ']' : ')'}`, b.n,
                  b.meanPredicted === null ? 'empty' : b.meanPredicted, b.observedFrequency === null ? 'empty' : b.observedFrequency, b.gap === null ? 'empty' : b.gap,
                ])}
              />
              <Basis basis={c.basis} testId="calibration-basis" />
            </>
          )}
        </Section>
      ) : null}
    </div>
  );
};
