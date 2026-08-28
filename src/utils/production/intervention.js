/**
 * Well Intervention Planner computation layer (Production P12,
 * Production-ROADMAP.md app 12).
 *
 * The last app in the module, and the one that reads everything the
 * others produced: the production history from the spine (P1), the
 * shared well description (P6.5), the validated nodal chain, and the
 * canonical economics engine.
 *
 * THREE THINGS IT DOES THAT A CHECKLIST CANNOT.
 *
 * 1. THE DIAGNOSIS GATES THE TREATMENT. Water channelling and water
 *    coning look identical on a water-cut plot and need opposite
 *    treatments. A shutoff squeeze fixes the first and is money down a
 *    hole on the second, because a cone shut off at the bottom
 *    perforations simply re-forms above them. The engine's screening
 *    refuses the treatments the diagnostic argues against, and this
 *    layer feeds it a diagnosis built from the well's own history
 *    rather than from a guess.
 *
 * 2. THE UPLIFT IS A NODAL RE-SOLVE, NOT A MULTIPLIER. Removing skin
 *    changes the INFLOW, and the well then finds a new operating point
 *    against the same tubing -- which gives back less than the inflow
 *    gained, because a faster well has a bigger friction loss. A
 *    percentage uplift applied to the current rate would miss that
 *    every time, and would miss it in the optimistic direction.
 *
 *    Removing water is stranger and more interesting. It changes the
 *    inflow hardly at all, and changes the OUTFLOW a great deal: less
 *    water is a lighter column, and a lighter column is a lower
 *    bottomhole pressure for the same wellhead pressure. So a shutoff
 *    can lift the oil rate by more than the water it removes would
 *    suggest, and on a well close to dying it is the difference
 *    between flowing and not. That effect lives entirely in the VLP
 *    and no inflow calculation will find it.
 *
 * 3. THE ECONOMICS ARE THE CANONICAL ENGINE. `calculateEconomics` from
 *    npvCalculations.js, imported and not reimplemented, per the
 *    module rule. A second NPV in this repo would be a second set of
 *    conventions for discounting, depreciation and cost recovery to
 *    drift apart from the first.
 *
 * Field units: psia, stb/d, Mscf/d, days, US dollars.
 */

// Relative imports (not the @/ alias) so this module also loads outside
// Vite: tools/validation/production-validation.ts exercises it directly.
import { computeIpr } from '../nodal/ipr.js';
import { solveOperatingPoint } from '../nodal/system.js';
import { num } from '../nodal/numerics.js';
import { bourdetDerivative, logDecimate, trimSpikes } from '../welltest/derivative.js';
import { calculateEconomics } from '../npvCalculations.js';
import {
  chanDiagnosis, screenTreatments, rankTreatments, skinPiMultiplier,
  minimumSkin, pssDenominator, logLogSlope, CHAN_DEFAULTS, CHAN_MECHANISMS,
  TREATMENTS,
} from './engine/interventionDiagnostics.js';

export {
  CHAN_DEFAULTS, CHAN_MECHANISMS, TREATMENTS, minimumSkin, pssDenominator,
  skinPiMultiplier, logLogSlope, rankTreatments,
};

/** Points per log decade the history is reduced to before differentiating. */
export const DECIMATE_PER_DECADE = 14;
/** Bourdet smoothing window, in log10 cycles. */
export const DERIVATIVE_L = 0.2;
/**
 * Derivative estimates dropped from each end of the series.
 *
 * The Bourdet formula needs a neighbour at least L log cycles away on
 * BOTH sides. At the ends of a series there is only one, so it falls
 * back to a one-sided slope, and on a curving response those estimates
 * are not just noisy but badly biased -- on the gated power-law case
 * the very first point reads a derivative-to-ratio ratio of 9.7 where
 * the true value is 1.6. Standard transient-analysis practice is to
 * ignore them, and ignoring them here takes the recovered exponent
 * from 1.32 to 1.56 against a true 1.6. Keeping them would put a
 * genuinely steep channelling history right on the classifier's
 * boundary, which is exactly the wrong place to be wrong.
 */
