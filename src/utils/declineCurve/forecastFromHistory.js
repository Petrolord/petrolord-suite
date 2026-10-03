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
import { terminalDeclinePerDay, normaliseTerminalDecline } from './declineInput';

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

/** The uptime fraction a forecast config states (DCA U2-011): 1 when no downtime is set. */
export function uptimeOf(config) {
  const d = Number(config?.downtimePct);
  return Number.isFinite(d) && d > 0 && d < 100 ? 1 - d / 100 : 1;
}

/**
 * Every history row with its cumulative from the first row (the same
 * trapezoids as producedToDate), for the rate against cumulative fit and plot
 * (DCA U2-002). Rows without a date or a rate are skipped; a row at or below
 * zero keeps its place in the cumulative.
 * @returns {Array<{date: string, t: number, rate: number, cum: number}>}
 */
export function cumulativePoints(data, stream) {
  const pts = (data || [])
    .map((p) => ({ date: p.date, t: new Date(p.date).getTime(), rate: Number(getStreamRate(p, stream)) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.rate))
    .sort((a, b) => a.t - b.t);
  let cum = 0;
  return pts.map((p, i) => {
    if (i > 0) cum += ((pts[i - 1].rate + p.rate) / 2) * ((p.t - pts[i - 1].t) / DAY);
    return { ...p, cum };
  });
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
  // DCA U2-001: a terminal decline (modified hyperbolic) when the analyst set
  // one; there is no default. The engine switches to an exponential at Dmin
  // where the hyperbolic decline falls to it (b > 0 only).
  const Dmin = terminalDeclinePerDay(config);
  const params = Dmin ? { ...fit, Dmin } : fit;
  const full = generateForecast(params, { ...config, forecastDurationDays: histDays + horizon }, t0);
  const raw = full.rates || [];
  // DCA-U1-007: the facility limit caps the forecast rate (the Monte Carlo
  // engine applies the same cap); the deterministic forecast used to show
  // the field and ignore it. 0 or blank is no cap.
  const cap = Number(config.facilityLimit) > 0 ? Number(config.facilityLimit) : null;
  // DCA U2-011: a downtime factor, the share of calendar time the well is
  // expected to be shut in after the cut-off. The fitted curve is the rate
  // while producing on the history's calendar-day basis; each forecast day
  // delivers that rate (capped at the facility limit) times the uptime. The
  // economic limit is tested on the curve, the rate while producing. Blank or
  // 0 is no downtime: the forecast is what it always was.
  const uptime = uptimeOf(config);
  let cum = 0;
  let cappedDays = 0;
  const rates = raw.map((r, i) => {
    let rate = r.rate;
    if (cap !== null && i >= histDays && rate > cap) { rate = cap; cappedDays += 1; }
    if (uptime !== 1 && i >= histDays) rate *= uptime;
    cum += rate;
    return cap === null && uptime === 1 ? r : { ...r, rate, cumulative: cum };
  });
  const totalCum = cap === null && uptime === 1 ? (full.eur || 0) : cum;
  const cumAtHist = histDays > 0 && rates[histDays - 1] ? rates[histDays - 1].cumulative : 0;
  const future = rates.slice(histDays).map((r) => ({ ...r, cumulative: r.cumulative - cumAtHist }));
  const remaining = Math.max(0, totalCum - cumAtHist);
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
    facilityLimit: cap,
    facilityLimitedDays: cappedDays,
    ...(uptime !== 1 ? { downtimePct: (1 - uptime) * 100 } : {}),
    // the switch to the terminal decline, dated; only present when one applies
    ...(full.terminalDecline ? { terminalDecline: terminalOf(full.terminalDecline, t0ms, lastMs, Dmin, config) } : {}),
  };
}

/** The terminal-decline switch of a forecast in the words the screens and the report use. */
function terminalOf(sw, t0ms, lastMs, Dmin, config) {
  const switchMs = t0ms + sw.tSwitch * DAY;
  return {
    entered: normaliseTerminalDecline(config.terminalDecline),
    dminPerDay: Dmin,
    tSwitchDays: sw.tSwitch,
    switchDate: new Date(switchMs).toISOString().slice(0, 10),
    qSwitch: sw.qSwitch,
    npSwitchFromFitStart: sw.npSwitch,
    fromStart: !!sw.fromStart,
    beforeCutoff: switchMs <= lastMs,
  };
}

/**
 * What a saved scenario keeps of a forecast (H3). The workbook and the
 * comparison table need the three volumes apart: produced to date, the
 * remaining volume after the last history date, and EUR, their sum. `eur`
 * is kept because older panels and saved scenarios read it; it is the
 * remaining volume.
 */
export function scenarioForecastSnapshot(fc) {
  return {
    eur: fc.eur,
    remaining: fc.remaining ?? fc.eur,
    produced: fc.produced,
    eurTotal: fc.eurTotal,
    limitReached: fc.limitReached,
    limitBeforeToday: fc.limitBeforeToday,
    historyEndDate: fc.historyEndDate,
    horizonDays: fc.horizonDays,
    timeToLimit: fc.timeToLimit,
    rates: fc.rates,
    probabilistic: fc.probabilistic,
    ...(fc.terminalDecline ? { terminalDecline: fc.terminalDecline } : {}),
    ...(fc.downtimePct ? { downtimePct: fc.downtimePct } : {}),
  };
}
