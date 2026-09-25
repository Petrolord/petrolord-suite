// Production Forecasting ML Workbench: rolling-origin backtest against the
// Arps baseline (Data & AI D4).
//
// The engine's compareWithArps backtests every chosen smoothing method and
// the Arps decline on the same expanding-window origins, scores them with
// the same metrics and ranks them. MASE is the headline and the default
// ranking metric; its lag m is stated. MAPE is shown with the engine's
// reason when it is undefined (an actual of 0, a shut-in step). sMAPE is on
// the 0 to 200 scale. When the fit spec has typed parameters, a toggle holds
// them in the single-well backtest (default off: every parameter estimated);
// those methods are then backtested by the engine's backtest() with the
// typed parameters held (forecastWorkflows.runCompare).
import React, { useState } from 'react';
import { useForecasting } from '@/contexts/ForecastingContext';
import {
  EngineError, Note, Section, SelectField, TextInput, Toggle,
} from '@/components/dataai/quality/shared';
import {
  Grid, NeedSeries, RunButton, StaleNote, dn, metricCell,
} from '@/components/dataai/forecast/common';
import { OriginChart } from '@/components/dataai/forecast/charts';
import {
  DEFAULT_FIRST_ORIGIN, METHOD_NAMES, RANK_METRICS, parseSpec, typedParams,
} from '@/utils/dataAi/forecastWorkflows';

const heldText = (held) => Object.entries(held).map(([m, p]) => `${METHOD_NAMES[m]} ${Object.entries(p).map(([k, v]) => `${k} ${v}`).join(', ')}`).join('; ');

export const BacktestSpec = ({ fieldWide = false }) => {
  const { spec, updateSpec } = useForecasting();
  const b = spec.backtest;
  const typed = fieldWide ? {} : typedParams(parseSpec(spec));
  const hasTyped = Object.keys(typed).length > 0;
  const holding = hasTyped && b.holdTyped;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <TextInput label="First origin" value={b.firstOrigin} onChange={(v) => updateSpec(['backtest', 'firstOrigin'], v)} placeholder="default" testId={`${fieldWide ? 'field-' : ''}bt-first`} width="w-20" />
        <TextInput label="Horizon" unit="steps" value={b.horizon} onChange={(v) => updateSpec(['backtest', 'horizon'], v)} testId={`${fieldWide ? 'field-' : ''}bt-horizon`} width="w-20" />
        <TextInput label="Step between origins" value={b.step} onChange={(v) => updateSpec(['backtest', 'step'], v)} testId={`${fieldWide ? 'field-' : ''}bt-step`} width="w-20" />
        <TextInput label="MASE lag m" value={b.m} onChange={(v) => updateSpec(['backtest', 'm'], v)} testId={`${fieldWide ? 'field-' : ''}bt-m`} width="w-20" />
        <div className="w-64">
          <SelectField label="Rank by" value={b.rankBy} onChange={(v) => updateSpec(['backtest', 'rankBy'], v)} testId={`${fieldWide ? 'field-' : ''}bt-rank`} options={RANK_METRICS} />
        </div>
        <Toggle label="Re-estimate parameters at every origin (refit)" checked={b.refit} onChange={(v) => updateSpec(['backtest', 'refit'], v)} testId={`${fieldWide ? 'field-' : ''}bt-refit`} />
        {hasTyped ? (
          <Toggle label="Hold the typed parameters in the backtest" checked={!!b.holdTyped} onChange={(v) => updateSpec(['backtest', 'holdTyped'], v)} testId="bt-hold-typed" />
        ) : null}
      </div>
      <Note>
        Origin o trains on steps 0 to o - 1 and forecasts the next horizon steps; origins run from the first origin by the
        step while a full horizon of actuals remains. A blank first origin is {DEFAULT_FIRST_ORIGIN}.
        {holding
          ? ` The typed parameters (${heldText(typed)}) are held at every origin; the other parameters are estimated (refit on: at every origin; off: on the first window, then held).`
          : ` Every parameter is estimated here (refit on: at every origin; off: on the first window, then held)${hasTyped ? '; switch on the hold toggle to keep the typed parameters fixed instead' : ''}${fieldWide ? '; the field comparison always estimates every parameter, since typed parameters belong to one well' : ''}.`}
        {' '}The Arps decline is refitted on every window. MASE scales each error by the mean absolute lag-m naive error on that origin&apos;s training values
        (m = 1 is the previous step).
      </Note>
    </div>
  );
};