export const EDGE_POINTS_DROPPED = 2;
/** Below this many points the ends are kept, because there is little else. */
export const MIN_POINTS_TO_TRIM_EDGES = 10;

// ---------------------------------------------------------------------------
// The history
// ---------------------------------------------------------------------------

/**
 * Turn daily production rows into the ratio history a Chan reading
 * wants.
 *
 * `rows` are the spine's daily production: { prod_date, oil_rate_stbd,
 * water_rate_stbd, gas_rate_mscfd }. Days on which the well made no oil
 * are DROPPED rather than given an infinite ratio -- a well that was
 * shut in that day has nothing to say about its water mechanism, and
 * carrying a divide-by-zero through as Infinity would poison the
 * derivative for a decade either side of it.
 *
 * Time is PRODUCING time from first oil, not calendar time, because the
 * diagnostic is about how much has been produced through the well
 * rather than how long the paperwork has existed.
 *
 * returns { ok, series, dropped, error }
 */
export const ratioHistory = ({ rows, ratio = 'wor' }) => {
  const clean = (rows || [])
    .map((r) => ({
      date: r.prod_date || r.date,
      qo: num(r.oil_rate_stbd ?? r.qo, NaN),
      qw: num(r.water_rate_stbd ?? r.qw, NaN),
      qg: num(r.gas_rate_mscfd ?? r.qg, NaN),
    }))
    .filter((r) => r.date && Number.isFinite(r.qo))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (clean.length < 6) {
    return { ok: false, error: 'There is not enough production history on the spine for this well. A Chan reading needs a history, not a handful of days.' };
  }

  const first = new Date(clean[0].date).getTime();
  const flowing = clean.filter((r) => r.qo > 0);
  const dropped = clean.length - flowing.length;

  const series = flowing.map((r) => {
    const t = (new Date(r.date).getTime() - first) / 86400000;
    const value = ratio === 'gor'
      ? (Number.isFinite(r.qg) ? (r.qg * 1000) / r.qo : NaN)
      : (Number.isFinite(r.qw) ? r.qw / r.qo : NaN);
    return { date: r.date, t: t > 0 ? t : 0.5, ratio: value, qo: r.qo, qw: r.qw, qg: r.qg };
  }).filter((p) => Number.isFinite(p.ratio) && p.ratio >= 0);

  if (series.length < 6) {
    return { ok: false, error: `Only ${series.length} day${series.length === 1 ? '' : 's'} of this history carries both an oil rate and a ${ratio === 'gor' ? 'gas' : 'water'} rate. There is not enough to read.` };
  }

  return { ok: true, series, droppedShutInDays: dropped, firstDate: clean[0].date };
};

/**
 * Differentiate the ratio against log time, with the SAME Bourdet
 * implementation the well test module uses.
 *
 * This is not reuse for its own sake. A daily production history is
 * exactly the kind of noisy log-time series a naive difference turns
 * into confetti, which is the problem Bourdet's three-point window with
 * a minimum log separation was designed for. Writing a second
 * derivative here would be writing a second thing to be wrong, and the
 * one that already exists is gated.
 *
 * The series is log-decimated first, because a thousand daily points
 * crowded into the last decade would let the late history dominate a
 * fit that is supposed to be read over log time.
 *
 * returns { ok, series:[{ t, ratio, derivative }], error }
 */
