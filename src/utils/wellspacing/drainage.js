/**
 * Well Spacing Optimizer: drainage geometry and timing (WS-U1, practitioner
 * lens PL1, reviewer lens RL8). Diagnostics beside the spacing economics:
 * nothing here changes an EUR or an NPV. Each case gets the distance
 * between neighbouring wells, its equivalent drainage radius, how long the
 * pressure transient takes to reach the neighbour and the drainage boundary,
 * and what a well on that drainage area can deliver at pseudosteady state,
 * held against the initial rate the economics assume.
 *
 * OILFIELD UNITS THROUGHOUT, and the constants are written for exactly
 * these: k in md (not darcies), h, r and rw in ft, mu in cp, ct in 1/psi,
 * p in psia, q in STB/d, B in RB/STB, A in acres converted to ft2, t in
 * HOURS (not days). Two sibling apps of this round carried S1 defects of
 * exactly this class (k in md where the equation takes darcies, a storage
 * factor inverted), so every constant is pinned by a gate in
 * __tests__/wellSpacingValidation.test.js with a negative control.
 *
 * Sources (Ahmed and McKinney, Advanced Reservoir Engineering, Gulf, 2005,
 * Chapter 1, the public sample chapter; Lee, Well Testing, SPE Textbook
 * Series 1, 1982; Earlougher, Advances in Well Test Analysis, SPE
 * Monograph 5, 1977, Table C.1, reprinted as Ahmed Table 1.4):
 *   drainage radius      re = sqrt(43,560 A / pi)                   (40 acres: 745 ft, Ahmed Ex. 1.5 and 1.6)
 *   radius of investig.  ri = sqrt(k t / (948 phi mu ct))           (Lee 1982; the Ei argument of Ahmed Eq. 1.2.134 equals 1 at ri)
 *   PSS onset            t = tDA phi mu ct A / (0.0002637 k)         (Ahmed Eq. 1.2.75b; tDA exact from Table 1.4)
 *   PSS rate             q = k h (pbar - pwf) / (141.2 B mu (0.5 ln(2.2458 A / (CA rw^2)) + s))
 *                                                                    (Ahmed Eq. 1.2.124 with the skin of Eq. 1.2.125; Ex. 1.18: 416 STB/d)
 *   line-source drop     dp = -70.6 q mu B / (k h) Ei(-948 phi mu ct r^2 / (k t))  (Ahmed Eq. 1.2.134, Ex. 1.21)
 *   EUR-implied area     A = EUR Bo / (7,758 h phi (1 - Swi) RF)     (the volumetric equation solved for area)
 *
 * Pure.
 */
import { expE1 } from '@/utils/welltest/numerics';

export const FT2_PER_ACRE = 43560;
export const BBL_PER_ACRE_FT = 7758;
/** 948: the diffusivity constant of the field-unit Ei argument, t in hours. */
export const DIFFUSIVITY_948 = 948;
/** 0.0002637: tD = 0.0002637 k t / (phi mu ct r^2), t in hours. */
export const TD_CONSTANT = 0.0002637;
/** 141.2: q = k h dp / (141.2 B mu pD), field units. */
export const DARCY_141_2 = 141.2;

/**
 * The well layouts the spacing can be drilled on, with the Dietz shape
 * factor of the drainage area each well gets and the dimensionless time at
 * which pseudosteady state is exact (Earlougher 1977, Table C.1; Ahmed
 * Table 1.4): a square for a square grid, a regular hexagon for a staggered
 * (triangular) grid.
 */
export const LAYOUTS = Object.freeze({
  square: Object.freeze({
    key: 'square', label: 'Square grid (each well drains a square)', shape: 'square', CA: 30.8828, tdaExact: 0.1,
    // a square of side d holds one well: d = sqrt(A)
    distanceFactor: 1,
  }),
  triangular: Object.freeze({
    key: 'triangular', label: 'Staggered (triangular) grid (each well drains a regular hexagon)', shape: 'regular hexagon', CA: 31.6, tdaExact: 0.1,
    // a regular hexagon with neighbours d apart has area (sqrt 3 / 2) d^2: d = sqrt(2 A / sqrt 3)
    distanceFactor: Math.sqrt(2 / Math.sqrt(3)),
  }),
});
export const DEFAULT_LAYOUT = 'square';

