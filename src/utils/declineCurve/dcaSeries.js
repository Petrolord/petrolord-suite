// Decline Curve Analysis: the plotted series, built once (DCA-U1, RL6 and
// RL12). The Model Fit chart on screen and the figures of the PDF report
// draw from these arrays, so the report shows the points the screen shows.
//
// Pure. Values come out in the display units of `u` (dcaUnits.js); time is
// milliseconds since 1970 (a calendar axis), cumulative volumes start at
// first production.
import { calculateArpsHyperbolic, calculateModifiedHyperbolicRate } from './dcaEngine';
import { terminalDeclinePerDay } from './declineInput';
import { getStreamRate } from './csvParser';
import { prepareFitData } from './dcaModel';
import { DCA_OILFIELD_UNITS } from './dcaUnits';

const DAY = 86400000;
const ms = (d) => new Date(d).getTime();
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** The most history points a plot draws; a longer history is drawn every k-th point and says so (PL10). */
export const MAX_PLOTTED_POINTS = 800;
const strideOf = (n) => Math.max(1, Math.ceil(n / MAX_PLOTTED_POINTS));
const every = (arr, k) => (k <= 1 ? arr : arr.filter((_, i) => i % k === 0 || i === arr.length - 1));

/** Every n-th point of a daily forecast, the last one always kept. */
export function thin(points, every = 30) {
  if (!points?.length) return [];
  const out = [];
  for (let i = 0; i < points.length; i += every) out.push(points[i]);
  if ((points.length - 1) % every !== 0) out.push(points[points.length - 1]);
  return out;
}

/**
 * @param {{data: Array, stream: string, fit?: ?object, forecast?: ?object, fitWindow?: object,
 *   excluded?: Array, forecastConfig?: object, u?: object}} a
 * @returns {{
 *   history: Array<{t: number, q: number, status: string, reason: string}>,
 *   used: Array<[number, number]>, left: Array<[number, number]>,
 *   fitted: Array<[number, number]>, forecast: Array<[number, number]>,
 *   p10: Array<[number, number]>, p90: Array<[number, number]>,
 *   window: ?{t0: number, t1: number}, forecastStart: ?number, limit: ?number,
 *   cumHistory: Array<[number, number]>, cumForecast: Array<[number, number]>,
 *   rateCumHistory: Array<[number, number]>, rateCumFitted: Array<[number, number]>, rateCumForecast: Array<[number, number]>,
 *   eur: ?number, produced: ?number, units: {rate: string, volume: string}, summary: object}}
 */