export const differentiateRatio = ({ series, L = DERIVATIVE_L, perDecade = DECIMATE_PER_DECADE }) => {
  const positive = (series || []).filter((p) => p.t > 0 && p.ratio > 0);
  if (positive.length < 6) {
    return { ok: false, error: 'A log-log derivative needs points at positive time with a positive ratio.' };
  }
  // trimSpikes returns { kept, removed }; the removed ones are counted
  // rather than discarded silently, because a history that needed a lot
  // of trimming is a history worth looking at before trusting a
  // mechanism read off it.
  const trimmed = trimSpikes(positive.map((p) => ({ x: p.t, y: p.ratio })), { threshold: 8 });
  const thinned = logDecimate(trimmed.kept, { pointsPerDecade: perDecade });
  const der = bourdetDerivative(thinned, { L });
  if (!der.length) {
    return { ok: false, error: 'The history could not be differentiated; it may all sit at one time.' };
  }
  const trimEdges = der.length >= MIN_POINTS_TO_TRIM_EDGES + 2 * EDGE_POINTS_DROPPED;
  const kept = trimEdges
    ? der.slice(EDGE_POINTS_DROPPED, der.length - EDGE_POINTS_DROPPED)
    : der;
  return {
    ok: true,
    series: kept.map((p) => ({ t: p.x, ratio: p.y, derivative: p.derivative })),
    allPoints: der.map((p) => ({ t: p.x, ratio: p.y, derivative: p.derivative })),
    rawCount: positive.length,
    usedCount: kept.length,
    edgesDropped: trimEdges ? EDGE_POINTS_DROPPED : 0,
    spikesRemoved: trimmed.removed.length,
  };
};

/** The whole diagnostic, from spine rows to a mechanism. */
export const diagnose = ({ rows, ratio = 'wor', lateFraction = 0.5, settings }) => {
  const hist = ratioHistory({ rows, ratio });
  if (!hist.ok) return { ok: false, error: hist.error };
  const der = differentiateRatio({ series: hist.series });
  if (!der.ok) return { ok: false, error: der.error };
  const chan = chanDiagnosis({ series: der.series, lateFraction, settings });
  return {
    ...chan,
    ok: chan.ok !== false,
    ratio,
    history: hist.series,
    derivative: der.series,
    droppedShutInDays: hist.droppedShutInDays,
    spikesRemoved: der.spikesRemoved,
    edgesDropped: der.edgesDropped,
    error: chan.error || null,
  };
};

// ---------------------------------------------------------------------------
// What a treatment is worth, by nodal re-solve
// ---------------------------------------------------------------------------

/** Rebuild an inflow with its productivity index scaled. */
const scaledIpr = ({ inflow, multiplier }) => {
  const mode = inflow?.calMode;
  const base = {
    model: inflow?.model,
    pr: num(inflow?.pr, NaN),
    pb: num(inflow?.pb, 0),
  };
  if (mode === 'pi') return computeIpr({ ...base, pi: num(inflow.pi, NaN) * multiplier });
  if (mode === 'qmax') return computeIpr({ ...base, qmax: num(inflow.qmax, NaN) * multiplier });
  if (mode === 'test') {
    // A test point scales the same way: the same drawdown now delivers
    // `multiplier` times the rate.
    return computeIpr({
      ...base,
      testPoint: { q: num(inflow.testQ, NaN) * multiplier, pwf: num(inflow.testPwf, NaN) },
    });
  }
  return computeIpr(base);
};

/**
 * Solve the well at a given inflow and duty.
 *
 * One nodal solve, the validated one. Both the before and the after
 * case go through it, so nothing in the comparison comes from a
 * different route.
 */
export const operatingPoint = ({ model, ipr, duty }) => {
  const wct = Math.min(Math.max(num(duty?.wctPct, 0) / 100, 0), 0.999);
  const vlp = {
    ...model.vlp,
    whp: num(duty?.whpPsia, NaN),
    rates: { qo: 0, wct, gor: num(duty?.gor, model.fluidModel.gor) },
  };
  // solveOperatingPoint returns { intersections, op, status, curve }.
  // The rate is on `op`, and `op` is NULL when the well has no stable
  // intersection -- which is a real answer ("this well is dead", "this
  // well has no stable operating point") and has to be read as one
  // rather than as a missing field.
  const s = solveOperatingPoint({ ipr, vlp });
  const q = s.op?.q;
  return {
    ok: Number.isFinite(q) && q > 0,
    qoStbd: q,
    pwfPsia: s.op?.pwf,
    qwStbd: q > 0 ? (q / (1 - wct)) - q : 0,
    status: s.status,
    intersections: s.intersections?.length ?? 0,
  };
};

