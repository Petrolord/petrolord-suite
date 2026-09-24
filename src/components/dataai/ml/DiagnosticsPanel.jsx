// ML Workbench: leakage demo, permutation importance and learning curve
// (Data & AI D2). Each is one engine call on the current design, run in the
// worker; the settings here (metric, held-out fraction of wells, seed,
// repeats) are shared by the three.
import React from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMlWorkbench } from '@/contexts/MlWorkbenchContext';
import { METRIC_OPTIONS, leakageVerdict } from '@/utils/dataAi/mlWorkflows';
import { MAX_IMPORTANCE_ROWS, ROW_CAP_BASIS } from '@/utils/dataAi/mlData';
import { displayNumber as dn } from '@/utils/dataAi/qcDisplay';
import {
  EngineError, Note, Section, SelectField, TextInput,
} from '@/components/dataai/quality/shared';
import { ImportanceChart, LearningChart } from './charts';
import { StaleNote } from './ResultsPanel';

const RunButton = ({ job, label }) => {
  const {
    design, parsed, runJob, busy,
  } = useMlWorkbench();
  return (
    <Button size="sm" variant="secondary" disabled={!design || !!design.error || !!parsed.error || !!busy} onClick={() => runJob(job)} data-testid={`run-${job}`}>
      <Play className="mr-1 h-3.5 w-3.5" /> {busy?.job === job ? 'Running' : label}
    </Button>
  );
};

const Side = ({ title, s, metric, testId }) => (
  <div className="flex-1 rounded border border-slate-800 p-2 text-xs" data-testid={testId}>
    <p className="mb-1 font-semibold text-slate-100">{title}</p>
    <p className="text-slate-300">Held-out {metric}: <span className="font-mono">{dn(s.testScore)}</span></p>
    <p className="text-slate-400">Training {metric}: <span className="font-mono">{dn(s.trainScore)}</span></p>
    <p className="text-slate-400">{s.nTrain.toLocaleString('en-US')} training rows, {s.nTest.toLocaleString('en-US')} test rows.</p>
    <p className="text-slate-400">
      Wells on both sides: {s.sharedGroups.length ? s.sharedGroups.join(', ') : 'none'}.
    </p>
  </div>
);

const Leakage = () => {
  const { results } = useMlWorkbench();
  const r = results.leakage;
  return (
    <Section title="Leakage: random rows against whole wells" right={<RunButton job="leakage" label="Run the comparison" />} testId="leakage-section">
      <Note>
        The same model and data are scored twice with the same fraction and seed: once holding out random rows, so
        neighbouring samples of every well sit on both sides, and once holding out whole wells. The numbers below are the
        engine&apos;s; which way they fall depends on the data.
      </Note>
      {r ? (
        <>
          <StaleNote keyName="leakage" />
          {r.result.error ? <EngineError result={r.result} prefix="Leakage demo refused" /> : (
            <div className="space-y-2" data-testid="leakage-result">
              <div className="flex flex-col gap-2 md:flex-row">
                <Side title="Random row split" s={r.result.randomRow} metric={r.result.metric} testId="leakage-random" />
                <Side title="Group split (whole wells)" s={r.result.group} metric={r.result.metric} testId="leakage-group" />
              </div>
              <p className="text-xs text-slate-200" data-testid="leakage-verdict">
                Optimism ({r.result.basis.optimism}): <span className="font-mono">{dn(r.result.optimism)}</span>. {leakageVerdict(r.result)}
              </p>
              <Note>
                A random split leaks when the features identify the well (a per-well offset, a well-level attribute), so the model
                can recognise a well it has already seen. The group split is the estimate for a new well.
              </Note>
            </div>
          )}
        </>
      ) : null}
    </Section>
  );
};

