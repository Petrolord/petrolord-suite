/**
 * DCA U2-002: the rate against cumulative fit through the app's own path
 * (fitRateCumWell on the cumulative the forecast counts as produced), its
 * own window, its stale rule, its EUR beside the rate-time EUR, and the
 * report's cross-check table and figure.
 *
 * Truth: a daily b = 1.3 history (qi 800 bbl/d, Di 0.004 per day) and the
 * engine's closed-form EUR. The engine fit itself is gated against CED
 * P03-004 in packages/engines/__tests__/dca.rateCumulative.test.js.
 * Negative control: a cumulative that does not start at the first row (the
 * window counted from zero) shifts the EUR by the volume left out.
 */
import { fitWell, forecastWell, withStreamResults } from '@/utils/declineCurve/dcaAnalysis';
import { analysisOf } from '@/utils/declineCurve/dcaModel';
import { fitRateCumWell, rateCumStatus, rateCumEur, crossCheckPct, prepareRateCumData } from '@/utils/declineCurve/rateCumFit';
import { collectDcaReportArgs, buildDcaPdf, engineInputsOf } from '@/utils/declineCurve/dcaReport';
import { missingInputRows } from '@/lib/reportKit';
import { readPdf, chartLogo, flat, expectFigureDrawn, pointCounts } from '@/lib/reportKit/testKit';
import { calculateArpsHyperbolic, calculateEUR, fitArpsRateCumulative } from '@/utils/declineCurve/dcaEngine';

const AT = new Date('2026-10-03T12:00:00Z');
const DAY = 86400000;
const TRUTH = { qi: 800, Di: 0.004, b: 1.3 };

const dailyWell = () => {
  const t0 = Date.UTC(2021, 0, 1);
  const data = Array.from({ length: 1096 }, (_, i) => {
    const q = calculateArpsHyperbolic(TRUTH.qi, TRUTH.Di, TRUTH.b, i);
    return { date: new Date(t0 + i * DAY).toISOString().slice(0, 10), oilRate: q, rate: q };
  });
  return {
    id: 'rc', name: 'RC-1', data,
    analysis: {
      fitWindow: { startDate: data[0].date, endDate: data[data.length - 1].date },
      streams: { oil: { modelType: 'Hyperbolic', constraints: { minB: 0, maxB: 2 }, forecastConfig: { economicLimit: 10, stopAtLimit: true, durationDays: 36525 } } },
    },
  };
};
const setStream = (w, patch) => {
  const a = analysisOf(w);
  return { ...w, analysis: { ...a, streams: { ...a.streams, oil: { ...a.streams.oil, ...patch } } } };
};
const withRateCum = (w) => {
  const res = fitRateCumWell(w, 'oil', { now: AT });
  if (!res.ok) throw new Error(res.error);
  return setStream(w, { rateCum: { ...(analysisOf(w).streams.oil.rateCum || {}), results: res.results } });
};
const forecastAll = (w) => {
  const f = fitWell(w, 'oil', { now: AT });
  if (!f.ok) throw new Error(f.error);
  let out = withStreamResults(w, 'oil', { fitResults: f.fit });
  out = withStreamResults(out, 'oil', { forecastResults: forecastWell(out, 'oil', { now: AT }) });
  return out;
};

