// Batch fit across wells (DCA U2-005): one window rule, every well of the
// project fitted and forecast through the same single-well path (fitWell,
// forecastWell), and a review grid. A well is fitted on its own data, its own
// model choice, b limits, exclusions and forecast settings; only the fit
// window is set by the rule. Nothing is averaged or shared between wells.
//
// Rules: 'whole' (the first to the last date of the well's data) and
// 'last' (the last N months of the well's data, or all of it when shorter).
// A well that cannot be fitted keeps what it had and the grid says why.
//
// Pure.
import { fitWell, forecastWell, withStreamResults } from './dcaAnalysis';
import { analysisOf } from './dcaModel';
import { getStreamRate } from './csvParser';
import { nominalAnnualPct } from './declineDisplay';

export const BATCH_RULES = Object.freeze({ whole: 'The whole history of each well', last: 'The last N months of each well' });

const day = (t) => new Date(t).toISOString().slice(0, 10);

/** The fit window a rule gives one well, or null when it has no dated rate for the stream. */
export function ruleWindow(well, stream, { rule = 'whole', months = 24 } = {}) {
  const ts = (well?.data || [])
    .filter((p) => { const v = getStreamRate(p, stream); return v != null && v !== '' && Number.isFinite(Number(v)); })
    .map((p) => new Date(p.date).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!ts.length) return null;
  const first = ts[0];
  const last = ts[ts.length - 1];
  if (rule !== 'last') return { startDate: day(first), endDate: day(last) };
  const d = new Date(last);
  const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - Math.max(1, Math.round(months)), d.getUTCDate());
  return { startDate: day(Math.max(first, from)), endDate: day(last) };
}

/**
 * Fit and forecast every well on one window rule.
 * @param {Object<string, object>} wells the project's wells by id
 * @param {string} stream
 * @param {{rule?: string, months?: number, now?: Date}} opts
 * @returns {{wells: Object<string, object>, rows: Array<object>}} the wells with their new analysis, and the grid
 */
export function batchFitWells(wells, stream, { rule = 'whole', months = 24, now = new Date() } = {}) {
  const out = { ...(wells || {}) };
  const rows = [];
  for (const [id, well] of Object.entries(wells || {})) {
    const window = ruleWindow(well, stream, { rule, months });
    if (!window) {
      rows.push({ wellId: id, wellName: well.name, ok: false, reason: `No ${stream} rates.` });
      continue;
    }
    const a = analysisOf(well);
    const windowed = { ...well, analysis: { ...a, fitWindow: window } };
    const f = fitWell(windowed, stream, { now });
    if (!f.ok) {
      rows.push({ wellId: id, wellName: well.name, ok: false, reason: f.error, window });
      continue;
    }
    let w = withStreamResults(windowed, stream, { fitResults: f.fit });
    const fc = forecastWell(w, stream, { now });
    w = withStreamResults(w, stream, { forecastResults: fc });
    out[id] = w;
    rows.push({
      wellId: id,
      wellName: well.name,
      ok: true,
      window,
      model: f.fit.modelType,
      qi: f.fit.qi,
      diPctYr: nominalAnnualPct(f.fit.Di),
      b: f.fit.b,
      R2: f.fit.R2,
      points: f.summary.used,
      remaining: fc?.remaining ?? null,
      eur: fc?.eurTotal ?? null,
      limitReached: !!fc?.limitReached,
      flags: [
        f.fit.R2 < 0.8 ? 'R2 below 0.8' : null,
        f.fit.b > 1 && !fc?.terminalDecline ? 'b above 1 with no terminal decline' : null,
        f.summary.used < 12 ? `only ${f.summary.used} points` : null,
        fc && !fc.limitReached ? 'limit not reached in the horizon' : null,
      ].filter(Boolean),
    });
  }
  return { wells: out, rows };
}