/** The layout of a form value; the flood-pattern names of earlier builds map onto it. */
export function layoutOf(value) {
  if (value === 'triangular' || value === '7-spot') return LAYOUTS.triangular;
  return LAYOUTS.square;
}

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const pos = (v) => finite(v) && v > 0;

/** Equivalent drainage radius of a well spacing, ft: re = sqrt(43,560 A / pi). */
export const drainageRadiusFt = (acres) => (pos(acres) ? Math.sqrt((acres * FT2_PER_ACRE) / Math.PI) : NaN);

/** Distance between neighbouring wells, ft, for the spacing and the layout. */
export const interWellDistanceFt = (acres, layout = DEFAULT_LAYOUT) => (
  pos(acres) ? layoutOf(layout).distanceFactor * Math.sqrt(acres * FT2_PER_ACRE) : NaN
);

/** Radius of investigation, ft (Lee 1982): ri = sqrt(k t / (948 phi mu ct)), t in hours. */
export function radiusOfInvestigationFt({ kMd, tHours, phi, muCp, ctPerPsi }) {
  if (![kMd, phi, muCp, ctPerPsi].every(pos) || !(finite(tHours) && tHours >= 0)) return NaN;
  return Math.sqrt((kMd * tHours) / (DIFFUSIVITY_948 * phi * muCp * ctPerPsi));
}

/** Hours for the radius of investigation to reach r ft: t = 948 phi mu ct r^2 / k. */
export function hoursToReach({ rFt, kMd, phi, muCp, ctPerPsi }) {
  if (![rFt, kMd, phi, muCp, ctPerPsi].every(pos)) return NaN;
  return (DIFFUSIVITY_948 * phi * muCp * ctPerPsi * rFt * rFt) / kMd;
}

/** Hours to the start of exact pseudosteady state: t = tDA phi mu ct A / (0.0002637 k). */
export function pssOnsetHours({ areaAcres, kMd, phi, muCp, ctPerPsi, tDA = LAYOUTS.square.tdaExact }) {
  if (![areaAcres, kMd, phi, muCp, ctPerPsi, tDA].every(pos)) return NaN;
  return (tDA * phi * muCp * ctPerPsi * areaAcres * FT2_PER_ACRE) / (TD_CONSTANT * kMd);
}

/**
 * Pseudosteady-state oil rate of a well on its drainage area, STB/d
 * (Ahmed Eq. 1.2.124, the skin added as in Eq. 1.2.125):
 *   q = k h (pbar - pwf) / (141.2 B mu (0.5 ln(2.2458 A / (CA rw^2)) + s))
 */
export function pssRateStbd({ kMd, hFt, pAvgPsia, pwfPsia, muCp, bo, areaAcres, CA = LAYOUTS.square.CA, rwFt, skin = 0 }) {
  if (![kMd, hFt, muCp, bo, areaAcres, CA, rwFt].every(pos) || !finite(pAvgPsia) || !finite(pwfPsia) || !finite(skin)) return NaN;
  const dp = pAvgPsia - pwfPsia;
  if (!(dp > 0)) return NaN;
  const A = areaAcres * FT2_PER_ACRE;
  const denom = DARCY_141_2 * bo * muCp * (0.5 * Math.log((2.2458 * A) / (CA * rwFt * rwFt)) + skin);
  return denom > 0 ? (kMd * hFt * dp) / denom : NaN;
}

/** The Ei argument of the line source, 948 phi mu ct r^2 / (k t). */
export function lineSourceArgument({ rFt, kMd, tHours, phi, muCp, ctPerPsi }) {
  if (![rFt, kMd, tHours, phi, muCp, ctPerPsi].every(pos)) return NaN;
  return (DIFFUSIVITY_948 * phi * muCp * ctPerPsi * rFt * rFt) / (kMd * tHours);
}

