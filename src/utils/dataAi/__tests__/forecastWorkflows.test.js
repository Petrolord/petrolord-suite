/**
 * Production Forecasting ML Workbench (D4): the app layer calls the engine.
 *
 * The engine is gated in packages/engines/__tests__/dataai.forecast.test.js
 * against an independent stdlib oracle and the NIST/SEMATECH 6.4.3 figures.
 * These check the app layer only: that the spec the page types reaches the
 * engine as the engine's own arguments (so the workflow result equals a
 * direct engine call, and equals the oracle's golden where the golden's
 * arguments are the ones typed), that the data layer hands the engine the
 * series as the file or the spine holds it, and that the field-wide run is
 * the per-well engine call. Goldens are read from the vendored test data;
 * a missing file fails the suite with its name.
 */
import fs from 'fs';
import path from 'path';
import * as FC from '@/utils/dataAi/engine/forecast';
import {
  defaultSpec, parseSpec, parseNum, firstOriginFor, runFit, runIntervals, runCompare, runField, summariseField, collectWarnings, methodText, ENGINE_COMMIT,
  rankRows, typedParams,
} from '@/utils/dataAi/forecastWorkflows';
import { forecastTableFromUpload, forecastTableFromSpine } from '@/utils/dataAi/forecastData';
import { parseDelimitedText } from '@/lib/tabularFile';
import { GOLDEN, GOLDEN_PATH, EKENE, ekeneCsv } from './fixtures/forecast/ekene';

const G = GOLDEN;
const byId = (id) => {
  const c = G.cases.find((x) => x.id === id);
  if (!c) throw new Error(`golden case ${id} is missing from ${GOLDEN_PATH}`);
  return c;
};
const close = (a, e, rel, where, abs = 1e-12) => {
  if (typeof e === 'number') {
    expect(typeof a).toBe('number');
    const d = Math.abs(a - e);
    if (d > abs && d > rel * Math.abs(e)) throw new Error(`${where}: ${a} vs ${e}`);
    return;
  }
  if (Array.isArray(e)) { expect(a).toHaveLength(e.length); e.forEach((x, i) => close(a[i], x, rel, `${where}[${i}]`, abs)); return; }
  if (e && typeof e === 'object') { Object.keys(e).forEach((k) => close(a[k], e[k], rel, `${where}.${k}`, abs)); return; }
  expect(a).toEqual(e);
};

const ekeneTable = () => forecastTableFromUpload(parseDelimitedText(ekeneCsv()), {
  label: 'ekene.csv', wellColumn: 0, periodColumn: 1, valueColumn: 2, unit: 'stb per month',
});

describe('the Ekene CSV reaches the engine as the golden series', () => {
  it('reads three wells of 60 months in file order, shut-in zeros kept as 0', () => {
    const t = ekeneTable();
    expect(t.wells.map((w) => w.name)).toEqual(['EKENE-P01', 'EKENE-P02', 'EKENE-P03']);
    t.wells.forEach((w, k) => {
      expect(w.values).toEqual(EKENE[k].rate);
      expect(w.labels[0]).toBe('2021-01');
      expect(w.labels[59]).toBe('2025-12');
    });
    expect(t.notes.join(' ')).toMatch(/EKENE-P01 has 3 steps at 0/);
  });

  it('refuses a blank value by default and names the row; reads it as 0 when chosen', () => {
    const text = 'well,month,q\nA,2020-01,10\nA,2020-02,\nA,2020-03,8\n';
    expect(() => forecastTableFromUpload(parseDelimitedText(text), { label: 'x', wellColumn: 0, periodColumn: 1, valueColumn: 2 }))
      .toThrow('1 value has no value: A data row 2 (2020-02). The engine needs one value per step.');
    const t = forecastTableFromUpload(parseDelimitedText(text), {
      label: 'x', wellColumn: 0, periodColumn: 1, valueColumn: 2, missing: 'zero',
    });
    expect(t.wells[0].values).toEqual([10, 0, 8]);
    expect(t.notes.join(' ')).toContain('1 missing value is read as 0 (shut in), as chosen: A data row 2 (2020-02).');
  });

  it('refuses text that is not a number, and a row with no well', () => {
    expect(() => forecastTableFromUpload(parseDelimitedText('w,q\nA,1\nA,abc\n'), { label: 'x', wellColumn: 0, periodColumn: null, valueColumn: 1 }))
      .toThrow('1 value in q is not a number: A data row 2 ("abc").');
    expect(() => forecastTableFromUpload(parseDelimitedText('w,q\nA,1\n,2\n'), { label: 'x', wellColumn: 0, periodColumn: null, valueColumn: 1 }))
      .toThrow('1 row has no well name in w: data row 2.');
  });
});

