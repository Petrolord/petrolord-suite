/**
 * Production Network Studio computation layer (Production P11,
 * Production-ROADMAP.md app 11).
 *
 * THE ONE THING NO OTHER STUDIO IN THIS PLATFORM CAN TELL YOU.
 *
 * Every single-well studio here -- nodal, gas lift, ESP, rod pump, gas
 * well, choke, flow assurance -- solves one well against a wellhead
 * pressure that somebody typed in. That is the right thing to do when
 * you are designing a completion. It is the wrong thing to do when you
 * are asking what a field makes, because in a real gathering system
 * nobody types the wellhead pressure in: the header pressure is
 * whatever the trunk line needs to carry the total, and the total is
 * the sum of what the wells make at that header pressure.
 *
 * So the wells set the pressure that holds the wells back. Open a new
 * well into a header and every well already on it makes less. That
 * loss is invisible to any amount of single-well work, and quantifying
 * it -- per well, in barrels -- is what this studio is for.
 *
 * HOW THE SOLVE IS PUT TOGETHER
 *
 * The network solver itself is in the engine package and knows nothing
 * about petroleum: it takes branch relations as callbacks and drives
 * nodal mass balance to zero by Newton. This module supplies the
 * relations, and both of them are the Suite's ALREADY-VALIDATED nodal
 * layer rather than anything new:
 *
 *   a well    its inflow met against its own tubing. Sampled by
 *             marching UP from the IPR: pick a rate, ask the inflow
 *             what bottomhole pressure it gives, march the tubing to
 *             the wellhead. One traverse per sample, and it produces
 *             q against wellhead pressure directly -- which is the
 *             curve the network wants -- instead of the nodal solve's
 *             single point at a wellhead pressure you had to guess.
 *
 *   a pipe    the same two-phase traverse the wellbore uses, marched
 *             horizontally (or up a rise), sampled at a set of rates
 *             to give pressure drop against rate.
 *
 * Both are turned into CHARACTERISTIC CURVES and handed to the solver
 * as fast monotone interpolations. Solving a traverse inside every
 * Newton evaluation would mean thousands of traverses; sampling each
 * branch once and interpolating means a few hundred, and the sampling
 * error is bounded, reported, and gated by refining it.
 *
 * COMPOSITION IS AN OUTER LOOP. A pipe's pressure drop depends on what
 * is in it, and what is in it depends on which wells are flowing where,
 * which depends on the pressures. So: solve the pressures, push the
 * well streams down the solved flow directions, rebuild the pipe curves
 * at the new mixtures, solve again. Two or three passes settle it. This
 * is what real network simulators do and it is reported as what it is
 * rather than hidden.
 *
 * Field units: psia, degF, ft, in, stb/d, Mscf/d, lb/d.
 */

// Relative imports (not the @/ alias) so this module also loads outside
// Vite: tools/validation/production-validation.ts exercises it directly.
import { computeTraverse, whpFromBhp } from '../nodal/traverse.js';
import { pwfAtRate } from '../nodal/ipr.js';
import { gasPwfAtRate } from '../nodal/system.js';
import { num, linspace } from '../nodal/numerics.js';
import { streamMass } from './flowAssurance.js';
import {
  buildNetwork, solveNetwork, propagateStreams, checkConservation, diagnose,
} from './engine/networkSolve.js';
import {
  PIPE_SCHEDULE, scheduleRow, ROUGHNESS_IN, roughnessOf, FITTINGS, fittingK,
  equivalentLengthFt, barlowPressurePsi, LINE_PIPE_GRADES, gradeYield,
} from './engine/pipeSchedule.js';

export {
  PIPE_SCHEDULE, scheduleRow, ROUGHNESS_IN, FITTINGS, LINE_PIPE_GRADES,
  barlowPressurePsi, equivalentLengthFt,
};

