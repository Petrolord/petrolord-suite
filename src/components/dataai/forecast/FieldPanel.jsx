// Production Forecasting ML Workbench: the field-wide comparison (Data & AI D4).
//
// compareWithArps on every well of the table with the same settings, in the
// Web Worker with a count of wells done. Per method: the wells where it
// ranked first and the mean of the ranking metric over the wells where the
// engine defines it. Each well's ranking and metrics follow.
import React from 'react';
import { useForecasting } from '@/contexts/ForecastingContext';
import { EngineError, Note, Section } from '@/components/dataai/quality/shared';
import {
  Grid, NeedSeries, RunButton, StaleNote, metricCell,
} from '@/components/dataai/forecast/common';
import { RankedFirstChart } from '@/components/dataai/forecast/charts';
import { BacktestSpec } from '@/components/dataai/forecast/BacktestPanel';
import { METHOD_NAMES } from '@/utils/dataAi/forecastWorkflows';

const FieldResults = () => {
  const { results } = useForecasting();
  const f = results.field?.result;
  if (!f) return null;
  const keys = [...f.methods, 'arps'];
  return (
    <Section title={`Field comparison over ${f.wells.length} well${f.wells.length === 1 ? '' : 's'}`} testId="field-results">
      <StaleNote job="field" />
      <p className="text-xs text-slate-200" data-testid="field-line">
        Ranked by {f.rankBy}, MASE lag m = {f.m}, horizon {f.horizon}, {f.refit ? 'refit at every origin' : 'parameters of the first window held'};
        {' '}{f.refused} well{f.refused === 1 ? '' : 's'} refused by the engine.
      </p>
      <Grid
        testId="field-summary"
        caption={`Mean ${f.rankBy} is over the wells where the engine defines it for that method.`}
        headers={['Method', 'Wells ranked first', `Mean ${f.rankBy}`, 'Wells with the metric', 'Wells without it']}
        rows={f.summary.map((s) => [METHOD_NAMES[s.method], s.rankedFirst, metricCell(s.meanMetric), s.wellsWithMetric, s.wellsWithout])}
      />
      <RankedFirstChart summary={f.summary} />
      <Grid
        testId="field-wells"
        caption={`Each well's ${f.rankBy} per method, and the method ranked first.`}
        headers={['Well', 'Steps', 'First origin', 'Ranked first', ...keys.map((m) => METHOD_NAMES[m])]}
        rows={f.wells.map((w) => (w.result.error
          ? [w.name, w.n, w.firstOrigin, 'refused', ...keys.map(() => '')]
          : [w.name, w.n, `${w.firstOrigin}${w.defaulted ? ' (default)' : ''}`, w.result.best ? METHOD_NAMES[w.result.best] : 'none', ...keys.map((m) => {
            const r = w.result.rows.find((x) => x.method === m);
            return r.error ? 'refused' : metricCell(r[f.rankBy]);
          })]))}
      />
      {f.wells.filter((w) => w.result.error).map((w) => <EngineError key={w.name} result={w.result} prefix={w.name} />)}
      {f.wells.filter((w) => !w.result.error).flatMap((w) => w.result.rows.filter((r) => r.error).map((r) => (
        <Note key={`${w.name}-${r.method}`}>{w.name}, {METHOD_NAMES[r.method]}: {r.error}</Note>
      )))}
    </Section>
  );
};

const FieldPanel = () => (
  <div className="space-y-4" data-testid="field-panel">
    <NeedSeries />
    <Section title="Every well, the same backtest" testId="field-spec">
      <BacktestSpec fieldWide />
      <p className="text-[11px] text-slate-400">
        Runs in the background with a count of wells done. The settings are shared with the Backtest tab; a blank first
        origin is taken per well from its own length.
      </p>
      <RunButton job="field">Compare every well</RunButton>
    </Section>
    <FieldResults />
  </div>
);

export default FieldPanel;