describe('the rate against cumulative fit', () => {
  it('recovers the planted decline and its EUR from the cumulative the app counts', () => {
    const w = withRateCum(dailyWell());
    const r = analysisOf(w).streams.oil.rateCum.results;
    expect(r.modelType).toBe('Hyperbolic');
    expect(Math.abs(r.b - TRUTH.b)).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(r.n).toBe(1096);
    const closed = calculateEUR(TRUTH.qi, TRUTH.Di, TRUTH.b, 10, 'hyperbolic');
    const eur = rateCumEur(r, analysisOf(w).streams.oil.forecastConfig);
    expect(Math.abs(eur - closed) / closed).toBeLessThan(0.005);
    expect(rateCumStatus(w, 'oil').state).toBe('current');
  });

  it('beside the rate-time EUR it agrees on a clean well (the cross-check)', () => {
    // with a terminal decline both reach the limit inside the horizon (b 1.3
    // alone would take about 157 years to fall to 10 bbl/d)
    const dw = dailyWell();
    dw.analysis.streams.oil.forecastConfig.terminalDecline = { value: 10, unit: '%/yr', basis: 'effective-tangent' };
    const w = withRateCum(forecastAll(dw));
    expect(analysisOf(w).streams.oil.forecastResults.limitReached).toBe(true);
    const s = analysisOf(w).streams.oil;
    const diff = crossCheckPct(rateCumEur(s.rateCum.results, s.forecastConfig), s.forecastResults.eurTotal);
    expect(Math.abs(diff)).toBeLessThan(1);
  });

  it('its own window: a cumulative range fits only the points inside it; changing it withdraws the fit', () => {
    const w0 = dailyWell();
    const all = prepareRateCumData(w0.data, 'oil', {}, []).all;
    const cumStart = all[365].cum;
    const w = withRateCum(setStream(w0, { rateCum: { window: { cumStart, cumEnd: null } } }));
    const r = analysisOf(w).streams.oil.rateCum.results;
    expect(r.n).toBe(1096 - 365);
    expect(r.summary.outsideWindow).toBe(365);
    const moved = setStream(w, { rateCum: { ...analysisOf(w).streams.oil.rateCum, window: { cumStart: all[400].cum, cumEnd: null } } });
    expect(rateCumStatus(moved, 'oil')).toEqual({ state: 'stale', reasons: ['its cumulative window changed'] });
  });

  it('the analyst exclusions of the rate-time fit apply; the cumulative still counts their volume', () => {
    const w0 = setStream(dailyWell(), { excluded: [{ date: '2021-03-01', reason: 'choke change' }] });
    const p = prepareRateCumData(w0.data, 'oil', {}, analysisOf(w0).streams.oil.excluded);
    expect(p.summary.excludedByUser).toBe(1);
    expect(p.points.length).toBe(1095);
    expect(p.points[p.points.length - 1].cum).toBeCloseTo(p.all[p.all.length - 1].cum, 9);
  });

  it('negative control: a cumulative counted from the window start misses EUR by the volume before it', () => {
    const w0 = dailyWell();
    const all = prepareRateCumData(w0.data, 'oil', {}, []).all;
    const late = all.slice(365);
    const right = fitArpsRateCumulative(late.map((x) => ({ cum: x.cum, rate: x.rate })), 'Hyperbolic', null, { minB: 0, maxB: 2 });
    const wrong = fitArpsRateCumulative(late.map((x) => ({ cum: x.cum - late[0].cum, rate: x.rate })), 'Hyperbolic', null, { minB: 0, maxB: 2 });
    const eR = calculateEUR(right.qi, right.Di, right.b, 10, 'hyperbolic');
    const eW = calculateEUR(wrong.qi, wrong.Di, wrong.b, 10, 'hyperbolic');
    expect(Math.abs((eR - eW) - late[0].cum) / late[0].cum).toBeLessThan(0.01);
  });
});

describe('the report carries the cross-check', () => {
  const logo = chartLogo();
  it('a table beside the regression, the fit on figure 2, the window row guarded (RL1, RL6)', () => {
    const w = withRateCum(forecastAll(dailyWell()));
    const m = collectDcaReportArgs({ project: { name: 'Gate' }, well: w, stream: 'oil', build: 'test', generatedAt: AT });
    expect(m.ok).toBe(true);
    expect(missingInputRows(engineInputsOf(w, 'oil'), m.inputs)).toEqual([]);
    expect(missingInputRows(engineInputsOf(w, 'oil'), m.inputs.filter((r) => r.key !== 'rcWindow')))
      .toEqual(['rateCum.window.cumStart', 'rateCum.window.cumEnd']);
    expect(m.rateCum.rows.map((r) => r[0])).toEqual(expect.arrayContaining(['EUR, rate against cumulative', 'EUR, rate against time (the forecast)', 'Difference']));
    const built = buildDcaPdf(m, { logo });
    const pdf = readPdf(built.doc, { ink: true });
    const t = flat(pdf.text);
    expect(t).toMatch(/Rate against cumulative cross-check Item Value Model Arps hyperbolic/);
    expect(t).toMatch(/EUR, rate against cumulative [\d,]+ bbl/);
    expect(t).toMatch(/The rate against cumulative fit \(dotted, its window shaded\) is the cross-check/);
    const fig2 = built.figuresBuilt.find((f) => f.id === 'rate-cum');
    expect(pointCounts(built.figuresBuilt)['rate-cum'][0]['Rate-cumulative fit']).toBeGreaterThan(10);
    expectFigureDrawn(pdf, fig2, { logo: true });
    pdf.close();
  });

  it('not run, and out of date, each say so instead of a table', () => {
    const w = forecastAll(dailyWell());
    expect(collectDcaReportArgs({ well: w, stream: 'oil', generatedAt: AT }).rateCumStatement).toMatch(/^Not run\./);
    const fitted = withRateCum(w);
    const stale = setStream(fitted, { rateCum: { ...analysisOf(fitted).streams.oil.rateCum, window: { cumStart: 1000, cumEnd: null } } });
    const m = collectDcaReportArgs({ well: stale, stream: 'oil', generatedAt: AT });
    expect(m.rateCum).toBeNull();
    expect(m.rateCumStatement).toMatch(/out of date \(its cumulative window changed\)/);
  });
});
