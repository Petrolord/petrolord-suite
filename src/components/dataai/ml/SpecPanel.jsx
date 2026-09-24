// ML Workbench: the model spec (Data & AI D2).
//
// What to predict, from which features, with which model and how to
// validate it. Every value is kept as typed; the engine reads it and
// refuses with its own message when a value does not make sense.
import React from 'react';
import { Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMlWorkbench } from '@/contexts/MlWorkbenchContext';
import { MODEL_KINDS } from '@/utils/dataAi/mlWorkflows';
import { LABEL_OPS, ROW_CAP_BASIS, MAX_FIT_ROWS } from '@/utils/dataAi/mlData';
import {
  Note, Section, SelectField, TextInput, Toggle,
} from '@/components/dataai/quality/shared';

const TaskChoice = () => {
  const { spec, updateSpec } = useMlWorkbench();
  const opts = [
    { id: 'regression', label: 'Predict a curve (regression)' },
    { id: 'classification', label: 'Classify rows (logistic)' },
  ];
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Task">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={spec.task === o.id}
          data-testid={`task-${o.id}`}
          onClick={() => updateSpec(['task'], o.id)}
          className={`rounded px-3 py-1 text-xs ${spec.task === o.id ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
};

const TargetChoice = ({ names }) => {
  const { spec, updateSpec, table } = useMlWorkbench();
  const unit = (n) => (table?.units?.[n] ? ` (${table.units[n]})` : '');
  if (spec.task === 'classification') {
    const lab = spec.label;
    return (
      <div className="space-y-2">
        <SelectField
          label="Label"
          value={lab.mode}
          onChange={(v) => updateSpec(['label', 'mode'], v)}
          testId="label-mode"
          options={[{ value: 'cutoff', label: 'A cutoff on a curve' }, { value: 'column', label: 'A 0 and 1 column' }]}
        />
        {lab.mode === 'column' ? (
          <SelectField label="Label column" value={lab.column} onChange={(v) => updateSpec(['label', 'column'], v)} emptyLabel="Choose" testId="label-column" options={names.map((n) => ({ value: n, label: n }))} />
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <SelectField label="Class 1 where" value={lab.curve} onChange={(v) => updateSpec(['label', 'curve'], v)} emptyLabel="Choose a curve" testId="label-curve" className="w-36" options={names.map((n) => ({ value: n, label: `${n}${unit(n)}` }))} />
            <SelectField label="is" value={lab.op} onChange={(v) => updateSpec(['label', 'op'], v)} testId="label-op" className="w-16" options={LABEL_OPS.map((o) => ({ value: o, label: o }))} />
            <TextInput label="Cutoff" value={lab.cutoff} onChange={(v) => updateSpec(['label', 'cutoff'], v)} testId="label-cutoff" />
          </div>
        )}
        <Note>
          Class 1 is the class the ROC curve, precision and recall treat as positive. A row missing the label curve is
          left out. If the label curve is also a feature, one threshold separates the classes and the engine refuses an
          unpenalised fit.
        </Note>
      </div>
    );
  }
  return (
    <SelectField label="Target curve" value={spec.target} onChange={(v) => updateSpec(['target'], v)} emptyLabel="Choose the curve to predict" testId="target-select" options={names.map((n) => ({ value: n, label: `${n}${unit(n)}` }))} />
  );
};

const FeatureChoice = ({ names }) => {
  const { spec, updateSpec } = useMlWorkbench();
  const on = (n) => spec.features.find((f) => f.name === n);
  const exclude = spec.task === 'classification' ? (spec.label.mode === 'column' ? spec.label.column : '') : spec.target;
  const set = (n, patch) => {
    const cur = spec.features;
    if (patch === null) updateSpec(['features'], cur.filter((f) => f.name !== n));
    else if (on(n)) updateSpec(['features'], cur.map((f) => (f.name === n ? { ...f, ...patch } : f)));
    else updateSpec(['features'], [...cur, { name: n, log: false, ...patch }]);
  };
  return (
    <div className="space-y-1" data-testid="feature-list">
      {names.filter((n) => n !== exclude).map((n) => (
        <div key={n} className="flex items-center gap-4">
          <Toggle label={n} checked={!!on(n)} onChange={(v) => set(n, v ? {} : null)} testId={`feature-${n}`} />
          {on(n) ? <Toggle label="log10" checked={!!on(n).log} onChange={(v) => set(n, { log: v })} testId={`log-${n}`} /> : null}
        </div>
      ))}
      <Note>Resistivity spans decades, so log10 of it is the usual feature. A row with a zero or negative value in a logged feature is left out and counted.</Note>
    </div>
  );
};

const DesignSummary = () => {
  const { design } = useMlWorkbench();
  if (!design) return null;
  if (design.error) return <Note tone="warn" testId="design-error">{design.error}</Note>;
  const c = design.counts;
  const dropped = [
    c.outsideWindow ? `${c.outsideWindow.toLocaleString('en-US')} outside the depth window` : null,
    c.thinned ? `${c.thinned.toLocaleString('en-US')} thinned` : null,
    c.missing ? `${c.missing.toLocaleString('en-US')} with a missing value` : null,
    c.nonPositiveLog ? `${c.nonPositiveLog.toLocaleString('en-US')} with a zero or negative value in a logged feature` : null,
  ].filter(Boolean);
  return (
    <div className="space-y-1 text-xs text-slate-300" data-testid="design-summary">
      <p>
        {design.X.length.toLocaleString('en-US')} rows from {design.wells.length} wells
        ({design.wells.map((w) => `${w.name} ${w.rows}`).join(', ')}); target {design.targetText}; features {design.names.join(', ')}.
      </p>
      {dropped.length ? <p className="text-slate-400">Left out of {c.total.toLocaleString('en-US')}: {dropped.join('; ')}.</p> : null}
      {design.wells.length < 2 ? <Note tone="warn">Validation holds out whole wells, so it needs rows from two wells or more.</Note> : null}
    </div>
  );
};

const SpecPanel = () => {
  const {
    table, spec, updateSpec, design, parsed, runJob, busy, cancelJob,
  } = useMlWorkbench();
  if (!table) return <Note testId="spec-no-data">Load wells or a table first (left panel).</Note>;
  const names = Object.keys(table.columns);
  const v = spec.validation;
  const canRun = design && !design.error && !parsed.error && !busy;
  return (
    <div className="space-y-3" data-testid="spec-panel">
      <Section title="What to learn">
        <TaskChoice />
        <TargetChoice names={names} />
      </Section>
      <Section title="Features">
        <FeatureChoice names={names} />
      </Section>
      <Section title="Rows">
        <div className="flex flex-wrap gap-3">
          <TextInput label="Depth window top" unit={table.depthUnit || 'm'} value={spec.depthMin} onChange={(x) => updateSpec(['depthMin'], x)} placeholder="all" testId="depth-min" />
          <TextInput label="Depth window base" unit={table.depthUnit || 'm'} value={spec.depthMax} onChange={(x) => updateSpec(['depthMax'], x)} placeholder="all" testId="depth-max" />
          <TextInput label="Keep every nth sample" value={spec.every} onChange={(x) => updateSpec(['every'], x)} testId="every" source="1 keeps every sample; entries count from 0 in each well" />
        </div>
        <Note>Row cap: {MAX_FIT_ROWS.toLocaleString('en-US')} rows per fit. {ROW_CAP_BASIS[0]}</Note>
      </Section>
      <Section title="Model and validation">
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label="Model"
            value={spec.task === 'classification' ? 'logistic' : spec.model.kind}
            onChange={(x) => updateSpec(['model', 'kind'], x)}
            testId="model-kind"
            className="w-56"
            options={MODEL_KINDS[spec.task === 'classification' ? 'classification' : 'regression']}
          />
          {spec.task !== 'classification' && spec.model.kind === 'ridge'
            ? <TextInput label="Ridge lambda" value={spec.model.lambda} onChange={(x) => updateSpec(['model', 'lambda'], x)} testId="ridge-lambda" source="on the sum of squares; scikit-learn Ridge alpha" /> : null}
          {spec.task === 'classification'
            ? <TextInput label="L2 penalty" value={spec.model.l2} onChange={(x) => updateSpec(['model', 'l2'], x)} testId="l2" source="0 is maximum likelihood; scikit-learn C = 1 / L2" /> : null}
        </div>
        <Toggle label="Standardise features (z-score with the population SD, fitted on each fold's training rows only)" checked={spec.standardise} onChange={(x) => updateSpec(['standardise'], x)} testId="standardise" />
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label="Validation"
            value={v.scheme}
            onChange={(x) => updateSpec(['validation', 'scheme'], x)}
            testId="validation-scheme"
            className="w-48"
            options={[{ value: 'kfold', label: 'Group k-fold (whole wells)' }, { value: 'split', label: 'Group split (whole wells)' }]}
          />
          {v.scheme === 'kfold'
            ? <TextInput label="Folds k" value={v.k} onChange={(x) => updateSpec(['validation', 'k'], x)} testId="k" source="2 to the number of wells" />
            : <TextInput label="Test fraction of wells" value={v.testFraction} onChange={(x) => updateSpec(['validation', 'testFraction'], x)} testId="test-fraction" />}
          <TextInput label="Seed" value={v.seed} onChange={(x) => updateSpec(['validation', 'seed'], x)} testId="seed" source="0 to 4294967295; the same seed gives the same wells" />
        </div>
      </Section>
      <DesignSummary />
      {parsed.error ? <Note tone="warn" testId="spec-error">{parsed.error}</Note> : null}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!canRun} onClick={() => runJob('evaluate')} data-testid="run-evaluate">
          <Play className="mr-1 h-4 w-4" /> Fit and validate
        </Button>
        {busy ? (
          <>
            <span className="text-xs text-slate-400" data-testid="busy">
              Running {busy.job}{busy.total ? `, fold ${Math.min(busy.done + 1, busy.total)} of ${busy.total}` : ''}.
            </span>
            <Button size="sm" variant="ghost" onClick={cancelJob}><Square className="mr-1 h-3 w-3" /> Stop</Button>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default SpecPanel;