/** How many points a characteristic curve is sampled at. */
export const CURVE_SAMPLES = 14;
/** How many composition passes before the answer is called settled. */
export const MAX_COMPOSITION_PASSES = 6;
/** Composition is settled when no branch's water cut moves by more than this. */
export const COMPOSITION_TOLERANCE = 1e-4;

// ---------------------------------------------------------------------------
// Monotone curves
// ---------------------------------------------------------------------------

/**
 * A monotone increasing interpolation with a NAMED extrapolation.
 *
 * Beyond the last sample the curve continues on the slope of the final
 * segment, and says it did. Silently flattening or clamping there is
 * how a network solver ends up with a branch that cannot be pushed any
 * harder no matter what pressure is put on it, and then converges to
 * something confident and wrong.
 */
export const monotoneCurve = (points) => {
  const pts = [...points].sort((a, b) => a.x - b.x);
  const n = pts.length;
  const at = (x) => {
    if (n === 0) return { y: NaN, extrapolated: true };
    if (n === 1) return { y: pts[0].y, extrapolated: x !== pts[0].x };
    if (x <= pts[0].x) {
      const s = (pts[1].y - pts[0].y) / (pts[1].x - pts[0].x);
      return { y: pts[0].y + s * (x - pts[0].x), extrapolated: x < pts[0].x };
    }
    if (x >= pts[n - 1].x) {
      const s = (pts[n - 1].y - pts[n - 2].y) / (pts[n - 1].x - pts[n - 2].x);
      return { y: pts[n - 1].y + s * (x - pts[n - 1].x), extrapolated: x > pts[n - 1].x };
    }
    for (let i = 1; i < n; i += 1) {
      if (x <= pts[i].x) {
        const t = (x - pts[i - 1].x) / (pts[i].x - pts[i - 1].x);
        return { y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y), extrapolated: false };
      }
    }
    return { y: pts[n - 1].y, extrapolated: true };
  };
  return { points: pts, at, y: (x) => at(x).y };
};

/** The same curve read the other way round. */
export const invertCurve = (curve) =>
  monotoneCurve(curve.points.map((p) => ({ x: p.y, y: p.x })));

// ---------------------------------------------------------------------------
// The well relation
// ---------------------------------------------------------------------------

/**
 * A well's deliverability against wellhead pressure.
 *
 * Built by marching UP from the inflow rather than by solving the nodal
 * point at a series of guessed wellhead pressures. For a rate, the IPR
 * says what bottomhole pressure that rate draws the well down to, and
 * the tubing says what wellhead pressure that leaves. One traverse per
 * sample, and the result is already in the form the network needs.
 *
 * A rate whose traverse cannot reach the surface -- the column is too
 * heavy for the drawdown -- is DROPPED from the curve rather than given
 * a wellhead pressure of atmospheric. That well simply does not flow at
 * that rate, and pretending otherwise puts a phantom branch of the
 * curve where the physics has none.
 *
 * returns { ok, points:[{ qoStbd, qwStbd, qgMscfd, massLbD, whpPsia }],
 *   maxWhpPsia, error }
 */