export const MetricsTable = ({ rows, rankBy, testId }) => (
  <Grid
    testId={testId}
    caption={`MASE is the headline metric; ranked by ${rankBy}. sMAPE is in percent on a 0 to 200 scale. MAPE is undefined when an actual is 0. ME is the mean of actual minus forecast (positive: the forecast is low).`}
    headers={['Method', 'MASE', 'MAE', 'RMSE', 'sMAPE', 'MAPE', 'ME', 'Errors scored']}
    rows={rows.map((r) => (r.error ? [METHOD_NAMES[r.method], 'refused', '', '', '', '', '', ''] : [
      METHOD_NAMES[r.method], metricCell(r.mase), r.mae, r.rmse, r.smape, metricCell(r.mape), r.me, r.n,
    ]))}
  />
);

export const MetricNotes = ({ rows, testIdPrefix = 'note' }) => (
  <>
    {rows.filter((r) => r.error).map((r) => <EngineError key={r.method} result={r} prefix={METHOD_NAMES[r.method]} />)}
    {rows.filter((r) => r.notes).flatMap((r) => Object.entries(r.notes).map(([k, t]) => (
      <Note key={`${r.method}-${k}`} testId={`${testIdPrefix}-${r.method}-${k}`}>{METHOD_NAMES[r.method]}: {t}</Note>
    )))}
  </>
);

const CompareResults = () => {
  const {
    results, series, table,
  } = useForecasting();
  const [origin, setOrigin] = useState('');
  const cmp = results.compare?.result;
  if (!cmp) return null;
  const c = cmp.result;
  if (c.error) return <Section title="Backtest" testId="compare-results"><StaleNote job="compare" /><EngineError result={c} prefix="Backtest" /></Section>;
  const shown = c.origins.includes(Number(origin)) ? Number(origin) : c.origins[0];
  const rows = c.rows.map((r) => (r.error ? r : { ...r }));
  return (
    <Section title={`Backtest on ${cmp.well}`} testId="compare-results">
      <StaleNote job="compare" />
      <p className="text-xs text-slate-200" data-testid="compare-line">
        Origins {c.origins.join(', ')}{cmp.defaulted ? ' (default first origin)' : ''}; horizon {c.horizon}; {c.refit ? 'refit at every origin' : 'parameters of the first window held'}; MASE lag m = {cmp.m}.
        {cmp.held ? <span data-testid="compare-held">{' '}Typed parameters held at every origin: {heldText(cmp.held)}.</span> : null}
        {' '}Ranking by {c.rankBy}: <span className="font-mono" data-testid="compare-ranking">{c.ranking.map((m) => METHOD_NAMES[m]).join(' > ')}</span>
        {c.unranked.length ? `; unranked (metric undefined): ${c.unranked.map((m) => METHOD_NAMES[m]).join(', ')}` : ''}.
      </p>
      <MetricsTable rows={rows} rankBy={c.rankBy} testId="compare-table" />
      <MetricNotes rows={rows} />
      <div className="space-y-2" data-testid="origin-view">
        <div className="w-40">
          <SelectField label="Origin to view" value={String(shown)} onChange={setOrigin} testId="origin-pick" options={c.origins.map((o) => ({ value: String(o), label: `origin ${o}` }))} />
        </div>
        {series && series.name === cmp.well ? <OriginChart series={series} compare={c} origin={shown} unit={table?.unit} /> : null}
        <Grid
          testId="origin-table"
          caption={`Forecasts from origin ${shown}, each step's actual, and each method's error (actual minus forecast).`}
          headers={['Step', 'Actual', ...c.rows.filter((r) => !r.error).flatMap((r) => [`${METHOD_NAMES[r.method]} forecast`, 'error'])]}
          rows={Array.from({ length: c.horizon }, (_, j) => {
            const first = c.rows.find((r) => !r.error)?.perOrigin.find((o) => o.origin === shown);
            return [shown + j, first ? first.actual[j] : '', ...c.rows.filter((r) => !r.error).flatMap((r) => {
              const o = r.perOrigin.find((x) => x.origin === shown);
              return [o.forecast[j], o.errors[j]];
            })];
          })}
        />
        <p className="text-[11px] text-slate-400" data-testid="origin-params">
          Parameters at origin {shown}: {c.rows.filter((r) => !r.error).map((r) => {
            const o = r.perOrigin.find((x) => x.origin === shown);
            return `${METHOD_NAMES[r.method]} ${Object.entries(o.params).map(([k, v]) => `${k} ${typeof v === 'number' ? dn(v) : v}`).join(', ')}`;
          }).join('; ')}.
        </p>
      </div>
    </Section>
  );
};

const BacktestPanel = () => (
  <div className="space-y-4" data-testid="backtest-panel">
    <NeedSeries />
    <Section title="Rolling-origin backtest against the Arps decline" testId="compare-spec">
      <BacktestSpec />
      <p className="text-[11px] text-slate-400">Methods and the Arps model are those chosen on the Fit and forecast tab.</p>
      <RunButton job="compare">Run the backtest</RunButton>
    </Section>
    <CompareResults />
  </div>
);

export default BacktestPanel;
