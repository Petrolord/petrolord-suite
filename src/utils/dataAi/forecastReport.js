// Production Forecasting ML Workbench (Data & AI D4): the run report as CSV.
//
// Layout only. Every fitted value, residual, parameter, forecast,
// percentile, error and metric is the engine's, taken from the results the
// workflows returned. The CSV keeps every number at full round-trip
// precision (String(x)); the screen rounds for reading, the export does not.
// Engine refusals, the reasons a metric is undefined, the percentile
// definition and every engine warning are written as the engine wrote them,
// as meta, note, refused and warning rows.
import { ENGINE_COMMIT, ENGINE_VERSION, collectWarnings } from '@/utils/dataAi/forecastWorkflows';

const q = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const CSV_COLUMNS = ['record', 'well', 'method', 'origin', 'step', 'period', 'name', 'value', 'detail'];
export const METRIC_KEYS = ['n', 'me', 'mae', 'rmse', 'mape', 'smape', 'mase'];

const metricRows = (row, base, r) => {
  METRIC_KEYS.forEach((k) => {
    if (r[k] === undefined) return;
    row({ ...base, record: 'metric', name: k, value: r[k] });
  });
  Object.entries(r.notes || {}).forEach(([k, t]) => row({ ...base, record: 'note', name: `${k} undefined`, detail: t }));
};

/**
 * One CSV, one row per record under a shared header: meta (run, data,
 * engine, spec, definitions), warnings, fits (parameters, optimiser, fitted
 * and residual per step, forecasts), Arps, intervals, the backtest (metrics,
 * ranking, every origin's forecasts and errors) and the field-wide
 * comparison.
 */