export const wellDeliverability = ({ model, duty, samples = CURVE_SAMPLES, cp }) => {
  if (!model) return { ok: false, error: 'The well model is incomplete.' };
  const isGas = model.phase === 'gas';
  const qmax = isGas ? model.gasIpr?.aof : model.ipr?.qmax;
  if (!(qmax > 0)) return { ok: false, error: 'The inflow did not calibrate, so the well has no deliverability curve.' };

  const wct = Math.min(Math.max(num(duty?.wctPct, 0) / 100, 0), 0.999);
  const gor = num(duty?.gor, model.fluidModel.gor);
  const wgr = num(duty?.wgr, 0);
  const cgr = num(duty?.cgr, 0);

  // Sample from a whisker above zero to just under the absolute open
  // flow. Zero itself is added separately as the shut-in point, where
  // the wellhead pressure is the static head and no traverse is needed.
  const rates = linspace(qmax * 0.02, qmax * 0.98, Math.max(4, samples));
  const points = [];
  const dropped = [];

  for (const q of rates) {
    const pwf = isGas ? gasPwfAtRate(model.gasIpr, q) : pwfAtRate(model.ipr, q);
    if (!(pwf > 0)) continue;
    const rates4 = isGas ? { qgMscfd: q, wgr, cgr } : { qo: q, wct, gor };
    const up = whpFromBhp({ ...model.vlp, rates: rates4, bhp: pwf });
    if (!up.ok || !(up.pEnd > 14.7)) { dropped.push(q); continue; }
    const qoStbd = isGas ? (cgr * q) / 1000 : q;
    const qwStbd = isGas ? (wgr * q) / 1000 : (q / (1 - wct)) - q;
    const qgMscfd = isGas ? q : (q * gor) / 1000;
    const mass = streamMass({
      qoStbd, qwStbd, qgMscfd,
      api: model.fluidModel.api, gasSg: model.fluidModel.gasSg,
      salinityPpm: model.fluidModel.salinityPpm, cp,
    });
    if (!mass.ok) continue;
    points.push({ qoStbd, qwStbd, qgMscfd, massLbD: mass.massRateLbHr * 24, whpPsia: up.pEnd });
  }

  if (points.length < 2) {
    return {
      ok: false,
      error: 'This well would not flow to surface at any rate the inflow allows. Check the tubing, the water cut and the gas-oil ratio before putting it in a network.',
    };
  }
  points.sort((a, b) => a.massLbD - b.massLbD);

  // THE UNSTABLE LEFT BRANCH.
  //
  // A tubing curve is not monotone. At low rate the liquid holds up,
  // the column is heavy, and the wellhead pressure the well can hold is
  // LOW. As rate rises the column lightens and the wellhead pressure
  // rises with it, until friction takes over and it starts falling
  // again. So the curve has a peak, and everything to the left of that
  // peak is the classic unstable branch: a well sitting there does not
  // hold a rate, it heads, or it loads up and dies.
  //
  // That branch is dropped rather than handed to the solver, for two
  // reasons and the physics one comes first. Physically it is not an
  // operating point at all, and offering it as one would be wrong in
  // the same way the whole studio exists to avoid. Numerically, a
  // non-monotone inflow relation gives the network more than one
  // answer and no way to say which it found.
  //
  // The peak itself is worth reporting rather than quietly discarding:
  // a well whose network operating point sits close to it is a well
  // about to start heading, and no single-well study would have said so
  // because no single-well study knew what the header was going to do.
  let peak = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].whpPsia > points[peak].whpPsia) peak = i;
  }
  const stable = points.slice(peak);
  const unstable = points.slice(0, peak);

  if (stable.length < 2) {
    return {
      ok: false,
      error: 'This well has no stable branch: its tubing performance is still rising at the highest rate the inflow allows, so every rate it could make is on the unstable side. It needs smaller tubing or lift before it belongs in a network.',
    };
  }

  return {
    ok: true,
    points: stable,
    allPoints: points,
    unstablePoints: unstable,
    droppedRates: dropped,
    maxWhpPsia: stable[0].whpPsia,
    minWhpPsia: stable[stable.length - 1].whpPsia,
    // The rate below which the well is on the unstable branch. Resolved
    // to the sample spacing, so it is a band rather than a knife edge,
    // and it is reported as the former.
    stabilityLimitStbd: unstable.length ? stable[0].qoStbd : null,
    stabilityLimitMassLbD: unstable.length ? stable[0].massLbD : null,
    warning: unstable.length
      ? `Below about ${Math.round(stable[0].qoStbd)} stb/d this well is on the unstable side of its tubing curve, where it heads rather than holding a rate. Rates under that are not offered to the network as operating points.`
      : null,
  };
};

