// AI Evaluation Studio: retrieval metrics (Data & AI D5).
//
// Precision, recall and hit at k, reciprocal rank, average precision and
// nDCG per judged query and averaged, from the current retrieval settings or
// a system's retrieved lists. The relevance threshold is a visible setting
// (default grade 1, the engine and trec_eval default); a query with no
// passage at the threshold is excluded and listed with the engine's reason,
// or kept with its undefined metrics scored 0.
import React from 'react';
import { useEvaluation } from '@/contexts/EvaluationContext';
import {
  EngineError, Note, Section, SelectField, TextInput,
} from '@/components/dataai/quality/shared';
import {
  Basis, Grid, NeedData, RunButton, SourcePicker, StaleNote, metricCell,
} from '@/components/dataai/evaluate/common';
import { GAINS, NO_RELEVANT, ENGINE_DEFAULTS } from '@/utils/dataAi/evalWorkflows';

export const MEAN_ROWS = [
  ['precision', 'Mean precision@k'],
  ['recall', 'Mean recall@k'],
  ['hitRate', 'Hit rate@k'],
  ['mrr', 'MRR@k (mean reciprocal rank)'],
  ['map', 'MAP@k (mean average precision)'],
  ['ndcg', 'Mean nDCG@k'],
];

/** The shared metric settings (also used by Compare systems). */
export const MetricSettings = () => {
  const { spec, updateSpec } = useEvaluation();
  const m = spec.metrics;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <TextInput label="k (cutoff)" value={m.k} onChange={(v) => updateSpec(['metrics', 'k'], v)} placeholder={String(ENGINE_DEFAULTS.K)} testId="met-k" />
      <TextInput
        label="Relevant at grade"
        value={m.relevantGrade}
        onChange={(v) => updateSpec(['metrics', 'relevantGrade'], v)}
        placeholder={String(ENGINE_DEFAULTS.RELEVANT_GRADE)}
        testId="met-grade"
        source="or more; default 1 (trec_eval). nDCG uses every grade."
      />
      <div className="w-56"><SelectField label="nDCG gain" value={m.gain} onChange={(v) => updateSpec(['metrics', 'gain'], v)} testId="met-gain" options={GAINS} /></div>
      <div className="w-72"><SelectField label="Query with no relevant passage" value={m.noRelevant} onChange={(v) => updateSpec(['metrics', 'noRelevant'], v)} testId="met-norel" options={NO_RELEVANT} /></div>
    </div>
  );
};

const MetricsPanel = () => {
  const {
    dataset, spec, updateSpec, results,
  } = useEvaluation();
  const out = results.metrics?.result;
  if (!dataset) return <NeedData />;
  const e = out?.evaluation;
  return (
    <div className="space-y-4">
      <Section title="Metric settings" testId="metrics-spec">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-72"><SourcePicker label="Ranked lists from" value={spec.metrics.source} onChange={(v) => updateSpec(['metrics', 'source'], v)} testId="met-source" /></div>
          <RunButton job="metrics">Score retrieval</RunButton>
        </div>
        <MetricSettings />
        <Note>
          Unjudged passages count as grade 0 and are counted separately. Precision@k divides by k even when fewer passages are
          ranked. Average precision divides by every relevant judged passage, so a relevant passage below the cutoff lowers it.
          The ideal DCG ranks every judged grade of the query.
        </Note>
      </Section>
      {e ? (
        <Section title={`Results: ${out.label}`} testId="metrics-results">
          <StaleNote job="metrics" />
          {e.error ? <EngineError result={e} /> : (
            <>
              <p className="text-xs text-slate-300" data-testid="metrics-line">
                k {e.k}; relevant at grade {e.relevantGrade} or more; {e.gain} gain; means over {e.nIncluded} of {e.nQueries} judged queries.
              </p>
              <Grid testId="means-table" headers={['Metric', 'Value']} rows={MEAN_ROWS.map(([k, label]) => [label, metricCell(e.mean[k])])} />
              {e.note ? <Note tone="warn">{e.note}</Note> : null}
              {e.excluded.length ? (
                <Grid testId="excluded-table" caption="Excluded from every mean" headers={['Query', 'Reason']} rows={e.excluded.map((x) => [x.query, x.reason])} />
              ) : null}
              {e.zeroed.length ? (
                <Grid testId="zeroed-table" caption="Kept in the means with each undefined metric scored 0" headers={['Query', 'Reason']} rows={e.zeroed.map((x) => [x.query, x.reason])} />
              ) : null}
              <Grid
                testId="per-query-table"
                maxHeight="max-h-96"
                headers={['Query', 'Relevant judged', 'Relevant in top k', 'Unjudged in top k', 'P@k', 'R@k', 'Hit', 'RR', 'AP', 'nDCG', 'Notes']}
                rows={e.perQuery.map((r) => [
                  r.query, r.nRelevant, r.relevantRetrieved, r.unjudgedRetrieved, r.precision, metricCell(r.recall), r.hit, r.reciprocalRank,
                  metricCell(r.averagePrecision), metricCell(r.ndcg), Object.values(r.notes || {}).join('; '),
                ])}
              />
              <Basis basis={e.basis} testId="metrics-basis" />
            </>
          )}
        </Section>
      ) : null}
    </div>
  );
};

export default MetricsPanel;