/**
 * What removing skin is worth, solved rather than multiplied.
 *
 * The inflow gains the full productivity multiplier. The WELL does not,
 * because it then has to push the extra rate up the same tubing and the
 * friction loss goes up with it. The gap between the two is the whole
 * reason this is a nodal solve: quoting the inflow multiplier as the
 * production uplift over-promises, always, and by more on a well whose
 * tubing is already working hard.
 *
 * returns { ok, before, after, piMultiplier, rateMultiplier,
 *   upliftStbd, inflowOnlyStbd, overstatementStbd, error }
 */
export const stimulationUplift = ({ model, inputs, duty, skinBefore, skinAfter }) => {
  if (!model) return { ok: false, error: 'The well model is incomplete.' };
  const geom = { reFt: num(inputs?.reFt, NaN), rwFt: num(inputs?.rwFt, NaN) };
  const pi = skinPiMultiplier({ ...geom, skinBefore, skinAfter });
  if (!pi.ok) return { ok: false, error: pi.error };

  const before = operatingPoint({ model, ipr: model.ipr, duty });
  if (!before.ok) {
    return { ok: false, error: 'The well does not have an operating point as it stands, so there is nothing to compare a treatment against. Check the wellhead pressure and the water cut.' };
  }
  const upIpr = scaledIpr({ inflow: inputs.inflow, multiplier: pi.multiplier });
  if (!(upIpr.qmax > 0)) {
    return { ok: false, error: 'The stimulated inflow did not calibrate.' };
  }
  const after = operatingPoint({ model, ipr: upIpr, duty });
  if (!after.ok) return { ok: false, error: 'The stimulated well did not solve.' };

  // What a percentage-uplift spreadsheet would have said.
  const inflowOnly = before.qoStbd * pi.multiplier;
  return {
    ok: true,
    before,
    after,
    piMultiplier: pi.multiplier,
    rateMultiplier: after.qoStbd / before.qoStbd,
    upliftStbd: after.qoStbd - before.qoStbd,
    inflowOnlyStbd: inflowOnly - before.qoStbd,
    overstatementStbd: inflowOnly - after.qoStbd,
    flowEfficiencyBefore: pi.flowEfficiencyBefore,
    flowEfficiencyAfter: pi.flowEfficiencyAfter,
    minimumSkin: pi.minimumSkin,
    ipr: upIpr,
  };
};

/**
 * What removing water is worth, solved rather than assumed.
 *
 * The inflow barely moves. The OUTFLOW moves a lot: less water is a
 * lighter column, and a lighter column needs less bottomhole pressure
 * for the same wellhead pressure, so the well slides down its inflow
 * curve to a higher rate. That effect lives entirely in the tubing and
 * an inflow calculation will not find it.
 *
 * The comparison holds the inflow FIXED so that what comes back is the
 * column effect and nothing else.
 */