/**
 * Turn the sampled curve into the mass-rate-against-pressure relation
 * the solver wants.
 *
 * Above the shut-in pressure the well makes nothing -- it does not take
 * injection -- and below the lowest sampled wellhead pressure the curve
 * is extrapolated on its final slope and the fact is recorded.
 */
export const wellInflowFrom = (deliverability) => {
  const curve = monotoneCurve(
    deliverability.points.map((p) => ({ x: p.whpPsia, y: p.massLbD })),
  );
  return (node, p) => {
    if (p >= deliverability.maxWhpPsia) return 0;
    const r = curve.at(p);
    return Math.max(0, r.y);
  };
};

// ---------------------------------------------------------------------------
// The pipe relation
// ---------------------------------------------------------------------------

/** A straight pipe with a rise, in the trajectory shape the traverse wants. */
const pipeTrajectory = ({ lengthFt, riseFt }) => {
  const rise = Math.max(-lengthFt, Math.min(lengthFt, num(riseFt, 0)));
  return {
    points: [
      { md: 0, tvd: 0, angle: (Math.acos(rise / lengthFt) * 180) / Math.PI },
      { md: lengthFt, tvd: rise, angle: (Math.acos(rise / lengthFt) * 180) / Math.PI },
    ],
    tvdMax: rise,
    mdMax: lengthFt,
    warnings: [],
  };
};

/**
 * Pressure drop against mass rate for one pipe, at a given mixture.
 *
 * Marched in the direction of flow with the same validated two-phase
 * gradient the wellbore uses. The elevation term is not a footnote: a
 * flowline that climbs three hundred feet to a manifold costs a hundred
 * psi of head before a foot of friction is counted, and on a low-energy
 * well that is the difference between flowing and not.
 *
 * returns { ok, points:[{ massLbD, dpPsi }], error }
 */
export const pipeCharacteristic = ({
  pipe, fluidModel, stream, tempF, pInPsia, samples = CURVE_SAMPLES, maxMassLbD,
}) => {
  const L = num(pipe.lengthFt, NaN);
  const idIn = num(pipe.idIn, NaN);
  if (!(L > 0)) return { ok: false, error: `${pipe.label || pipe.id}: a length is needed.` };
  if (!(idIn > 0)) return { ok: false, error: `${pipe.label || pipe.id}: a bore is needed.` };
  const total = (stream?.qoStbd || 0) + (stream?.qwStbd || 0);
  const massRef = stream?.massLbD;
  if (!(massRef > 0)) {
    // A branch carrying nothing right now still has to have a real
    // characteristic, because the solver needs to know what it WOULD do
    // if pressure were put across it. Handing back a single point at
    // the origin makes the branch flow identically zero whatever the
    // pressure, which flattens the Jacobian row of the node behind it
    // and takes the whole network down with it -- as it did the first
    // time a well shut in at a high separator pressure.
    return {
      ok: false,
      idle: true,
      error: `${pipe.label || pipe.id}: nothing is flowing through it, so there is no mixture to build its characteristic from. Give it a reference stream.`,
    };
  }

  const trajectory = pipeTrajectory({ lengthFt: L, riseFt: pipe.riseFt });
  const rough = num(pipe.roughnessIn, 0.0018) / idIn;
  const wct = total > 0 ? (stream.qwStbd || 0) / total : 0;
  const gor = (stream.qoStbd || 0) > 0
    ? ((stream.qgMscfd || 0) * 1000) / stream.qoStbd
    : 0;
  const tAt = () => num(tempF, 100);

  const top = maxMassLbD > massRef ? maxMassLbD : massRef * 1.6;
  const massPoints = [0, ...linspace(top / (samples - 1), top, Math.max(3, samples) - 1)];
  const points = [];
  for (const m of massPoints) {
    if (m === 0) { points.push({ massLbD: 0, dpPsi: 0 }); continue; }
    const f = m / massRef;
    const qo = (stream.qoStbd || 0) * f;
    const qw = (stream.qwStbd || 0) * f;
    // The traverse takes oil rate, water CUT and gas-oil RATIO, which
    // are ratios and so do not change when the whole stream is scaled.
    const rates = qo > 0
      ? { qo, wct, gor }
      : { qgMscfd: (stream.qgMscfd || 0) * f, wgr: qw > 0 ? (qw * 1000) / ((stream.qgMscfd || 1) * f) : 0, cgr: 0 };
    const march = computeTraverse({
      fluidModel,
      rates,
      trajectory,
      tAt,
      idIn,
      roughnessIn: num(pipe.roughnessIn, 0.0018),
      correlation: pipe.correlation || 'beggsBrill',
      pStart: num(pInPsia, 400),
      mdStart: 0,
      mdEnd: L,
      stepFt: Math.max(50, L / 40),
    });
    // Marching from md 0 to md L is marching AGAINST the flow in the
    // traverse's own convention, so the pressure it accumulates is the
    // drop the flow experiences going the other way.
    const dp = march.pEnd - num(pInPsia, 400);
    if (!Number.isFinite(dp)) continue;
    points.push({ massLbD: m, dpPsi: dp });
  }
  if (points.length < 2) {
    return { ok: false, error: `${pipe.label || pipe.id}: the pressure drop could not be computed at any rate.` };
  }
  points.sort((a, b) => a.massLbD - b.massLbD);
  return { ok: true, points, wct, gor, rough };
};