export function buildForecastCsv({
  runName, table, spec, results,
}) {
  const lines = [CSV_COLUMNS.join(',')];
  const row = (cells) => lines.push(CSV_COLUMNS.map((c) => q(cells[c])).join(','));
  row({ record: 'meta', name: 'run', value: runName || 'Unsaved forecast run' });
  row({ record: 'meta', name: 'data', value: table?.label || '' });
  row({ record: 'meta', name: 'unit', value: table?.unit || 'as in the source' });
  row({ record: 'meta', name: 'step', value: table?.step || '' });
  row({ record: 'meta', name: 'engine', value: ENGINE_VERSION });
  row({ record: 'meta', name: 'engine commit', value: ENGINE_COMMIT });
  row({ record: 'meta', name: 'generated', value: new Date().toISOString() });
  if (spec) row({ record: 'meta', name: 'spec', detail: JSON.stringify(spec) });
  (table?.notes || []).forEach((t) => row({ record: 'note', name: 'data', detail: t }));
  collectWarnings(results).forEach((w) => row({ record: 'warning', name: w.where, detail: w.text }));

  const fit = results.fit?.result;
  if (fit) {
    const series = (table?.wells || []).find((w) => w.name === fit.well);
    Object.entries(fit.fits).forEach(([m, r]) => {
      const base = { well: fit.well, method: m };
      if (r.error) { row({ ...base, record: 'refused', name: 'fit', detail: r.error }); return; }
      Object.entries(r.params).forEach(([k, v]) => row({
        ...base, record: 'param', name: k, value: v, detail: r.fixed.includes(k) ? 'held fixed' : 'estimated',
      }));
      row({ ...base, record: 'fit', name: 'initial', detail: r.basis.initial });
      row({ ...base, record: 'fit', name: 'sse', value: r.sse });
      row({ ...base, record: 'fit', name: 'mse', value: r.mse });
      row({ ...base, record: 'fit', name: 'scoredFrom', value: r.scoredFrom });
      if (r.optimiser) {
        row({ ...base, record: 'optimiser', name: 'converged', value: r.optimiser.converged });
        row({ ...base, record: 'optimiser', name: 'atBounds', value: r.optimiser.atBounds.join('; ') });
        row({ ...base, record: 'optimiser', name: 'evaluations', value: r.optimiser.evaluations });
        row({ ...base, record: 'optimiser', name: 'gridSse', value: r.optimiser.gridSse });
        row({ ...base, record: 'optimiser', name: 'gridStart', detail: JSON.stringify(r.optimiser.gridStart) });
      }
      r.fitted.forEach((f, t) => row({
        ...base, record: 'fitted', step: t, period: series?.labels[t], name: 'actual, fitted, residual', value: f, detail: `${series ? series.values[t] : ''} | ${r.residuals[t] ?? ''}`,
      }));
      r.forecast.forEach((f, j) => row({ ...base, record: 'forecast', step: fit.n + j, name: `h ${j + 1}`, value: f }));
    });
    const a = fit.arps;
    const base = { well: fit.well, method: 'arps' };
    if (a.error) row({ ...base, record: 'refused', name: 'fit', detail: a.error });
    else {
      ['modelType', 'qi', 'Di', 'b', 'R2', 'RMSE', 't0Index', 'nUsed', 'dropped'].forEach((k) => row({ ...base, record: 'param', name: k, value: a[k] }));
      row({ ...base, record: 'note', name: 'time', detail: a.basis.time });
      a.fitted.forEach((f, t) => { if (f !== null) row({ ...base, record: 'fitted', step: t, period: series?.labels[t], name: 'fitted', value: f }); });
      a.forecast.forEach((f, j) => row({ ...base, record: 'forecast', step: fit.n + j, name: `h ${j + 1}`, value: f }));
    }
  }

  const pi = results.intervals?.result;
  if (pi) {
    const base = { well: pi.well, method: pi.method };
    const r = pi.result;
    if (r.error) row({ ...base, record: 'refused', name: 'intervals', detail: r.error });
    else {
      row({ ...base, record: 'meta', name: 'seed', value: r.seed });
      row({ ...base, record: 'meta', name: 'nSims', value: r.nSims });
      row({ ...base, record: 'meta', name: 'poolSize', value: r.poolSize });
      row({ ...base, record: 'meta', name: 'clippedToZero', value: r.clippedToZero });
      row({ ...base, record: 'meta', name: 'definition', detail: r.definition });
      row({ ...base, record: 'meta', name: 'bootstrap', detail: r.basis.bootstrap });
      row({ ...base, record: 'meta', name: 'percentiles', detail: r.basis.percentiles });
      r.forecast.forEach((f, j) => {
        const b2 = { ...base, record: 'interval', step: pi.n + j };
        row({ ...b2, name: `point h ${j + 1}`, value: f });
        row({ ...b2, name: `P90 h ${j + 1}`, value: r.P90[j] });
        row({ ...b2, name: `P50 h ${j + 1}`, value: r.P50[j] });
        row({ ...b2, name: `P10 h ${j + 1}`, value: r.P10[j] });
      });
    }
  }

  const cmp = results.compare?.result;
  if (cmp) {
    const c = cmp.result;
    if (c.error) row({ well: cmp.well, record: 'refused', name: 'backtest', detail: c.error });
    else {
      row({ well: cmp.well, record: 'meta', name: 'backtest', detail: `${c.basis.origins}; ${c.refit ? 'refit at every origin' : 'parameters of the first window held'}; ranked by ${c.rankBy}; MASE lag m ${cmp.m}` });
      row({ well: cmp.well, record: 'meta', name: 'ranking', value: c.ranking.join(' > '), detail: c.unranked.length ? `unranked: ${c.unranked.join(', ')}` : '' });
      c.rows.forEach((r) => {
        const base = { well: cmp.well, method: r.method };
        if (r.error) { row({ ...base, record: 'refused', name: 'backtest', detail: r.error }); return; }
        metricRows(row, base, r);
        r.perOrigin.forEach((o) => {
          o.forecast.forEach((f, j) => row({
            ...base, record: 'origin', origin: o.origin, step: o.origin + j, name: 'forecast, actual, error', value: f, detail: `${o.actual[j]} | ${o.errors[j]}`,
          }));
          row({ ...base, record: 'origin', origin: o.origin, name: 'maseScale', value: o.maseScale });
          row({ ...base, record: 'origin', origin: o.origin, name: 'params', detail: JSON.stringify(o.params) });
        });
      });
    }
  }

  const field = results.field?.result;
  if (field) {
    row({ record: 'meta', method: 'field', name: 'field comparison', detail: `${field.wells.length} wells, ${field.refused} refused; ranked by ${field.rankBy}; MASE lag m ${field.m}` });
    field.summary.forEach((s) => {
      row({ record: 'field', method: s.method, name: 'wells ranked first', value: s.rankedFirst });
      row({ record: 'field', method: s.method, name: `mean ${field.rankBy}`, value: s.meanMetric, detail: `over ${s.wellsWithMetric} wells; undefined on ${s.wellsWithout}` });
    });
    field.wells.forEach((w) => {
      if (w.result.error) { row({ well: w.name, record: 'refused', name: 'backtest', detail: w.result.error }); return; }
      row({ well: w.name, record: 'meta', name: 'ranking', value: w.result.ranking.join(' > '), detail: `first origin ${w.firstOrigin}${w.defaulted ? ' (default)' : ''}` });
      w.result.rows.forEach((r) => {
        if (r.error) { row({ well: w.name, method: r.method, record: 'refused', name: 'backtest', detail: r.error }); return; }
        metricRows(row, { well: w.name, method: r.method }, r);
      });
    });
  }
  return `${lines.join('\n')}\n`;
}