describe('the spine reaches the engine as calendar-month totals or stored rows', () => {
  const field = { id: 'f1', name: 'Ekene' };
  const wells = [{ id: 'w1', name: 'P-1' }];
  const rows = [
    { well_id: 'w1', prod_date: '2024-01-01', oil_stb: 100 },
    { well_id: 'w1', prod_date: '2024-01-02', oil_stb: 90 },
    { well_id: 'w1', prod_date: '2024-02-10', oil_stb: 80 },
    { well_id: 'w1', prod_date: '2024-04-01', oil_stb: 0 },
    { well_id: 'w2', prod_date: '2024-01-01', oil_stb: 5 },
  ];

  it('sums each month, and refuses a month with no stored row by default', () => {
    expect(() => forecastTableFromSpine({ field, wells, rows })).toThrow('1 month has no value: P-1 2024-03.');
    const t = forecastTableFromSpine({ field, wells, rows, missing: 'zero' });
    expect(t.wells[0].labels).toEqual(['2024-01', '2024-02', '2024-03', '2024-04']);
    expect(t.wells[0].values).toEqual([190, 80, 0, 0]);
    expect(t.unit).toBe('stb per calendar month');
  });

  it('takes each stored row as one step when asked', () => {
    const t = forecastTableFromSpine({ field, wells, rows, step: 'row' });
    expect(t.wells[0].values).toEqual([100, 90, 80, 0]);
    expect(t.wells[0].labels).toEqual(['2024-01-01', '2024-01-02', '2024-02-10', '2024-04-01']);
  });
});