/**
 * The branch relation: mass rate for a given pressure drop.
 *
 * The characteristic is sampled as dp against rate, so this is its
 * inverse, and it is made ODD in the pressure drop: a negative drop
 * gives the same magnitude of flow the other way. A pipe does not care
 * which way it is pointed, and getting that wrong is how a solver
 * produces a branch that can only flow one direction and then cannot
 * find a solution to a looped network.
 */
export const pipeFlowFrom = (characteristic) => {
  const inverse = invertCurve(monotoneCurve(
    characteristic.points.map((p) => ({ x: p.massLbD, y: p.dpPsi })),
  ));
  return (branch, pIn, pOut) => {
    const dp = pIn - pOut;
    const r = inverse.at(Math.abs(dp));
    const q = Number.isFinite(r.y) ? Math.max(0, r.y) : 0;
    return dp >= 0 ? q : -q;
  };
};

// ---------------------------------------------------------------------------
// The whole run
// ---------------------------------------------------------------------------

const emptyStream = () => ({ qoStbd: 0, qwStbd: 0, qgMscfd: 0, massLbD: 0 });

/**
 * Solve the network, then answer the question it was built for.
 *
 * inputs.nodes    [{ id, kind, label, pressurePsia?, wellId?, duty }]
 * inputs.branches [{ id, from, to, label, lengthFt, idIn, riseFt,
 *                    roughnessIn, correlation, tempF }]
 * wellModels      { [nodeId]: buildWellModel output }
 *
 * returns { ok, errors, network, solution, wells, branches, diagnosis,
 *   conservation, passes, warnings }
 */
