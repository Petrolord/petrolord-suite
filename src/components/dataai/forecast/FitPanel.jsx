// Production Forecasting ML Workbench: fit, forecast and bootstrap intervals (Data & AI D4).
//
// Simple exponential smoothing, Holt's linear trend and the damped trend are
// fitted by the engine (fitSmoothing) with each parameter estimated when left
// blank and held when typed; the optimiser's record (converged, parameters
// on a bound, SSE evaluations) is shown as the engine returns it. The Arps
// decline baseline is the engine's arpsForecast, which imports
// engines/dca/arps.js. The intervals are the engine's residual bootstrap.
import React from 'react';
import { useForecasting } from '@/contexts/ForecastingContext';
import {
  EngineError, Note, Section, SelectField, TextInput, Toggle,
} from '@/components/dataai/quality/shared';
import {
  Grid, NeedSeries, RunButton, StaleNote, dn,
} from '@/components/dataai/forecast/common';
import { ForecastChart } from '@/components/dataai/forecast/charts';
import {
  ARPS_MODELS, METHODS, METHOD_NAMES, METHOD_PARAMS, ENGINE_DEFAULTS,
} from '@/utils/dataAi/forecastWorkflows';

const PARAM_NOTE = {
  alpha: 'level smoothing, 0 to 1',
  beta: 'trend smoothing, 0 to 1',
  phi: `damping; fitted from ${ENGINE_DEFAULTS.PHI_MIN} to ${ENGINE_DEFAULTS.PHI_MAX}, typed above 0 and at most 1`,
};