const Importance = () => {
  const { results } = useMlWorkbench();
  const r = results.importance;
  return (
    <Section title="Permutation importance (held-out wells)" right={<RunButton job="importance" label="Run importance" />} testId="importance-section">
      <Note>
        One group split; the scaler and the model are fitted on its training wells. Then each feature&apos;s values are
        shuffled across the held-out rows with the seed, and the drop in score is recorded, repeat by repeat. A drop
        near zero or below it means the model does not lean on that feature here; a correlated partner can stand in for
        it. Capped at {MAX_IMPORTANCE_ROWS.toLocaleString('en-US')} held-out rows. {ROW_CAP_BASIS[1]}
      </Note>
      {r ? (
        <>
          <StaleNote keyName="importance" />
          {r.result.error ? <EngineError result={r.result} prefix="Permutation importance refused" /> : (
            <div className="space-y-2" data-testid="importance-result">
              <p className="text-xs text-slate-300">
                Held-out wells {r.result.testGroups.join(', ')} ({r.result.nTest.toLocaleString('en-US')} rows); baseline {r.result.metric} {dn(r.result.baseline)};
                {' '}{r.result.nRepeats} repeats, seed {r.result.seed}. Ranking: {r.result.ranking.join(', ')}.
              </p>
              <ImportanceChart importances={r.result.importances} metric={r.result.metric} />
              <table className="w-full text-xs">
                <thead><tr><th className="px-2 text-left text-slate-400">Feature</th><th className="px-2 text-left text-slate-400">Mean drop</th><th className="px-2 text-left text-slate-400">SD (population)</th></tr></thead>
                <tbody>
                  {r.result.importances.map((x) => (
                    <tr key={x.feature} className="border-t border-slate-800"><td className="px-2">{x.feature}</td><td className="px-2 font-mono">{dn(x.mean)}</td><td className="px-2 font-mono">{dn(x.sd)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </Section>
  );
};

const Learning = () => {
  const { results } = useMlWorkbench();
  const r = results.learning;
  return (
    <Section title="Learning curve (by training wells)" right={<RunButton job="learning" label="Run the curve" />} testId="learning-section">
      <Note>
        One group split fixes the held-out wells. The model is fitted on the first 1, 2, 3 and more training wells of the
        split&apos;s shuffled order and scored on its training rows and on the held-out wells. Sizes count wells, because a
        new well is what the model has to generalise to.
      </Note>
      {r ? (
        <>
          <StaleNote keyName="learning" />
          {r.result.skipped?.length ? (
            <Note tone="warn" testId="learning-skipped">
              {r.result.skipped.map((s) => `${s.nGroups} training well${s.nGroups === 1 ? '' : 's'}: ${s.reason}`).join(' ')}
            </Note>
          ) : null}
          {r.result.error ? <EngineError result={r.result} prefix="Learning curve refused" /> : (
            <div className="space-y-2" data-testid="learning-result">
              <p className="text-xs text-slate-300">Held-out wells {r.result.testGroups.join(', ')} ({r.result.nTest.toLocaleString('en-US')} rows).</p>
              <LearningChart points={r.result.points} metric={r.result.metric} />
            </div>
          )}
        </>
      ) : null}
    </Section>
  );
};

const DiagnosticsPanel = () => {
  const { spec, updateSpec, table } = useMlWorkbench();
  if (!table) return <Note>Load data and set up the model first.</Note>;
  const task = spec.task === 'classification' ? 'classification' : 'regression';
  const t = spec.tools;
  return (
    <div className="space-y-3" data-testid="diagnostics-panel">
      <Section title="Settings for the three diagnostics">
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label="Metric"
            value={t.metric || (task === 'classification' ? 'auc' : 'r2')}
            onChange={(x) => updateSpec(['tools', 'metric'], x)}
            options={METRIC_OPTIONS[task]}
            className="w-36"
            testId="tools-metric"
          />
          <TextInput label="Held-out fraction of wells" value={t.testFraction} onChange={(x) => updateSpec(['tools', 'testFraction'], x)} testId="tools-fraction" />
          <TextInput label="Seed" value={t.seed} onChange={(x) => updateSpec(['tools', 'seed'], x)} testId="tools-seed" />
          <TextInput label="Repeats (importance)" value={t.nRepeats} onChange={(x) => updateSpec(['tools', 'nRepeats'], x)} testId="tools-repeats" />
        </div>
        <Note>
          The leakage comparison and the learning curve fit on the features as given. Ridge standardises inside them on each
          training set, and OLS and unpenalised logistic predictions do not change when a feature is rescaled; a penalised
          logistic fit there is penalised in the features&apos; own units.
        </Note>
      </Section>
      <Leakage />
      <Importance />
      <Learning />
    </div>
  );
};

export default DiagnosticsPanel;