export const shutoffUplift = ({ model, duty, wctAfterPct }) => {
  if (!model) return { ok: false, error: 'The well model is incomplete.' };
  const wctBefore = num(duty?.wctPct, NaN);
  const wctAfter = num(wctAfterPct, NaN);
  if (!(wctBefore >= 0) || !(wctAfter >= 0)) {
    return { ok: false, error: 'Both the water cut now and the water cut afterwards are needed.' };
  }
  if (wctAfter >= wctBefore) {
    return { ok: false, error: 'A shutoff has to leave less water than there is now, or there is nothing to evaluate.' };
  }
  const before = operatingPoint({ model, ipr: model.ipr, duty });
  if (!before.ok) {
    return { ok: false, error: 'The well does not have an operating point as it stands. If it has already died, the question is lift rather than shutoff.' };
  }
  const after = operatingPoint({
    model, ipr: model.ipr, duty: { ...duty, wctPct: String(wctAfter) },
  });
  if (!after.ok) return { ok: false, error: 'The well did not solve at the lower water cut.' };

  return {
    ok: true,
    before,
    after,
    wctBeforePct: wctBefore,
    wctAfterPct: wctAfter,
    upliftStbd: after.qoStbd - before.qoStbd,
    waterRemovedStbd: before.qwStbd - after.qwStbd,
    // The number that says why this is a nodal solve. The inflow did
    // not change at all; every barrel of the gain came from the column
    // getting lighter.
    inflowUnchanged: true,
    pwfDropPsi: before.pwfPsia - after.pwfPsia,
  };
};

// ---------------------------------------------------------------------------
// Economics, on the canonical engine
// ---------------------------------------------------------------------------

/**
 * Value an intervention, using the Suite's canonical screening
 * economics rather than a second implementation.
 *
 * The uplift DECLINES. An intervention that is modelled as a permanent
 * step change is an intervention that will always pay, and that is the
 * commonest way a workover case is oversold. The decline rate is an
 * explicit input with no defensible default, because it depends on what
 * was done and to what, and this layer will not pretend otherwise.
 *
 * returns { ok, economics, profile, error }
 */
export const valueIntervention = ({
  upliftStbd, costUsdMM, oilPriceUsd, declinePctPerYear, projectLife = 10,
  discountRate = 10, opexUsdPerBbl = 0, royaltyRate = 0, taxRate = 0,
  uptimeFraction = 0.95, fiscalType = 'TaxRoyalty',
}) => {
  const uplift = num(upliftStbd, NaN);
  if (!(uplift > 0)) return { ok: false, error: 'There is no uplift to value.' };
  const decline = num(declinePctPerYear, NaN);
  if (!(decline >= 0)) {
    return { ok: false, error: 'An annual decline on the uplift is needed. An intervention modelled as a permanent step change is an intervention that always pays, which is the commonest way a workover case is oversold.' };
  }
  const life = Math.max(1, Math.round(num(projectLife, 10)));
  const uptime = Math.min(Math.max(num(uptimeFraction, 0.95), 0), 1);

  const oil = [];
  let rate = uplift;
  for (let i = 0; i < life; i += 1) {
    oil.push(rate * 365 * uptime);
    rate *= 1 - decline / 100;
  }
  const capex = new Array(life).fill(0);
  capex[0] = num(costUsdMM, 0);
  const opexVariable = oil.map((v) => (v * num(opexUsdPerBbl, 0)) / 1e6);

  const economics = calculateEconomics({
    projectLife: life,
    discountRate: num(discountRate, 10),
    fiscalType,
    production: { oil, gas: new Array(life).fill(0) },
    price: { oil: new Array(life).fill(num(oilPriceUsd, 0)), gas: new Array(life).fill(0) },
    capex,
    opexFixed: new Array(life).fill(0),
    opexVariable,
    abandonment: new Array(life).fill(0),
    royaltyRate: num(royaltyRate, 0),
    taxRate: num(taxRate, 0),
  });

  return {
    ok: true,
    economics,
    profile: oil.map((v, i) => ({ year: i + 1, oilBbl: v, rateStbd: v / (365 * uptime) })),
    incrementalBbl: oil.reduce((a, v) => a + v, 0),
  };
};

// ---------------------------------------------------------------------------
// The whole plan
// ---------------------------------------------------------------------------

/**
 * Diagnose, screen, size and value, in that order, because that is the
 * order the questions actually come in.
 *
 * The screening comes AFTER the diagnosis and is handed it, which is
 * the entire architecture: a treatment the diagnostic argues against is
 * refused before anybody works out what it would be worth. Sizing a
 * shutoff on a coning well to four decimal places does not make it a
 * better idea.
 */
