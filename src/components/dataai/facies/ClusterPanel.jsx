// Electrofacies Studio: unsupervised clustering (Data & AI D3).
//
// k-means (seeded k-means++ starts and Lloyd iterations), the elbow over a
// range of k with the mean silhouette, and agglomerative clustering (Ward,
// complete or average linkage). Each is compared with the core facies when
// a core source is chosen. Every figure is the engine's.
import React from 'react';
import { useElectrofacies } from '@/contexts/ElectrofaciesContext';
import { LINKAGES } from '@/utils/dataAi/faciesWorkflows';
import { AGGLOMERATIVE_MAX_ROWS, ELBOW_SAMPLE_ROWS } from '@/utils/dataAi/faciesData';
import {
  EngineError, Note, Section, SelectField, TextInput, Toggle,
} from '@/components/dataai/quality/shared';
import {
  CoreComparison, dn, Grid, NeedDesign, RunButton, StaleNote,
} from './common';
import { ElbowChart, MergeHeightsChart } from './charts';

const SilhouetteLine = ({ s, testId }) => {
  if (!s) return null;
  if (s.error) return <EngineError result={s} prefix="Silhouette" />;
  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-200">
        Mean silhouette <span className="font-mono" data-testid={testId}>{dn(s.mean)}</span>
        {s.sampled ? ` on a seeded sample of ${s.n.toLocaleString('en-US')} rows (the engine's sample rule; the silhouette measures every pair of rows).` : ` on all ${s.n.toLocaleString('en-US')} rows.`}
      </p>
      <Grid headers={['Cluster', 'Rows', 'Mean silhouette']} rows={s.perCluster.map((c) => [String(c.label), c.size, c.mean])} />
    </div>
  );
};

const KmeansSection = () => {
  const { spec, updateSpec, results } = useElectrofacies();
  const r = results.kmeans?.result;
  const km = r?.kmeans;
  return (
    <Section title="k-means" testId="kmeans-section">
      <div className="flex flex-wrap items-end gap-3">
        <TextInput label="k (clusters)" value={spec.kmeans.k} onChange={(v) => updateSpec(['kmeans', 'k'], v)} testId="kmeans-k" width="w-16" />
        <TextInput label="Seed" value={spec.kmeans.seed} onChange={(v) => updateSpec(['kmeans', 'seed'], v)} testId="kmeans-seed" width="w-24" />
        <TextInput label="Starts (nInit)" value={spec.kmeans.nInit} onChange={(v) => updateSpec(['kmeans', 'nInit'], v)} testId="kmeans-ninit" width="w-16" source="Default 10." />
        <RunButton job="kmeans">Run k-means</RunButton>
      </div>
      <Note>
        k-means++ picks the starting centres from one mulberry32 stream seeded as given; each of the nInit starts runs
        Lloyd iterations to convergence and the lowest inertia wins. The same seed gives the same clusters.
      </Note>
      <StaleNote job="kmeans" />
      {km?.error ? <EngineError result={km} /> : null}
      {km && !km.error ? (
        <div className="space-y-2" data-testid="kmeans-result">
          {km.warning ? <Note tone="warn">{km.warning}</Note> : null}
          <p className="text-xs text-slate-200">
            Inertia <span className="font-mono" data-testid="kmeans-inertia">{dn(km.inertia)}</span> (sum of squared distances to the centres, on the scaled logs);
            {' '}best of {km.runs.length} start{km.runs.length === 1 ? '' : 's'} was run {km.bestRun} (from 0), {km.iterations} assignment passes, {km.converged ? 'converged' : 'not converged'}
            {km.emptyClusterRelocations ? `, ${km.emptyClusterRelocations} empty cluster relocations` : ''}.
          </p>
          <Grid
            testId="kmeans-centres"
            caption="Centres in the logs' own units (the engine's centresOriginal)."
            headers={['Cluster', 'Rows', ...km.names]}
            rows={km.centresOriginal.map((c, i) => [String(i), km.sizes[i], ...c])}
          />
          <SilhouetteLine s={r.silhouette} testId="kmeans-silhouette" />
          <CoreComparison compare={r.compare} testId="kmeans-core" />
        </div>
      ) : null}
    </Section>
  );
};

