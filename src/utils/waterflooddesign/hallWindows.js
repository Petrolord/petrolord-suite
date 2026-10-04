// Hall plot windows chosen by the user (WF-U2-003, RL6, RL8). The engine
// fits the first third and the last third of an injector's points
// (computeHallPlots, WF-U1-006); a reviewer picks the windows that bracket
// the event instead. A choice is kept with the project per injector:
//
//   hallWindows[injector] = { baseline?: { from, to }, recent?: { from, to }, reason, setAt }
//
// dates as YYYY-MM-DD, inclusive. Each chosen window is refitted with the
// engine's own least-squares line (olsLine: slope, intercept, 95 percent
// interval, r2), the slopes and their ratio replace the thirds, and the
// injectivity alert of that injector is decided again on the engine's
// thresholds (ratio 1.2 or more: declining; 0.8 or less: improving). A
// window not chosen stays the engine's third. Pure.
import { olsLine } from '@/utils/waterfloodCalculations';

export const HALL_RATIO_HI = 1.2;
export const HALL_RATIO_LO = 0.8;
export const HALL_MIN_WINDOW_POINTS = 3;

const day = (d) => String(d ?? '').slice(0, 10);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The index range [lo, hi) of the points dated from..to inclusive, or null. */
export function indexRangeByDates(dates, from, to) {
  let lo = -1;
  let hi = -1;
  (dates || []).forEach((d, i) => {
    const k = day(d);
    if (k >= from && k <= to) {
      if (lo < 0) lo = i;
      hi = i + 1;
    }
  });
  return lo < 0 ? null : { lo, hi };
}

/**
 * Problems with a choice for one plot, in words; [] when it can be applied.
 * @param {{dates: string[]}} plot
 * @param {{baseline?: {from: string, to: string}, recent?: {from: string, to: string}, reason?: string}} choice
 */
export function hallChoiceProblems(plot, choice) {
  const out = [];
  if (!choice) return ['No windows chosen.'];
  if (!String(choice.reason || '').trim()) out.push('Give the reason for the windows: it is printed with them.');
  if (!choice.baseline && !choice.recent) out.push('Choose a baseline window, a recent window or both.');
  for (const key of ['baseline', 'recent']) {
    const w = choice[key];
    if (!w) continue;
    const name = key === 'baseline' ? 'The baseline window' : 'The recent window';
    if (!ISO.test(w.from || '') || !ISO.test(w.to || '')) { out.push(`${name} needs a start and an end date.`); continue; }
    if (w.from > w.to) { out.push(`${name} ends before it starts.`); continue; }
    const r = indexRangeByDates(plot?.dates, w.from, w.to);
    const n = r ? r.hi - r.lo : 0;
    if (n < HALL_MIN_WINDOW_POINTS) out.push(`${name} holds ${n} point${n === 1 ? '' : 's'}; at least ${HALL_MIN_WINDOW_POINTS} are needed for a slope with an interval.`);
  }
  return out;
}

const alertFor = (inj, ratio) => {
  if (ratio != null && ratio >= HALL_RATIO_HI) return { injector: inj, message: `Injector ${inj}: Hall slope up ${(ratio).toFixed(2)}× vs baseline, declining injectivity (rising skin / near-well plugging).` };
  if (ratio != null && ratio <= HALL_RATIO_LO) return { injector: inj, message: `Injector ${inj}: Hall slope down ${(ratio).toFixed(2)}× vs baseline, improving injectivity (possible fracturing or thief-zone channeling).` };
  return null;
};

/** One plot with a choice applied (a choice with problems is not applied and says why). */
export function applyHallChoice(plot, choice) {
  if (!choice) return plot;
  const problems = hallChoiceProblems(plot, choice);
  if (problems.length) return { ...plot, windowChoice: { ...choice, applied: false, problems } };
  const windows = { ...plot.windows };
  for (const key of ['baseline', 'recent']) {
    const w = choice[key];
    if (!w) continue;
    const r = indexRangeByDates(plot.dates, w.from, w.to);
    const line = olsLine(plot.cum_injection, plot.hall_integral, r.lo, r.hi);
    if (line) windows[key] = { ...line, chosen: { from: w.from, to: w.to } };
  }
  const slopeBaseline = windows.baseline?.slope ?? null;
  const slopeRecent = windows.recent?.slope ?? null;
  const ratio = slopeBaseline && slopeBaseline > 0 && slopeRecent != null ? slopeRecent / slopeBaseline : null;
  return {
    ...plot,
    windows,
    slope_baseline: slopeBaseline,
    slope_last: slopeRecent,
    slope_ratio: ratio,
    windowChoice: { reason: String(choice.reason).trim(), setAt: choice.setAt || null, applied: true, problems: [] },
  };
}

/**
 * An analyzeWaterflood result with the chosen windows applied: the plots,
 * and the injectivity alerts of the injectors whose windows were chosen.
 */
export function applyHallWindows(result, choices) {
  if (!result || result.error || !Array.isArray(result.hall_plots) || !choices || !Object.keys(choices).length) return result;
  const plots = result.hall_plots.map((p) => applyHallChoice(p, choices[p.injector]));
  const changed = new Set(plots.filter((p) => p.windowChoice?.applied).map((p) => p.injector));
  if (!changed.size) return { ...result, hall_plots: plots };
  const kept = (result.alerts?.injectivity_issue || []).filter((a) => !changed.has(a.injector));
  const fresh = plots.filter((p) => changed.has(p.injector)).map((p) => alertFor(p.injector, p.slope_ratio)).filter(Boolean);
  return { ...result, hall_plots: plots, alerts: { ...result.alerts, injectivity_issue: [...kept, ...fresh] } };
}

/** "Chosen 2026-10-04: reason" for the report and the screen. */
export function hallChoiceText(plot) {
  const c = plot?.windowChoice;
  if (!c) return null;
  if (!c.applied) return `Windows not applied: ${c.problems.join(' ')}`;
  return `Windows chosen${c.setAt ? ` ${day(c.setAt)}` : ''}: ${c.reason}`;
}
