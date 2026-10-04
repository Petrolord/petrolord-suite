// Rate against cumulative fitting (DCA U2-002): the cross-check on the
// rate-time fit.
//
// The Arps relations have a time-free form, rate against cumulative volume
// (engines dca/arps fitArpsRateCumulative, gated against CED P03-004). It is
// the classic second look at a decline: it does not care when the volume was
// produced, so shut-ins, curtailment and uneven sampling do not move it, and
// its EUR is read where the line meets the economic limit.
//
// One stream of one well has its own rate-cumulative fit with its OWN window,
// a cumulative range in the stream's state volume unit (bbl or Mscf), blank
// for all of the history. The cumulative is counted from the first row of the
// history by trapezoids of the rates (the "produced to date" of the forecast),
// so the fitted qi and Di are referenced to that first row. The points the
// analyst excluded from the rate-time fit are left out here too, and rates at
// or below zero cannot be fitted; both still count in the cumulative, since
// the volume was produced (or not) all the same.
//
// The fit records what it was made on, like the rate-time fit (dcaModel), and
// is withdrawn when the data, its window, the model choice, the b limits or
// the exclusions change. EUR is not stored: it is computed from the fitted
// parameters and the current economic limit and terminal decline, so it can
// never disagree with the settings printed beside it.
//
// Pure.
import { fitArpsRateCumulative, calculateModifiedEUR } from './dcaEngine';
import { cumulativePoints } from './forecastFromHistory';
import { analysisOf, dataDigest, fingerprint } from './dcaModel';
import { terminalDeclinePerDay } from './declineInput';

const dayKey = (d) => {
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
};
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

export const EMPTY_RC_WINDOW = Object.freeze({ cumStart: null, cumEnd: null });

/** The rate-cumulative state of a stream (an older project has none). */
export function rateCumOf(streamState) {
  const rc = streamState?.rateCum || {};
  const w = rc.window || {};
  return {
    window: { cumStart: finite(w.cumStart) ? w.cumStart : null, cumEnd: finite(w.cumEnd) ? w.cumEnd : null },
    results: rc.results || null,
  };
}

/** What a rate-cumulative fit is stored with. */
export function rateCumBasisOf({ data, stream, window, modelType, constraints, excluded }) {
  return {
    dataDigest: dataDigest(data, stream),
    window: { cumStart: window?.cumStart ?? null, cumEnd: window?.cumEnd ?? null },
    modelType: modelType || 'Auto',
    constraints: { minB: constraints?.minB ?? null, maxB: constraints?.maxB ?? null },
    excluded: (excluded || []).map((e) => dayKey(e.date)).filter(Boolean).sort(),
  };
}

/** The points the fit is handed and the account of the rest. */
export function prepareRateCumData(data, stream, window, excluded = []) {
  const ex = new Set((excluded || []).map((e) => dayKey(e.date)));
  const all = cumulativePoints(data, stream);
  const summary = { withRate: all.length, nonPositive: 0, excludedByUser: 0, outsideWindow: 0, used: 0 };
  const points = [];
  for (const p of all) {
    if (ex.has(dayKey(p.date))) { summary.excludedByUser += 1; continue; }
    if (!(p.rate > 0)) { summary.nonPositive += 1; continue; }
    if ((finite(window?.cumStart) && p.cum < window.cumStart) || (finite(window?.cumEnd) && p.cum > window.cumEnd)) { summary.outsideWindow += 1; continue; }
    summary.used += 1;
    points.push({ date: p.date, cum: p.cum, rate: p.rate });
  }
  return { points, all, summary };
}

/**
 * Fit one stream of a well in rate against cumulative space.
 * @returns {{ok: true, results: object}|{ok: false, error: string}}
 */
export function fitRateCumWell(well, stream, { now = new Date() } = {}) {
  const a = analysisOf(well);
  const s = a.streams[stream];
  const rc = rateCumOf(s);
  const data = well?.data || [];
  const prepared = prepareRateCumData(data, stream, rc.window, s.excluded);
  if (prepared.points.length < 3) {
    return { ok: false, error: `The rate against cumulative fit needs at least 3 points with a ${stream} rate in its window; it has ${prepared.points.length}.` };
  }
  const fit = fitArpsRateCumulative(prepared.points, s.modelType, null, s.constraints);
  if (!(fit && fit.qi > 0 && fit.modelType && fit.modelType !== 'None')) {
    return { ok: false, error: 'The rate against cumulative fit failed: the points do not describe a decline in cumulative.' };
  }
  return {
    ok: true,
    results: {
      modelType: fit.modelType,
      qi: fit.qi,
      Di: fit.Di,
      b: fit.b,
      R2: fit.R2,
      RMSE: fit.RMSE,
      n: fit.n,
      fittedAt: now.toISOString(),
      firstDate: prepared.all.length ? dayKey(prepared.all[0].date) : null,
      cumRange: prepared.points.length ? [prepared.points[0].cum, prepared.points[prepared.points.length - 1].cum] : null,
      summary: prepared.summary,
      basis: rateCumBasisOf({ data, stream, window: rc.window, modelType: s.modelType, constraints: s.constraints, excluded: s.excluded }),
    },
  };
}

/**
 * Is the rate-cumulative fit still what the inputs say?
 * @returns {{state: 'none'|'current'|'stale', reasons: string[]}}
 */
export function rateCumStatus(well, stream) {
  const a = analysisOf(well);
  const s = a.streams[stream];
  const rc = rateCumOf(s);
  if (!rc.results) return { state: 'none', reasons: [] };
  const b = rc.results.basis || {};
  const now = rateCumBasisOf({ data: well?.data, stream, window: rc.window, modelType: s.modelType, constraints: s.constraints, excluded: s.excluded });
  const reasons = [];
  if (b.dataDigest !== now.dataDigest) reasons.push('the production data changed');
  if (fingerprint(b.window) !== fingerprint(now.window)) reasons.push('its cumulative window changed');
  if (b.modelType !== now.modelType) reasons.push('the model choice changed');
  if (fingerprint(b.constraints) !== fingerprint(now.constraints)) reasons.push('the b limits changed');
  if (fingerprint(b.excluded) !== fingerprint(now.excluded)) reasons.push('points were excluded or restored');
  return { state: reasons.length ? 'stale' : 'current', reasons };
}

/** EUR of the rate-cumulative fit to the current economic limit (and Dmin), or null with no limit. */
export function rateCumEur(results, forecastConfig) {
  if (!results) return null;
  const limit = forecastConfig?.stopAtLimit !== false && forecastConfig?.economicLimit > 0 ? forecastConfig.economicLimit : null;
  if (!limit) return null;
  const Dmin = terminalDeclinePerDay(forecastConfig);
  const eur = calculateModifiedEUR(results.qi, results.Di, results.b, Dmin || undefined, limit);
  return finite(eur) ? eur : null;
}

/** The rate-cumulative EUR against the rate-time EUR, as a signed percent of the latter. */
export function crossCheckPct(rcEur, rtEur) {
  if (!(finite(rcEur) && finite(rtEur) && rtEur > 0)) return null;
  // to one decimal, with no negative zero (a printed "-0.0%" reads as a sign)
  return Math.round((1000 * (rcEur - rtEur)) / rtEur) / 10 || 0;
}
