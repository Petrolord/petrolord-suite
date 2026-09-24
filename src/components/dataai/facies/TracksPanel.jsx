// Electrofacies Studio: facies against depth, one well at a time (Data & AI D3).
//
// A log curve as loaded, then a column per labelling: the core facies and
// every method that has labelled the rows. Colours are fixed per labelling
// over all wells, so a class keeps its colour from well to well.
import React, { useMemo, useState } from 'react';
import { useElectrofacies } from '@/contexts/ElectrofaciesContext';
import { labelsOf } from '@/utils/dataAi/faciesWorkflows';
import { Note, Section, SelectField } from '@/components/dataai/quality/shared';
import { NeedDesign } from './common';
import { ClassLegend, classesOf, FaciesTracks } from './charts';

const TRACK_NAMES = {
  core: 'Core', kmeans: 'k-means', agglomerative: 'Agglom.', knn: 'kNN', cart: 'CART',
};

const TracksPanel = () => {
  const {
    design, table, results, isStale,
  } = useElectrofacies();
  const ok = design && !design.error;
  const [well, setWell] = useState('');
  const [curve, setCurve] = useState('');
  const wellName = ok && design.wells.some((w) => w.name === well) ? well : (ok && design.wells[0] ? design.wells[0].name : '');
  const curveName = ok && design.features.some((f) => f.name === curve) ? curve : (ok ? design.features[0].name : '');

  const labellings = useMemo(() => {
    if (!ok) return [];
    const out = [];
    if (design.facies) out.push({ key: 'core', labels: design.facies });
    ['kmeans', 'agglomerative', 'knn', 'cart'].forEach((k) => {
      const l = labelsOf(results[k]?.result);
      if (l && l.length === design.X.length) out.push({ key: k, labels: l, stale: isStale(k) });
    });
    return out.map((t) => ({ ...t, classes: classesOf(t.labels) }));
  }, [ok, design, results, isStale]);

  if (!ok) return <NeedDesign />;
  const idx = [];
  design.groups.forEach((g, j) => { if (g === wellName) idx.push(j); });
  const hasDepth = idx.every((j) => design.depth[j] !== null && design.depth[j] !== undefined);
  const depth = idx.map((j, i) => (hasDepth ? design.depth[j] : i));
  const values = idx.map((j) => table.columns[curveName][design.rows[j]]);
  const tracks = labellings.map((t) => ({
    key: t.key, name: TRACK_NAMES[t.key], labels: idx.map((j) => t.labels[j]), classes: t.classes,
  }));

  return (
    <div className="space-y-3" data-testid="tracks-panel">
      <Section title="Facies against depth">
        <div className="flex flex-wrap items-end gap-3">
          <SelectField label="Well" value={wellName} onChange={setWell} options={design.wells.map((w) => ({ value: w.name, label: `${w.name} (${w.rows} rows)` }))} testId="tracks-well" className="w-56" />
          <SelectField label="Curve" value={curveName} onChange={setCurve} options={design.features.map((f) => ({ value: f.name, label: f.name }))} testId="tracks-curve" className="w-40" />
        </div>
        {labellings.length <= (design.facies ? 1 : 0) ? <Note testId="tracks-empty">Run k-means, agglomerative clustering, kNN or CART to see their facies here.</Note> : null}
        {labellings.some((t) => t.stale) ? <Note tone="warn">A column is from a run made before the settings changed; run it again to refresh it.</Note> : null}
        <FaciesTracks
          depth={depth}
          curve={values}
          curveName={curveName}
          tracks={tracks}
          depthLabel={hasDepth ? `Depth (${table.depthUnit || 'm'})` : 'Sample (from 0)'}
        />
        <div className="space-y-1">
          {labellings.map((t) => (
            <ClassLegend key={t.key} name={TRACK_NAMES[t.key]} classes={t.classes} describe={(c) => (t.key === 'kmeans' || t.key === 'agglomerative' ? `cluster ${c}` : String(c))} />
          ))}
        </div>
        <Note>
          Each sample fills from halfway to the sample above to halfway to the sample below. A blank is a sample with no label:
          no core facies there, or a row outside an agglomerative sample. Samples left out of the design (window, thinning,
          a missing log) are not drawn.
        </Note>
      </Section>
    </div>
  );
};

export default TracksPanel;