export const runIntervention = ({ inputs, model, rows }) => {
  const errors = [];
  const notes = [];

  const diagnosis = rows?.length
    ? diagnose({
      rows,
      ratio: inputs.diagnostic?.ratio || 'wor',
      lateFraction: num(inputs.diagnostic?.lateFraction, 0.5),
      settings: inputs.diagnostic?.settings,
    })
    : { ok: false, error: 'No production history is linked, so there is no diagnosis. Link a well on the spine, or the screening will refuse every water treatment for want of one.' };

  if (!diagnosis.ok && diagnosis.error) notes.push(diagnosis.error);

  const duty = inputs.duty || {};
  const screening = rankTreatments(screenTreatments({
    well: {
      skin: num(inputs.well?.skin, NaN),
      reFt: num(inputs.well?.reFt, NaN),
      rwFt: num(inputs.well?.rwFt, NaN),
      wctPct: num(duty.wctPct, NaN),
      gorScfStb: num(duty.gor, NaN),
      expectedGorScfStb: num(inputs.well?.expectedGor, model?.fluidModel?.gor),
      flowing: inputs.well?.flowing !== false,
    },
    diagnosis: diagnosis.ok ? diagnosis : null,
  }));

  // --- sizing, only for what the screening did not block ---
  const blocked = new Set(screening.filter((r) => r.blocked).map((r) => r.id));

  let stimulation = null;
  if (!blocked.has('matrixAcid') && model) {
    stimulation = stimulationUplift({
      model,
      inputs: {
        reFt: num(inputs.well?.reFt, NaN),
        rwFt: num(inputs.well?.rwFt, NaN),
        inflow: inputs.inflow,
      },
      duty,
      skinBefore: num(inputs.well?.skin, NaN),
      skinAfter: num(inputs.treatment?.skinAfter, 0),
    });
    if (!stimulation.ok) notes.push(`Stimulation sizing: ${stimulation.error}`);
  }

  let shutoff = null;
  if (!blocked.has('waterShutoff') && model) {
    shutoff = shutoffUplift({
      model, duty, wctAfterPct: num(inputs.treatment?.wctAfterPct, NaN),
    });
    if (!shutoff.ok) notes.push(`Shutoff sizing: ${shutoff.error}`);
  } else if (blocked.has('waterShutoff')) {
    notes.push('The water shutoff was not sized, because the screening blocked it. Sizing a treatment the diagnostic argues against to four decimal places does not make it a better idea.');
  }

  // --- value what was sized ---
  const chosen = inputs.treatment?.kind || 'stimulation';
  const sized = chosen === 'shutoff' ? shutoff : stimulation;
  const economics = sized?.ok
    ? valueIntervention({
      upliftStbd: sized.upliftStbd,
      costUsdMM: num(inputs.economics?.costUsdMM, NaN),
      oilPriceUsd: num(inputs.economics?.oilPriceUsd, NaN),
      declinePctPerYear: num(inputs.economics?.declinePctPerYear, NaN),
      projectLife: num(inputs.economics?.projectLife, 10),
      discountRate: num(inputs.economics?.discountRate, 10),
      opexUsdPerBbl: num(inputs.economics?.opexUsdPerBbl, 0),
      royaltyRate: num(inputs.economics?.royaltyRate, 0),
      taxRate: num(inputs.economics?.taxRate, 0),
      uptimeFraction: num(inputs.economics?.uptimeFraction, 0.95),
      fiscalType: inputs.economics?.fiscalType || 'TaxRoyalty',
    })
    : null;
  if (economics && !economics.ok) notes.push(`Economics: ${economics.error}`);

  return {
    ok: errors.length === 0,
    errors,
    notes: [...new Set(notes)],
    diagnosis,
    screening,
    stimulation,
    shutoff,
    chosen,
    sized,
    economics,
  };
};
