// Electrofacies Studio: principal components (Data & AI D3).
import React, { useState } from 'react';
import { useElectrofacies } from '@/contexts/ElectrofaciesContext';
import { labelsOf } from '@/utils/dataAi/faciesWorkflows';
import {
  EngineError, Note, Section, SelectField,
} from '@/components/dataai/quality/shared';
import {
  dn, Grid, NeedDesign, RunButton, StaleNote,
} from './common';
import { ScreeChart, ScoreCrossplot } from './charts';

const COLOUR_BY = {
  none: 'No colouring', core: 'Core facies', kmeans: 'k-means clusters', agglomerative: 'Agglomerative clusters', knn: 'kNN facies', cart: 'CART facies',
};

const PcaPanel = () => {
  const {
    spec, updateSpec, results, design,
  } = useElectrofacies();
  const [colourBy, setColourBy] = useState('none');
  const r = results.pca?.result;
  const ok = design && !design.error;
  const p = ok ? design.names.length : 0;
  const pcs = Array.from({ length: p }, (_, k) => ({ value: String(k + 1), label: `PC${k + 1}` }));
  const cx = Math.max(0, Math.min(p - 1, Number(spec.pca.x) - 1));
  const cy = Math.max(0, Math.min(p - 1, Number(spec.pca.y) - 1));
  const options = Object.entries(COLOUR_BY)
    .filter(([k]) => k === 'none' || (k === 'core' ? ok && design.facies : Array.isArray(labelsOf(results[k]?.result))))
    .map(([value, label]) => ({ value, label }));
  const labels = colourBy === 'core' ? design?.facies : (colourBy === 'none' ? null : labelsOf(results[colourBy]?.result));
  const sameRows = labels && r && !r.error && labels.length === r.scores.length;

  return (
    <div className="space-y-3" data-testid="pca-panel">
      <NeedDesign />
      <Section title="Principal component analysis">
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label="Matrix"
            value={spec.pca.matrix}
            onChange={(v) => updateSpec(['pca', 'matrix'], v)}
            options={[{ value: 'correlation', label: 'Correlation (engine default)' }, { value: 'covariance', label: 'Covariance' }]}
            testId="pca-matrix"
            className="w-56"
          />
          <RunButton job="pca">Run PCA</RunButton>
        </div>
        <Note>
          Correlation standardises each log with its sample SD, so logs in different units weigh the same and the
          eigenvalues sum to the number of logs. Covariance keeps the units, so the log with the largest spread dominates.
          Eigenvalues by the engine&apos;s Jacobi rotations; in each component the largest loading is made positive.
        </Note>
        <StaleNote job="pca" />
        {r?.error ? <EngineError result={r} /> : null}
      </Section>
      {r && !r.error ? (
        <>
          <Section title="Explained variance" testId="pca-variance">
            {r.warning ? <Note tone="warn">{r.warning}</Note> : null}
            <ScreeChart pca={r} />
            <Grid
              testId="pca-eigen"
              headers={['Component', 'Eigenvalue', 'Explained ratio', 'Cumulative']}
              rows={r.eigenvalues.map((v, k) => [`PC${k + 1}`, v, r.explainedVarianceRatio[k], r.cumulativeRatio[k]])}
            />
            <p className="text-[11px] text-slate-400">
              {r.n.toLocaleString('en-US')} rows, {r.p} logs, {r.matrix} matrix, total variance {dn(r.totalVariance)}; Jacobi {r.jacobiSweeps} sweep{r.jacobiSweeps === 1 ? '' : 's'}.
            </p>
          </Section>
          <Section title="Loadings" testId="pca-loadings">
            <Grid
              testId="pca-loadings-table"
              headers={['Log', ...r.loadings.map((_, k) => `PC${k + 1}`)]}
              rows={r.names.map((nm, j) => [nm, ...r.loadings.map((l) => l[j])])}
            />
            <Note>
              A loading is the unit component times the square root of its eigenvalue; with the correlation matrix it is the
              correlation of the log with the component score.
            </Note>
          </Section>
          <Section title="Score crossplot" testId="pca-scores">
            <div className="flex flex-wrap items-end gap-3">
              <SelectField label="Across" value={String(cx + 1)} onChange={(v) => updateSpec(['pca', 'x'], v)} options={pcs} testId="pca-x" className="w-24" />
              <SelectField label="Up" value={String(cy + 1)} onChange={(v) => updateSpec(['pca', 'y'], v)} options={pcs} testId="pca-y" className="w-24" />
              <SelectField label="Colour by" value={colourBy} onChange={setColourBy} options={options} testId="pca-colour" className="w-56" />
            </div>
            <ScoreCrossplot
              scores={r.scores}
              cx={cx}
              cy={cy}
              labels={sameRows ? labels : null}
              labelName={colourBy === 'core' ? 'Facies' : COLOUR_BY[colourBy]}
            />
            {labels && !sameRows ? <Note tone="warn">That labelling is from other rows; run PCA again.</Note> : null}
          </Section>
        </>
      ) : null}
    </div>
  );
};

export default PcaPanel;