export const runNetwork = ({ inputs, wellModels, samples = CURVE_SAMPLES }) => {
  const errors = [];
  const warnings = [];

  const network = buildNetwork({
    nodes: (inputs.nodes || []).map((n) => ({
      id: n.id,
      kind: n.kind,
      label: n.label,
      pressurePsia: n.kind === 'sink' ? num(n.pressurePsia, NaN) : undefined,
    })),
    branches: (inputs.branches || []).map((b) => ({
      id: b.id, from: b.from, to: b.to, label: b.label,
    })),
  });
  if (!network.ok) return { ok: false, errors: [network.error] };

  // --- every well's deliverability, once ---
  const wellNodes = network.nodes.filter((n) => n.kind === 'well');
  const deliverability = {};
  for (const n of wellNodes) {
    const source = (inputs.nodes || []).find((x) => x.id === n.id);
    const d = wellDeliverability({
      model: wellModels?.[n.id], duty: source?.duty, samples,
    });
    if (!d.ok) { errors.push(`${n.label || n.id}: ${d.error}`); continue; }
    if (d.warning) warnings.push(`${n.label || n.id}: ${d.warning}`);
    deliverability[n.id] = d;
  }
  if (errors.length) return { ok: false, errors, network };

  const wellInflow = (node, p) => wellInflowFrom(deliverability[node.id])(node, p);

  // A first mixture for every branch: everything a well can make, in
  // its own composition, pushed at whatever the topology says. Crude,
  // and it only has to be close enough for the first pass.
  const openFlow = {};
  for (const n of wellNodes) {
    const best = deliverability[n.id].points[deliverability[n.id].points.length - 1];
    openFlow[n.id] = { ...best, massLbD: best.massLbD };
  }
  const totalOpen = Object.values(openFlow).reduce((a, s) => a + s.massLbD, 0);

  const specByBranchId = new Map((inputs.branches || []).map((b) => [b.id, b]));
  let branchStreams = Object.fromEntries(network.branches.map((b) => {
    const s = Object.values(openFlow).reduce(
      (acc, x) => ({
        qoStbd: acc.qoStbd + x.qoStbd, qwStbd: acc.qwStbd + x.qwStbd,
        qgMscfd: acc.qgMscfd + x.qgMscfd, massLbD: acc.massLbD + x.massLbD,
      }),
      emptyStream(),
    );
    // Scale the field mixture down to something a single branch might
    // plausibly carry, so the first characteristic is not built at ten
    // times the rate the branch will ever see.
    const share = 1 / Math.max(1, network.branches.length - 1);
    return [b.id, {
      qoStbd: s.qoStbd * share, qwStbd: s.qwStbd * share,
      qgMscfd: s.qgMscfd * share, massLbD: s.massLbD * share,
    }];
  }));

  const fluidModel = wellModels[wellNodes[0].id].fluidModel;
  let solution = null;
  let streams = null;
  let actualStreams = null;
  let passes = 0;
  let settled = false;
  let characteristics = {};

  while (passes < MAX_COMPOSITION_PASSES && !settled) {
    passes += 1;

    characteristics = {};
    for (const b of network.branches) {
      const spec = specByBranchId.get(b.id) || {};
      const c = pipeCharacteristic({
        pipe: { ...spec, id: b.id, label: b.label },
        fluidModel,
        stream: branchStreams[b.id],
        tempF: num(spec.tempF, 110),
        pInPsia: num(spec.designPsia, 400),
        samples,
        maxMassLbD: totalOpen,
      });
      if (!c.ok) { errors.push(c.error); continue; }
      characteristics[b.id] = c;
    }
    if (errors.length) return { ok: false, errors, network };

    const flowFns = Object.fromEntries(
      Object.entries(characteristics).map(([id, c]) => [id, pipeFlowFrom(c)]),
    );
    solution = solveNetwork({
      network,
      branchFlow: (b, pIn, pOut) => flowFns[b.id](b, pIn, pOut),
      wellInflow,
      initialPressures: solution?.pressures,
    });
    if (!solution.ok) return { ok: false, errors: [solution.error], network };
    solution.warnings.forEach((w) => warnings.push(w));

    // Push each well's own composition down the solved directions.
    const wellStreams = {};
    for (const n of wellNodes) {
      const d = deliverability[n.id];
      const mass = solution.wellRates[n.id] || 0;
      const curve = monotoneCurve(d.points.map((p) => ({ x: p.massLbD, y: p.qoStbd })));
      const wcurve = monotoneCurve(d.points.map((p) => ({ x: p.massLbD, y: p.qwStbd })));
      const gcurve = monotoneCurve(d.points.map((p) => ({ x: p.massLbD, y: p.qgMscfd })));
      wellStreams[n.id] = {
        qoStbd: Math.max(0, curve.y(mass)),
        qwStbd: Math.max(0, wcurve.y(mass)),
        qgMscfd: Math.max(0, gcurve.y(mass)),
        massLbD: mass,
      };
    }
    const prop = propagateStreams({ network, flows: solution.flows, wellStreams });
    if (!prop.ok) return { ok: false, errors: [prop.error], network, solution };

    // Settled when no branch's water cut has moved.
    let moved = 0;
    for (const b of network.branches) {
      const before = branchStreams[b.id];
      const after = prop.branchStreams[b.id] || emptyStream();
      const wctOf = (s) => {
        const t = s.qoStbd + s.qwStbd;
        return t > 0 ? s.qwStbd / t : 0;
      };
      moved = Math.max(moved, Math.abs(wctOf(after) - wctOf(before)));
    }
    actualStreams = Object.fromEntries(network.branches.map(
      (b) => [b.id, prop.branchStreams[b.id] || emptyStream()],
    ));
    // A branch that has gone quiet KEEPS its last real mixture for the
    // purpose of building its characteristic. What it is carrying and
    // what it would carry are different questions, and only the second
    // one belongs in a pressure-drop curve.
    branchStreams = Object.fromEntries(network.branches.map((b) => {
      const next = actualStreams[b.id];
      return [b.id, next.massLbD > 0 ? next : branchStreams[b.id]];
    }));
    streams = prop;
    settled = moved < COMPOSITION_TOLERANCE;
  }

  if (!settled) {
    warnings.push(`The mixtures in the lines were still shifting after ${passes} passes. The pressures below are close but the line compositions are not fully settled; treat a marginal result with care.`);
  }

  // --- the answer this studio exists for ---
  const standalone = standaloneRates({
    network, deliverability, characteristics, wellNodes,
  });

  const wells = wellNodes.map((n) => {
    const inNetwork = solution.wellRates[n.id] || 0;
    const alone = standalone[n.id] ?? NaN;
    const stream = streams?.nodeStreams?.[n.id] || emptyStream();
    const d = deliverability[n.id];
    const oilCurve = monotoneCurve(d.points.map((p) => ({ x: p.massLbD, y: p.qoStbd })));
    return {
      id: n.id,
      label: n.label || n.id,
      whpPsia: solution.pressures[n.id],
      massLbD: inNetwork,
      qoStbd: Math.max(0, oilCurve.y(inNetwork)),
      qoAloneStbd: Number.isFinite(alone) ? Math.max(0, oilCurve.y(alone)) : NaN,
      massAloneLbD: alone,
      lostLbD: Number.isFinite(alone) ? alone - inNetwork : NaN,
      lostFraction: Number.isFinite(alone) && alone > 0 ? (alone - inNetwork) / alone : NaN,
      stream,
      shutIn: inNetwork <= 1e-6,
    };
  });

  const branchRows = network.branches.map((b) => {
    const spec = specByBranchId.get(b.id) || {};
    const s = (actualStreams && actualStreams[b.id]) || emptyStream();
    const total = s.qoStbd + s.qwStbd;
    return {
      id: b.id,
      label: b.label || b.id,
      from: b.from,
      to: b.to,
      lengthFt: num(spec.lengthFt, NaN),
      idIn: num(spec.idIn, NaN),
      massLbD: solution.flows[b.id],
      dpPsi: solution.pressures[b.from] - solution.pressures[b.to],
      stream: s,
      wctPct: total > 0 ? (100 * s.qwStbd) / total : null,
      gorScfStb: s.qoStbd > 0 ? (s.qgMscfd * 1000) / s.qoStbd : null,
    };
  });

  return {
    ok: true,
    errors: [],
    warnings: [...new Set(warnings)],
    network,
    solution,
    deliverability,
    characteristics,
    streams,
    wells,
    branches: branchRows,
    diagnosis: diagnose({
      network, pressures: solution.pressures, flows: solution.flows,
    }),
    conservation: checkConservation({
      network, flows: solution.flows, wellRates: solution.wellRates,
    }),
    passes,
    settled,
    totals: {
      qoStbd: wells.reduce((a, w) => a + (w.qoStbd || 0), 0),
      qoAloneStbd: wells.reduce((a, w) => a + (w.qoAloneStbd || 0), 0),
      massLbD: wells.reduce((a, w) => a + (w.massLbD || 0), 0),
    },
  };
};