const MethodSpec = () => {
  const { spec, updateSpec } = useForecasting();
  return (
    <Section title="Methods and parameters" testId="method-spec">
      <Note>
        Leave a parameter blank for the engine to estimate it by least one-step squared error (a grid, then a compass
        search in the stated box); type a number to hold it fixed.
      </Note>
      <div className="grid gap-3 md:grid-cols-3">
        {METHODS.map(({ value: m, label }) => (
          <div key={m} className="space-y-1 rounded border border-slate-800 p-2">
            <Toggle label={label} checked={spec.methods[m]} onChange={(v) => updateSpec(['methods', m], v)} testId={`method-${m}`} />
            <div className="flex flex-wrap gap-2">
              {METHOD_PARAMS[m].map((p) => (
                <TextInput key={p} label={p} value={spec.params[m][p]} onChange={(v) => updateSpec(['params', m, p], v)} placeholder="fitted" testId={`param-${m}-${p}`} source={PARAM_NOTE[p]} width="w-20" />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <TextInput label="Forecast horizon h" unit="steps" value={spec.h} onChange={(v) => updateSpec(['h'], v)} testId="horizon-h" />
        <div className="w-52">
          <SelectField label="Arps decline model" value={spec.arpsModel} onChange={(v) => updateSpec(['arpsModel'], v)} testId="arps-model" options={ARPS_MODELS.map((a) => ({ value: a, label: a }))} />
        </div>
        <RunButton job="fit">Fit and forecast</RunButton>
      </div>
    </Section>
  );
};

const optimiserText = (r) => {
  if (!r.optimiser) return 'all parameters given';
  const o = r.optimiser;
  return `${o.converged ? 'converged' : 'stopped before converging'}; ${o.evaluations.toLocaleString('en-US')} SSE evaluations; on a bound: ${o.atBounds.length ? o.atBounds.join(', ') : 'none'}`;
};

const FitResults = () => {
  const { results, series, table } = useForecasting();
  const fit = results.fit?.result;
  if (!fit) return null;
  const ok = Object.entries(fit.fits);
  return (
    <Section title={`Fits on ${fit.well}`} testId="fit-results">
      <StaleNote job="fit" />
      {ok.map(([m, r]) => (r.error ? <EngineError key={m} result={r} prefix={METHOD_NAMES[m]} /> : null))}
      <Grid
        testId="fit-table"
        caption="Parameters as the engine returned them; held parameters were typed. SSE and MSE are over the scored one-step errors (the first scored step is shown)."
        headers={['Method', 'Parameters', 'SSE', 'MSE', 'Scored from step', 'Optimiser']}
        rows={ok.filter(([, r]) => !r.error).map(([m, r]) => [
          METHOD_NAMES[m],
          Object.entries(r.params).map(([k, v]) => `${k} ${dn(v)}${r.fixed.includes(k) ? ' (held)' : ''}`).join(', '),
          r.sse,
          r.mse,
          r.scoredFrom,
          optimiserText(r),
        ])}
      />
      {ok.filter(([, r]) => !r.error && r.warnings).map(([m, r]) => r.warnings.map((w) => <Note key={`${m}${w}`} tone="warn" testId={`warning-${m}`}>{METHOD_NAMES[m]}: {w}</Note>))}
      {fit.arps.error ? <EngineError result={fit.arps} prefix="Arps decline" /> : (
        <p className="text-xs text-slate-200" data-testid="arps-line">
          Arps decline ({fit.arps.modelType}{fit.arps.requested !== fit.arps.modelType ? `, chosen by ${fit.arps.requested}` : ''}):
          qi <span className="font-mono">{dn(fit.arps.qi)}</span> per step, Di <span className="font-mono">{dn(fit.arps.Di)}</span> per step,
          b <span className="font-mono">{dn(fit.arps.b)}</span>; {fit.arps.nUsed} positive values used, {fit.arps.dropped} zero or negative dropped.
        </p>
      )}
      {series && series.name === fit.well ? <ForecastChart series={series} fit={fit} intervals={results.intervals?.result?.well === fit.well ? results.intervals.result : null} unit={table?.unit} /> : null}
    </Section>
  );
};

const IntervalSpec = () => {
  const {
    spec, updateSpec, results, series, table,
  } = useForecasting();
  const pi = results.intervals?.result;
  const fitShown = results.fit?.result?.well === pi?.well;
  const r = pi?.result;
  return (
    <Section title="Bootstrap intervals" testId="intervals-section">
      <Note>
        Residual bootstrap: each simulated path adds a one-step residual of the fit, drawn with replacement, at every
        step. The seed makes every path reproducible. P90 is the low case and P10 the high case: {r && !r.error ? r.definition : 'P90 means a 90% probability the actual quantity meets or exceeds this value, per SPE PRMS.'}
      </Note>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <SelectField label="Method" value={spec.intervals.method} onChange={(v) => updateSpec(['intervals', 'method'], v)} testId="intervals-method" options={METHODS} />
        </div>
        <TextInput label="Paths (nSims)" value={spec.intervals.nSims} onChange={(v) => updateSpec(['intervals', 'nSims'], v)} testId="intervals-nsims" />
        <TextInput label="Seed" value={spec.intervals.seed} onChange={(v) => updateSpec(['intervals', 'seed'], v)} testId="intervals-seed" />
        <Toggle label="Report a negative percentile as 0" checked={spec.intervals.nonNegative} onChange={(v) => updateSpec(['intervals', 'nonNegative'], v)} testId="intervals-nonneg" />
        <RunButton job="intervals">Run the bootstrap</RunButton>
      </div>
      <p className="text-[11px] text-slate-400">The horizon is the forecast horizon h above; the method&apos;s typed parameters are held here too.</p>
      {pi ? <StaleNote job="intervals" /> : null}
      {r?.error ? <EngineError result={r} prefix="Intervals" /> : null}
      {r && !r.error ? (
        <>
          <p className="text-xs text-slate-200" data-testid="intervals-line">
            {METHOD_NAMES[pi.method]} on {pi.well}: {r.nSims.toLocaleString('en-US')} paths, seed {r.seed}, {r.poolSize} residuals in the pool;
            {' '}{r.clippedToZero} percentile{r.clippedToZero === 1 ? '' : 's'} reported as 0.
          </p>
          <Grid
            testId="intervals-table"
            caption="Per step: the point forecast and the 10th, 50th and 90th percentiles of the simulated values, labelled P90, P50 and P10."
            headers={['Step', 'Point forecast', 'P90 (low)', 'P50', 'P10 (high)']}
            rows={r.forecast.map((f, j) => [pi.n + j, f, r.P90[j], r.P50[j], r.P10[j]])}
          />
          {!fitShown && series && series.name === pi.well ? <ForecastChart series={series} fit={null} intervals={pi} unit={table?.unit} testId="intervals-chart" /> : null}
        </>
      ) : null}
    </Section>
  );
};

const FitPanel = () => (
  <div className="space-y-4" data-testid="fit-panel">
    <NeedSeries />
    <MethodSpec />
    <FitResults />
    <IntervalSpec />
  </div>
);

export default FitPanel;