describe('the spec reaches the engine as its arguments', () => {
  it('reads a blank as undefined, and passes text that is not a number on as NaN for the engine to refuse', () => {
    expect(parseNum('')).toBeUndefined();
    expect(parseNum(' 0.5 ')).toBe(0.5);
    expect(Number.isNaN(parseNum('abc'))).toBe(true);
    const p = parseSpec({ ...defaultSpec(), params: { ...defaultSpec().params, ses: { alpha: 'abc' } } });
    const y = EKENE[0].rate;
    const r = runFit({ series: { name: 'x', values: y }, parsed: { ...p, methods: ['ses'] } });
    expect(r.fits.ses).toEqual(FC.fitSmoothing({ y, method: 'ses', alpha: NaN, h: 24 }));
    expect(r.fits.ses.error).toBe('alpha must be a number from 0 to 1 (inclusive)');
  });

  it('fits with blanks estimated, matching the oracle golden damped-ekene1-fit', () => {
    const c = byId('damped-ekene1-fit');
    const spec = { ...defaultSpec(), methods: { ses: false, holt: false, damped: true }, h: String(c.args.h) };
    const r = runFit({ series: { name: 'P01', values: c.args.y }, parsed: parseSpec(spec) });
    expect(r.fits.damped).toEqual(FC.fitSmoothing(c.args));
    const ft = c.fieldTol || {};
    ['sse', 'fitted', 'forecast', 'params'].forEach((k) => close(r.fits.damped[k], c.expected[k], ft[k]?.rel ?? 0, k, ft[k]?.abs ?? c.abs ?? 1e-12));
    expect(r.arps).toEqual(FC.arpsForecast({ y: c.args.y, h: c.args.h, modelType: 'Auto-Select' }));
  });

  it('holds a typed parameter fixed, matching the NIST 6.4.3.1 golden at alpha 0.1', () => {
    const c = byId('nist-6431-ses-alpha-0.1');
    const spec = {
      ...defaultSpec(), methods: { ses: true, holt: false, damped: false }, params: { ...defaultSpec().params, ses: { alpha: '0.1' } }, h: '1',
    };
    const r = runFit({ series: { name: 'NIST', values: c.args.y }, parsed: parseSpec(spec) });
    close(r.fits.ses, c.expected, c.tol, 'ses');
    expect(methodText(r.fits.ses)).toBe('simple exponential smoothing: alpha 0.1 (held)');
  });

  it('runs the bootstrap with the typed seed, paths and horizon, matching an intervals golden', () => {
    const c = G.cases.find((x) => x.fn === 'forecastIntervals' && !x.expected.error && x.args.seed !== undefined && x.args.alpha === undefined && x.args.nonNegative === undefined);
    if (!c) throw new Error('no forecastIntervals golden with a seed and fitted parameters in forecast_cases.json');
    const spec = {
      ...defaultSpec(),
      h: String(c.args.h),
      intervals: {
        method: c.args.method, nSims: String(c.args.nSims ?? 1000), seed: String(c.args.seed), nonNegative: true,
      },
    };
    const r = runIntervals({ series: { name: 'x', values: c.args.y }, parsed: parseSpec(spec) });
    expect(r.result).toEqual(FC.forecastIntervals({ ...c.args, nSims: c.args.nSims ?? 1000, nonNegative: true }));
    close(r.result, c.expected, c.tol, c.id);
    expect(r.result.definition).toBe('P90 means a 90% probability the actual quantity meets or exceeds this value, per SPE PRMS.');
  });

  it('holds the typed parameters of the interval method in the bootstrap too', () => {
    const y = EKENE[2].rate;
    const spec = {
      ...defaultSpec(), h: '6', params: { ...defaultSpec().params, damped: { alpha: '', beta: '', phi: '0.9' } },
    };
    const r = runIntervals({ series: { name: 'P03', values: y }, parsed: parseSpec(spec) });
    expect(r.result).toEqual(FC.forecastIntervals({
      y, method: 'damped', phi: 0.9, h: 6, nSims: 1000, seed: 42, nonNegative: true,
    }));
    expect(r.result.params.phi).toBe(0.9);
  });

  it('backtests with the typed origins, matching the oracle golden cmp-ekene1 and its MASE ranking', () => {
    const c = byId('cmp-ekene1');
    const spec = {
      ...defaultSpec(), backtest: { ...defaultSpec().backtest, firstOrigin: String(c.args.firstOrigin), horizon: String(c.args.horizon), step: String(c.args.step) },
    };
    const r = runCompare({ series: { name: 'P01', values: c.args.y }, parsed: parseSpec(spec) });
    expect(r.defaulted).toBe(false);
    expect(r.result).toEqual(FC.compareWithArps({ ...c.args, m: 1 }));
    expect(r.result.ranking).toEqual(c.expected.ranking);
    expect(r.result.rankBy).toBe('mase');
    c.expected.rows.forEach((row, i) => ['mae', 'rmse', 'smape', 'mase'].forEach((k) => {
      if (typeof row[k] === 'number') close(r.result.rows[i][k], row[k], c.fieldTol?.rows?.rel ?? 1e-6, `${row.method}.${k}`);
      else expect(r.result.rows[i][k]).toBe(row[k]);
    }));
  });

  it('passes refit false and MASE lag m to the engine', () => {
    const c = byId('cmp-ekene2-rmse-refit-false');
    const spec = {
      ...defaultSpec(),
      backtest: {
        firstOrigin: String(c.args.firstOrigin), horizon: String(c.args.horizon), step: String(c.args.step ?? 1), refit: c.args.refit, m: '1', rankBy: c.args.rankBy,
      },
    };
    const r = runCompare({ series: { name: 'P02', values: c.args.y }, parsed: parseSpec(spec) });
    expect(r.result).toEqual(FC.compareWithArps({ ...c.args, m: 1 }));
    expect(r.result.ranking).toEqual(c.expected.ranking);
    const m12 = runCompare({ series: { name: 'P02', values: c.args.y }, parsed: parseSpec({ ...spec, backtest: { ...spec.backtest, m: '12' } }) });
    expect(m12.result).toEqual(FC.compareWithArps({ ...c.args, m: 12 }));
  });

  it('defaults a blank first origin to the length less three horizons, at least 3', () => {
    expect(firstOriginFor(60, { firstOrigin: undefined, horizon: 6 })).toEqual({ firstOrigin: 42, defaulted: true });
    expect(firstOriginFor(10, { firstOrigin: undefined, horizon: 6 })).toEqual({ firstOrigin: 3, defaulted: true });
    expect(firstOriginFor(60, { firstOrigin: 20, horizon: 6 })).toEqual({ firstOrigin: 20, defaulted: false });
    const y = EKENE[1].rate;
    const r = runCompare({ series: { name: 'P02', values: y }, parsed: parseSpec(defaultSpec()) });
    expect(r.result.origins).toEqual([42, 48, 54]);
    expect(r.result).toEqual(FC.compareWithArps({
      y, methods: ['ses', 'holt', 'damped'], firstOrigin: 42, horizon: 6, step: 6, refit: true, arpsModel: 'Auto-Select', rankBy: 'mase', m: 1,
    }));
  });

  it('shows an engine refusal as the engine wrote it', () => {
    const r = runCompare({ series: { name: 'x', values: [1, 2, 3, 4] }, parsed: parseSpec(defaultSpec()) });
    expect(r.result.error).toBe(FC.compareWithArps({
      y: [1, 2, 3, 4], methods: ['ses', 'holt', 'damped'], firstOrigin: 3, horizon: 6, step: 6, refit: true, arpsModel: 'Auto-Select', rankBy: 'mase', m: 1,
    }).error);
  });
});

