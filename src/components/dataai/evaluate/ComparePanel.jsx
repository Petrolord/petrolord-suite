// AI Evaluation Studio: compare two systems (Data & AI D5).
//
// Both systems are scored with the metric settings of the Retrieval metrics
// tab. The per-query values of one metric over the included queries are
// bootstrapped: each system's mean with a percentile interval, and the mean
// difference A minus B, paired by query by default, all from the seed shown.
// Interval ends are labelled as percentiles of the bootstrap statistic
// (lib/conventions/percentile.js), never as P10 or P90.
import React from 'react';
import { useEvaluation } from '@/contexts/EvaluationContext';
import {
  EngineError, Note, Section, SelectField, TextInput, Toggle,
} from '@/components/dataai/quality/shared';
import {
  Basis, Grid, NeedData, RunButton, SourcePicker, StaleNote, dn,
} from '@/components/dataai/evaluate/common';
import { MetricSettings } from '@/components/dataai/evaluate/MetricsPanel';
import { COMPARE_METRICS, LEVELS } from '@/utils/dataAi/evalWorkflows';
import { APP_CAPS } from '@/utils/dataAi/evalData';

const interval = (b) => (b.error ? b.error : `${dn(b.lower)} to ${dn(b.upper)}`);

const ComparePanel = () => {
  const {
    dataset, spec, updateSpec, results,
  } = useEvaluation();
  const c = spec.compare;
  const out = results.compare?.result;
  if (!dataset) return <NeedData />;
  return (
    <div className="space-y-4">
      <Section title="Compare settings" testId="compare-spec">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64"><SourcePicker label="System A" value={c.a} onChange={(v) => updateSpec(['compare', 'a'], v)} testId="cmp-a" /></div>
          <div className="w-64"><SourcePicker label="System B" value={c.b} onChange={(v) => updateSpec(['compare', 'b'], v)} testId="cmp-b" /></div>
          <div className="w-60"><SelectField label="Metric" value={c.metric} onChange={(v) => updateSpec(['compare', 'metric'], v)} testId="cmp-metric" options={COMPARE_METRICS} /></div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <TextInput label="Bootstrap replicates" value={c.nBoot} onChange={(v) => updateSpec(['compare', 'nBoot'], v)} testId="cmp-nboot" source={`Up to ${APP_CAPS.BOOT_MAX.toLocaleString('en-US')}`} />
          <TextInput label="Seed" value={c.seed} onChange={(v) => updateSpec(['compare', 'seed'], v)} testId="cmp-seed" width="w-32" />
          <div className="w-40"><SelectField label="Interval" value={c.level} onChange={(v) => updateSpec(['compare', 'level'], v)} testId="cmp-level" options={LEVELS} /></div>
          <Toggle label="Paired by query" checked={c.paired} onChange={(v) => updateSpec(['compare', 'paired'], v)} testId="cmp-paired" />
          <RunButton job="compare">Compare</RunButton>
        </div>
        <p className="text-[11px] text-slate-400">Metric settings (shared with the Retrieval metrics tab):</p>
        <MetricSettings />
      </Section>
      {out ? (
        <Section title="Results" testId="compare-results">
          <StaleNote job="compare" />
          {out.a.evaluation.error ? <EngineError result={out.a.evaluation} prefix={`System A (${out.a.label})`} /> : null}
          {out.b.evaluation.error ? <EngineError result={out.b.evaluation} prefix={`System B (${out.b.label})`} /> : null}
          {out.refused ? <EngineError result={out.refused} /> : null}
          {out.paired ? (
            out.paired.error ? <EngineError result={out.paired} /> : (
              <>
                <p className="text-xs text-slate-300" data-testid="compare-line">
                  {out.metric.label} over {out.queries.length} included queries; {out.paired.nBoot.toLocaleString('en-US')} replicates, seed {out.paired.seed},
                  {' '}{out.paired.level * 100} percent interval; {out.paired.paired ? 'paired by query (both systems resampled on the same queries)' : 'unpaired (each system resampled on its own)'}.
                </p>
                <Grid
                  testId="compare-table"
                  headers={['', 'Mean', `${out.paired.labels.lower} to ${out.paired.labels.upper}`, 'Standard error']}
                  rows={[
                    [`A: ${out.a.label}`, out.bootA.error ? '' : out.bootA.mean, interval(out.bootA), out.bootA.error ? '' : out.bootA.standardError ?? 'undefined'],
                    [`B: ${out.b.label}`, out.bootB.error ? '' : out.bootB.mean, interval(out.bootB), out.bootB.error ? '' : out.bootB.standardError ?? 'undefined'],
                    ['A minus B', out.paired.difference, interval(out.paired), out.paired.standardError ?? 'undefined'],
                  ]}
                />
                <p className="text-xs text-slate-300" data-testid="compare-share">
                  In {dn(out.paired.shareAtOrBelowZero * 100)} percent of the replicates A does not beat B (a difference at or below 0).
                  This share describes the resampling; it is not a p-value.
                </p>
                {out.a.evaluation.excluded?.length ? (
                  <Note testId="compare-excluded">Excluded (the no-relevant rule): {out.a.evaluation.excluded.map((x) => `${x.query}, ${x.reason}`).join('; ')}.</Note>
                ) : null}
                <Grid
                  testId="compare-values"
                  maxHeight="max-h-80"
                  headers={['Query', `A ${out.metric.value}`, `B ${out.metric.value}`]}
                  rows={out.queries.map((q, i) => [q, out.values.a[i], out.values.b[i]])}
                />
                <Basis basis={out.paired.basis} testId="compare-basis" />
              </>
            )
          ) : null}
        </Section>
      ) : null}
    </div>
  );
};

export default ComparePanel;
