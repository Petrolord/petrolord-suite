// Electrofacies Studio: supervised facies against the core (Data & AI D3).
//
// kNN and a CART tree learn the core facies from the cored rows of the
// training wells and are scored on the cored rows of wells held out whole;
// the final model, trained on every cored row, then classifies every row
// for the depth tracks and the write-back. Every figure is the engine's.
import React from 'react';
import { useElectrofacies } from '@/contexts/ElectrofaciesContext';
import { MAX_KNN_TRAIN_ROWS } from '@/utils/dataAi/faciesData';
import {
  EngineError, Note, Section, SelectField, TextInput, Toggle,
} from '@/components/dataai/quality/shared';
import {
  ConfusionTable, dn, Grid, NeedDesign, ReportTable, RunButton, StaleNote,
} from './common';

const HoldOut = () => {
  const { spec, updateSpec, design } = useElectrofacies();
  const sup = spec.supervised;
  const cored = design && !design.error && design.facies ? design.wells.filter((w) => w.cored > 0).map((w) => w.name) : [];
  return (
    <Section title="Wells held out" testId="holdout-section">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          label="Hold out"
          value={sup.holdout}
          onChange={(v) => updateSpec(['supervised', 'holdout'], v)}
          options={[{ value: 'seeded', label: 'Cored wells drawn by the engine group split' }, { value: 'chosen', label: 'Cored wells I choose' }]}
          testId="holdout-mode"
          className="w-80"
        />
        {sup.holdout === 'seeded' ? (
          <>
            <TextInput label="Wells held out" value={sup.nTest} onChange={(v) => updateSpec(['supervised', 'nTest'], v)} testId="holdout-n" width="w-16" />
            <TextInput label="Seed" value={sup.seed} onChange={(v) => updateSpec(['supervised', 'seed'], v)} testId="holdout-seed" width="w-24" />
          </>
        ) : null}
      </div>
      {sup.holdout === 'chosen' ? (
        <div className="flex flex-wrap gap-3" data-testid="holdout-wells">
          {cored.map((w) => (
            <Toggle
              key={w}
              label={w}
              checked={sup.chosen.includes(w)}
              onChange={(on) => updateSpec(['supervised', 'chosen'], on ? [...sup.chosen, w] : sup.chosen.filter((x) => x !== w))}
              testId={`holdout-${w}`}
            />
          ))}
          {!cored.length ? <Note>No well has a core facies yet.</Note> : null}
        </div>
      ) : null}
      <Note>
        Whole wells are held out, so a score says how the method does on a well it never saw. Rows of a neighbouring depth
        in the same well are often much alike, and scoring on them can flatter the method.
      </Note>
    </Section>
  );
};

const SplitLine = ({ split }) => (
  <p className="text-xs text-slate-200" data-testid="split-line">
    Trained on {split.nTrain.toLocaleString('en-US')} cored rows of {split.trainGroups.join(', ')}; scored on
    {' '}{split.nTest.toLocaleString('en-US')} cored rows of {split.testGroups.join(', ')}
    {split.scheme === 'seeded' ? ` (engine group split, seed ${split.seed}).` : ' (wells chosen).'}
  </p>
);

const Scores = ({ r, prefix }) => (
  <div className="space-y-2">
    <SplitLine split={r.split} />
    {r.scores.report.error ? <EngineError result={r.scores.report} /> : (
      <>
        <p className="text-xs text-slate-200">
          Held-out accuracy <span className="font-mono" data-testid={`${prefix}-accuracy`}>{dn(r.scores.report.accuracy)}</span>,
          {' '}macro F1 <span className="font-mono">{dn(r.scores.report.macro.f1)}</span>,
          {' '}adjusted Rand index <span className="font-mono" data-testid={`${prefix}-ari`}>{r.scores.ari.error ? r.scores.ari.error : dn(r.scores.ari.ari)}</span>.
        </p>
        <ConfusionTable report={r.scores.report} testId={`${prefix}-confusion`} />
        <ReportTable report={r.scores.report} testId={`${prefix}-report`} />
      </>
    )}
  </div>
);