/**
 * Pressure drop at distance r from a well producing q since t hours, psi
 * (line source, infinite acting; Ahmed Eq. 1.2.134, as for an offset well
 * in Ex. 1.21): dp = -70.6 q mu B / (k h) Ei(-x), and -Ei(-x) = E1(x).
 */
export function lineSourceDropPsi({ qStbd, muCp, bo, kMd, hFt, phi, ctPerPsi, rFt, tHours }) {
  const x = lineSourceArgument({ rFt, kMd, tHours, phi, muCp, ctPerPsi });
  if (!finite(x) || ![qStbd, muCp, bo, kMd, hFt].every(pos)) return NaN;
  return ((70.6 * qStbd * muCp * bo) / (kMd * hFt)) * expE1(x);
}

/** The drainage area, acres, that an EUR implies at the stated rock, fluid and recovery factor. */
export function eurImpliedAreaAcres({ eurStb, hFt, phi, swi, rf, bo }) {
  if (![eurStb, hFt, phi, rf, bo].every(pos) || !(finite(swi) && swi >= 0 && swi < 1)) return NaN;
  return (eurStb * bo) / (BBL_PER_ACRE_FT * hFt * phi * (1 - swi) * rf);
}

/**
 * The drainage diagnostics of one spacing case. `rock` carries what the
 * timing and the deliverability need; a part that cannot be computed says
 * which input it waits for, so the report prints the reason and no number.
 * @returns {{distanceFt, drainageRadiusFt, layout, interferenceDays, pssDays, pssRateStbd, planRateStbd, rateRatio, timing: ?string, deliverability: ?string}}
 */
export function drainageCase({ spacingAcres, layout, planRateStbd, rock = {} }) {
  const L = layoutOf(layout);
  const d = interWellDistanceFt(spacingAcres, L.key);
  const re = drainageRadiusFt(spacingAcres);
  const { kMd, phi, muCp, ctPerPsi, hFt, pAvgPsia, pwfPsia, bo, rwFt, skin } = rock;
  const timingMissing = [['permeability', kMd], ['porosity', phi], ['oil viscosity', muCp], ['total compressibility', ctPerPsi]].filter(([, v]) => !pos(v)).map(([n]) => n);
  let interferenceDays = NaN;
  let pssDays = NaN;
  if (!timingMissing.length) {
    // interference begins when the radius of investigation of each well reaches half the distance to its neighbour
    interferenceDays = hoursToReach({ rFt: d / 2, kMd, phi, muCp, ctPerPsi }) / 24;
    pssDays = pssOnsetHours({ areaAcres: spacingAcres, kMd, phi, muCp, ctPerPsi, tDA: L.tdaExact }) / 24;
  }
  const rateMissing = [...timingMissing.filter((n) => n !== 'porosity' && n !== 'total compressibility'),
    ...[['net pay', hFt], ['average reservoir pressure', pAvgPsia], ['flowing bottomhole pressure', pwfPsia], ['oil FVF', bo], ['wellbore radius', rwFt]].filter(([, v]) => !pos(v)).map(([n]) => n)];
  if (!rateMissing.length && !(pAvgPsia > pwfPsia)) rateMissing.push('a flowing pressure below the average pressure');
  const q = rateMissing.length ? NaN : pssRateStbd({ kMd, hFt, pAvgPsia, pwfPsia, muCp, bo, areaAcres: spacingAcres, CA: L.CA, rwFt, skin: finite(skin) ? skin : 0 });
  return {
    spacingAcres,
    layout: L.key,
    distanceFt: d,
    drainageRadiusFt: re,
    interferenceDays,
    pssDays,
    pssRateStbd: q,
    planRateStbd: planRateStbd,
    rateRatio: finite(q) && pos(planRateStbd) ? planRateStbd / q : NaN,
    timing: timingMissing.length ? `Not computed: ${timingMissing.join(', ')} not given.` : null,
    deliverability: rateMissing.length ? `Not computed: ${[...new Set(rateMissing)].join(', ')} not given.` : null,
  };
}