/**
 * What each well would make with the others shut in.
 *
 * Solved on the SAME network with the same branch curves, one well at a
 * time, rather than by a separate single-well calculation. That is the
 * only way the comparison means anything: it isolates the effect of the
 * other wells and nothing else, because every other input -- the
 * flowline, the trunk, the delivery pressure, the correlation, the
 * interpolation error in the curves -- is identical on both sides.
 */
export const standaloneRates = ({ network, deliverability, characteristics, wellNodes }) => {
  const flowFns = Object.fromEntries(
    Object.entries(characteristics).map(([id, c]) => [id, pipeFlowFrom(c)]),
  );
  const out = {};
  for (const target of wellNodes) {
    const res = solveNetwork({
      network,
      branchFlow: (b, pIn, pOut) => flowFns[b.id](b, pIn, pOut),
      wellInflow: (node, p) => (node.id === target.id
        ? wellInflowFrom(deliverability[node.id])(node, p)
        : 0),
    });
    out[target.id] = res.ok ? (res.wellRates[target.id] || 0) : NaN;
  }
  return out;
};

/**
 * What lowering the delivery pressure buys.
 *
 * A whole network solve per point, so this is an explicit run. It is
 * also the single most useful sensitivity in the studio, because the
 * separator pressure is usually the one thing an operator can actually
 * change tomorrow.
 */