describe('the backtest with the typed parameters held', () => {
  // bt-damped-fixed: the oracle's backtest of the damped trend with alpha,
  // beta and phi held, first origin 40, horizon 6, step 4 on 60 values.
  const c = byId('bt-damped-fixed');
  const y = c.args.y;
  const spec = {
    ...defaultSpec(),
    params: { ...defaultSpec().params, damped: { alpha: String(c.args.alpha), beta: String(c.args.beta), phi: String(c.args.phi) } },
    backtest: {
      ...defaultSpec().backtest, firstOrigin: String(c.args.firstOrigin), horizon: String(c.args.horizon), step: String(c.args.step), refit: c.args.refit,
    },
  };
  const cmpArgs = {
    y, methods: ['ses', 'holt', 'damped'], firstOrigin: c.args.firstOrigin, horizon: c.args.horizon, step: c.args.step, refit: c.args.refit, arpsModel: 'Auto-Select', rankBy: 'mase', m: 1,
  };

  it('is off by default: typed parameters stay out of the backtest, as before', () => {
    expect(defaultSpec().backtest.holdTyped).toBe(false);
    const r = runCompare({ series: { name: 'x', values: y }, parsed: parseSpec(spec) });
    expect(r.held).toBeNull();
    expect(r.result).toEqual(FC.compareWithArps(cmpArgs));
  });

  it('holds them when asked: the damped row is the engine backtest with them held, matching the oracle golden', () => {
    const on = { ...spec, backtest: { ...spec.backtest, holdTyped: true } };
    const r = runCompare({ series: { name: 'x', values: y }, parsed: parseSpec(on) });
    expect(r.held).toEqual({ damped: { alpha: c.args.alpha, beta: c.args.beta, phi: c.args.phi } });
    const bt = FC.backtest(c.args);
    const row = r.result.rows.find((x) => x.method === 'damped');
    expect(row).toEqual({
      method: 'damped', origins: bt.origins, perOrigin: bt.perOrigin, ...bt.overall,
    });
    // the oracle's figures, independent of the JS
    close(row.mase, c.expected.overall.mase, c.tol, 'mase', c.abs);
    close(row.rmse, c.expected.overall.rmse, c.tol, 'rmse', c.abs);
    expect(row.mape).toBeNull();
    c.expected.perOrigin.forEach((o, i) => {
      expect(row.perOrigin[i].params).toEqual(o.params);
      close(row.perOrigin[i].forecast, o.forecast, c.tol, `forecast at ${o.origin}`, c.abs);
    });
    // every other row is compareWithArps's own
    const plain = FC.compareWithArps(cmpArgs);
    ['ses', 'holt', 'arps'].forEach((m) => expect(r.result.rows.find((x) => x.method === m)).toEqual(plain.rows.find((x) => x.method === m)));
    // the estimated damped row differs, so the toggle changes the answer
    expect(plain.rows.find((x) => x.method === 'damped').mase).not.toBe(row.mase);
    expect(r.result.ranking).toEqual(rankRows(r.result.rows, 'mase').ranking);
    expect(r.result.best).toBe(r.result.ranking[0]);
    expect(r.result.basis.held).toBe(`typed parameters held at every origin by backtest(): damped alpha ${c.args.alpha}, beta ${c.args.beta}, phi ${c.args.phi}; the other parameters re-estimated at every origin; rows ranked again by the rule above`);
  });

  it('holds a partial set with refit off, passing both on to backtest()', () => {
    const on = {
      ...spec,
      params: { ...defaultSpec().params, holt: { alpha: '', beta: '0.1' } },
      backtest: { ...spec.backtest, refit: false, m: '12', holdTyped: true },
    };
    const r = runCompare({ series: { name: 'x', values: y }, parsed: parseSpec(on) });
    expect(r.held).toEqual({ holt: { beta: 0.1 } });
    const bt = FC.backtest({
      y, method: 'holt', firstOrigin: c.args.firstOrigin, horizon: c.args.horizon, step: c.args.step, refit: false, m: 12, beta: 0.1,
    });
    expect(r.result.rows.find((x) => x.method === 'holt')).toEqual({
      method: 'holt', origins: bt.origins, perOrigin: bt.perOrigin, ...bt.overall,
    });
    r.result.rows.find((x) => x.method === 'holt').perOrigin.forEach((o) => expect(o.params.beta).toBe(0.1));
    expect(r.result.rows.find((x) => x.method === 'damped')).toEqual(FC.compareWithArps({ ...cmpArgs, refit: false, m: 12 }).rows.find((x) => x.method === 'damped'));
  });

  it('is compareWithArps unchanged when the toggle is on and nothing is typed', () => {
    const on = { ...defaultSpec(), backtest: { ...spec.backtest, holdTyped: true } };
    expect(typedParams(parseSpec(on))).toEqual({});
    const r = runCompare({ series: { name: 'x', values: y }, parsed: parseSpec(on) });
    expect(r.held).toBeNull();
    expect(r.result).toEqual(FC.compareWithArps(cmpArgs));
  });

  it('shows a held parameter the engine refuses as the engine wrote it, in that method row', () => {
    const on = {
      ...spec, params: { ...defaultSpec().params, ses: { alpha: '1.5' } }, backtest: { ...spec.backtest, holdTyped: true },
    };
    const r = runCompare({ series: { name: 'x', values: y }, parsed: parseSpec(on) });
    const row = r.result.rows.find((x) => x.method === 'ses');
    expect(row.error).toBe(FC.backtest({
      y, method: 'ses', firstOrigin: c.args.firstOrigin, horizon: c.args.horizon, step: c.args.step, alpha: 1.5,
    }).error);
    expect(r.result.unranked).toContain('ses');
    expect(r.result.ranking).not.toContain('ses');
  });

  it('ranks by the rule compareWithArps states: rankRows gives back the engine ranking on every comparison golden', () => {
    const cases = G.cases.filter((x) => x.fn === 'compareWithArps' && !x.expected.error);
    expect(cases.length).toBeGreaterThanOrEqual(7);
    cases.forEach((x) => {
      const e = FC.compareWithArps(x.args);
      expect(rankRows(e.rows, e.rankBy)).toEqual({ ranking: e.ranking, best: e.best, unranked: e.unranked });
      expect(e.ranking).toEqual(x.expected.ranking);
    });
  });
});

