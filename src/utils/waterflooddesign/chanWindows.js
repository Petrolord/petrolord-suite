// Chan late-time windows (WF-U2-006, RL6, RL8). The engine reads the
// mechanism from the log-log slope of WOR' over the last 40 percent of the
// points (computeChanDiagnostics, Chan 1995), without an interval and without
// saying which points. Here the window is shown, its slope carries the 95
// percent interval of the engine's least-squares line (olsLine on ln t,
// ln WOR', the points with WOR' > 0, as the engine), and the user may choose
// it, in days since water onset (the time axis of the plot), with a reason:
//
//   chanWindows[series] = { from, to, reason, setAt }, series = producer name or 'field'
//
// The mechanism is decided again with the engine's own classifyChan. Pure.
import { olsLine, classifyChan } from '@/utils/waterfloodCalculations';

export const CHAN_MIN_WINDOW_POINTS = 3;
export const FIELD_KEY = 'field';
export const chanKeyOf = (s) => (s?.producer === 'Field (all wells)' ? FIELD_KEY : s?.producer);

/** The least-squares line of ln WOR' on ln t over points[lo, hi) with WOR' > 0. */
export function chanSlope(points, lo, hi) {
  const lx = [];
  const ly = [];
  const ts = [];
  for (let i = lo; i < hi; i += 1) {
    const p = points[i];
    if (p && p.worDeriv > 0 && p.t > 0) { lx.push(Math.log(p.t)); ly.push(Math.log(p.worDeriv)); ts.push(p.t); }
  }
  if (lx.length < CHAN_MIN_WINDOW_POINTS) return { n: lx.length, slope: null, ci95: null, r2: null, tFrom: ts[0] ?? null, tTo: ts[ts.length - 1] ?? null };
  const l = olsLine(lx, ly, 0, lx.length);
  return { n: l?.n ?? lx.length, slope: l?.slope ?? null, ci95: l?.ci95 ?? null, r2: l?.r2 ?? null, intercept: l?.intercept ?? null, tFrom: ts[0], tTo: ts[ts.length - 1] };
}

/** The engine's own window (the last 40 percent of the points), with its interval. */
export function engineChanWindow(points) {
  const start = Math.floor((points?.length || 0) * 0.6);
  return { ...chanSlope(points || [], start, (points || []).length), chosen: null };
}

/** Problems with a choice, in words; [] when it can be applied. */
export function chanChoiceProblems(series, choice) {
  const out = [];
  if (!String(choice?.reason || '').trim()) out.push('Give the reason for the window: it is printed with it.');
  const from = Number(choice?.from);
  const to = Number(choice?.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) { out.push('The window needs a start and an end day.'); return out; }
  if (from >= to) { out.push('The window ends before it starts.'); return out; }
  const pts = series?.points || [];
  const idx = pts.map((p, i) => (p.t >= from && p.t <= to ? i : -1)).filter((i) => i >= 0);
  const n = idx.length ? chanSlope(pts, idx[0], idx[idx.length - 1] + 1).n : 0;
  if (n < CHAN_MIN_WINDOW_POINTS) out.push(`The window holds ${n} point${n === 1 ? '' : 's'} with a rising WOR'; at least ${CHAN_MIN_WINDOW_POINTS} are needed.`);
  return out;
}

/** One series with its window (engine or chosen), slope interval and mechanism. */
export function applyChanChoice(series, choice) {
  if (!series) return series;
  const base = engineChanWindow(series.points);
  if (!choice) return { ...series, window: base };
  const problems = chanChoiceProblems(series, choice);
  if (problems.length) return { ...series, window: { ...base, choice: { ...choice, applied: false, problems } } };
  const pts = series.points;
  const idx = pts.map((p, i) => (p.t >= Number(choice.from) && p.t <= Number(choice.to) ? i : -1)).filter((i) => i >= 0);
  const w = chanSlope(pts, idx[0], idx[idx.length - 1] + 1);
  return {
    ...series,
    lateSlope: w.slope,
    classification: classifyChan(w.slope),
    window: { ...w, chosen: { from: Number(choice.from), to: Number(choice.to) }, choice: { reason: String(choice.reason).trim(), setAt: choice.setAt || null, applied: true, problems: [] } },
  };
}

/** An analyzeWaterflood result with every Chan series given its window. */
export function applyChanWindows(result, choices = {}) {
  if (!result || result.error || !result.chan) return result;
  const c = result.chan;
  return {
    ...result,
    chan: {
      ...c,
      field: c.field ? applyChanChoice(c.field, choices?.[FIELD_KEY]) : c.field,
      producers: (c.producers || []).map((p) => applyChanChoice(p, choices?.[p.producer])),
    },
  };
}

/** "day 40 to 90 (chosen: reason)" or "the last 40 percent (day 52 to 90)". */
export function chanWindowText(w) {
  if (!w) return 'n/a';
  const d = (v) => (Number.isFinite(v) ? String(Math.round(v)) : 'n/a');
  if (w.chosen) return `day ${d(w.chosen.from)} to ${d(w.chosen.to)}, chosen: ${w.choice?.reason || ''}`;
  return `the last 40 percent of the points (day ${d(w.tFrom)} to ${d(w.tTo)})`;
}
