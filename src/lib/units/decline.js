// Nominal and effective decline (Reservoir round, Step 0a). Pure.
//
// The registry's `declineRate` family converts the TIME BASIS of a decline
// rate (per day, per month, per year, percent per year). Whether a rate is
// nominal (the instantaneous D of q = qi exp(-D t)) or effective (the
// fraction of rate lost over one period) is NOT a unit: the two are related
// by De = 1 - exp(-Dn) over the same period (Arps 1945; SPEE REP 6), and an
// app states which one it shows. These two functions make that step explicit
// so that no app hides it inside a "unit conversion".
//
// Both take and return a FRACTION per period (0.25 = 25 percent), with the
// period the same on both sides.

/** Effective decline fraction over one period from a nominal rate per period. */
export function effectiveFromNominal(nominal) {
  if (!Number.isFinite(nominal) || nominal < 0) return NaN;
  return -Math.expm1(-nominal);
}

/** Nominal rate per period from an effective decline fraction (0 <= De < 1). */
export function nominalFromEffective(effective) {
  if (!Number.isFinite(effective) || effective < 0 || effective >= 1) return NaN;
  return -Math.log1p(-effective);
}

export const DECLINE_BASIS_LABELS = Object.freeze({ nominal: 'nominal', effective: 'effective' });
