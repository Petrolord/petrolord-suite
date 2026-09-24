// Electrofacies Studio: logs, window, scaling and core facies (Data & AI D3).
import React from 'react';
import { useElectrofacies } from '@/contexts/ElectrofaciesContext';
import { intervalKinds, ROW_CAP_BASIS } from '@/utils/dataAi/faciesData';
import { SCALES } from '@/utils/dataAi/faciesWorkflows';
import {
  EngineError, Note, Section, SelectField, TextInput, Toggle,
} from '@/components/dataai/quality/shared';
import { Grid } from './common';

const FACIES_SOURCE_OPTIONS = (table) => [
  { value: 'none', label: 'None: cluster only' },
  { value: 'curve', label: 'A facies code curve' },
  ...(table?.intervals ? [{ value: 'intervals', label: 'Registry interval logs' }] : []),
  ...(table?.facies ? [{ value: 'column', label: `The uploaded column ${table.faciesName}` }] : []),
];

const SpecPanel = () => {
  const {
    table, spec, updateSpec, design,
  } = useElectrofacies();
  if (!table) return <Note testId="spec-no-data">Load data first: wells from the registry or an uploaded table.</Note>;
  const curves = Object.keys(table.columns);
  const chosen = new Map((spec.features || []).map((f) => [f.name, f]));
  const toggleFeature = (name, on) => {
    const next = on ? [...spec.features, { name, log: false }] : spec.features.filter((f) => f.name !== name);
    updateSpec(['features'], next);
  };
  const toggleLog = (name, on) => updateSpec(['features'], spec.features.map((f) => (f.name === name ? { ...f, log: on } : f)));
  const kinds = intervalKinds(table);
  const fs = spec.facies || {};
  const ok = design && !design.error;

  return (
    <div className="space-y-3" data-testid="spec-panel">
      <Section title="Logs to cluster on">
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {curves.map((c) => (
            <div key={c} className="flex items-center gap-3">
              <Toggle label={`${c}${table.units?.[c] ? ` (${table.units[c]})` : ''}`} checked={chosen.has(c)} onChange={(on) => toggleFeature(c, on)} testId={`feature-${c}`} />
              {chosen.has(c) ? <Toggle label="log10" checked={!!chosen.get(c).log} onChange={(on) => toggleLog(c, on)} testId={`log-${c}`} /> : null}
            </div>
          ))}
        </div>
        <Note>
          Resistivity-type logs are usually clustered as log10. A row missing any chosen log is left out and counted; a
          zero or negative value in a log10 log is left out too.
        </Note>
        <div className="flex flex-wrap items-end gap-3">
          <TextInput label="Top of window" unit={table.depthUnit || 'depth'} value={spec.depthMin} onChange={(v) => updateSpec(['depthMin'], v)} testId="depth-min" />
          <TextInput label="Base of window" unit={table.depthUnit || 'depth'} value={spec.depthMax} onChange={(v) => updateSpec(['depthMax'], v)} testId="depth-max" />
          <TextInput label="Keep every nth sample" value={spec.every} onChange={(v) => updateSpec(['every'], v)} testId="every" source="Entry 0 of each well, then every nth (entries from 0)." width="w-20" />
          <SelectField label="Scaling" value={spec.scale} onChange={(v) => updateSpec(['scale'], v)} options={SCALES} testId="scale" className="w-80" />
        </div>
        <Note>
          Scaling is the engine&apos;s: the standard scaler (z-score with the population SD, the engine default) or min-max,
          fitted on the rows clustered, or on the training rows for kNN. k-means, the silhouette, agglomerative clustering
          and kNN all measure Euclidean distance on the scaled logs. PCA has its own choice of matrix; CART uses the logs as
          given.
        </Note>
      </Section>

      <Section title="Core facies">
        <div className="flex flex-wrap items-end gap-3">
          <SelectField label="Source" value={fs.source} onChange={(v) => updateSpec(['facies', 'source'], v)} options={FACIES_SOURCE_OPTIONS(table)} testId="facies-source" className="w-64" />
          {fs.source === 'curve' ? (
            <SelectField label="Facies code curve" value={fs.curve} onChange={(v) => updateSpec(['facies', 'curve'], v)} emptyLabel="Choose" options={curves.map((c) => ({ value: c, label: c }))} testId="facies-curve" className="w-48" />
          ) : null}
          {fs.source === 'intervals' ? (
            <SelectField label="Interval kind" value={fs.kind} onChange={(v) => updateSpec(['facies', 'kind'], v)} emptyLabel="Choose" options={kinds.map((k) => ({ value: k.kind, label: `${k.kind} (${k.wells.join(', ')})` }))} testId="facies-kind" className="w-72" />
          ) : null}
        </div>
        {fs.source === 'intervals' && !kinds.length ? <Note tone="warn">These wells have no interval logs. Import core descriptions or facies intervals in the Well Data Manager.</Note> : null}
        <Note>
          The core facies are what the clusters are compared with and what kNN and CART learn from. A sample takes the
          interval with top at or above it and base below it (top &lt;= depth &lt; base). Rows without a core facies are
          still clustered and classified; they take no part in the comparison.
        </Note>
      </Section>

      <Section title="Rows used" testId="design-summary">
        {design?.error ? <EngineError result={design} /> : null}
        {ok ? (
          <>
            <p className="text-xs text-slate-200" data-testid="design-rows">
              {design.X.length.toLocaleString('en-US')} rows on {design.names.join(', ')} from {design.wells.length} well{design.wells.length === 1 ? '' : 's'}
              {design.facies ? `; ${design.labelled.length.toLocaleString('en-US')} have a core facies (${design.classes.length} facies: ${design.classes.join(', ')}).` : '; no core facies chosen.'}
            </p>
            <Grid
              testId="design-wells"
              headers={['Well', 'Rows', 'Rows with core facies']}
              rows={design.wells.map((w) => [w.name, w.rows, design.facies ? w.cored : ''])}
            />
            <p className="text-[11px] text-slate-400">
              Left out: {design.counts.outsideWindow} outside the window, {design.counts.thinned} thinned, {design.counts.missing} missing a log,
              {' '}{design.counts.nonPositiveLog} zero or negative in a log10 log (of {design.counts.total} loaded).
            </p>
          </>
        ) : null}
        {ROW_CAP_BASIS.map((t) => <Note key={t}>{t}</Note>)}
      </Section>
    </div>
  );
};

export default SpecPanel;