const KnnSection = () => {
  const { spec, updateSpec, results } = useElectrofacies();
  const r = results.knn?.result;
  const refused = r && (r.error ? r : (r.blind?.error ? r.blind : null));
  return (
    <Section title="k-nearest neighbours (kNN)" testId="knn-section">
      <div className="flex flex-wrap items-end gap-3">
        <TextInput label="k (neighbours)" value={spec.supervised.knnK} onChange={(v) => updateSpec(['supervised', 'knnK'], v)} testId="knn-k" width="w-16" source="Default 5." />
        <RunButton job="knn">Run kNN</RunButton>
      </div>
      <Note>
        Each row takes the majority facies of its k nearest training rows (Euclidean on the scaled logs, the scaler fitted on
        the training rows only). Equal distances go to the lower training row; a tied vote goes to the tied facies whose
        nearest member comes first. At most {MAX_KNN_TRAIN_ROWS.toLocaleString('en-US')} training rows.
      </Note>
      <StaleNote job="knn" />
      {refused ? <EngineError result={refused} /> : null}
      {r && !refused ? (
        <div className="space-y-2" data-testid="knn-result">
          <Scores r={r} prefix="knn" />
          <p className="text-[11px] text-slate-400">
            {r.blind.tiedVotes} held-out row{r.blind.tiedVotes === 1 ? ' had' : 's had'} a tied vote.
            {r.final && !r.final.error ? ` The final model (every cored row) classified all ${r.final.predictions.length.toLocaleString('en-US')} rows in ${r.final.batches} batch${r.final.batches === 1 ? '' : 'es'}.` : ''}
          </p>
          {r.finalRefusal ? <Note tone="warn">{r.finalRefusal}</Note> : null}
          {r.final?.error ? <EngineError result={r.final} prefix="Final model" /> : null}
        </div>
      ) : null}
    </Section>
  );
};

const CartSection = () => {
  const { spec, updateSpec, results } = useElectrofacies();
  const r = results.cart?.result;
  const refused = r && (r.error ? r : (r.blindTree?.error ? r.blindTree : (r.blind?.error ? r.blind : null)));
  return (
    <Section title="CART classification tree" testId="cart-section">
      <div className="flex flex-wrap items-end gap-3">
        <TextInput label="Max depth" value={spec.supervised.maxDepth} onChange={(v) => updateSpec(['supervised', 'maxDepth'], v)} testId="cart-depth" width="w-16" source="Default 5; the root is depth 0." />
        <TextInput label="Min rows per leaf" value={spec.supervised.minLeaf} onChange={(v) => updateSpec(['supervised', 'minLeaf'], v)} testId="cart-leaf" width="w-16" source="Default 1." />
        <RunButton job="cart">Run CART</RunButton>
      </div>
      <Note>
        Gini splits at midpoints between consecutive values, a value at or below the threshold going left; equal splits go to
        the lower log, then the lower threshold; a node splits only when the impurity falls. The tree reads the logs as given.
      </Note>
      <StaleNote job="cart" />
      {refused ? <EngineError result={refused} /> : null}
      {r && !refused ? (
        <div className="space-y-2" data-testid="cart-result">
          <Scores r={r} prefix="cart" />
          {r.finalTree?.error ? <EngineError result={r.finalTree} prefix="Final tree" /> : null}
          {r.finalTree && !r.finalTree.error ? (
            <>
              <p className="text-xs text-slate-200">
                Final tree on every cored row: {r.finalTree.nLeaves} leaves, depth {r.finalTree.depth}, training accuracy {dn(r.finalTree.trainingAccuracy)} (measured on the rows it was grown on).
              </p>
              <pre className="max-h-96 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 font-mono text-[11px] leading-snug text-slate-200" data-testid="cart-tree">{r.finalTree.printed}</pre>
              <Grid
                testId="cart-importance"
                caption="Feature importance: each log's share of the total Gini decrease (engine featureImportances)."
                headers={['Log', 'Importance']}
                rows={r.finalTree.names.map((nm, j) => [nm, r.finalTree.featureImportances[j]])}
              />
            </>
          ) : null}
          <details className="text-xs text-slate-300">
            <summary className="cursor-pointer text-slate-400">The tree grown on the training wells only (the one scored above)</summary>
            <pre className="mt-1 max-h-72 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 font-mono text-[11px] leading-snug" data-testid="cart-blind-tree">{r.blindTree.printed}</pre>
          </details>
        </div>
      ) : null}
    </Section>
  );
};

const SupervisedPanel = () => {
  const { design } = useElectrofacies();
  return (
    <div className="space-y-3" data-testid="supervised-panel">
      <NeedDesign />
      {design && !design.error && !design.facies ? (
        <Note tone="warn" testId="supervised-no-core">Choose a core facies source under Logs and core: kNN and CART learn from the core.</Note>
      ) : null}
      <HoldOut />
      <KnnSection />
      <CartSection />
    </div>
  );
};

export default SupervisedPanel;