const ElbowSection = () => {
  const {
    spec, updateSpec, results, design,
  } = useElectrofacies();
  const r = results.elbow?.result;
  const big = design && !design.error && design.X.length > ELBOW_SAMPLE_ROWS;
  return (
    <Section title="Elbow and silhouette over k" testId="elbow-section">
      <div className="flex flex-wrap items-end gap-3">
        <TextInput label="k from" value={spec.elbow.kMin} onChange={(v) => updateSpec(['elbow', 'kMin'], v)} testId="elbow-kmin" width="w-16" />
        <TextInput label="k to" value={spec.elbow.kMax} onChange={(v) => updateSpec(['elbow', 'kMax'], v)} testId="elbow-kmax" width="w-16" />
        <RunButton job="elbow">Run the elbow</RunButton>
      </div>
      <Note>
        k-means for each k with the seed and starts above, and the mean silhouette for each k from 2. The engine picks no
        elbow: read the drops. {big
          ? `These ${design.X.length.toLocaleString('en-US')} rows are more than ${ELBOW_SAMPLE_ROWS.toLocaleString('en-US')}, so the elbow runs on a seeded sample of ${ELBOW_SAMPLE_ROWS.toLocaleString('en-US')} rows (the seed above).`
          : `Up to ${ELBOW_SAMPLE_ROWS.toLocaleString('en-US')} rows it runs on every row; above that on a seeded sample of ${ELBOW_SAMPLE_ROWS.toLocaleString('en-US')} rows.`}
      </Note>
      <StaleNote job="elbow" />
      {r?.error ? <EngineError result={r} /> : null}
      {r && !r.error ? (
        <div className="space-y-2" data-testid="elbow-result">
          <p className="text-xs text-slate-200" data-testid="elbow-rows">
            {r.sampled ? `Ran on a seeded sample of ${r.n.toLocaleString('en-US')} rows (seed ${r.seed}).` : `Ran on all ${r.n.toLocaleString('en-US')} rows.`}
            {r.bestSilhouetteK !== null ? ` Highest mean silhouette at k = ${r.bestSilhouetteK}.` : ''}
          </p>
          {r.warning ? <Note tone="warn">{r.warning}</Note> : null}
          <ElbowChart table={r.table} />
          <Grid
            testId="elbow-table"
            headers={['k', 'Inertia', 'Drop', 'Drop fraction', 'Mean silhouette', 'Passes', 'Converged']}
            rows={r.table.map((t) => [t.k, t.inertia, t.drop === null ? '' : t.drop, t.dropFraction === null ? '' : t.dropFraction, t.silhouette === null ? '' : t.silhouette, t.iterations, t.converged ? 'yes' : 'no'])}
          />
        </div>
      ) : null}
    </Section>
  );
};

const AgglomerativeSection = () => {
  const {
    spec, updateSpec, results, design,
  } = useElectrofacies();
  const r = results.agglomerative?.result;
  const ag = r?.agglomerative;
  const big = design && !design.error && design.X.length > AGGLOMERATIVE_MAX_ROWS;
  return (
    <Section title="Agglomerative clustering" testId="agglomerative-section">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField label="Linkage" value={spec.agglomerative.linkage} onChange={(v) => updateSpec(['agglomerative', 'linkage'], v)} options={LINKAGES} testId="agg-linkage" className="w-44" />
        <TextInput label="k (clusters)" value={spec.agglomerative.k} onChange={(v) => updateSpec(['agglomerative', 'k'], v)} testId="agg-k" width="w-16" />
        <RunButton job="agglomerative">Run agglomerative</RunButton>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Toggle
          label={`Above ${AGGLOMERATIVE_MAX_ROWS.toLocaleString('en-US')} rows, cluster a seeded sample of ${AGGLOMERATIVE_MAX_ROWS.toLocaleString('en-US')} rows`}
          checked={spec.agglomerative.sample}
          onChange={(on) => updateSpec(['agglomerative', 'sample'], on)}
          testId="agg-sample"
        />
        {spec.agglomerative.sample ? <TextInput label="Sample seed" value={spec.agglomerative.seed} onChange={(v) => updateSpec(['agglomerative', 'seed'], v)} testId="agg-seed" width="w-24" /> : null}
      </div>
      <Note>
        The engine holds every pairwise distance, so it refuses above {AGGLOMERATIVE_MAX_ROWS.toLocaleString('en-US')} rows.
        {big ? ` These ${design.X.length.toLocaleString('en-US')} rows are above that: thin them, or cluster a seeded sample and the labels cover the sampled rows only.` : ''}
      </Note>
      <StaleNote job="agglomerative" />
      {ag?.error ? <EngineError result={ag} /> : null}
      {ag && !ag.error ? (
        <div className="space-y-2" data-testid="agglomerative-result">
          <p className="text-xs text-slate-200" data-testid="agg-rows">
            {r.sampled
              ? `Clustered a seeded sample of ${ag.n.toLocaleString('en-US')} of ${design.X.length.toLocaleString('en-US')} rows (seed ${spec.agglomerative.seed}); the other rows have no label.`
              : `Clustered all ${ag.n.toLocaleString('en-US')} rows.`}
            {' '}{ag.tiedSteps ? `${ag.tiedSteps} merge steps were tied and went to the pair with the lowest cluster ids.` : 'No merge was tied.'}
            {ag.cutHeights ? ` The ${ag.k}-cluster cut lies between merge heights ${dn(ag.cutHeights.below)} and ${ag.cutHeights.above === null ? 'the top' : dn(ag.cutHeights.above)}.` : ''}
          </p>
          <MergeHeightsChart heights={ag.heights} n={ag.n} />
          <SilhouetteLine s={r.silhouette} testId="agg-silhouette" />
          <CoreComparison compare={r.compare} testId="agg-core" />
        </div>
      ) : null}
    </Section>
  );
};

const ClusterPanel = () => (
  <div className="space-y-3" data-testid="cluster-panel">
    <NeedDesign />
    <KmeansSection />
    <ElbowSection />
    <AgglomerativeSection />
  </div>
);

export default ClusterPanel;