export function buildDcaSeries({ data, stream, fit = null, forecast = null, fitWindow = null, excluded = [], forecastConfig = {}, u = DCA_OILFIELD_UNITS }) {
  const rate = (v) => u.rateTo(stream, v);
  const prepared = prepareFitData(data, stream, fitWindow, excluded);
  const history = prepared.rows
    .filter((r) => r.rate != null && Number.isFinite(ms(r.date)))
    .map((r) => ({ t: ms(r.date), q: rate(r.rate), status: r.status, reason: r.reason }))
    .sort((a, b) => a.t - b.t);
  // a long (daily) history is drawn every k-th point; the fit used them all
  const stride = strideOf(history.length);
  const used = every(history.filter((h) => h.status === 'used'), stride).map((h) => [h.t, h.q]);
  const left = every(history.filter((h) => h.status !== 'used'), stride).map((h) => [h.t, h.q]);

  // the fitted curve over the fit window, at the dates of the data in it
  let fitted = [];
  let window = null;
  if (fit && finite(fit.qi) && fit.t0) {
    const t0 = ms(fit.t0);
    const wEnd = fitWindow?.endDate ? ms(fitWindow.endDate) : (history.length ? history[history.length - 1].t : t0);
    const wStart = fitWindow?.startDate ? ms(fitWindow.startDate) : t0;
    window = { t0: Math.min(wStart, t0), t1: wEnd };
    const dates = every(history.filter((h) => h.t >= t0 && h.t <= wEnd), stride).map((h) => h.t);
    fitted = dates.map((t) => [t, rate(calculateArpsHyperbolic(fit.qi, fit.Di, fit.b, (t - t0) / DAY))]);
  }

  // the forecast after the last data, thinned to about monthly points
  const fRates = forecast?.rates || [];
  const fThin = thin(fRates);
  const forecastPts = fThin.map((r) => [ms(r.date), rate(r.rate)]);
  const forecastStart = forecast?.historyEndDate ? ms(forecast.historyEndDate) : null;

  // the P10 to P90 band of a probabilistic run: 1.28 sigma parameter
  // offsets of the fit, sigma being half the 95 percent half width, the
  // convention of the engine's own generateProbabilisticCurves (DCA-U1-012:
  // the screen used 1.28 times the whole half width, about 2.5 sigma)
  let p10 = [];
  let p90 = [];
  const ci = fit?.confidenceIntervals;
  if (forecast?.probabilistic && ci?.hasIntervals && fit) {
    const z = 1.2816;
    const off = (v, half, dir) => v + dir * z * (Math.abs(half || 0) / 2);
    const hi = { qi: Math.max(off(fit.qi, ci.qi, 1), 0), Di: Math.max(off(fit.Di, ci.Di, -1), 0), b: Math.max(Math.min(off(fit.b, ci.b, 1), 2), 0) };
    const lo = { qi: Math.max(off(fit.qi, ci.qi, -1), 0), Di: Math.max(off(fit.Di, ci.Di, 1), 0), b: Math.max(Math.min(off(fit.b, ci.b, -1), 2), 0) };
    const t0 = ms(fit.t0);
    // DCA U2-001: with a terminal decline the band follows the modified curve
    // (Dmin is the analyst's, not sampled), as the Monte Carlo does
    const Dmin = terminalDeclinePerDay(forecastConfig);
    const q = (p, tt) => (Dmin ? calculateModifiedHyperbolicRate(p.qi, p.Di, p.b, Dmin, tt) : calculateArpsHyperbolic(p.qi, p.Di, p.b, tt));
    for (const r of fThin) {
      const tt = (ms(r.date) - t0) / DAY;
      const a = q(hi, tt);
      const b = q(lo, tt);
      p10.push([ms(r.date), rate(Math.max(a, b))]);
      p90.push([ms(r.date), rate(Math.min(a, b))]);
    }
  }

  // cumulative from first production: the rate history by trapezoids, then
  // the forecast's own cumulative on top of what was produced
  const vol = (v) => u.volumeTo(stream, v);
  const raw = (data || [])
    .map((p) => ({ t: ms(p.date), q: Number(getStreamRate(p, stream)) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.q))
    .sort((a, b) => a.t - b.t);
  let cum = 0;
  const cumHistoryEngine = raw.map((p, i) => {
    if (i > 0) cum += ((raw[i - 1].q + p.q) / 2) * ((p.t - raw[i - 1].t) / DAY);
    return [p.t, cum];
  });
  const produced = forecast && finite(forecast.produced) ? forecast.produced : (cumHistoryEngine.length ? cumHistoryEngine[cumHistoryEngine.length - 1][1] : null);
  const cumHistory = every(cumHistoryEngine, stride).map(([t, c]) => [t, vol(c)]);
  const cumForecast = fThin.map((r) => [ms(r.date), vol((produced || 0) + r.cumulative)]);

  // rate against cumulative: the data, the fitted rate at the data dates, the forecast
  const cumAt = new Map(cumHistoryEngine.map(([t, c]) => [t, c]));
  const rateCumHistory = every(raw, stride).map((p) => [vol(cumAt.get(p.t)), rate(p.q)]);
  const rateCumFitted = fitted.map(([t, q]) => [vol(cumAt.get(t) ?? NaN), q]).filter((p) => finite(p[0]));
  const rateCumForecast = fThin.map((r) => [vol((produced || 0) + r.cumulative), rate(r.rate)]);

  const limitEngine = Number(forecastConfig?.economicLimit);
  return {
    history,
    used,
    left,
    fitted,
    forecast: forecastPts,
    p10,
    p90,
    window,
    forecastStart,
    limit: limitEngine > 0 && forecastConfig?.stopAtLimit !== false ? rate(limitEngine) : null,
    cumHistory,
    cumForecast,
    rateCumHistory,
    rateCumFitted,
    rateCumForecast,
    produced: produced == null ? null : vol(produced),
    eur: forecast && finite(forecast.eurTotal) ? vol(forecast.eurTotal) : null,
    units: { rate: u.rateLabel(stream), volume: u.volumeLabel(stream) },
    summary: prepared.summary,
    // how the history was drawn: every k-th of the rows (1 when all)
    stride,
    historyRows: history.length,
    // DCA U2-001: where the forecast switches to the terminal decline
    switchAt: forecast?.terminalDecline ? { t: ms(forecast.terminalDecline.switchDate), q: rate(forecast.terminalDecline.qSwitch) } : null,
  };
}
