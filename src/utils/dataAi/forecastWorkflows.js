// Production Forecasting ML Workbench (Data & AI D4): the workflows, every
// number from the engine.
//
// Each function takes one well's series (or the whole table) and the parsed
// spec, and calls the vendored engine (packages/engines/engines/dataai/
// forecast.js through its one-line shim): fitSmoothing, forecastIntervals,
// arpsForecast and compareWithArps. The engine imports the Arps decline fit
// from engines/dca/arps.js and its sampling and quantiles from lib/stats; this
// layer computes none of them.
//
// Conventions this layer adds (stated on screen and in the help guide):
//   - A parameter left blank is estimated by the engine; a number typed is
//     held fixed. Text that is not a number is passed on as NaN, and the
//     engine refuses it with its own message.
//   - The first backtest origin, when left blank, is the series length less
//     three horizons, and at least 3 (DEFAULT_FIRST_ORIGIN).
//   - The field-wide comparison runs compareWithArps on every well with the
//     same settings (each well's own default first origin when blank) and
//     then counts, per method, the wells where it ranked first and the mean
//     of the ranking metric over the wells where the metric is defined.
import * as FC from '@/utils/dataAi/engine/forecast';

/** The engine build the workbench runs: petrolord-engines at the VENDOR.json pin. */
export const ENGINE_VERSION = 'petrolord-engines 1dfdd60 (engines/dataai/forecast.js, PR #255; PR #256 message wording, no numeric change)';
export const ENGINE_COMMIT = '1dfdd60556259fe75e1fe8bfffda841f6c1b3aa1';

export const DEFAULT_SEED = 42;
export const ENGINE_DEFAULTS = FC.DEFAULTS;

export const METHODS = [
  { value: 'ses', label: 'Simple exponential smoothing' },
  { value: 'holt', label: "Holt's linear trend" },
  { value: 'damped', label: 'Damped trend (Gardner and McKenzie)' },
];
export const METHOD_NAMES = {
  ses: 'simple exponential smoothing',
  holt: "Holt's linear trend",
  damped: 'damped trend',
  arps: 'Arps decline',
};
export const METHOD_PARAMS = { ses: ['alpha'], holt: ['alpha', 'beta'], damped: ['alpha', 'beta', 'phi'] };
export const ARPS_MODELS = ['Auto-Select', 'Exponential', 'Harmonic', 'Hyperbolic'];
export const RANK_METRICS = [
  { value: 'mase', label: 'MASE (mean absolute scaled error)' },
  { value: 'mae', label: 'MAE' },
  { value: 'rmse', label: 'RMSE' },
  { value: 'smape', label: 'sMAPE (percent, 0 to 200)' },
  { value: 'mape', label: 'MAPE (percent; undefined when an actual is 0)' },
];
export const DEFAULT_FIRST_ORIGIN = 'the series length less three horizons, and at least 3';

/** A fresh spec: every field as typed text, read by parseSpec. */
export const defaultSpec = () => ({
  well: '',
  methods: { ses: true, holt: true, damped: true },
  params: {
    ses: { alpha: '' },
    holt: { alpha: '', beta: '' },
    damped: { alpha: '', beta: '', phi: '' },
  },
  h: '24',
  arpsModel: 'Auto-Select',
  intervals: {
    method: 'damped', nSims: '1000', seed: String(DEFAULT_SEED), nonNegative: true,
  },
  backtest: {
    firstOrigin: '', horizon: '6', step: '6', refit: true, m: '1', rankBy: 'mase',
  },
});

/** Blank is undefined (the engine estimates or defaults); anything else is Number(text). */
export const parseNum = (text) => {
  const s = String(text ?? '').trim();
  return s === '' ? undefined : Number(s);
};

/** The spec as the engine reads it. */
export function parseSpec(spec) {
  const s = spec || defaultSpec();
  const params = {};
  METHODS.forEach(({ value: m }) => {
    params[m] = {};
    METHOD_PARAMS[m].forEach((p) => {
      const v = parseNum(s.params?.[m]?.[p]);
      if (v !== undefined) params[m][p] = v;
    });
  });
  return {
    methods: METHODS.map((x) => x.value).filter((m) => s.methods?.[m]),
    params,
    h: parseNum(s.h),
    arpsModel: s.arpsModel,
    intervals: {
      method: s.intervals.method,
      nSims: parseNum(s.intervals.nSims),
      seed: parseNum(s.intervals.seed),
      nonNegative: !!s.intervals.nonNegative,
    },
    backtest: {
      firstOrigin: parseNum(s.backtest.firstOrigin),
      horizon: parseNum(s.backtest.horizon),
      step: parseNum(s.backtest.step),
      refit: !!s.backtest.refit,
      m: parseNum(s.backtest.m),
      rankBy: s.backtest.rankBy,
    },
  };
}

