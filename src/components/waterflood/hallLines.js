// The Hall plot windows as lines and words (WF-U1-006), shared by the
// Surveillance panel and the Waterflood report. Pure.
import { EMPTY_VALUE } from '@/lib/emptyValue';

/**
 * The two fitted lines of a Hall plot (WF-U1-006): each window's line drawn
 * over the injected volume of its own points, from the engine's fit. The
 * screen and the report draw from this one builder.
 */
export function hallWindowLines(d) {
  const out = [];
  for (const [key, label] of [['baseline', 'Baseline window (first third)'], ['recent', 'Recent window (last third)']]) {
    const w = d.windows?.[key];
    if (!w || !Number.isFinite(w.slope) || !Number.isFinite(w.intercept)) continue;
    // WF-U2-003: a window the user chose says so
    out.push({
      key, label: w.chosen ? `${key === 'baseline' ? 'Baseline' : 'Recent'} window (chosen ${w.chosen.from} to ${w.chosen.to})` : label, chosen: !!w.chosen, slope: w.slope, ci95: w.ci95, n: w.n, r2: w.r2,
      dateFrom: d.dates?.[w.lo] ?? null, dateTo: d.dates?.[w.hi - 1] ?? null,
      points: [w.x0, w.x1].map((x) => ({ x, y: w.intercept + w.slope * x })),
    });
  }
  return out;
}

/** Slope words with the 95 percent interval: "2.00 psi.d/bbl (95% 1.90 to 2.10)". */
export function hallSlopeText(slope, ci95, u = null) {
  if (slope == null || !Number.isFinite(slope)) return EMPTY_VALUE;
  const f = (v) => (u ? u.show('hallSlope', v) : v);
  const unit = u ? u.label('hallSlope') : 'psi.d/bbl';
  const ci = ci95 && ci95.every(Number.isFinite) ? ` (95% ${f(ci95[0]).toFixed(2)} to ${f(ci95[1]).toFixed(2)})` : '';
  return `${f(slope).toFixed(2)} ${unit}${ci}`;
}


