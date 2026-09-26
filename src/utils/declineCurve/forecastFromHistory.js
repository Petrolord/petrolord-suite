// Forecast from the end of history (DCA senior test T1, Wave 2 #20).
//
// The engine's generateForecast integrates the fitted curve from the fit's
// t0, the first fitted date, for the whole duration. The studio labelled
// that sum "remaining reserves", so a well with two years of history
// reported the volume it had already produced as still to come, and the
// duration ran from first production instead of from today. This wrapper
// runs the same engine curve from t0 through history plus the horizon and
// splits it at the last history date.

import { generateForecast } from './dcaEngine';
import { getStreamRate } from './csvParser';

const DAY = 86400000;

/** Produced volume to date from the rate history: rate x days, trapezoids between samples. */
export function producedToDate(data, stream) {
  const pts = (data || [])
    .map((p) => ({ t: new Date(p.date).getTime(), q: Number(getStreamRate(p, stream)) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.q))
    .sort((a, b) => a.t - b.t);
  let cum = 0;
  for (let i = 1; i < pts.length; i++) cum += ((pts[i - 1].q + pts[i].q) / 2) * ((pts[i].t - pts[i - 1].t) / DAY);
  return cum;
}

/**
 * @param {object} fit fitted {qi, Di, b, modelType, t0}
 * @param {object} config forecast config (economicLimit, stopAtLimit, forecastDurationDays = horizon after history)
 * @param {Array} data production history rows
 * @param {string} stream 'oil' | 'gas' | 'water'
 */
export function forecastFromHistory(fit, config, data, stream) {
  const t0 = fit.t0 || new Date().toISOString();
  const t0ms = new Date(t0).getTime();
  const dates = (data || []).map((p) => new Date(p.date).getTime()).filter(Number.isFinite);
  const lastMs = dates.length ? Math.max(...dates) : t0ms;
  const histDays = Math.max(0, Math.round((lastMs - t0ms) / DAY));
  const horizon = config.forecastDurationDays || config.durationDays || 3650;
  const full = generateForecast(fit, { ...config, forecastDurationDays: histDays + horizon }, t0);
  const rates = full.rates || [];
  const cumAtHist = histDays > 0 && rates[histDays - 1] ? rates[histDays - 1].cumulative : 0;
  const future = rates.slice(histDays).map((r) => ({ ...r, cumulative: r.cumulative - cumAtHist }));
  const remaining = Math.max(0, (full.eur || 0) - cumAtHist);
  const produced = producedToDate(data, stream);
  const endDay = full.timeToLimit ?? histDays + horizon;
  const limitReached = Boolean(config.stopAtLimit && config.economicLimit && endDay < histDays + horizon);
  const limitBeforeToday = limitReached && endDay <= histDays;
  return {
    ...full,
    rates: future,
    chartData: future,
    remaining,
    produced,
    eurTotal: produced + remaining,
    eur: remaining, // the key the panels and scenarios read, now the volume still to come
    timeToLimit: Math.max(0, endDay - histDays), // days after the last history date
    limitReached,
    limitBeforeToday,
    historyEndDate: new Date(lastMs).toISOString(),
    horizonDays: horizon,
  };
}