/** The first origin the engine is given: as typed, or DEFAULT_FIRST_ORIGIN. */
export function firstOriginFor(n, backtest) {
  if (backtest.firstOrigin !== undefined) return { firstOrigin: backtest.firstOrigin, defaulted: false };
  const H = Number.isInteger(backtest.horizon) ? backtest.horizon : 0;
  return { firstOrigin: Math.max(3, n - 3 * H), defaulted: true };
}

/** The series of the chosen well, or null. */
export const seriesOf = (table, name) => (table?.wells || []).find((w) => w.name === name) || null;

/** Every smoothing method chosen, fitted by the engine, and the Arps baseline, h steps ahead. */
export function runFit({ series, parsed }) {
  const y = series.values;
  const fits = {};
  parsed.methods.forEach((m) => {
    fits[m] = FC.fitSmoothing({
      y, method: m, ...parsed.params[m], h: parsed.h,
    });
  });
  const arps = FC.arpsForecast({ y, h: parsed.h, modelType: parsed.arpsModel });
  return {
    well: series.name, n: y.length, h: parsed.h, methods: parsed.methods.slice(), fits, arps,
  };
}

/** Residual-bootstrap P90, P50 and P10 for one method, by the engine. */
export function runIntervals({ series, parsed }) {
  const { method, nSims, seed, nonNegative } = parsed.intervals;
  const result = FC.forecastIntervals({
    y: series.values, method, ...(parsed.params[method] || {}), h: parsed.h, nSims, seed, nonNegative,
  });
  return {
    well: series.name, n: series.values.length, method, result,
  };
}

const compareArgs = (y, parsed) => {
  const bt = parsed.backtest;
  const { firstOrigin, defaulted } = firstOriginFor(y.length, bt);
  return {
    args: {
      y,
      methods: parsed.methods,
      firstOrigin,
      horizon: bt.horizon,
      step: bt.step,
      refit: bt.refit,
      arpsModel: parsed.arpsModel,
      rankBy: bt.rankBy,
      m: bt.m,
    },
    defaulted,
  };
};

/** Rolling-origin backtest of the chosen methods and the Arps baseline, ranked, by the engine. */
export function runCompare({ series, parsed }) {
  const { args, defaulted } = compareArgs(series.values, parsed);
  const result = FC.compareWithArps(args);
  return {
    well: series.name, n: series.values.length, firstOrigin: args.firstOrigin, defaulted, m: args.m, result,
  };
}

/**
 * Per method across the wells: how many wells ranked it first, and the mean
 * of the ranking metric over the wells where it is defined.
 */
export function summariseField(wells, methods, rankBy) {
  const keys = [...methods, 'arps'];
  return keys.map((method) => {
    let first = 0;
    let sum = 0;
    let count = 0;
    let undefinedCount = 0;
    wells.forEach((w) => {
      const r = w.result;
      if (!r || r.error) return;
      if (r.best === method) first += 1;
      const row = r.rows.find((x) => x.method === method);
      const v = row ? row[rankBy] : null;
      if (typeof v === 'number') { sum += v; count += 1; } else undefinedCount += 1;
    });
    return {
      method, rankedFirst: first, meanMetric: count ? sum / count : null, wellsWithMetric: count, wellsWithout: undefinedCount,
    };
  });
}

/** compareWithArps on every well of the table with the same settings. */
export function runField({ table, parsed, onProgress }) {
  const total = table.wells.length;
  const wells = table.wells.map((w, i) => {
    const { args, defaulted } = compareArgs(w.values, parsed);
    const result = FC.compareWithArps(args);
    onProgress?.({ phase: 'wells', done: i + 1, total });
    return {
      name: w.name, n: w.values.length, firstOrigin: args.firstOrigin, defaulted, result,
    };
  });
  const refused = wells.filter((w) => w.result.error).length;
  return {
    wells,
    methods: parsed.methods.slice(),
    rankBy: parsed.backtest.rankBy,
    m: parsed.backtest.m,
    refit: parsed.backtest.refit,
    horizon: parsed.backtest.horizon,
    step: parsed.backtest.step,
    refused,
    summary: summariseField(wells, parsed.methods, parsed.backtest.rankBy),
  };
}

/** Every engine warning in a set of results, with where it came from. */
export function collectWarnings(results) {
  const out = [];
  const fit = results.fit?.result;
  if (fit) {
    Object.entries(fit.fits).forEach(([m, r]) => (r.warnings || []).forEach((t) => out.push({ where: `fit ${m}`, text: t })));
  }
  const pi = results.intervals?.result?.result;
  (pi?.warnings || []).forEach((t) => out.push({ where: `intervals ${results.intervals.result.method}`, text: t }));
  return out;
}

/** One line naming a fitted method and its parameters, as the engine returned them. */
export function methodText(r) {
  if (!r || r.error) return '';
  const ps = Object.entries(r.params).map(([k, v]) => `${k} ${v}${r.fixed.includes(k) ? ' (held)' : ''}`).join(', ');
  return `${METHOD_NAMES[r.method]}: ${ps}`;
}
