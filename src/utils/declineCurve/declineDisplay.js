// One place that turns the fitted decline into what the screen prints (H2).
//
// The engine fits on a time axis in days, so `fit.Di` is a NOMINAL decline
// per DAY (the instantaneous slope -dq/dt / q at t = 0). The app shows it as
// a nominal percent per year: Di x 365 x 100. Before this module one card
// printed Di x 100 under a "%/yr" label, 365 times too small, beside another
// card that had the right number.
//
// Nominal and effective differ and must not share a label. The effective
// first-year decline is the fraction of the initial rate lost over the first
// year, read off the engine's own rate function so it holds for any b.
//
// The year (DCA-U1-010): 365.25 days, the Suite registry's year (the Julian
// year of the SPE metric standard), used by Decline Curve Analysis, Forecast
// Scenario Hub and Well Spacing alike. The engine fits on calendar dates, so
// its day is a calendar day and a calendar year averages 365.2425 days; 365
// was a quarter of a day short. Moving from 365 raised every printed %/yr by
// 0.068 percent and changed no fitted number.
import { calculateArpsHyperbolic } from '@/utils/declineCurve/dcaEngine';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { DAYS_PER_YEAR as REGISTRY_YEAR } from '@/lib/units/registry';

export const DAYS_PER_YEAR = REGISTRY_YEAR;

/** The words that go beside every nominal annual Di on the screen. */
export const DI_BASIS_LABEL = 'nominal, %/yr';
export const DI_EFFECTIVE_LABEL = 'effective, first year';

const ok = (v) => typeof v === 'number' && Number.isFinite(v);

/** Per-day nominal Di to nominal percent per year. */
export function nominalAnnualPct(diPerDay) {
  return ok(diPerDay) ? diPerDay * DAYS_PER_YEAR * 100 : null;
}

/** Percent of the initial rate lost in the first year of 365.25 days (secant effective decline). */
export function effectiveFirstYearPct(diPerDay, b = 0) {
  if (!ok(diPerDay)) return null;
  const q = calculateArpsHyperbolic(1, diPerDay, ok(b) ? b : 0, DAYS_PER_YEAR);
  return ok(q) ? (1 - q) * 100 : null;
}

const fixed = (v, digits) => (ok(v) ? v.toFixed(digits) : EMPTY_VALUE);

/** "43.83" for 0.0012 per day; EMPTY_VALUE when there is no Di. */
export function formatNominalAnnual(diPerDay, digits = 2) {
  return fixed(nominalAnnualPct(diPerDay), digits);
}

/** "35.49" for 0.0012 per day, b = 0. */
export function formatEffectiveFirstYear(diPerDay, b = 0, digits = 2) {
  return fixed(effectiveFirstYearPct(diPerDay, b), digits);
}

/** A whole phrase for a tight spot: "43.83 %/yr nominal". */
export function describeNominalAnnual(diPerDay, digits = 2) {
  const v = nominalAnnualPct(diPerDay);
  return ok(v) ? `${v.toFixed(digits)} %/yr nominal` : EMPTY_VALUE;
}

// ---- the display unit of the decline (DCA-U1, PL3) ----------------------

/** "nominal, %/yr" in the view's decline unit (dcaUnits.js); %/yr without a view. */
export function declineBasisLabel(u) {
  return `nominal, ${u?.declineLabel || '%/yr'}`;
}

/** A per-day nominal Di in the view's decline unit: two decimals in %/yr, four figures otherwise. */
export function formatDecline(diPerDay, u, digits = 2) {
  if (!ok(diPerDay)) return EMPTY_VALUE;
  if (!u || u.declineUnit === '%/yr') return formatNominalAnnual(diPerDay, digits);
  const v = u.declineTo(diPerDay);
  return ok(v) ? String(parseFloat(v.toPrecision(4))) : EMPTY_VALUE;
}