describe('the field-wide comparison', () => {
  it('is compareWithArps on every well, with progress per well and the counts read off the engine rankings', () => {
    const t = ekeneTable();
    const progress = [];
    const parsed = parseSpec(defaultSpec());
    const r = runField({ table: t, parsed, onProgress: (p) => progress.push(p) });
    expect(progress.map((p) => p.done)).toEqual([1, 2, 3]);
    expect(progress.every((p) => p.total === 3 && p.phase === 'wells')).toBe(true);
    r.wells.forEach((w, k) => {
      expect(w.result).toEqual(runCompare({ series: t.wells[k], parsed }).result);
    });
    const firsts = r.summary.reduce((s, x) => s + x.rankedFirst, 0);
    expect(firsts).toBe(r.wells.filter((w) => !w.result.error && w.result.best).length);
    const ses = r.summary.find((x) => x.method === 'ses');
    const vals = r.wells.map((w) => w.result.rows.find((x) => x.method === 'ses').mase);
    expect(ses.meanMetric).toBe(vals.reduce((a, b) => a + b, 0) / vals.length);
    expect(r.summary.map((x) => x.method)).toEqual(['ses', 'holt', 'damped', 'arps']);
  });

  it('counts a null metric as undefined on that well and a refused well as neither', () => {
    const wells = [
      { result: { best: 'ses', rows: [{ method: 'ses', mase: 1 }, { method: 'arps', mase: null }] } },
      { result: { error: 'y has 2 values' } },
    ];
    expect(summariseField(wells, ['ses'], 'mase')).toEqual([
      { method: 'ses', rankedFirst: 1, meanMetric: 1, wellsWithMetric: 1, wellsWithout: 0 },
      { method: 'arps', rankedFirst: 0, meanMetric: null, wellsWithMetric: 0, wellsWithout: 1 },
    ]);
  });
});

describe('warnings and the engine pin', () => {
  it('collects engine warnings from the fit and intervals results', () => {
    const results = {
      fit: { result: { fits: { damped: { warnings: ['the compass search stopped'] }, ses: {} } } },
      intervals: { result: { method: 'holt', result: { warnings: ['w2'] } } },
    };
    expect(collectWarnings(results)).toEqual([{ where: 'fit damped', text: 'the compass search stopped' }, { where: 'intervals holt', text: 'w2' }]);
  });

  it('names the commit VENDOR.json pins', () => {
    const vendor = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../packages/engines/VENDOR.json'), 'utf8'));
    expect(ENGINE_COMMIT).toBe(vendor.canonical.commit);
  });
});