export const deliverySweep = ({ inputs, wellModels, pressures, samples = 10 }) => {
  const sinkId = (inputs.nodes || []).find((n) => n.kind === 'sink')?.id;
  if (!sinkId) return { ok: false, error: 'There is no delivery point to sweep.' };
  const base = num((inputs.nodes || []).find((n) => n.id === sinkId)?.pressurePsia, NaN);
  if (!(base > 0)) return { ok: false, error: 'The delivery point needs a pressure.' };
  const list = pressures && pressures.length
    ? pressures
    : linspace(Math.max(20, base * 0.4), base * 1.4, samples);

  const points = [];
  for (const p of list) {
    const trial = {
      ...inputs,
      nodes: inputs.nodes.map((n) => (n.id === sinkId ? { ...n, pressurePsia: p } : n)),
    };
    const r = runNetwork({ inputs: trial, wellModels, samples: Math.max(6, samples) });
    points.push({
      deliveryPsia: p,
      ok: r.ok,
      qoStbd: r.ok ? r.totals.qoStbd : NaN,
      massLbD: r.ok ? r.totals.massLbD : NaN,
      wells: r.ok ? Object.fromEntries(r.wells.map((w) => [w.id, w.qoStbd])) : {},
      shutIn: r.ok ? r.wells.filter((w) => w.shutIn).map((w) => w.label) : [],
    });
  }
  const usable = points.filter((p) => p.ok && Number.isFinite(p.qoStbd));
  // Rate gained per psi of separator pressure given up, read off the
  // curve rather than asserted. It is not a constant: the further the
  // pressure comes down the more wells come back on, and the slope
  // steepens where one does.
  const slope = usable.length > 1
    ? usable.map((p, i) => (i === 0 ? null : {
      deliveryPsia: p.deliveryPsia,
      stbdPerPsi: (usable[i - 1].qoStbd - p.qoStbd) / (p.deliveryPsia - usable[i - 1].deliveryPsia),
    })).filter(Boolean)
    : [];
  return { ok: true, points, slope, basePsia: base };
};
