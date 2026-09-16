/**
 * The one risk scoring authority for the Assurance module.
 *
 * AS2, Assurance-ROADMAP.md §6: "Risk score, rating band and appetite
 * status are computed in exactly one module and imported everywhere,
 * including by the hub. Two places that both know the 5x5 matrix is the
 * defect this module is most likely to grow."
 *
 * It had already grown it. Before this file there were four different
 * answers to "how red is this risk" in the same app:
 *
 *   utils/riskScoring.js          >= 15 / >= 10 / >= 5
 *   RiskHeatmapMatrix getCellBg   the same thresholds, written again,
 *                                 in the file that imports the first one
 *   RiskRegisterTablePage         > 15, so a score of exactly 15 was
 *                                 green in the table and red everywhere
 *                                 else
 *   useAssuranceAnalytics         `r.rating || (computed)`, preferring a
 *                                 stored text column the app never
 *                                 writes, so the hub would have shown a
 *                                 stale band the moment anything did
 *
 * Nothing in this module may restate a threshold. Import from here.
 * `src/lib/__tests__/riskScoring.test.js` has a guard that fails if a
 * second copy appears.
 *
 * Convention: a 5x5 likelihood-by-impact matrix, ISO 31000 shaped,
 * scored as the product. The bands are the ones the register shipped
 * with; they are not changed here, because changing them would silently
 * reclassify every risk an organization has already logged. Changing
 * them is an owner decision with a migration behind it.
 */

export const SCALE_MIN = 1;
export const SCALE_MAX = 5;

/** Band thresholds, inclusive lower bounds, highest first. */
export const RISK_BANDS = Object.freeze([
  { band: 'Critical', min: 15, max: 25, cssVar: '--risk-critical' },
  { band: 'High', min: 10, max: 14, cssVar: '--risk-high' },
  { band: 'Medium', min: 5, max: 9, cssVar: '--risk-medium' },
  { band: 'Low', min: 1, max: 4, cssVar: '--risk-low' },
]);

export const RISK_BAND_NAMES = Object.freeze(RISK_BANDS.map((b) => b.band));

/** Returned when a risk has no usable likelihood or impact. */
export const NO_BAND = 'None';

const clampLevel = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < SCALE_MIN || n > SCALE_MAX) return null;
  return n;
};

/**
 * Inherent or residual score from a likelihood and an impact.
 * Returns 0 when either side is missing or off the 1-5 scale, which is
 * the only score that maps to NO_BAND. It never guesses a level.
 */
export const calculateRiskScore = (likelihood, impact) => {
  const l = clampLevel(likelihood);
  const i = clampLevel(impact);
  if (l === null || i === null) return 0;
  return l * i;
};

/** The band a score falls in. */
export const getRiskBand = (score) => {
  const n = Number(score);
  if (!Number.isFinite(n) || n <= 0) return NO_BAND;
  const hit = RISK_BANDS.find((b) => n >= b.min);
  return hit ? hit.band : NO_BAND;
};

export const getRiskBandColor = (band) => {
  const hit = RISK_BANDS.find((b) => b.band === band);
  return hit ? `hsl(var(${hit.cssVar}))` : 'hsl(var(--muted))';
};

const BAND_CLASSES = Object.freeze({
  Critical: 'bg-red-500/10 text-red-500 border-red-500/20',
  High: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  Medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  Low: 'bg-green-500/10 text-green-500 border-green-500/20',
  [NO_BAND]: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
});

export const getRiskBandClasses = (score) => BAND_CLASSES[getRiskBand(score)];

const CELL_CLASSES = Object.freeze({
  Critical: 'bg-red-500/90 hover:bg-red-500',
  High: 'bg-orange-500/90 hover:bg-orange-500',
  Medium: 'bg-yellow-500/90 hover:bg-yellow-500',
  Low: 'bg-green-500/90 hover:bg-green-500',
  [NO_BAND]: 'bg-slate-500/90',
});

/** Heatmap cell fill for a likelihood/impact pair. */
export const getHeatmapCellClasses = (likelihood, impact) =>
  CELL_CLASSES[getRiskBand(calculateRiskScore(likelihood, impact))];

/**
 * Residual score. A risk whose residual position has not been assessed
 * has not been mitigated, so its residual IS its inherent score. That
 * is the conservative reading and it matches the generated column in
 * migration 20260916110000, which must agree with this function.
 */
export const calculateResidualScore = (risk = {}) =>
  calculateRiskScore(
    risk.residual_likelihood ?? risk.likelihood,
    risk.residual_impact ?? risk.impact,
  );

export const APPETITE = Object.freeze({
  WITHIN: 'Within appetite',
  ABOVE: 'Above appetite',
  NOT_SET: 'Not set',
});

/**
 * Appetite status: is the residual score inside the tolerance set for
 * this risk? With no target set there is no answer, and NOT_SET says so
 * rather than reporting a pass.
 */
export const getAppetiteStatus = (risk = {}) => {
  const target = Number(risk.target_score);
  if (!Number.isFinite(target) || target <= 0) return APPETITE.NOT_SET;
  const residual = calculateResidualScore(risk);
  if (residual <= 0) return APPETITE.NOT_SET;
  return residual <= target ? APPETITE.WITHIN : APPETITE.ABOVE;
};

/**
 * Is this risk's review overdue? `asOf` is injectable so the tests are
 * not a function of the day they run on.
 */
export const isReviewOverdue = (risk = {}, asOf = new Date()) => {
  if (!risk.next_review_date) return false;
  const due = new Date(risk.next_review_date);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date(asOf);
  // Compare whole days; a review due today is not yet overdue.
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return due < today;
};

/**
 * Everything the UI and the database need for one risk, derived once.
 * `rating` is the column the register stores; it is written from here on
 * every save so the stored band can never disagree with the stored
 * score.
 */
export const deriveRiskFields = (risk = {}) => {
  const inherentScore = calculateRiskScore(risk.likelihood, risk.impact);
  const residualScore = calculateResidualScore(risk);
  return {
    inherentScore,
    inherentBand: getRiskBand(inherentScore),
    residualScore,
    residualBand: getRiskBand(residualScore),
    rating: getRiskBand(inherentScore),
    appetite_status: getAppetiteStatus(risk),
  };
};

/** Counts by band, for the dashboard and the hub. Never re-derived. */
export const countByBand = (risks = [], { residual = false } = {}) => {
  const counts = Object.fromEntries(RISK_BAND_NAMES.map((b) => [b, 0]));
  counts[NO_BAND] = 0;
  risks.forEach((r) => {
    const score = residual
      ? calculateResidualScore(r)
      : calculateRiskScore(r.likelihood, r.impact);
    counts[getRiskBand(score)] += 1;
  });
  return counts;
};
